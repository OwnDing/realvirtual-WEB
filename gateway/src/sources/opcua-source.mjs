// SPDX-License-Identifier: AGPL-3.0-only
/**
 * OPC UA source: one client session, one subscription, one monitored item per
 * configured signal, and explicit writes for writable PLCInput* signals.
 *
 * - `start()` returns immediately; connecting (and reconnecting forever with
 *   backoff) happens in the background so the gateway serves /health and the
 *   WebSocket while the PLC is unreachable.
 * - On connection loss every signal turns `uncertain` but keeps its last value.
 * - `write()` resolves with an outcome; a timeout or a lost session is
 *   `unknown` and is NEVER retried here (IO-3 / AI_SAFETY §5).
 */
import { EventEmitter } from 'node:events';
import {
  OPCUAClient, MessageSecurityMode, SecurityPolicy, AttributeIds, DataType,
  TimestampsToReturn, UserTokenType, StatusCodes,
} from 'node-opcua-client';
import { OPCUACertificateManager } from 'node-opcua-certificate-manager';

const SECURITY_POLICY_URI = {
  None: SecurityPolicy.None,
  Basic256Sha256: SecurityPolicy.Basic256Sha256,
  Aes128_Sha256_RsaOaep: SecurityPolicy.Aes128_Sha256_RsaOaep,
  Aes256_Sha256_RsaPss: SecurityPolicy.Aes256_Sha256_RsaPss,
};

export class OpcUaSource extends EventEmitter {
  /**
   * @param {ReturnType<import('../config.mjs').validateConfig>['source']} config
   * @param {import('../signals.mjs').SignalRegistry} registry
   * @param {{ opcuaPassword: string|null }} secrets
   */
  constructor(config, registry, secrets) {
    super();
    this.kind = 'opcua';
    this.config = config;
    this.registry = registry;
    this.secrets = secrets;
    this.state = 'stopped';
    this.lastError = null;
    /** Signals whose monitored item the server refused (bad NodeId, no access). */
    this.badSignals = new Map();
    this._client = null;
    this._session = null;
    this._subscription = null;
    this._stopping = false;
  }

  _setState(state, error = null) {
    this.state = state;
    if (error) this.lastError = error instanceof Error ? error.message : String(error);
    this.emit('state', state);
  }

  start() {
    this._stopping = false;
    const options = {
      applicationName: this.config.applicationName,
      endpointMustExist: false,
      keepSessionAlive: true,
      requestedSessionTimeout: 60_000,
      securityMode: MessageSecurityMode[this.config.securityMode],
      securityPolicy: SECURITY_POLICY_URI[this.config.securityPolicy],
      connectionStrategy: { initialDelay: 1000, maxDelay: 10_000, maxRetry: -1 },
    };
    if (this.config.pkiDir) {
      options.clientCertificateManager = new OPCUACertificateManager({ rootFolder: this.config.pkiDir, automaticallyAcceptUnknownCertificate: false });
    }
    const client = OPCUAClient.create(options);
    this._client = client;
    client.on('connection_lost', () => { this.registry.markAll('uncertain'); this._setState('reconnecting'); });
    client.on('connection_reestablished', () => this._setState('connected'));
    client.on('backoff', (retry, delay) => { if (this.state !== 'connected') this._setState('connecting', `retry ${retry} in ${delay} ms`); });
    this._setState('connecting');
    this._ready = this._connect().catch((error) => {
      if (!this._stopping) this._setState('error', error);
    });
    return this;
  }

  async _connect() {
    await this._client.connect(this.config.endpointUrl);
    if (this._stopping) return;
    const identity = this.config.identity.type === 'username'
      ? { type: UserTokenType.UserName, userName: this.config.identity.username, password: this.secrets.opcuaPassword }
      : { type: UserTokenType.Anonymous };
    this._session = await this._client.createSession(identity);
    this._session.on('session_closed', () => { if (!this._stopping) this._setState('reconnecting'); });
    this._subscription = await this._session.createSubscription2({
      requestedPublishingInterval: this.config.publishingIntervalMs,
      requestedLifetimeCount: 600,
      requestedMaxKeepAliveCount: 20,
      maxNotificationsPerPublish: 0,
      publishingEnabled: true,
      priority: 10,
    });
    const entries = this.registry.entries();
    const items = entries.map((entry) => ({ nodeId: entry.config.nodeId, attributeId: AttributeIds.Value }));
    const group = await this._subscription.monitorItems(items, {
      samplingInterval: this.config.samplingIntervalMs, discardOldest: true, queueSize: 1,
    }, TimestampsToReturn.Both);
    group.monitoredItems.forEach((item, index) => {
      const status = item.statusCode;
      if (status && status.isNotGood?.()) {
        this.badSignals.set(entries[index].config.name, status.name);
        this.registry.update(entries[index].config.name, undefined, 'bad');
      }
    });
    group.on('changed', (monitoredItem, dataValue, index) => {
      const name = entries[index]?.config.name;
      if (!name) return;
      const quality = dataValue.statusCode?.isGood?.() ? 'good' : dataValue.statusCode?.isNotBad?.() ? 'uncertain' : 'bad';
      const time = dataValue.sourceTimestamp?.getTime?.() ?? Date.now();
      this.registry.update(name, dataValue.value?.value, quality, time);
    });
    this._setState('connected');
  }

  /** @returns {Promise<{ outcome: 'written'|'failed'|'unknown', status: string }>} */
  async write(signal, value) {
    const session = this._session;
    if (!session || this.state !== 'connected') return { outcome: 'unknown', status: 'NotConnected' };
    const request = {
      nodeId: signal.config.nodeId,
      attributeId: AttributeIds.Value,
      value: { value: { dataType: DataType[signal.config.dataType], value } },
    };
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ outcome: 'unknown', status: 'Timeout' }), this.config.writeTimeoutMs);
    });
    try {
      const result = await Promise.race([
        session.write(request).then((status) => (status === StatusCodes.Good || status?.isGood?.()
          ? { outcome: 'written', status: 'Good' }
          : { outcome: 'failed', status: status?.name ?? String(status) })),
        timeout,
      ]);
      return result;
    } catch (error) {
      // The request may have left the socket before it failed: outcome unknown.
      return { outcome: 'unknown', status: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
  }

  health() {
    return {
      kind: this.kind, state: this.state, endpointUrl: this.config.endpointUrl,
      securityMode: this.config.securityMode, lastError: this.lastError,
      badSignals: Object.fromEntries(this.badSignals),
    };
  }

  async stop() {
    this._stopping = true;
    try { await this._subscription?.terminate(); } catch { /* already gone */ }
    try { await this._session?.close(); } catch { /* already gone */ }
    try { await this._client?.disconnect(); } catch { /* already gone */ }
    this._subscription = null;
    this._session = null;
    this._client = null;
    this._setState('stopped');
  }
}

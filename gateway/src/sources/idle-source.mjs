// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The source of an installed but not yet configured gateway: no PLC, no signals.
 * /health reports `unconfigured` so an operator sees why nothing streams.
 */
import { EventEmitter } from 'node:events';

export class IdleSource extends EventEmitter {
  constructor() {
    super();
    this.kind = 'none';
    this.state = 'unconfigured';
    this.lastError = null;
  }

  start() { return this; }

  async write() { return { outcome: 'unknown', status: 'NoSource' }; }

  health() {
    return { kind: this.kind, state: this.state, endpointUrl: null, securityMode: null, lastError: null, badSignals: {} };
  }

  async stop() {}
}

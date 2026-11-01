#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * xyvirtual-gateway --config <gateway.json>
 *
 * Exit codes: 0 clean shutdown, 2 configuration/secret error, 1 runtime failure.
 */
import { loadConfig, resolveSecrets, ConfigError } from './config.mjs';
import { createGateway } from './gateway.mjs';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const path = argValue('--config') ?? process.env.XYV_GATEWAY_CONFIG;
  if (!path) throw new ConfigError('missing --config <gateway.json>');
  const config = loadConfig(path);
  const secrets = resolveSecrets(config);
  const gateway = createGateway(config, secrets);
  const address = await gateway.start();
  const where = typeof address === 'object' && address ? `${address.address}:${address.port}` : String(address);
  const sourceText = config.source ? `${config.source.kind} ${config.source.endpointUrl}` : 'none (unconfigured)';
  console.log(`[gateway] listening on ${where}; source ${sourceText}; ${config.signals.length} signals; readOnly=${config.readOnly}`);
  gateway.source.on('state', (state) => console.log(`[gateway] source ${state}${gateway.source.lastError ? ` (${gateway.source.lastError})` : ''}`));
  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`[gateway] ${signal} — stopping`);
    await gateway.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error(`[gateway] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(error instanceof ConfigError ? 2 : 1);
});

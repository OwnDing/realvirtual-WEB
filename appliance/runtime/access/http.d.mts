import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccessStore } from './store.mjs';
export interface AccessConfig { root: string; origin: string; maxBytes?: number; quotaBytes?: number; retentionDays?: number; }
export function createAccessHandler(config: AccessConfig, dependencies?: { store?: AccessStore }): {
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>; store: AccessStore; close(): void;
};

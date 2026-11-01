import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AccessStore } from './store.mjs';
export function projectPath(raw: string): string[];
export function createProjectsHandler(
  config: { forgejoUrl: string; owner: string; tokenFile: string },
  dependencies: { store: AccessStore; origin: string; fetchImpl?: typeof fetch },
): { handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> };

// SPDX-License-Identifier: AGPL-3.0-only

/** Machining worker entry (ADR-0026): hosts {@link CsgWorkerCore}. */

import { CsgWorkerCore, type CsgRequest, type CsgResponse } from './csg-worker-core';

const scope = self as unknown as { postMessage(msg: CsgResponse, transfer: Transferable[]): void; onmessage: ((e: MessageEvent<CsgRequest>) => void) | null };
const fatal = (error: unknown) => scope.postMessage({ type: 'fatal', message: error instanceof Error ? error.message : String(error) }, []);
// Pump turns run from the scheduler, outside onmessage: they need their own guard.
const core = new CsgWorkerCore((msg, transfer) => scope.postMessage(msg, transfer), (fn) => {
  setTimeout(() => { try { fn(); } catch (error) { fatal(error); } }, 0);
});

scope.onmessage = (event) => {
  try {
    core.handle(event.data);
  } catch (error) {
    fatal(error);
  }
};
scope.postMessage({ type: 'ready' }, []);

// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import type { SimDesControl } from '../../src/core/material-flow/simulation-kernel';
import { createDesRunner } from '../../src/plugins/des/register-des-runner';

describe('public DES runner service facade', () => {
  it('loads on first DES start and exposes the real experiment/snapshot/batch surface', async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const model = `public-services-${suffix}`;
    const exp = 'Experiment 1';
    const root = new Object3D();
    const executor = createDesRunner([], { root });
    const control = executor as unknown as SimDesControl;

    executor.start([], { root, host: {} as never });
    try {
      expect(executor.mode).toBe('des');
      expect(control.ready).toBe(false);
      expect(typeof control.patchExperimentMetaJson).toBe('function');
      expect(typeof control.saveSnapshot).toBe('function');
      expect(typeof control.runExperimentBatch).toBe('function');

      await control.patchExperimentMetaJson!(model, exp, JSON.stringify({
        baseSeed: 77,
        endTime: 10,
        replicationCount: 1,
        enabled: true,
      }));
      expect(control.ready).toBe(true);
      expect(await control.listExperiments!(model)).toEqual([{ model, experiment: exp }]);
      expect(JSON.parse((await control.readManifestJson!(model, exp))!)).toMatchObject({
        model, experiment: exp, baseSeed: 77, endTime: 10,
      });

      expect(control.activeRunInfoJson?.()).not.toBeNull();
      await control.saveSnapshot!({ model, exp, repl: 0 }, 'manual');
      const manifest = JSON.parse((await control.readManifestJson!(model, exp))!);
      expect(manifest.replications[0].snapshots[0]).toMatchObject({ simTime: 0, label: 'manual' });
      await control.loadSnapshot!({ model, exp, repl: 0, t: 0 });
      expect(control.subMode).toBe('step');

      await control.runExperimentBatch!({ model, exp }, { replications: 1, crn: false });
      expect(JSON.parse(control.batchProgressJson?.() ?? 'null')).toMatchObject({
        exp, total: 1, phase: 'done',
      });
    } finally {
      await control.deleteExperiment?.(model, exp);
      executor.dispose();
    }
  });
});

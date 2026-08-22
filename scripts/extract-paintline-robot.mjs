// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025 realvirtual GmbH <https://realvirtual.io>

/**
 * Regenerates `public/library/PaintLine/PaintRobot.glb` (EP-DEMO-003).
 *
 * The paint booth's robot is NOT authored here — it is the `FanucCRX-10iA_L`
 * arm that already ships inside `public/models/DemoRobotIK.glb`, lifted out by
 * `extract-glb-subtree.mjs`. Two subtrees are left behind on purpose:
 *
 *   - `SchunkEGH80Gripper` — a two-finger pick-and-place gripper a paint line
 *     has no use for, and 8.1 MB of the source geometry;
 *   - `Robotpath` — the pick-and-place `IKPath` with its `Home`/`Pick`/`Place`
 *     targets, which would give the arm a trajectory that has nothing to do
 *     with spraying.
 *
 * The source GLB is read-only and stays byte-identical.
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSubtree } from './extract-glb-subtree.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const stats = extractSubtree({
  inPath: join(ROOT, 'public', 'models', 'DemoRobotIK.glb'),
  rootName: 'FanucCRX-10iA_L',
  exclude: ['SchunkEGH80Gripper', 'Robotpath'],
  outPath: join(ROOT, 'public', 'library', 'PaintLine', 'PaintRobot.glb'),
  rename: 'PaintRobot',
});

console.log(
  `  PaintRobot.glb  ${stats.nodes} nodes, ${stats.meshes} meshes, `
  + `${(stats.bytes / 1048576).toFixed(2)} MB  (from DemoRobotIK.glb#FanucCRX-10iA_L)`,
);

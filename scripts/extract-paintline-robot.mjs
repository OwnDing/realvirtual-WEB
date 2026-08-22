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

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSubtree } from './extract-glb-subtree.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const outPath = join(ROOT, 'public', 'library', 'PaintLine', 'PaintRobot.glb');

const sourcePath = join(ROOT, 'public', 'models', 'DemoRobotIK.glb');
const isGlb = (path) => {
  const bytes = readFileSync(path);
  return bytes.length >= 4 && bytes.readUInt32LE(0) === 0x46546c67;
};

// Developer checkouts may intentionally contain only the donor's Git-LFS
// pointer while the already-extracted PaintRobot is a normal checked-in GLB.
// In that case keep its geometry and apply the deterministic metadata patch;
// never turn an unavailable donor into a broken generated output.
let stats;
if (isGlb(sourcePath)) {
  stats = extractSubtree({
    inPath: sourcePath,
    rootName: 'FanucCRX-10iA_L',
    exclude: ['SchunkEGH80Gripper', 'Robotpath'],
    outPath,
    rename: 'PaintRobot',
  });
} else if (isGlb(outPath)) {
  stats = { nodes: 0, meshes: 0, bytes: readFileSync(outPath).length };
  console.warn('  DemoRobotIK.glb is a Git-LFS pointer; preserving checked-in PaintRobot geometry');
} else {
  throw new Error('PaintRobot generation needs either a materialized DemoRobotIK.glb or an existing PaintRobot.glb');
}

/** Add a stable robot-base mount without touching any extracted geometry. */
function addAssemblyPort(path) {
  const source = readFileSync(path);
  const jsonLength = source.readUInt32LE(12);
  const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString('utf8'));
  const binHeaderAt = 20 + jsonLength;
  const binLength = source.readUInt32LE(binHeaderAt);
  const bin = source.subarray(binHeaderAt + 8, binHeaderAt + 8 + binLength);
  const rootIndex = json.scenes[json.scene ?? 0].nodes[0];
  const root = json.nodes[rootIndex];
  root.extras ??= {};
  root.extras.realvirtual ??= {};
  root.extras.realvirtual._formatVersion = '1.1';
  root.extras.realvirtual.NodeId = 'urn:rv:paintline:paintrobot';
  root.extras.realvirtual.PaintProcessRobot = {
    RobotId: 'paintrobot',
    SpraySweepDegrees: 36,
    SprayPeriodSeconds: 4,
  };

  const mountNode = {
    name: 'Snap-YB-paintline-robot-mount-v1',
    extras: {
      realvirtual: {
        _formatVersion: '1.1',
        NodeId: 'urn:rv:paintline:paintrobot:port:robot.mount',
        AssemblyPort: {
          PortId: 'robot.mount',
          TypeId: 'paintline-robot-mount-v1',
          Flow: 'bidi',
          Direction: { x: 0, y: -1, z: 0 },
        },
      },
    },
  };
  let mountIndex = json.nodes.findIndex((node) =>
    node?.extras?.realvirtual?.AssemblyPort?.PortId === 'robot.mount',
  );
  if (mountIndex >= 0) json.nodes[mountIndex] = mountNode;
  else mountIndex = json.nodes.push(mountNode) - 1;
  root.children = [...new Set([...(root.children ?? []), mountIndex])];

  const rawJson = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonChunk = Buffer.concat([rawJson, Buffer.alloc((4 - rawJson.length % 4) % 4, 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4, 0)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binChunk.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  writeFileSync(path, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]));
}

addAssemblyPort(outPath);
if (stats.nodes > 0) stats.nodes += 1;

console.log(
  `  PaintRobot.glb  ${stats.nodes || 'preserved'} nodes, ${stats.meshes || 'preserved'} meshes, `
  + `${(stats.bytes / 1048576).toFixed(2)} MB  (from DemoRobotIK.glb#FanucCRX-10iA_L)`,
);

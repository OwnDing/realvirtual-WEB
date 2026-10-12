// SPDX-License-Identifier: AGPL-3.0-only
import type { MaterialValue } from '../editor/rv-asset-ops';
import type { AssetDocument } from '../editor/rv-asset-document';
import { collectPaintableMeshes, materialToValue } from '../editor/rv-asset-material';
import { PresentationError, isRecord } from './look';
import { DoubleSide, FrontSide, NormalBlending, type Object3D, type MeshStandardMaterial, type MeshPhysicalMaterial } from 'three';
import { NodeRegistry } from '../engine/rv-node-registry';
import { outermostReference } from '../engine/rv-reference-scope';
export interface MaterialPreset { id: string; group: 'metal' | 'paint' | 'other'; value: MaterialValue }
const preset = (id: string, group: MaterialPreset['group'], color: string, metalness: number, roughness: number, opacity = 1): MaterialPreset => ({ id, group, value: { name: id, color, metalness, roughness, opacity, transparent: opacity < 1 } });
export const MATERIAL_PRESETS: readonly MaterialPreset[] = [
  preset('steel', 'metal', '#899197', 1, 0.35), preset('brushed-steel', 'metal', '#a5abb0', 1, 0.65),
  preset('aluminium', 'metal', '#c1c5c9', 1, 0.45), preset('copper', 'metal', '#b97850', 1, 0.35),
  preset('paint-white', 'paint', '#ebeeef', 0.15, 0.4), preset('paint-blue', 'paint', '#28689b', 0.15, 0.4),
  preset('paint-yellow', 'paint', '#ecb72f', 0.15, 0.4), preset('paint-red', 'paint', '#b63632', 0.15, 0.4),
  preset('paint-grey', 'paint', '#616b72', 0.15, 0.4), preset('plastic', 'other', '#d2d6da', 0, 0.65),
  preset('rubber', 'other', '#222529', 0, 0.95), preset('guard', 'other', '#bfdee4', 0, 0.12, 0.25),
  preset('concrete', 'other', '#8e8c87', 0, 0.95), preset('dark-plastic', 'other', '#31383e', 0, 0.65),
];
export function parseMaterial(v: unknown): MaterialValue {
  if (!isRecord(v) || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 80 || typeof v.color !== 'string'
    || !/^#[0-9a-f]{6}$/i.test(v.color) || typeof v.transparent !== 'boolean') throw new PresentationError('invalid');
  for (const k of ['metalness', 'roughness', 'opacity'] as const) if (typeof v[k] !== 'number' || !Number.isFinite(v[k]) || v[k] < 0 || v[k] > 1) throw new PresentationError('invalid');
  return { name: v.name, color: v.color, metalness: v.metalness as number, roughness: v.roughness as number, opacity: v.opacity as number, transparent: v.transparent };
}
const originals = new WeakMap<AssetDocument, Map<Object3D, MaterialValue>>();
/** Validate the whole selection before applying ONE undoable document operation. */
export async function applyMaterialToSelection(doc: AssetDocument, nodes: Object3D[], paths: string[], value: MaterialValue): Promise<number> {
  const material = parseMaterial(value);
  if (!nodes.length || nodes.length !== paths.length) throw new PresentationError('empty');
  if (nodes.some((node, i) => NodeRegistry.computeNodePath(node) !== paths[i])) throw new PresentationError('changed');
  const meshes = new Set<ReturnType<typeof collectPaintableMeshes>[number]>();
  for (const node of nodes) {
    if (outermostReference(node)) throw new PresentationError('readonly');
    const validate = (child: Object3D) => {
      if (child.name.startsWith('_') || child.userData._rvGizmo) return;
      for (const descendant of child.children) validate(descendant);
      if (outermostReference(child) || child.userData._rvBatchSource) throw new PresentationError('material');
      const mesh = child as ReturnType<typeof collectPaintableMeshes>[number];
      if (!mesh.isMesh) return;
      let parent: Object3D | null = child;
      while (parent) {
        const ud = parent.userData;
        if (ud._rvLampMesh || ud._rvSceneButtonMesh || ['Pipe', 'Tank'].includes(ud._rvType) || (isRecord(ud.realvirtual) && ['Lamp', 'Sensor', 'Pipe', 'Tank', 'SceneButton'].some(k => ud.realvirtual[k]))) throw new PresentationError('material');
        parent = parent.parent;
      }
      const m = mesh.material as MeshStandardMaterial;
      if (Array.isArray(mesh.material) || !m.isMeshStandardMaterial || m.map || m.normalMap || m.roughnessMap || m.metalnessMap || m.aoMap || m.emissiveMap || m.alphaMap || m.lightMap
        || m.bumpMap || m.displacementMap || m.envMap || m.vertexColors || m.flatShading || m.wireframe || m.alphaTest > 0
        || !m.depthWrite || !m.depthTest || m.blending !== NormalBlending || m.side !== (m.transparent ? DoubleSide : FrontSide)
        || (m as MeshPhysicalMaterial).isMeshPhysicalMaterial || m.emissive?.getHex() || child.userData.rv_components) throw new PresentationError('material');
    };
    validate(node);
    for (const mesh of collectPaintableMeshes(node)) meshes.add(mesh);
  }
  if (!meshes.size) throw new PresentationError('empty');
  const previous = new Map(originals.get(doc));
  for (const mesh of meshes) {
    const original = materialToValue(mesh.material as MeshStandardMaterial);
    if (original && !previous.has(mesh)) previous.set(mesh, original);
  }
  await doc.withTransaction('presentation.material.apply', async () => { doc.setMaterial(paths, material); });
  originals.set(doc, previous);
  return meshes.size;
}

/** Restore the originally loaded appearance of selected parts as one undo unit. */
export async function restoreOriginalMaterials(doc: AssetDocument, nodes: Object3D[]): Promise<void> {
  const previous = originals.get(doc), meshes = new Set(nodes.flatMap(collectPaintableMeshes));
  const targets = [...meshes].filter(mesh => previous?.has(mesh));
  if (!targets.length) throw new PresentationError('empty');
  for (const node of targets) if (outermostReference(node)) throw new PresentationError('readonly');
  await doc.withTransaction('presentation.material.restore', async () => {
    for (const mesh of targets) doc.setMaterial([NodeRegistry.computeNodePath(mesh)], previous!.get(mesh)!);
  });
}

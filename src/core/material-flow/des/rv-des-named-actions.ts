// SPDX-License-Identifier: AGPL-3.0-only

import type { NamedAction } from './rv-des-event';

export const ACTION_BY_INDEX: NamedAction[] = [];
export const ACTION_INDEX = new Map<string, number>();
export const ACTION_NAME = new Map<number, string>();

export function registerAction(name: string, action: NamedAction): number {
  if (!name || typeof action !== 'function') throw new Error('DES action name and handler are required');
  if (ACTION_INDEX.has(name)) throw new Error(`duplicate DES action: ${name}`);
  const index = ACTION_BY_INDEX.length;
  ACTION_BY_INDEX.push(action);
  ACTION_INDEX.set(name, index);
  ACTION_NAME.set(index, name);
  return index;
}

export function ensureAction(name: string, action: NamedAction): number {
  return ACTION_INDEX.get(name) ?? registerAction(name, action);
}

export function getActionIndex(name: string): number {
  const index = ACTION_INDEX.get(name);
  if (index === undefined) throw new Error(`unknown action: ${name}`);
  return index;
}

export function getActionName(index: number): string {
  const name = ACTION_NAME.get(index);
  if (name === undefined) throw new Error(`unknown action index: ${index}`);
  return name;
}

// SPDX-License-Identifier: AGPL-3.0-only
import type { AdaptiveQuality, QualityMode } from '../engine/rv-adaptive-quality';
import { PERFORMANCE_QUALITY_KEY } from './rv-storage-keys';
const modes: readonly string[] = ['auto', 'high', 'balanced', 'fast', 'manual'];
export function readPerformanceQuality(fallback: QualityMode): QualityMode {
  try {
    const value = localStorage.getItem(PERFORMANCE_QUALITY_KEY);
    if (value && modes.includes(value)) return value as QualityMode;
  } catch {
    /* unavailable storage uses session state */
  }
  return fallback;
}
export function selectPerformanceQuality(controller: AdaptiveQuality, mode: QualityMode): void {
  controller.setMode(mode);
  try {
    localStorage.setItem(PERFORMANCE_QUALITY_KEY, mode);
  } catch {
    /* session setting remains usable */
  }
}

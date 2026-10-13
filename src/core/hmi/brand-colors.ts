// SPDX-License-Identifier: AGPL-3.0-only
/** Shared CSS references keep deployment accents consistent across component styles. */
export const BRAND_ACCENT = 'var(--rv-brand-primary, #4fc3f7)';
export const brandAccentAlpha = (opacity: number): string => `rgba(var(--rv-brand-primary-rgb, 79,195,247),${opacity})`;

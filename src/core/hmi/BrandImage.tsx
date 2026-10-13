// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type CSSProperties } from 'react';
/** A broken customer asset must retain a readable identity and never block the UI. */
export function BrandImage({ src, name, style }: { src: string; name: string; style?: CSSProperties }) {
  const [failed, setFailed] = useState<string>();
  if (failed === src) return <span role="img" aria-label={name} style={{ ...style, overflow: 'hidden', fontSize: 10 }}>{name}</span>;
  return <img src={src} alt={name} style={style} onError={() => { setFailed(src); console.warn('[branding] Logo unavailable; showing product name'); }} />;
}

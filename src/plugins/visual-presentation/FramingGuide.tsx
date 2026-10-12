// SPDX-License-Identifier: AGPL-3.0-only
import { useLayoutEffect, useState } from 'react';
import { Box, Portal } from '@mui/material';
/** DOM-only guide. The capture camera uses the same central crop. */
export default function FramingGuide({ canvas, aspect }: { canvas: HTMLCanvasElement; aspect: number | null }) {
  const [rect, setRect] = useState(() => canvas.getBoundingClientRect());
  useLayoutEffect(() => {
    const update = () => setRect(canvas.getBoundingClientRect());
    const observer = new ResizeObserver(update); observer.observe(canvas);
    window.addEventListener('scroll', update, true); window.addEventListener('resize', update); update();
    return () => { observer.disconnect(); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [canvas]);
  if (!rect.width || !rect.height) return null;
  const ratio = aspect ?? rect.width / rect.height;
  const height = Math.min(rect.height, rect.width / ratio), width = height * ratio;
  return <Portal><Box aria-hidden sx={{ position: 'fixed', pointerEvents: 'none', overflow: 'hidden', zIndex: 1100, left: rect.left, top: rect.top, width: rect.width, height: rect.height }}>
    <Box data-testid="presentation-framing-guide" sx={{ position: 'absolute', boxSizing: 'border-box', left: (rect.width - width) / 2, top: (rect.height - height) / 2, width, height, border: '1px solid #fff', outline: '1px solid #0008', boxShadow: '0 0 0 9999px #0005' }} />
  </Box></Portal>;
}

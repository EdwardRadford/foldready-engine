import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { Box, DomMetrics } from './probe';

export interface Comparison {
  pixelDiffPct: number;
  layoutShiftCount: number;
  comparedBoxes: number;
  overflowOnlyAfterResize: boolean;
  differs: boolean;
}

/** Pixel difference (percent) of the top `cropHeight` rows of two PNG buffers. */
export function pixelDiffTop(a: Buffer, b: Buffer, cropHeight: number): number {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  const w = Math.min(pa.width, pb.width);
  const h = Math.min(pa.height, pb.height, cropHeight);
  if (w === 0 || h === 0) return 0;
  const crop = (p: PNG) => {
    const out = new PNG({ width: w, height: h });
    PNG.bitblt(p, out, 0, 0, w, h, 0, 0);
    return out;
  };
  const ca = crop(pa);
  const cb = crop(pb);
  const diff = pixelmatch(ca.data, cb.data, null, w, h, { threshold: 0.15, includeAA: true });
  return (diff / (w * h)) * 100;
}

export function layoutDiff(after: Box[], fresh: Box[], tolerance = 6): { shifted: number; compared: number } {
  const map = new Map(fresh.map((b) => [b.key, b]));
  let shifted = 0;
  let compared = 0;
  for (const b of after) {
    const f = map.get(b.key);
    if (!f) continue;
    compared++;
    if (Math.abs(b.x - f.x) > tolerance || Math.abs(b.w - f.w) > tolerance || Math.abs(b.h - f.h) > tolerance * 2) shifted++;
  }
  return { shifted, compared };
}

export function compareFold(
  afterResize: { metrics: DomMetrics; png: Buffer },
  freshLoad: { metrics: DomMetrics; png: Buffer },
  viewportHeightPx: number,
): Comparison {
  let pixelDiffPct = 0;
  try {
    pixelDiffPct = pixelDiffTop(afterResize.png, freshLoad.png, viewportHeightPx);
  } catch {
    pixelDiffPct = 0;
  }
  const { shifted, compared } = layoutDiff(afterResize.metrics.boxes, freshLoad.metrics.boxes);
  const freshOverflows = freshLoad.metrics.scrollWidth > freshLoad.metrics.innerWidth + 1;
  const afterOverflows = afterResize.metrics.scrollWidth > afterResize.metrics.innerWidth + 1;
  const overflowOnlyAfterResize = afterOverflows && !freshOverflows;
  const shiftRatio = compared ? shifted / compared : 0;
  // Layout signals only. Pixel difference is reported as evidence but never decides: hero videos,
  // carousels and cookie banners change pixels without any layout bug.
  const differs = overflowOnlyAfterResize || (compared >= 5 && shiftRatio >= 0.25 && shifted >= 3);
  return {
    pixelDiffPct: Math.round(pixelDiffPct * 10) / 10,
    layoutShiftCount: shifted,
    comparedBoxes: compared,
    overflowOnlyAfterResize,
    differs,
  };
}

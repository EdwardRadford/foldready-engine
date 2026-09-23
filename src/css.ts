// Pure text analysis of the page's CSS and HTML. No browser needed; unit-tested.
import type { Platform } from './types';
import { FOLDED_TRAP_BAND } from './device';

export interface MediaQueryInfo {
  raw: string;        // the condition text, e.g. "(max-width: 480px)"
  minWidth?: number;  // px
  maxWidth?: number;  // px
}

export interface CssInfo {
  bytes: number;
  mediaQueries: MediaQueryInfo[];
  widthQueries: MediaQueryInfo[];      // queries that mention a width at all
  trapQueries: MediaQueryInfo[];       // width breakpoints in the folded trap band
  landscapeQueries: MediaQueryInfo[];  // orientation: landscape rules that would fire at 890×626
  vh: { count: number; dvhOrSvh: number; samples: string[] };
  fixedWidthRules: string[];           // e.g. "width: 960px" on selectors that look like page containers
}

const PX = /(-?\d+(?:\.\d+)?)\s*(px|em|rem)/i;

function toPx(value: string): number | undefined {
  const m = PX.exec(value);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === 'px' ? n : n * 16;
}

/** Extract every @media condition from CSS text. Tolerant of minified input. */
export function extractMediaQueries(css: string): MediaQueryInfo[] {
  const out: MediaQueryInfo[] = [];
  const re = /@media\s*([^{]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const raw = m[1].trim().replace(/\s+/g, ' ');
    const info: MediaQueryInfo = { raw };
    const min = /min-width\s*:\s*([\d.]+\s*(?:px|em|rem))/i.exec(raw);
    const max = /max-width\s*:\s*([\d.]+\s*(?:px|em|rem))/i.exec(raw);
    // range syntax: (width >= 480px), (width <= 480px), (480px <= width)
    const rangeGe = /width\s*>=?\s*([\d.]+\s*(?:px|em|rem))/i.exec(raw) || /([\d.]+\s*(?:px|em|rem))\s*<=?\s*width/i.exec(raw);
    const rangeLe = /width\s*<=?\s*([\d.]+\s*(?:px|em|rem))/i.exec(raw) || /([\d.]+\s*(?:px|em|rem))\s*>=?\s*width/i.exec(raw);
    if (min) info.minWidth = toPx(min[1]);
    else if (rangeGe) info.minWidth = toPx(rangeGe[1]);
    if (max) info.maxWidth = toPx(max[1]);
    else if (rangeLe) info.maxWidth = toPx(rangeLe[1]);
    out.push(info);
  }
  return out;
}

export function analyseCss(cssTexts: string[]): CssInfo {
  const css = cssTexts.join('\n');
  const mediaQueries = extractMediaQueries(css);
  const widthQueries = mediaQueries.filter((q) => q.minWidth !== undefined || q.maxWidth !== undefined);
  const [lo, hi] = FOLDED_TRAP_BAND;
  const inBand = (n?: number) => n !== undefined && n >= lo && n <= hi;
  const seen = new Set<string>();
  const trapQueries = widthQueries.filter((q) => {
    if (!(inBand(q.minWidth) || inBand(q.maxWidth))) return false;
    if (seen.has(q.raw)) return false;
    seen.add(q.raw);
    return true;
  });

  // Landscape rules meant for a rotated phone fire the moment the Duo opens (890 wide, 626 tall).
  const seenL = new Set<string>();
  const landscapeQueries = mediaQueries.filter((q) => {
    if (!/orientation\s*:\s*landscape/i.test(q.raw)) return false;
    if (q.minWidth !== undefined && q.minWidth > 890) return false;
    if (q.maxWidth !== undefined && q.maxWidth < 890) return false;
    if (seenL.has(q.raw)) return false;
    seenL.add(q.raw);
    return true;
  });

  const vhMatches = css.match(/(?:min-|max-)?height\s*:\s*(?:calc\([^)]*)?100\s*vh/gi) ?? [];
  const dvhMatches = css.match(/(?:min-|max-)?height\s*:\s*(?:calc\([^)]*)?100\s*[ds]vh/gi) ?? [];
  const vhSamples = Array.from(new Set(vhMatches.map((s) => s.replace(/\s+/g, ' ')))).slice(0, 5);

  // Fixed-width page containers: a rule on a container-ish selector with a px width >= 500.
  const fixedWidthRules: string[] = [];
  const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
  let r: RegExpExecArray | null;
  while ((r = ruleRe.exec(css))) {
    const sel = r[1].trim();
    const body = r[2];
    if (!/(?:^|[\s,.#])(?:container|wrapper|wrap|page|main|content|site|inner|body|header|footer)\b/i.test(sel)) continue;
    const w = /(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(body);
    if (w && parseFloat(w[1]) >= 500 && !/max-width/i.test(body)) {
      fixedWidthRules.push(`${sel.slice(0, 60)} { width: ${w[1]}px }`);
      if (fixedWidthRules.length >= 8) break;
    }
  }

  return {
    bytes: css.length,
    mediaQueries,
    widthQueries,
    trapQueries,
    landscapeQueries,
    vh: { count: vhMatches.length, dvhOrSvh: dvhMatches.length, samples: vhSamples },
    fixedWidthRules,
  };
}

export function detectPlatform(html: string): Platform {
  const h = html.slice(0, 200_000).toLowerCase();
  if (h.includes('/wp-content/') || h.includes('/wp-includes/') || h.includes('wp-json')) return 'wordpress';
  if (h.includes('squarespace.com') || h.includes('squarespace-cdn') || h.includes('static1.squarespace')) return 'squarespace';
  if (h.includes('wixstatic.com') || h.includes('wix.com') || h.includes('_wix')) return 'wix';
  if (h.includes('webflow.js') || h.includes('data-wf-page') || h.includes('website-files.com')) return 'webflow';
  if (h.includes('cdn.shopify.com') || h.includes('shopify.theme') || h.includes('myshopify')) return 'shopify';
  if (h.length < 200) return 'unknown';
  return 'custom';
}

export interface ViewportMetaInfo {
  present: boolean;
  content: string | null;
  deviceWidth: boolean;
  fixedWidth?: number;
  blocksZoom: boolean;
}

export function analyseViewportMeta(content: string | null): ViewportMetaInfo {
  if (content === null) return { present: false, content: null, deviceWidth: false, blocksZoom: false };
  const c = content.toLowerCase();
  const fw = /width\s*=\s*(\d+)/.exec(c);
  return {
    present: true,
    content,
    deviceWidth: /width\s*=\s*device-width/.test(c),
    fixedWidth: fw ? parseInt(fw[1], 10) : undefined,
    blocksZoom: /user-scalable\s*=\s*(no|0)/.test(c) || /maximum-scale\s*=\s*1(\.0+)?(?![\d.])/.test(c),
  };
}

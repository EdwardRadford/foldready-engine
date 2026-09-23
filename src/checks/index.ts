// Every check returns pass | warn | fail (or info) with one plain-English sentence.
import type { Finding, ViewportId } from '../types';
import type { RenderOutput, Capture } from '../render';
import type { CssInfo } from '../css';
import { analyseViewportMeta } from '../css';
import type { Comparison } from '../compare';
import { FOLDED, UNFOLDED, SPLIT } from '../device';

export interface CheckInput {
  render: RenderOutput;
  css: CssInfo;
  fold: Comparison;       // unfolded without reload vs fresh unfolded load
  foldBack: Comparison;   // folded back without reload vs the original folded load
}

const label: Record<ViewportId, string> = { folded: 'folded screen', unfolded: 'unfolded screen', split: 'Split View' };

function overflowCheck(cap: Capture, id: ViewportId): Finding {
  const m = cap.metrics;
  const extra = m.scrollWidth - m.innerWidth;
  if (extra <= 1) {
    return { id: `overflow-${id}`, status: 'pass', viewport: id, title: `Fits the ${label[id]}`, detail: `Nothing spills past the right edge at ${cap.viewport.width}px wide.` };
  }
  const evidence = m.overflowing.map((o) => `${o.sel} is ${o.width}px wide${o.explicit ? ' (fixed width)' : ''}`);
  return {
    id: `overflow-${id}`,
    status: 'fail',
    viewport: id,
    title: `Horizontal scrollbar on the ${label[id]}`,
    detail: `The page is ${extra}px wider than the ${label[id]} (${cap.viewport.width}px), so it scrolls sideways.`,
    evidence,
  };
}

export function runChecks({ render, css, fold, foldBack }: CheckInput): Finding[] {
  const f: Finding[] = [];
  const folded = render.folded.metrics;

  // 1. viewport meta
  const vm = analyseViewportMeta(folded.viewportMeta);
  if (!vm.present) {
    f.push({ id: 'viewport-meta', scope: 'general', status: 'fail', title: 'No viewport meta tag', detail: 'Without it, Safari renders the page at desktop width and shrinks it to fit, so nothing adapts to the Duo.' });
  } else if (vm.fixedWidth && !vm.deviceWidth) {
    f.push({ id: 'viewport-meta', scope: 'general', status: 'fail', title: `Viewport locked to ${vm.fixedWidth}px`, detail: 'The viewport tag sets a fixed width, so the page is scaled rather than laid out for the screen.', evidence: [vm.content ?? ''] });
  } else if (vm.blocksZoom) {
    f.push({ id: 'viewport-meta', scope: 'general', status: 'warn', title: 'Pinch zoom is disabled', detail: 'The viewport tag blocks zooming. Not a Duo problem, but worth removing.', evidence: [vm.content ?? ''] });
  } else {
    f.push({ id: 'viewport-meta', scope: 'general', status: 'pass', title: 'Viewport tag is set correctly', detail: 'The page tells Safari to use the real screen width.' });
  }

  // 2. overflow at each width
  f.push(overflowCheck(render.folded, 'folded'));
  f.push(overflowCheck(render.unfolded, 'unfolded'));
  f.push(overflowCheck(render.split, 'split'));

  // 3. fixed pixel widths wider than the folded screen
  const fixedWide = folded.overflowing.filter((o) => o.explicit);
  const foldedOverflows = folded.scrollWidth > folded.innerWidth + 1;
  if (fixedWide.length > 0 || css.fixedWidthRules.length > 0) {
    f.push({
      id: 'fixed-width',
      status: fixedWide.length > 0 && foldedOverflows ? 'fail' : 'warn',
      viewport: 'folded',
      title: 'Elements with a fixed pixel width',
      detail: fixedWide.length > 0
        ? `${fixedWide.length} element${fixedWide.length === 1 ? ' is' : 's are'} set to a pixel width wider than the folded screen.`
        : 'The stylesheet sets a fixed pixel width on a page container; it may not adapt at every Duo size.',
      evidence: [...fixedWide.map((o) => `${o.sel}: ${o.width}px`), ...css.fixedWidthRules],
    });
  } else {
    f.push({ id: 'fixed-width', status: 'pass', title: 'No fixed-width elements', detail: 'Widths are fluid, which is what the three Duo sizes need.' });
  }

  // 4. 100vh usage
  const heroes = folded.vhHeroes;
  if (heroes.length > 0) {
    f.push({
      id: 'vh-units',
      status: 'warn',
      viewport: 'folded',
      title: 'A full-height section is pinned to the screen height',
      detail: 'On the folded screen the height is short, and it changes again on unfolding. A section sized to 100vh can cut content off or jump when the phone opens.',
      evidence: [...heroes.map((h) => `${h.sel} is ${h.height}px tall`), ...css.vh.samples],
    });
  } else if (css.vh.count > 0) {
    f.push({ id: 'vh-units', status: 'pass', title: 'No sections pinned to the screen height', detail: 'The stylesheet mentions 100vh, but nothing in the first screen is sized to it, so folding will not cut content off.', evidence: css.vh.samples });
  } else if (css.vh.dvhOrSvh > 0) {
    f.push({ id: 'vh-units', status: 'pass', title: 'Height units are fold-safe', detail: 'The page uses dvh or svh units, which track the real screen height.' });
  } else {
    f.push({ id: 'vh-units', status: 'pass', title: 'No 100vh sections', detail: 'Nothing is pinned to the screen height, so folding will not cut content off.' });
  }

  // 5. breakpoints in the folded trap band
  if (css.trapQueries.length > 0) {
    const tabletSide = css.trapQueries.filter((q) => (q.maxWidth !== undefined && q.maxWidth < FOLDED.width) || (q.minWidth !== undefined && q.minWidth <= FOLDED.width));
    if (tabletSide.length > 0) {
      f.push({
        id: 'breakpoint-band',
        status: 'warn',
        viewport: 'folded',
        title: 'Folded screen gets the wider layout',
        detail: `The layout switches at a width just under ${FOLDED.width}px, so the folded screen lands on the wider-layout side. It may get a cramped tablet layout on a phone-sized screen.`,
        evidence: tabletSide.map((q) => `@media ${q.raw}`).slice(0, 8),
      });
    } else {
      f.push({
        id: 'breakpoint-band',
        status: 'pass',
        viewport: 'folded',
        title: 'Folded screen stays in the phone layout',
        detail: `A breakpoint sits just above ${FOLDED.width}px, but the folded screen falls on the phone side of it. Worth re-checking once real device sizes are confirmed.`,
        evidence: css.trapQueries.map((q) => `@media ${q.raw}`).slice(0, 8),
      });
    }
  } else if (css.widthQueries.length > 0) {
    f.push({ id: 'breakpoint-band', status: 'pass', title: 'No breakpoints near the folded width', detail: `None of the ${css.widthQueries.length} width breakpoints land between 440px and 500px.` });
  }

  // 6. tap targets (folded)
  if (folded.tapTotal > 0) {
    const ratio = folded.smallTapTotal / folded.tapTotal;
    if (folded.smallTapTotal >= 3 && ratio > 0.25) {
      f.push({
        id: 'tap-targets',
        scope: 'general',
        status: 'warn',
        viewport: 'folded',
        title: 'Some tap targets are small',
        detail: `${folded.smallTapTotal} of ${folded.tapTotal} links and buttons near the top are under 44px, which is fiddly on a phone.`,
        evidence: folded.smallTapTargets.map((t) => `${t.sel}: ${t.w}×${t.h}px`),
      });
    } else {
      f.push({ id: 'tap-targets', scope: 'general', status: 'pass', title: 'Tap targets are big enough', detail: 'Links and buttons are comfortably tappable on the folded screen.' });
    }
  }

  // 7. text size (folded)
  if (folded.textChars > 200) {
    const pct = Math.round((folded.smallTextChars / folded.textChars) * 100);
    if (pct > 50) {
      f.push({ id: 'text-size', scope: 'general', status: 'warn', viewport: 'folded', title: 'Most text is under 16px', detail: `About ${pct}% of the text on the folded screen is smaller than 16px.` });
    } else {
      f.push({ id: 'text-size', scope: 'general', status: 'pass', title: 'Text is readable', detail: `Most text on the folded screen is 16px or larger.` });
    }
  }

  // 8. fold transition: the Duo-specific check
  const ft = render.foldTransition.metrics;
  if (fold.differs) {
    const why = fold.overflowOnlyAfterResize
      ? `After unfolding, the page is ${ft.scrollWidth - ft.innerWidth}px too wide, but a fresh load at the same size fits.`
      : `${fold.layoutShiftCount} of ${fold.comparedBoxes} layout blocks sit in a different place than they do after a fresh load (${fold.pixelDiffPct}% of the top screen differs).`;
    f.push({
      id: 'fold-transition',
      status: 'fail',
      viewport: 'unfolded',
      title: 'Layout does not update when the phone unfolds',
      detail: `${why} Scripts that measured the screen once at load time are not re-measuring.`,
      evidence: [`pixel difference ${fold.pixelDiffPct}%`, `layout blocks moved ${fold.layoutShiftCount}/${fold.comparedBoxes}`],
    });
  } else {
    f.push({ id: 'fold-transition', status: 'pass', viewport: 'unfolded', title: 'Layout updates when the phone unfolds', detail: 'Unfolding mid-session gives the same page as a fresh load at the unfolded size.' });
  }

  // 9. landscape sanity (unfolded)
  const u = render.unfolded.metrics;
  const headerPct = Math.round((u.headerHeight / UNFOLDED.height) * 100);
  const fixedPct = Math.round(u.fixedCoverage * 100);
  if (headerPct > 40 || fixedPct > 45) {
    f.push({
      id: 'landscape-header',
      status: 'warn',
      viewport: 'unfolded',
      title: 'Header takes a lot of the unfolded screen',
      detail: headerPct > 40
        ? `The header is ${u.headerHeight}px tall, about ${headerPct}% of the ${UNFOLDED.height}px unfolded screen, leaving little room for content.`
        : `Fixed bars cover about ${fixedPct}% of the unfolded screen height.`,
    });
  } else {
    f.push({ id: 'landscape-header', status: 'pass', viewport: 'unfolded', title: 'Unfolded screen has room for content', detail: `The header and any fixed bars leave most of the ${UNFOLDED.height}px height free.` });
  }
  if (u.navPresent && !u.navVisible && !u.menuToggle) {
    f.push({ id: 'landscape-nav', status: 'warn', viewport: 'unfolded', title: 'Navigation is off screen when unfolded', detail: 'The navigation element exists but is not visible in the first screen at the unfolded size.' });
  }

  // 10. Split View note
  if (render.split.metrics.scrollWidth <= SPLIT.width + 1 && render.folded.metrics.scrollWidth <= FOLDED.width + 1) {
    f.push({ id: 'split-view', status: 'pass', viewport: 'split', title: 'Works in Split View', detail: `The page fits the ${SPLIT.width}px half-screen used when two apps share the inner display.` });
  }

  // 11. folding back: the mirror of the unfold check
  const fb = render.foldBack.metrics;
  if (foldBack.differs) {
    const why = foldBack.overflowOnlyAfterResize
      ? `After closing the phone, the page is ${fb.scrollWidth - fb.innerWidth}px too wide for the folded screen, although it fitted when first opened there.`
      : `${foldBack.layoutShiftCount} of ${foldBack.comparedBoxes} layout blocks sit in a different place than they did when the page first loaded folded.`;
    f.push({
      id: 'fold-back',
      status: 'fail',
      viewport: 'folded',
      title: 'Layout does not update when the phone closes',
      detail: `${why} The wider layout is staying put on the small screen.`,
      evidence: [...fb.overflowing.map((o) => `${o.sel} is ${o.width}px wide, ending at ${o.right}px`), `pixel difference ${foldBack.pixelDiffPct}%`, `layout blocks moved ${foldBack.layoutShiftCount}/${foldBack.comparedBoxes}`],
    });
  } else {
    f.push({ id: 'fold-back', status: 'pass', viewport: 'folded', title: 'Layout updates when the phone closes', detail: 'Closing the phone mid-session gives the same page as loading it folded.' });
  }

  // 12. script errors during the unfold
  if (render.unfoldErrors.length > 0) {
    f.push({
      id: 'unfold-errors',
      status: 'fail',
      viewport: 'unfolded',
      title: 'A script failed when the phone unfolded',
      detail: `${render.unfoldErrors.length} JavaScript error${render.unfoldErrors.length === 1 ? '' : 's'} fired while the screen changed size. Whatever that script does will not happen after opening the phone.`,
      evidence: render.unfoldErrors,
    });
  } else {
    f.push({ id: 'unfold-errors', status: 'pass', viewport: 'unfolded', title: 'No script errors on unfolding', detail: 'Nothing in the page\'s JavaScript failed when the screen changed size.' });
  }

  // 13. landscape rules meant for a rotated phone
  if (css.landscapeQueries.length > 0) {
    f.push({
      id: 'landscape-rules',
      status: 'warn',
      viewport: 'unfolded',
      title: 'Landscape rules fire when the phone opens',
      detail: `The stylesheet has ${css.landscapeQueries.length} rule${css.landscapeQueries.length === 1 ? '' : 's'} for a phone held sideways. The unfolded Duo counts as landscape, so they apply the moment it opens, usually hiding the header or shrinking the top of the page.`,
      evidence: css.landscapeQueries.map((q) => `@media ${q.raw}`).slice(0, 6),
    });
  }

  // 14. long lines of text when unfolded
  const wide = u.textBlocks.filter((t) => t.width >= 680 && t.fontSize <= 18);
  if (wide.length > 0) {
    const w = wide[0];
    const perLine = Math.round(w.width / (w.fontSize * 0.5));
    f.push({
      id: 'long-lines',
      status: 'warn',
      viewport: 'unfolded',
      title: 'Very long lines of text when unfolded',
      detail: `Paragraphs run ${w.width}px wide at ${Math.round(w.fontSize)}px text, roughly ${perLine} characters a line. Around 75 is comfortable; a max-width on text columns fixes it.`,
      evidence: wide.slice(0, 5).map((t) => `${t.sel}: ${t.width}px wide, ${Math.round(t.fontSize)}px text`),
    });
  } else if (u.textBlocks.length > 0) {
    f.push({ id: 'long-lines', status: 'pass', viewport: 'unfolded', title: 'Text columns stay readable when unfolded', detail: 'Paragraphs are capped at a comfortable width on the wide inner screen.' });
  }

  // 15. blurry images after the unfold
  const blurry = (m: typeof u) => m.images.filter((i) => i.natural < i.rendered * 0.9);
  const blurAfter = blurry(ft);
  const blurFresh = blurry(u);
  if (blurAfter.length > 0 && blurAfter.length > blurFresh.length) {
    f.push({
      id: 'blurry-images',
      status: 'warn',
      viewport: 'unfolded',
      title: 'Images stay low-resolution after unfolding',
      detail: `${blurAfter.length} image${blurAfter.length === 1 ? '' : 's'} chosen for the folded screen ${blurAfter.length === 1 ? 'is' : 'are'} stretched on the inner screen, so ${blurAfter.length === 1 ? 'it looks' : 'they look'} soft until the page reloads.`,
      evidence: blurAfter.slice(0, 6).map((i) => `${i.sel}: ${i.natural}px image shown at ${i.rendered}px`),
    });
  } else if (blurFresh.length >= 2) {
    f.push({
      id: 'blurry-images',
      scope: 'general',
      status: 'warn',
      viewport: 'unfolded',
      title: 'Some images are low-resolution on the inner screen',
      detail: `${blurFresh.length} images are smaller than the space they fill at ${UNFOLDED.width}px, so they look soft. Not caused by the fold, but visible on it.`,
      evidence: blurFresh.slice(0, 6).map((i) => `${i.sel}: ${i.natural}px image shown at ${i.rendered}px`),
    });
  } else if (ft.images.length > 0) {
    f.push({ id: 'blurry-images', status: 'pass', viewport: 'unfolded', title: 'Images stay sharp after unfolding', detail: 'Pictures are re-fetched or already large enough for the inner screen.' });
  }

  // 16. banners or overlays covering the folded screen
  if (folded.overlay && folded.overlay.coveragePct >= 30) {
    f.push({
      id: 'overlay-folded',
      status: folded.overlay.coveragePct >= 50 ? 'warn' : 'info',
      viewport: 'folded',
      title: `A banner covers ${folded.overlay.coveragePct}% of the folded screen`,
      detail: `A fixed banner or overlay takes ${folded.overlay.coveragePct}% of the short folded screen before anyone reads the page. On a taller phone the same banner takes far less.`,
      evidence: [folded.overlay.sel],
    });
  }

  // --- General insights: what any checker would say. Never fail, never drive the sale.
  const net = render.network;
  const mb = (b: number) => (b >= 1_000_000 ? (b / 1_000_000).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1000)) + ' KB');
  if (net.bytes > 0) {
    const heavy = net.bytes > 3_000_000;
    f.push({
      id: 'page-weight',
      scope: 'general',
      status: heavy ? 'warn' : 'pass',
      title: heavy ? `Heavy page: ${mb(net.bytes)}` : `Page weight ${mb(net.bytes)}`,
      detail: heavy
        ? `The first load pulls ${mb(net.bytes)} over ${net.requests} requests. On a mobile connection that is slow; images are ${mb(net.imageBytes)} of it.`
        : `The first load is ${mb(net.bytes)} over ${net.requests} requests, which is reasonable for mobile.`,
      evidence: [`images ${mb(net.imageBytes)}`, `scripts ${mb(net.scriptBytes)}`, `fonts ${mb(net.fontBytes)}`, `${net.requests} requests`],
    });
  }
  if (net.loadMs > 0) {
    const slow = net.loadMs > 5000;
    f.push({
      id: 'load-time',
      scope: 'general',
      status: slow ? 'warn' : 'pass',
      title: slow ? `Slow to load: ${(net.loadMs / 1000).toFixed(1)} s` : `Loaded in ${(net.loadMs / 1000).toFixed(1)} s`,
      detail: `Content appeared after ${(net.domContentLoadedMs / 1000).toFixed(1)} s and the page finished loading at ${(net.loadMs / 1000).toFixed(1)} s in our emulation, on a fast connection. Real phones on mobile data will be slower.`,
    });
  }
  if (net.insecureRequests > 0) {
    f.push({ id: 'mixed-content', scope: 'general', status: 'warn', title: 'Some files load over plain http', detail: `${net.insecureRequests} request${net.insecureRequests === 1 ? '' : 's'} on this https page use http, which Safari blocks or flags.` });
  }
  const a = folded.a11y;
  f.push(a.hasTitle && a.hasDescription
    ? { id: 'page-meta', scope: 'general', status: 'pass', title: 'Title and description are set', detail: 'The page has a title and a meta description for search results.' }
    : { id: 'page-meta', scope: 'general', status: 'warn', title: a.hasTitle ? 'No meta description' : 'No page title', detail: a.hasTitle ? 'Search results will pick their own snippet without a meta description.' : 'The page has no title, so tabs, bookmarks and search results show the address instead.' });
  f.push(a.hasLang
    ? { id: 'page-lang', scope: 'general', status: 'pass', title: 'Page language is declared', detail: 'Screen readers and translation tools know which language to use.' }
    : { id: 'page-lang', scope: 'general', status: 'warn', title: 'Page language is not declared', detail: 'Adding lang="en" to the html tag helps screen readers pronounce the page correctly.' });
  if (a.imgTotal > 0) {
    f.push(a.imgNoAlt === 0
      ? { id: 'image-alt', scope: 'general', status: 'pass', title: 'Every image has alt text', detail: `All ${a.imgTotal} images carry an alt attribute.` }
      : { id: 'image-alt', scope: 'general', status: 'warn', title: `${a.imgNoAlt} of ${a.imgTotal} images have no alt text`, detail: 'Screen readers skip them or read the filename. Decorative images should carry an empty alt="".' });
  }
  f.push(a.h1Count === 1
    ? { id: 'headings', scope: 'general', status: 'pass', title: 'One main heading', detail: 'The page has a single h1, which is what search engines and screen readers expect.' }
    : { id: 'headings', scope: 'general', status: 'warn', title: a.h1Count === 0 ? 'No main heading' : `${a.h1Count} main headings`, detail: a.h1Count === 0 ? 'There is no h1 on the page, so nothing says what it is about.' : 'More than one h1 blurs what the page is about. Keep one and demote the rest.' });
  if (a.inputTotal > 0) {
    f.push(a.inputNoLabel === 0
      ? { id: 'form-labels', scope: 'general', status: 'pass', title: 'Form fields are labelled', detail: `All ${a.inputTotal} form fields have a label.` }
      : { id: 'form-labels', scope: 'general', status: 'warn', title: `${a.inputNoLabel} of ${a.inputTotal} form fields have no label`, detail: 'Unlabelled fields are hard to fill in with a screen reader and get no autofill help.' });
  }
  if (a.linkTotal > 0 && a.linkNoText > 0) {
    f.push({ id: 'link-text', scope: 'general', status: 'warn', title: `${a.linkNoText} links have no text`, detail: 'Icon-only links need an aria-label so screen readers can say where they go.' });
  }

  const order = { fail: 0, warn: 1, info: 2, pass: 3 } as const;
  return f.sort((a, b) => order[a.status] - order[b.status]);
}

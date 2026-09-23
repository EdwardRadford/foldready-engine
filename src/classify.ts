// Outcome decides which button the visitor sees. Tune here, never renegotiate with a customer.
import type { Finding, Outcome } from './types';
import type { CssInfo, ViewportMetaInfo } from './css';
import type { DomMetrics } from './probe';

export interface ClassifyInput {
  findings: Finding[];
  css: CssInfo;
  viewportMeta: ViewportMetaInfo;
  folded: DomMetrics;
}

export interface Classification {
  outcome: Outcome;
  score: number;
  summary: string;
  reasons: string[];
}

export function classify({ findings, css, viewportMeta, folded }: ClassifyInput): Classification {
  // Only Duo findings decide the outcome and the score. General insights are notes.
  const duo = findings.filter((f) => f.scope !== 'general' || f.id === 'viewport-meta');
  const fails = duo.filter((f) => f.status === 'fail');
  const warns = duo.filter((f) => f.status === 'warn');
  const score = Math.max(0, 100 - fails.length * 20 - warns.length * 7);
  const reasons: string[] = [];

  // Honest by default: a site with no failures passes, whatever its foundation. Warns are notes,
  // not a reason to sell a fix.
  if (fails.length === 0) {
    return {
      outcome: 'passes',
      score,
      summary: warns.length <= 2
        ? 'Your site handles the Duo at all three screen sizes.'
        : `Your site handles the Duo at all three screen sizes, with ${warns.length} things worth a look.`,
      reasons: [],
    };
  }

  // Needs more than a patch: the site has no responsive foundation to patch.
  if (!viewportMeta.present) reasons.push('no viewport meta tag');
  if (viewportMeta.present && viewportMeta.fixedWidth && !viewportMeta.deviceWidth) reasons.push('viewport locked to a fixed width');
  if (css.widthQueries.length === 0) reasons.push('no width media queries');
  const bodyLevelFixed = folded.overflowing.filter((o) => o.explicit && o.width >= 600);
  if (bodyLevelFixed.length > 0) reasons.push('fixed-width page container');
  if (folded.bigTables.length > 0) reasons.push('table-based layout');

  if (reasons.length > 0) {
    return {
      outcome: 'needs-more',
      score,
      summary: 'Your site was built for a fixed width, so a small patch would not be enough.',
      reasons,
    };
  }

  const lead = fails[0]?.title ?? warns[0]?.title ?? 'a few things';
  const count = fails.length + warns.length;
  return {
    outcome: 'patchable',
    score,
    summary: fails.length > 0
      ? `Your site is responsive, but ${count} thing${count === 1 ? '' : 's'} go${count === 1 ? 'es' : ''} wrong at the Duo's screen sizes, starting with: ${lead.toLowerCase()}.`
      : `Your site mostly works on the Duo, with ${count} things worth tightening up.`,
    reasons: [],
  };
}

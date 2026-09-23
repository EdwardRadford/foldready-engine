// Contract between the engine and the web UI. Keep additive.
export type ViewportId = 'folded' | 'unfolded' | 'split';
export type ShotKind = ViewportId | 'fold-transition' | 'fold-back' | 'other';
export type Status = 'pass' | 'warn' | 'fail' | 'info';
export type Outcome = 'passes' | 'patchable' | 'needs-more';
export type Platform = 'wordpress' | 'squarespace' | 'wix' | 'webflow' | 'shopify' | 'custom' | 'unknown';

export interface ViewportSpec {
  id: ViewportId;
  label: string;        // "Folded", "Unfolded", "Split View"
  width: number;        // CSS px
  height: number;       // CSS px
  description: string;  // one plain sentence
}

export interface Finding {
  id: string;           // stable machine id, e.g. "overflow-folded"
  status: Status;
  scope?: 'duo' | 'general'; // 'general' = what any checker would say; default 'duo'
  title: string;        // short, plain English
  detail: string;       // one or two sentences, specific, calm
  viewport?: ViewportId;
  evidence?: string[];  // selectors, values, media queries — shown behind "details"
}

export interface Shot {
  kind: ShotKind;
  file: string;         // filename only, e.g. "folded.png"; served by the web app
  width: number;        // viewport width
  height: number;       // viewport height
  fullHeight: number;   // full-page height captured
  label?: string;       // for kind 'other': e.g. "iPhone 17"
  description?: string; // for kind 'other': one plain sentence
}

export interface Video {
  kind: 'folded' | 'unfolded';
  file: string;         // e.g. "folded.webm"; the page as it plays for a few seconds after load
  width: number;
  height: number;
  durationMs: number;
}

export interface FoldTransition {
  differs: boolean;
  pixelDiffPct: number;     // 0-100, post-resize vs fresh load at unfolded size
  layoutShiftCount: number; // elements whose box differs between the two
  note: string;             // one plain sentence
}

export interface Result {
  id: string;
  engineVersion?: number;   // ENGINE_VERSION that produced this result
  url: string;
  finalUrl: string;
  checkedAt: string;        // ISO
  durationMs: number;
  engine: 'webkit' | 'chromium';
  platform: Platform;
  outcome: Outcome;
  score: number;            // 0-100, secondary to the screenshots
  summary: string;          // one sentence for the top of the results page
  findings: Finding[];      // ordered: fails, warns, passes
  shots: Shot[];
  videos?: Video[];         // short clips at the folded and unfolded sizes, animations running
  foldTransition: FoldTransition;
  viewports: ViewportSpec[];
  emulationNote: string;
  error?: string;           // set when the page could not be fetched/rendered
}

export interface Job {
  id: string;
  url: string;
  state: 'queued' | 'running' | 'done' | 'error';
  progress: string;         // human readable, e.g. "Rendering folded view"
  createdAt: string;
  result?: Result;
  error?: string;
}

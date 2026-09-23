# foldready-engine

Renders a website at the three screen sizes of a foldable phone and reports what breaks.

Foldables are the first mainstream device where one browser changes viewport mid-session. A layout
can pass every normal responsive test and still fail the moment the device unfolds, because the
fold is a *resize without a reload* — no navigation, no fresh render, just a different box.

This is the engine behind [Fold Ready](https://foldready.com), extracted as a standalone module.
It has a CLI, a library API and JSON output, and it does not depend on the web app it was built for.

## Install

```bash
npm install
npx playwright install webkit
```

## Use

```bash
# human-readable
npx tsx src/cli.ts https://example.com

# machine-readable, for CI
npx tsx src/cli.ts https://example.com --json --out ./results
```

Flags: `--json` structured output · `--out <dir>` where screenshots land · `--chromium` render in
Chromium instead of WebKit · `--allow-local` permit localhost and private addresses.

As a library:

```ts
import { runCheck, closeBrowser } from './src/index';

const result = await runCheck('https://example.com', { json: true });
await closeBrowser();
```

## What it checks

Three viewports — folded, unfolded, and split-screen — with the fold simulated as a resize without
a reload, because that is what the device actually does. Every check returns `pass`, `warn` or
`fail` with one plain-English sentence explaining it, and the images are kept so a human can
disagree with the verdict.

## Design notes

- **WebKit by default.** The target device runs WebKit, so rendering in Chromium and hoping is not
  a test. Chromium is available behind a flag for comparison.
- **Viewport constants live in one file** (`src/device.ts`) so they can be corrected in one place
  when the hardware ships and the real numbers are known.
- **The URL guard is deliberate.** `src/url.ts` refuses credentials in URLs and, by default,
  localhost and private address ranges — a renderer that fetches arbitrary URLs on request is an
  SSRF hole if you let it be one.
- **No verdict without evidence.** Every result keeps the screenshot it was derived from.

## Licence

MIT. Built by [Edward Radford](https://edwardradford.co.uk).

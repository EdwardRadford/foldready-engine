# foldready-engine

[![CI](https://github.com/EdwardRadford/foldready-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/EdwardRadford/foldready-engine/actions/workflows/ci.yml)

Renders a website at the three screen sizes of a foldable phone and reports what breaks.

**This is the rendering core of [foldready](https://github.com/EdwardRadford/foldready), a
website-fix service I am building, extracted as a standalone module.** `src/` here is the app's
`src/engine/`, so the two public repos deliberately overlap: nine of these eleven files are
byte-identical to their copies there, about 1,500 of 1,640 lines. It is split out because the
checker is worth having without the service around it — CLI, library API, JSON output, and no
dependency on the web app or its hosting.

Foldables are the first mainstream device where one browser changes viewport mid-session. A layout
can pass every normal responsive test and still fail the moment the device unfolds, because the
fold is a *resize without a reload* — no navigation, no fresh render, just a different box.

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
  SSRF hole if you let it be one. It resolves the host first and checks the addresses DNS actually
  returns, not just the string, and it fails closed on anything it cannot parse as an address.
  `test/url.test.ts` is the proof: see below.
- **No verdict without evidence.** Every result keeps the screenshot it was derived from.

## Tests

```bash
npm ci
npm test              # 18 tests over the URL guard, offline
npm run typecheck     # src/
npm run typecheck:test # src/ and test/
```

The tests cover `src/url.ts`, because that module is the only thing between a public check
endpoint and the machine's own network. They are table-driven and run offline — every case is
string work or an IP literal, so no test performs a lookup or opens a browser. What they pin down:
scheme and credential rejection; each reserved IPv4 range including carrier-grade NAT
(100.64/10), link-local (169.254/16, where cloud metadata lives), benchmarking (198.18/15) and
multicast, with the addresses immediately either side of each range asserted public; IPv6
loopback, link-local, unique-local and multicast; IPv4-mapped IPv6 (`::ffff:127.0.0.1` must be
refused like `127.0.0.1`); and fail-closed behaviour on input that is not an address at all.

Writing them found a real hole: IPv6 multicast (`ff00::/8`, including `ff02::1`, all nodes on the
link) and site-local (`fec0::/10`) were being treated as public. Both are blocked now.

GitHub Actions runs the type checks and the tests on every push and pull request.

## Licence

MIT. Built by [Edward Radford](https://edwardradford.co.uk).

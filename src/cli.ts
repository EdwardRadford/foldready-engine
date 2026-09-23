#!/usr/bin/env node
// duocheck <url> [--out dir] [--json] [--chromium] [--allow-local]
import path from 'node:path';
import { runCheck, closeBrowser, UrlError } from './index';

async function main() {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith('--'));
  if (!url) {
    console.error('usage: duocheck <url> [--out dir] [--json] [--chromium] [--allow-local]');
    process.exit(2);
  }
  const outIdx = args.indexOf('--out');
  const id = Date.now().toString(36);
  const outDir = outIdx >= 0 ? args[outIdx + 1] : path.join('out', id);
  const json = args.includes('--json');
  const engine = args.includes('--chromium') ? 'chromium' : 'webkit';
  const allowLocal = args.includes('--allow-local');

  try {
    const result = await runCheck(url, {
      id,
      outDir,
      engine,
      allowLocal,
      onProgress: (m) => { if (!json) console.error(`  ${m}`); },
    });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n${result.finalUrl}`);
      console.log(`${result.outcome.toUpperCase()}  score ${result.score}  platform ${result.platform}  ${Math.round(result.durationMs / 1000)}s`);
      console.log(result.summary);
      if (result.error) console.log(`error: ${result.error}`);
      console.log('');
      for (const f of result.findings) console.log(`  ${f.status.padEnd(4)}  ${f.title}  -  ${f.detail}`);
      console.log(`\nfold: ${result.foldTransition.note} (pixels ${result.foldTransition.pixelDiffPct}%, blocks moved ${result.foldTransition.layoutShiftCount})`);
      console.log(`shots: ${path.resolve(outDir)}`);
    }
  } catch (e) {
    if (e instanceof UrlError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  } finally {
    await closeBrowser();
  }
}

main();

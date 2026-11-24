/* global console, ValleyCapture */
// Run from the repository root. Supports stock Playwright Chromium on a GPU-less CI host.
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';
const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] || 'test-results/world-calibration');
const gradeFile = process.argv[3];
const grade = gradeFile ? JSON.parse(await readFile(gradeFile, 'utf8')) : { gain: [1, 1, 1], saturation: 1 };
const refs = JSON.parse(await readFile(join(here, 'reference-regions.json'), 'utf8'));
const bundle = await build({
  entryPoints: [join(here, 'fixture.js')],
  bundle: true,
  format: 'iife',
  globalName: 'ValleyCapture',
  write: false,
  logLevel: 'silent',
});
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
await mkdir(out, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 480, height: 320 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.setContent('<body style="margin:0">');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const meta = [];
  for (const [i, frame] of refs.frames.entries()) {
    const entry = await page.evaluate(
      ([f, i, g, mask]) => ValleyCapture.capture(f, i, g, mask),
      [frame, i, grade, !gradeFile],
    );
    for (const [j, s] of entry.shots.entries()) {
      for (const [name, data] of Object.entries(s))
        if (data)
          await writeFile(
            join(out, `${frame.id}-${j}-${name}.png`),
            Buffer.from(data.split(',')[1], 'base64'),
          );
    }
    delete entry.shots;
    meta.push({ id: frame.id, ...entry });
    if (errors.length) throw Error(errors.join('\n'));
    console.log('Captured', frame.id);
  }
  await writeFile(join(out, 'captures.json'), JSON.stringify(meta, null, 2));
} finally {
  await browser.close();
}

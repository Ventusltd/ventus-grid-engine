/** Deterministic browser bundle of the owned receipt and presentation code.
 * Usage: node tools/build-browser-observer.mjs <output-file>
 * This bundles observation only; the caller must supply its actual calculation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function buildBrowserObserver() {
  const read = name => fs.readFileSync(path.join(root, 'engine', name), 'utf8').replace(/\r\n/g, '\n');
  const geodesy = read('v9-geodesy.js').replace(/^export /gm, '');
  const observer = read('compute-observer.js').replace(/^import .*;\n/m, '').replace(/^export /gm, '');
  const presentation = read('compute-presentation.js').replace(/^export /gm, '');
  return `/* Ventus Grid Engine: generated receipt observer; not a substitute nearest engine. */\n(() => {\n'use strict';\nconst distanceKm = (() => {\n${geodesy}\nreturn distanceKm;\n})();\n${observer}\n${presentation}\nglobalThis.VentusGridCompute = Object.freeze({ schema, createComputeObserver, describeComputeReceipt });\n})();\n`;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Output file is required');
  fs.writeFileSync(process.argv[2], buildBrowserObserver());
}

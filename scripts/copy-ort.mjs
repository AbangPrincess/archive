// Copies the speech engine runtime (ONNX Runtime Web) into public/ort so the app serves it
// itself instead of loading code from a third-party CDN. Runs before `dev` and `build`.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const to = join(root, 'public', 'ort');
mkdirSync(to, { recursive: true });
for (const file of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  copyFileSync(join(from, file), join(to, file));
}
console.log('speech runtime copied to public/ort');

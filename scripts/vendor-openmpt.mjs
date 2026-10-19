// 从 chiptune3（MIT，含 BSD 许可的 libopenmpt WebAssembly 构建）复制 libopenmpt.worklet.js 到 public/vendor/openmpt，
// 并导出 wasmTable，以便调用 libopenmpt 扩展接口（通道静音）。
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('chiptune3/package.json'));
const out = join(process.cwd(), 'public/vendor/openmpt');
mkdirSync(out, { recursive: true });
const target = join(out, 'libopenmpt.worklet.js');
let src = readFileSync(join(pkgDir, 'libopenmpt.worklet.js'), 'latin1');
const m = src.match(/wasmTable=wasmExports\["(\w+)"\]/);
if (!m) throw new Error('无法定位 wasmTable，chiptune3 版本可能已变化');
src = src.replace(m[0], `${m[0]};Module["wasmTable"]=wasmTable`);
if (!existsSync(target) || readFileSync(target, 'latin1') !== src) writeFileSync(target, src, 'latin1');
copyFileSync(join(pkgDir, 'LICENSE'), join(out, 'LICENSE-chiptune3.txt'));
console.log('libopenmpt worklet ready');

/**
 * 应用内导入的工作进程（Electron utilityProcess）：
 * 解压玩家选择的安装包（7z 自解压）或直接读取游戏目录，生成资源包到用户数据目录。
 * 不渲染音乐（游戏内用 libopenmpt WebAssembly 实时播放原版模块）。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { runImport } from './importer';

interface Job {
  source: string;
  outDir: string;
  tempDir: string;
  sevenZip: string;
}

type Port = { on(ev: 'message', cb: (e: { data: Job }) => void): void; postMessage(m: unknown): void };
const port = (process as unknown as { parentPort: Port }).parentPort;

function post(m: unknown) {
  port.postMessage(m);
}

port.on('message', (e) => {
  const job = e.data;
  try {
    let gameDir = job.source;
    if (statSync(job.source).isFile()) {
      post({ type: 'log', text: '正在解压安装包……' });
      rmSync(job.tempDir, { recursive: true, force: true });
      mkdirSync(job.tempDir, { recursive: true });
      execFileSync(job.sevenZip, ['x', '-y', `-o${job.tempDir}`, job.source], { stdio: 'ignore', windowsHide: true });
      gameDir = job.tempDir;
    }
    const staging = `${job.outDir}.new`;
    rmSync(staging, { recursive: true, force: true });
    const m = runImport({
      gameDir,
      outDir: staging,
      log: (text) => post({ type: 'log', text }),
      progress: (done, total, stage) => post({ type: 'progress', done, total, stage }),
    });
    // 原子替换旧资源包
    if (existsSync(job.outDir)) rmSync(job.outDir, { recursive: true, force: true });
    renameSync(staging, job.outDir);
    if (existsSync(job.tempDir)) rmSync(job.tempDir, { recursive: true, force: true });
    post({ type: 'done', stats: m.stats, reanims: Object.keys(m.reanims).length, images: Object.keys(m.images).length, sounds: Object.keys(m.sounds).length, source: m.source, music: !!m.mo3 });
  } catch (err) {
    post({ type: 'error', text: (err as Error).message });
  }
});

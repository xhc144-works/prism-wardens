import type { WorkerIn, WorkerOut } from '../workers/simWorker';
import { CONTENT } from '../core/content/registry';
import type { BatchRequest, BatchStats, GameSummary } from '../ai/runner';
import { aggregate } from '../ai/runner';
import type { ResearchRequest } from '../ai/research';
import type { CoachRequest } from '../ai/coach';

type Pending = { onProgress?: (o: Extract<WorkerOut, { type: 'progress' }>) => void; resolve: (v: unknown) => void; reject: (e: Error) => void };

let nextId = 1;

function makeWorker(): Worker {
  return new Worker(new URL('../workers/simWorker.ts', import.meta.url), { type: 'module' });
}

/** 在独立线程中运行模拟任务。返回 promise 与取消函数。 */
export function runInWorker<T>(type: WorkerIn['type'], req: unknown, onProgress?: (done: number, total: number, info: unknown) => void): { promise: Promise<T>; cancel: () => void } {
  const worker = makeWorker();
  const id = nextId++;
  let cancelled = false;
  const promise = new Promise<T>((resolve, reject) => {
    const p: Pending = { resolve: resolve as (v: unknown) => void, reject, onProgress: (o) => onProgress?.(o.done, o.total, o.info) };
    worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const m = ev.data;
      if (m.id !== id) return;
      if (m.type === 'progress') p.onProgress?.(m);
      else if (m.type === 'result') {
        worker.terminate();
        p.resolve(m.result);
      } else if (m.type === 'error') {
        worker.terminate();
        p.reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      if (!cancelled) reject(new Error(e.message || 'Worker 错误'));
    };
    worker.postMessage({ id, type, req, pack: CONTENT.customPack } as WorkerIn);
  });
  return {
    promise,
    cancel: () => {
      cancelled = true;
      worker.terminate();
    },
  };
}

/** 多线程批量模拟：把局数分摊到多个 Worker */
export function parallelBatch(req: BatchRequest, onProgress?: (done: number, total: number, last?: GameSummary) => void): { promise: Promise<BatchStats>; cancel: () => void } {
  const threads = Math.max(1, Math.min(navigator.hardwareConcurrency ? navigator.hardwareConcurrency - 1 : 2, 6, req.runs));
  const per = Math.ceil(req.runs / threads);
  const jobs: { promise: Promise<BatchStats>; cancel: () => void }[] = [];
  const progress = new Array(threads).fill(0);
  for (let i = 0; i < threads; i++) {
    const runs = Math.min(per, req.runs - i * per);
    if (runs <= 0) break;
    const sub: BatchRequest = { ...req, runs, seedBase: (req.seedBase ?? 1000) + i * per * 7919 };
    jobs.push(
      runInWorker<BatchStats>('batch', sub, (d, _t, info) => {
        progress[i] = d;
        onProgress?.(progress.reduce((a, b) => a + b, 0), req.runs, info as GameSummary);
      }),
    );
  }
  return {
    promise: Promise.all(jobs.map((j) => j.promise)).then((all) => aggregate(all.flatMap((s) => s.summaries))),
    cancel: () => jobs.forEach((j) => j.cancel()),
  };
}

export function researchInWorker(req: ResearchRequest, onProgress?: (done: number, total: number, info: unknown) => void) {
  return runInWorker<{ best: unknown; history: unknown[] }>('research', req, onProgress);
}

export function coachInWorker(req: CoachRequest, onProgress?: (done: number, total: number, info: unknown) => void) {
  return runInWorker<unknown>('coach', req, onProgress);
}

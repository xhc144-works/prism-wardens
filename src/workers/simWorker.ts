/// <reference lib="webworker" />
import { CONTENT, type ContentPack } from '../core/content/registry';
import { runBatch, type BatchRequest } from '../ai/runner';
import { ResearchRun, type ResearchRequest } from '../ai/research';
import { runCoach, type CoachRequest } from '../ai/coach';

export type WorkerIn =
  | { id: number; type: 'batch'; req: BatchRequest; pack?: ContentPack }
  | { id: number; type: 'research'; req: ResearchRequest; pack?: ContentPack }
  | { id: number; type: 'coach'; req: CoachRequest; pack?: ContentPack };

export type WorkerOut =
  | { id: number; type: 'progress'; done: number; total: number; info?: unknown }
  | { id: number; type: 'result'; result: unknown }
  | { id: number; type: 'error'; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data;
  try {
    if (msg.pack) CONTENT.setCustomPack(msg.pack);
    if (msg.type === 'batch') {
      const stats = runBatch(msg.req, (done, last) => ctx.postMessage({ id: msg.id, type: 'progress', done, total: msg.req.runs, info: last } satisfies WorkerOut));
      ctx.postMessage({ id: msg.id, type: 'result', result: stats } satisfies WorkerOut);
    } else if (msg.type === 'research') {
      const run = new ResearchRun(msg.req);
      const it = run.iterate();
      let r = it.next();
      while (!r.done) {
        const p = r.value;
        ctx.postMessage({
          id: msg.id,
          type: 'progress',
          done: p.evaluated,
          total: p.totalEvals,
          info: { generation: p.generation, best: { fitness: p.best.fitness, genome: p.best.genome, stats: { ...p.best.stats, summaries: [] } }, history: p.history },
        } satisfies WorkerOut);
        r = it.next();
      }
      ctx.postMessage({ id: msg.id, type: 'result', result: { best: { ...r.value, stats: { ...r.value.stats, summaries: r.value.stats.summaries.slice(0, 10) } }, history: run.history } } satisfies WorkerOut);
    } else if (msg.type === 'coach') {
      let done = 0;
      const total = msg.req.levels.length * msg.req.maxAttempts;
      const result = runCoach(msg.req, (e) => {
        if (e.type === 'attempt') done++;
        ctx.postMessage({ id: msg.id, type: 'progress', done, total, info: e } satisfies WorkerOut);
      });
      ctx.postMessage({ id: msg.id, type: 'result', result } satisfies WorkerOut);
    }
  } catch (e) {
    ctx.postMessage({ id: msg.id, type: 'error', message: (e as Error).message } satisfies WorkerOut);
  }
};

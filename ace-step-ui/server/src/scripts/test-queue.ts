import { generationQueue } from '../services/generationQueue.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const results: string[] = [];

  generationQueue.setConfig({
    maxTotalWorkers: 2,
    maxFreeWorkers: 1,
    maxPerUser: 1,
    batchWindowMs: 200,
    batchSize: 4,
  });

  const jobs = [
    { id: 'job-free-1', userId: 'u1', tier: 'free', delay: 300 },
    { id: 'job-pro-1', userId: 'u2', tier: 'pro', delay: 200 },
    { id: 'job-pro-2', userId: 'u2', tier: 'pro', delay: 200 },
    { id: 'job-unlimited-1', userId: 'u3', tier: 'unlimited', delay: 150 },
  ];

  const done = new Promise<void>((resolve) => {
    let remaining = jobs.length;
    for (const job of jobs) {
      generationQueue.enqueue({
        id: job.id,
        userId: job.userId,
        tier: job.tier as 'free' | 'pro' | 'unlimited',
        createdAt: Date.now(),
        params: {
          customMode: true,
          lyrics: 'test',
          style: 'test',
          title: 'test',
          instrumental: false,
          duration: 30,
        },
        run: async () => {
          results.push(`start:${job.id}`);
          await sleep(job.delay);
          results.push(`end:${job.id}`);
          generationQueue.markJobFinished(job.id);
          remaining -= 1;
          if (remaining === 0) {
            resolve();
          }
        },
      });
    }
  });

  await done;

  console.log('[test-queue] Order:', results.join(' | '));
  console.log('[test-queue] OK');
}

main().catch((error) => {
  console.error('[test-queue] Failed', error);
  process.exit(1);
});

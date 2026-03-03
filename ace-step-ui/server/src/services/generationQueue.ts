import type { GenerationParams } from './acestep.js';

type Tier = 'free' | 'pro' | 'unlimited';

interface QueueJob {
  id: string;
  userId: string;
  tier: Tier;
  params: GenerationParams;
  createdAt: number;
  run: () => Promise<void>;
}

export interface QueueConfig {
  maxTotalWorkers: number;
  maxFreeWorkers: number;
  maxPerUser: number;
  batchWindowMs: number;
  batchSize: number;
}

const DEFAULT_CONFIG: QueueConfig = {
  maxTotalWorkers: 3,
  maxFreeWorkers: 1,
  maxPerUser: 1,
  batchWindowMs: 3000,
  batchSize: 4,
};

class GenerationQueue {
  private queue: QueueJob[] = [];
  private activeJobs = new Map<string, QueueJob>();
  private activePerUser = new Map<string, number>();
  private activeFree = 0;
  private timer: NodeJS.Timeout | null = null;
  private config: QueueConfig;
  private persistEnqueue?: (jobId: string) => Promise<void>;
  private persistDequeue?: (jobId: string) => Promise<void>;

  constructor(config: QueueConfig) {
    this.config = config;
  }

  setConfig(config: QueueConfig): void {
    this.config = config;
    this.schedule();
  }

  getConfig(): QueueConfig {
    return { ...this.config };
  }

  setPersistence(
    enqueue: (jobId: string) => Promise<void>,
    dequeue: (jobId: string) => Promise<void>
  ): void {
    this.persistEnqueue = enqueue;
    this.persistDequeue = dequeue;
  }

  enqueue(job: QueueJob, options?: { persist?: boolean }): { position: number } {
    this.queue.push(job);
    if (options?.persist !== false) {
      this.persistEnqueue?.(job.id).catch(() => {});
    }
    this.schedule();
    return { position: this.getQueuePosition(job.id) };
  }

  getQueuePosition(jobId: string): number {
    const index = this.queue.findIndex((job) => job.id === jobId);
    return index === -1 ? 0 : index + 1;
  }

  markJobFinished(jobId: string): void {
    const job = this.activeJobs.get(jobId);
    if (!job) return;
    this.activeJobs.delete(jobId);
    const userCount = (this.activePerUser.get(job.userId) || 1) - 1;
    if (userCount <= 0) this.activePerUser.delete(job.userId);
    else this.activePerUser.set(job.userId, userCount);
    if (job.tier === 'free') {
      this.activeFree = Math.max(0, this.activeFree - 1);
    }
    this.persistDequeue?.(jobId).catch(() => {});
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) return;
    if (this.queue.length === 0) return;
    if (this.queue.length >= this.config.batchSize) {
      this.flush();
      return;
    }
    this.timer = setTimeout(() => this.flush(), this.config.batchWindowMs);
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.queue.sort((a, b) => this.calculatePriority(b) - this.calculatePriority(a));

    while (this.queue.length > 0 && this.canDispatchAny()) {
      const index = this.queue.findIndex((job) => this.canDispatch(job));
      if (index === -1) break;
      const job = this.queue.splice(index, 1)[0];
      this.dispatch(job);
    }

    if (this.queue.length > 0) {
      this.schedule();
    }
  }

  private dispatch(job: QueueJob): void {
    this.activeJobs.set(job.id, job);
    this.activePerUser.set(job.userId, (this.activePerUser.get(job.userId) || 0) + 1);
    if (job.tier === 'free') {
      this.activeFree += 1;
    }

    job.run().catch(() => {
      this.markJobFinished(job.id);
    });
  }

  private calculatePriority(job: QueueJob): number {
    const tierWeight: Record<Tier, number> = { free: 1, pro: 5, unlimited: 10 };
    const waitMinutes = (Date.now() - job.createdAt) / 60000;
    return tierWeight[job.tier] + waitMinutes;
  }

  private canDispatch(job: QueueJob): boolean {
    if (this.activeJobs.size >= this.config.maxTotalWorkers) return false;
    if (job.tier === 'free' && this.activeFree >= this.config.maxFreeWorkers) return false;
    const perUser = this.activePerUser.get(job.userId) || 0;
    if (perUser >= this.config.maxPerUser) return false;
    return true;
  }

  private canDispatchAny(): boolean {
    return this.activeJobs.size < this.config.maxTotalWorkers;
  }
}

export const generationQueue = new GenerationQueue(DEFAULT_CONFIG);

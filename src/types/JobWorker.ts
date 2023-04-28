import { QueueWorker } from 'queue';
import type { JobEntity } from '../entities/JobEntity.js';

export type JobWorker = QueueWorker & {
    job?: JobEntity;
};

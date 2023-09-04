import Queue from 'queue';

import { AppDataSource } from '../AppDataSource.js';
import { Config } from '../Config.js';
import { logger } from '../Logger.js';
import { JobEntity } from '../entities/index.js';
import { JobWorker } from '../types/JobWorker.js';
import { downloadFiles } from './TeraBox.js';

const JobRepository = AppDataSource.getRepository(JobEntity);

const queue = new Queue({
    concurrency: Config.JOB_CONCURRENCY,
    timeout: 20 * 60 * 1000,
    autostart: true,
});

queue.addEventListener('start', (e) => {
    const worker = e.detail.job as JobWorker;

    logger.info('Job started!', {
        action: 'onQueueEvent',
        job: worker.job,
    });
});

queue.addEventListener('success', (e) => {
    const result = e.detail.result;

    logger.info('Job success!', {
        action: 'onQueueEvent',
        result,
    });
});

queue.addEventListener('error', (e) => {
    const error = e.detail.error;
    const worker = e.detail.job as JobWorker;

    logger.error('Job failed with error!', {
        action: 'onQueueEvent',
        error,
        job: worker.job,
    });
});

queue.addEventListener('end', (e) => {
    const error = e.detail.error;

    if (error) {
        logger.error('Job ended with error!', {
            action: 'onQueueEvent',
            error,
        });
    } else {
        logger.info('Job ended', {
            action: 'onQueueEvent',
        });
    }
});

export async function scheduleExistingJobs(): Promise<void> {
    const existingJobs = await JobRepository.find({
        where: [{ status: 'queued' }, { status: 'inprogress' }],
    });

    if (existingJobs && existingJobs.length) {
        logger.info(`Scheduling ${existingJobs.length} existing jobs!`, {
            action: 'onSchedule',
        });

        existingJobs.forEach(scheduleJob);
    } else {
        logger.debug('No existing jobs for scheduling!', {
            action: 'onSchedule',
        });
    }
}

export function scheduleJob(job: JobEntity) {
    const worker: JobWorker = async () => {
        logger.info(`Running job ${job.id}...`, {
            action: 'onJob',
            job: job,
        });

        job.status = 'inprogress';
        await job.save();

        try {
            const downloadedFiles = await downloadFiles(job);

            job.downloadedFiles = downloadedFiles;
            job.status = 'completed';
            try {
                await job.save();
            } catch (error) {
                logger.error(
                    `Failed to save job complete status of ${job.id}!`,
                    {
                        action: 'onJob',
                        job: job,
                        error,
                    }
                );
            }
        } catch (error) {
            logger.error(`Job failed ${job.id}!`, {
                action: 'onJob',
                job: job,
                error,
            });
            job.status = 'failed';
            try {
                await job.save();
            } catch (error) {
                logger.error(`Failed to save job failed status of ${job.id}!`, {
                    action: 'onJob',
                    job: job,
                    error,
                });
            }
        }
    };

    worker.job = job;

    queue.push(worker);
}

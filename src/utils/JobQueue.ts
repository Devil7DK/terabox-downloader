import Queue from 'queue';

import { AppDataSource } from '../AppDataSource.js';
import { JobEntity } from '../entities/index.js';
import { logger } from '../Logger.js';
import { downloadFiles } from './TeraBox.js';

const JobRepository = AppDataSource.getRepository(JobEntity);

const queue = new Queue({ concurrency: 1, autostart: true });

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
    queue.push(async () => {
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
    });
}

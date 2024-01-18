import 'reflect-metadata';

import { AppDataSource } from './AppDataSource.js';
import { Config } from './Config.js';
import { logger } from './Logger.js';
import { setupBot } from './TelegramBot.js';
import { scheduleExistingJobs } from './utils/index.js';

logger.debug('Starting application...', {
    action: 'onStart',
    config: Config,
});

AppDataSource.initialize().then(async () => {
    logger.info('Database initialized!', {
        action: 'onStart',
    });

    await setupBot();

    logger.info('Loading previously scheduled jobs!', {
        action: 'onStart',
    });
    await scheduleExistingJobs();
});

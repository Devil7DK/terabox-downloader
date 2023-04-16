import 'reflect-metadata';

import { config } from 'dotenv';

import { AppDataSource } from './AppDataSource.js';
import { logger } from './Logger.js';
import { setupBot } from './TelegramBot.js';
import { scheduleExistingJobs } from './utils/index.js';

config();

AppDataSource.initialize().then(() => {
    logger.info('Database initialized!');

    logger.info('Loading previously scheduled jobs!');
    scheduleExistingJobs();

    setupBot();
});

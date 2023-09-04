import dotenv from 'dotenv';
import { bool, cleanEnv, json, num, str } from 'envalid';

dotenv.config();

export const Config = cleanEnv(process.env, {
    LOG_LEVEL: str({ desc: 'Log level', default: 'info', devDefault: 'debug' }),

    MYSQL_HOST: str({ desc: 'MySQL server host', default: '' }),
    MYSQL_PORT: num({ desc: 'MySQL server port', default: 3306 }),
    MYSQL_USERNAME: str({ desc: 'MySQL server username', default: '' }),
    MYSQL_PASSWORD: str({ desc: 'MySQL server password', default: '' }),
    MYSQL_DATABASE: str({ desc: 'MySQL database name', default: '' }),

    BOT_TOKEN: str({ desc: 'Telegram bot token' }),
    BOT_API_SERVER: str({
        desc: 'Telegram bot API server',
        default: '',
    }),
    BOT_WEBHOOK_DOMAIN: str({
        desc: 'Telegram bot webhook domain',
        default: '',
    }),
    BOT_WEBHOOK_PORT: num({
        desc: 'Telegram bot webhook port',
        default: 80,
    }),
    BOT_WEBHOOK_CERTIFICATE: str({
        desc: 'Telegram bot webhook certificate path',
        default: '',
    }),
    BOT_WEBHOOK_KEY: str({
        desc: 'Telegram bot webhook key path',
        default: '',
    }),

    BOT_ONLY_ALLOWED: bool({
        desc: 'Only allow users in BOT_ALLOWED_USERS to use the bot',
        default: false,
    }),
    BOT_ALLOWED_USERS: json({
        desc: 'List of allowed users to use the bot as JSON array of usernames (or ID if username is not available)',
        default: [],
    }),

    JOB_CONCURRENCY: num({
        desc: 'Number of jobs to run concurrently',
        default: 1,
    }),
    JOB_RETRY_COUNT: num({
        desc: 'Number of times to retry a failed job',
        default: 3,
    }),
});

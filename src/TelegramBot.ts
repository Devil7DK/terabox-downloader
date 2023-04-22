import { Telegraf } from 'telegraf';

import { existsSync, readFileSync } from 'fs';
import { logger } from './Logger.js';
import { store } from './Store.js';
import * as middlewares from './bot/index.js';

export async function setupBot() {
    const token = process.env.BOT_TOKEN;
    const onlyAllowed = process.env.BOT_ONLY_ALLOWED === 'true';
    const allowedUsers = JSON.parse(
        process.env.BOT_ALLOWED_USERS || '[]'
    ) as string[];

    if (!token) {
        throw new Error('Failed to launch bot! Invalid token!');
    }

    const bot = (store.bot = new Telegraf(token, {
        telegram: { apiRoot: process.env.BOT_API_SERVER },
    }));

    logger.info('Launching bot!', { action: 'onInit' });

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    if (onlyAllowed) {
        bot.use(async (ctx, next) => {
            if (ctx.from && ctx.chat) {
                if (
                    !allowedUsers.includes(
                        ctx.from?.username || ctx.from?.id?.toString?.()
                    )
                ) {
                    ctx.reply(
                        'Sorry! seems like you are not allowed to use me!'
                    );
                    if (ctx.chat?.type !== 'private') {
                        ctx.leaveChat();
                    }
                    return;
                }
            }

            await next();
        });
    }

    for (const middleware of Object.values(middlewares)) {
        if (typeof middleware === 'function') {
            logger.debug(`Configuring bot middleware "${middleware.name}"`);
            middleware(bot);
        }
    }

    const launchOptions: Telegraf.LaunchOptions = {};

    if (
        process.env.NODE_ENV === 'production' &&
        process.env.BOT_WEBHOOK_DOMAIN
    ) {
        launchOptions.webhook = {
            domain: process.env.BOT_WEBHOOK_DOMAIN,
            port: Number(process.env.BOT_WEBHOOK_PORT) || 80,
        };

        if (
            process.env.BOT_WEBHOOK_CERTIFICATE &&
            existsSync(process.env.BOT_WEBHOOK_CERTIFICATE) &&
            process.env.BOT_WEBHOOK_KEY &&
            existsSync(process.env.BOT_WEBHOOK_KEY)
        ) {
            logger.debug('Found CA certificate for webhook!', {
                action: 'onInit',
            });

            launchOptions.webhook.certificate = {
                source: readFileSync(process.env.BOT_WEBHOOK_CERTIFICATE),
            };

            launchOptions.webhook.tlsOptions = {
                cert: readFileSync(process.env.BOT_WEBHOOK_CERTIFICATE),
                key: readFileSync(process.env.BOT_WEBHOOK_KEY),
            };
        }
    }

    await bot.launch(launchOptions);
}

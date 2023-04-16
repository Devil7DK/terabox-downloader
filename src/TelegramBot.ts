import { Telegraf } from 'telegraf';

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

    await bot.launch(
        process.env.NODE_ENV === 'production' && process.env.BOT_WEBHOOK_DOMAIN
            ? {
                  webhook: {
                      domain: process.env.BOT_WEBHOOK_DOMAIN,
                      port: 80,
                  },
              }
            : {}
    );
}

import { existsSync, readFileSync } from 'fs';
import { Telegraf } from 'telegraf';

import { Config } from './Config.js';
import { logger } from './Logger.js';
import { store } from './Store.js';
import * as middlewares from './bot/index.js';

export async function setupBot() {
    const token = Config.BOT_TOKEN;
    const onlyAllowed = Config.BOT_ONLY_ALLOWED;
    const allowedUsers = Config.BOT_ALLOWED_USERS;

    if (!token) {
        throw new Error('Failed to launch bot! Invalid token!');
    }

    const bot = (store.bot = new Telegraf(
        token,
        Config.BOT_API_SERVER
            ? {
                  telegram: { apiRoot: Config.BOT_API_SERVER },
              }
            : undefined
    ));

    process.once('SIGINT', () => {
        bot.stop('SIGINT');

        process.exit(0);
    });
    process.once('SIGTERM', () => {
        bot.stop('SIGTERM');

        process.exit(0);
    });

    if (onlyAllowed) {
        bot.use(async (ctx, next) => {
            if (ctx.from && ctx.chat) {
                logger.info('Checking if user is allowed to use the bot', {
                    action: 'onInit',
                    from: ctx.from,
                    chat: ctx.chat,
                });

                if (
                    !allowedUsers.includes(
                        ctx.from?.username || ctx.from?.id?.toString?.()
                    )
                ) {
                    try {
                        await ctx.reply(
                            'Sorry! seems like you are not allowed to use me!'
                        );
                    } catch (error) {
                        logger.error('Failed to reply to user', {
                            action: 'onInit',
                            from: ctx.from,
                            chat: ctx.chat,
                            error,
                        });
                    }

                    if (ctx.chat?.type !== 'private') {
                        try {
                            await ctx.leaveChat();
                        } catch (error) {
                            logger.error('Failed to leave chat', {
                                action: 'onInit',
                                from: ctx.from,
                                chat: ctx.chat,
                                error,
                            });
                        }
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

    if (Config.isProduction && Config.BOT_WEBHOOK_DOMAIN) {
        launchOptions.webhook = {
            domain: Config.BOT_WEBHOOK_DOMAIN,
            port: Config.BOT_WEBHOOK_PORT,
        };

        if (
            Config.BOT_WEBHOOK_CERTIFICATE &&
            existsSync(Config.BOT_WEBHOOK_CERTIFICATE) &&
            Config.BOT_WEBHOOK_KEY &&
            existsSync(Config.BOT_WEBHOOK_KEY)
        ) {
            logger.debug('Found CA certificate for webhook!', {
                action: 'onInit',
            });

            launchOptions.webhook.certificate = {
                source: readFileSync(Config.BOT_WEBHOOK_CERTIFICATE),
            };

            launchOptions.webhook.tlsOptions = {
                cert: readFileSync(Config.BOT_WEBHOOK_CERTIFICATE),
                key: readFileSync(Config.BOT_WEBHOOK_KEY),
            };
        }
    }

    logger.debug('Configuring bot launch options', {
        action: 'onInit',
        launchOptions,
    });

    logger.info('Launching bot!', { action: 'onInit' });

    bot.catch((error, ctx) => {
        logger.error('Failed to process update!', {
            action: 'onInit',
            error,
            chat: ctx.chat,
            from: ctx.from,
            message: ctx.message,
            update: ctx.update,
        });
    });

    await bot.launch(launchOptions);
}

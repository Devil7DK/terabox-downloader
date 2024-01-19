import { Telegraf } from 'telegraf';
import { LessThan } from 'typeorm';

import { BotCommand } from 'typegram';
import { AppDataSource } from '../AppDataSource.js';
import { Config } from '../Config.js';
import { logger } from '../Logger.js';
import { ChatEntity, ConfigEntity, JobEntity } from '../entities/index.js';
import { DownloadMethod, TeraboxMirror } from '../types/index.js';
import { getEnumLabel } from '../utils/Common.js';
import { scheduleJob } from '../utils/JobQueue.js';

const ChatRepository = AppDataSource.getRepository(ChatEntity);
const ConfigRepository = AppDataSource.getRepository(ConfigEntity);
const JobRepository = AppDataSource.getRepository(JobEntity);

const createDefaultConfig = async (chat: ChatEntity): Promise<ConfigEntity> => {
    return await ConfigRepository.create({
        chatId: chat.id,
        downloadMethod: Object.values(DownloadMethod)[0],
        mirror: Object.values(TeraboxMirror)[0],
    }).save();
};

export function setupChat(bot: Telegraf) {
    const commands: BotCommand[] = [
        {
            command: 'cleanup_all',
            description: 'Cleanup all jobs for this chat',
        },
        {
            command: 'cleanup_failed',
            description: 'Cleanup failed jobs for this chat',
        },
        {
            command: 'cleanup_completed',
            description: 'Cleanup completed jobs for this chat',
        },
        {
            command: 'retry_failed',
            description: 'Retry failed jobs for this chat',
        },
        {
            command: 'retry_failed_all',
            description:
                'Retry all failed jobs for this chat (including those with maxed out retry count)',
        },
        {
            command: 'job_stats',
            description: 'Get job stats for this chat',
        },
        {
            command: '/download_method',
            description: 'View/update download method',
        },
        {
            command: '/mirror',
            description: 'View/update mirror used for downloading files',
        },
    ];

    if (Config.PROXY_URL) {
        commands.push({
            command: 'use_proxy',
            description: 'Toggle proxy usage for downloading files',
        });
    }

    if (Config.ENABLE_RESTART) {
        commands.push({
            command: 'restart',
            description: 'Restart the bot',
        });
    }

    bot.telegram.setMyCommands(commands);

    bot.start(async (ctx) => {
        try {
            logger.debug('Received start message!', {
                action: 'onBotStart',
                chatId: ctx.chat.id,
                messageId: ctx.message.message_id,
            });

            let existingChat = await ChatRepository.findOne({
                where: { id: ctx.chat.id },
            });

            if (!existingChat) {
                logger.debug('Existing chat not found! Creating new one!', {
                    action: 'onBotStart',
                    chatId: ctx.chat.id,
                    messageId: ctx.message.message_id,
                });

                existingChat = await ChatRepository.create({
                    id: ctx.chat.id,
                    type: ctx.chat.type,
                    status: 'active',
                    userId: ctx.from.id,
                    userInfo: ctx.from,
                }).save();
            }

            if (!existingChat.config) {
                existingChat.config = await createDefaultConfig(existingChat);
            }

            logger.info(
                `Responding to user ${ctx.from.username || ctx.from.id}`,
                {
                    action: 'onBotStart',
                    chatId: ctx.chat.id,
                    messageId: ctx.message.message_id,
                }
            );

            await ctx.reply(
                `Hi ${[ctx.from.first_name, ctx.from.last_name]
                    .filter((item) => !!item)
                    .join(' ')}`
            );
        } catch (error) {
            logger.error('Failed to respond for start message!', {
                action: 'onBotStart',
                chatId: ctx.chat.id,
                messageId: ctx.message.message_id,
                error,
            });
        }
    });

    bot.command('cleanup_all', async (ctx) => {
        logger.debug('Received cleanup all command!', {
            action: 'onCleanupCommand',
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
        });

        const result = await JobRepository.delete({ chatId: ctx.chat.id });

        logger.debug('Cleanup all result', {
            action: 'onCleanupCommand',
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
            result,
        });

        await ctx.reply(`Cleanup result: ${result.affected} jobs deleted!`);
    });

    bot.command('cleanup_failed', async (ctx) => {
        logger.debug('Received cleanup failed command!', {
            action: 'onCleanupCommand',
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
        });

        const result = await JobRepository.delete({
            chatId: ctx.chat.id,
            status: 'failed',
        });

        logger.debug('Cleanup failed result', {
            action: 'onCleanupCommand',
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
            result,
        });

        await ctx.reply(
            `Cleanup result: ${result.affected} failed jobs deleted!`
        );
    });

    bot.command('cleanup_completed', async (ctx) => {
        logger.debug('Received cleanup completed command!', {
            action: 'onCleanupCommand',
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
        });

        const result = await JobRepository.delete({
            chatId: ctx.chat.id,
            status: 'completed',
        });

        logger.debug('Cleanup completed result', {
            action: 'onCleanupCommand',
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
            result,
        });

        await ctx.reply(
            `Cleanup result: ${result.affected} completed jobs deleted!`
        );
    });

    bot.command('retry_failed', async (ctx) => {
        logger.debug('Received retry failed command!', {
            action: 'onRetryFailedCommand',
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
        });

        const jobs = await JobRepository.find({
            where: {
                chatId: ctx.chat.id,
                status: 'failed',
                retryCount: LessThan(Config.JOB_RETRY_COUNT),
            },
        });

        for (const job of jobs) {
            try {
                job.status = 'queued';

                const updatedJob = await job.save();

                scheduleJob(updatedJob);
            } catch (error) {
                logger.error('Failed to re-queue job!', {
                    action: 'onRetryFailedCommand',
                    chatId: ctx.chat.id,
                    messageId: ctx.message.message_id,
                    job,
                    error,
                });
            }
        }

        await ctx.reply(`Retry result: ${jobs.length} failed jobs re-queued!`);
    });

    bot.command('retry_failed_all', async (ctx) => {
        logger.debug('Received retry failed all command!', {
            action: 'onRetryFailedCommand',
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
        });

        const jobs = await JobRepository.find({
            where: {
                chatId: ctx.chat.id,
                status: 'failed',
            },
        });

        for (const job of jobs) {
            try {
                job.status = 'queued';

                const updatedJob = await job.save();

                scheduleJob(updatedJob);
            } catch (error) {
                logger.error('Failed to re-queue job!', {
                    action: 'onRetryFailedCommand',
                    chatId: ctx.chat.id,
                    messageId: ctx.message.message_id,
                    job,
                    error,
                });
            }
        }

        await ctx.reply(`Retry result: ${jobs.length} failed jobs re-queued!`);
    });

    bot.command('job_stats', async (ctx) => {
        logger.debug('Received job stats command!', {
            action: 'onJobStatsCommand',
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
        });

        const result = await JobRepository.createQueryBuilder('job')
            .select("SUM(job.status='queued')", 'queued')
            .addSelect(
                `SUM(job.status='failed' AND job.retryCount < ${Config.JOB_RETRY_COUNT})`,
                'failed_with_retry'
            )
            .addSelect("SUM(job.status='failed')", 'failed')
            .addSelect("SUM(job.status='completed')", 'completed')
            .addSelect("SUM(job.status='inprogress')", 'inprogress')
            .where('job.chatId = :chatId', { chatId: ctx.chat.id })
            .getRawOne();

        logger.debug('Job stats result', {
            action: 'onJobStatsCommand',
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
            result,
        });

        await ctx.reply(
            `Job stats for this chat:\n\nQueued: ${result.queued}\nIn progress: ${result.inprogress}\nCompleted: ${result.completed}\nFailed: ${result.failed}\nFailed with retry: ${result.failed_with_retry}`
        );
    });

    bot.command('download_method', async (ctx) => {
        // Reply with the current download method and buttons to change it
        const chat = await ChatRepository.findOne({
            where: { id: ctx.chat.id },
        });

        if (!chat) {
            await ctx.reply('Chat not found!');
            return;
        }

        if (!chat.config) {
            chat.config = await createDefaultConfig(chat);
        }

        const currentDownloadMethod = chat.config.downloadMethod;

        await ctx.reply(
            `Current download method is ${getEnumLabel(
                currentDownloadMethod,
                DownloadMethod
            )}`,
            {
                reply_markup: {
                    inline_keyboard: [
                        Object.entries(DownloadMethod).map(([key, value]) => ({
                            text: key,
                            callback_data: `download_method:${value}`,
                        })),
                    ],
                },
            }
        );
    });

    bot.action(/download_method:(.+)/, async (ctx) => {
        const downloadMethod = ctx.match[1] as DownloadMethod;

        logger.debug('Received download method update action!', {
            action: 'onAction',
            chatId: ctx.chat?.id,
            downloadMethod,
        });

        if (!Object.values(DownloadMethod).includes(downloadMethod)) {
            await ctx.answerCbQuery('Invalid download method!');
            return;
        }

        if (!ctx.chat) {
            await ctx.answerCbQuery('Chat not found!');
            return;
        }

        const chat = await ChatRepository.findOne({
            where: { id: ctx.chat.id },
        });

        if (!chat) {
            await ctx.answerCbQuery('Chat not found!');
            return;
        }

        if (!chat.config) {
            chat.config = await createDefaultConfig(chat);
        }

        chat.config.downloadMethod = downloadMethod;

        await chat.config.save();

        await ctx.answerCbQuery(`Download method set to ${downloadMethod}!`);
    });

    bot.command('mirror', async (ctx) => {
        // Reply with the current mirror and buttons to change it
        const chat = await ChatRepository.findOne({
            where: { id: ctx.chat.id },
        });

        if (!chat) {
            await ctx.reply('Chat not found!');
            return;
        }

        if (!chat.config) {
            chat.config = await createDefaultConfig(chat);
        }

        const currentMirror = chat.config.mirror;

        await ctx.reply(`Current mirror is ${currentMirror}`, {
            reply_markup: {
                inline_keyboard: [
                    Object.entries(TeraboxMirror).map(([_, value]) => ({
                        text: value,
                        callback_data: `mirror:${value}`,
                    })),
                ],
            },
        });
    });

    bot.action(/mirror:(.+)/, async (ctx) => {
        const mirror = ctx.match[1] as TeraboxMirror;

        logger.debug('Received mirror update action!', {
            action: 'onAction',
            chatId: ctx.chat?.id,
            mirror,
        });

        if (!Object.values(TeraboxMirror).includes(mirror)) {
            await ctx.answerCbQuery('Invalid mirror!');
            return;
        }

        if (!ctx.chat) {
            await ctx.answerCbQuery('Chat not found!');
            return;
        }

        const chat = await ChatRepository.findOne({
            where: { id: ctx.chat.id },
        });

        if (!chat) {
            await ctx.answerCbQuery('Chat not found!');
            return;
        }

        if (!chat.config) {
            chat.config = await createDefaultConfig(chat);
        }

        chat.config.mirror = mirror;

        await chat.config.save();

        await ctx.answerCbQuery(`Mirror set to ${mirror}!`);
    });

    if (Config.PROXY_URL) {
        bot.command('use_proxy', async (ctx) => {
            logger.debug('Received use proxy command!', {
                action: 'onUseProxyCommand',
                chatId: ctx.chat.id,
                messageId: ctx.message.message_id,
            });

            const chat = await ChatRepository.findOne({
                where: { id: ctx.chat.id },
            });

            if (!chat) {
                await ctx.reply('Chat not found!');
                return;
            }

            chat.config.useProxy = !chat.config.useProxy;

            await chat.config.save();

            await ctx.reply(
                chat.config.useProxy ? 'Enabled proxy!' : 'Disabled proxy!'
            );
        });
    }

    if (Config.ENABLE_RESTART) {
        bot.command('restart', async (ctx) => {
            logger.debug('Received restart command!', {
                action: 'onRestartCommand',
                chatId: ctx.chat.id,
                messageId: ctx.message.message_id,
            });

            await ctx.reply('Restarting...');

            setTimeout(() => {
                process.exit(-1);
            }, 5000);
        });
    } else {
        bot.command('restart', async (ctx) => {
            logger.debug('Received restart command!', {
                action: 'onRestartCommand',
                chatId: ctx.chat.id,
                messageId: ctx.message.message_id,
            });

            await ctx.reply('Restart is disabled!');
        });
    }
}

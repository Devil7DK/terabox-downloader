import { Telegraf } from 'telegraf';

import { AppDataSource } from '../AppDataSource.js';
import { ChatEntity, JobEntity } from '../entities/index.js';
import { logger } from '../Logger.js';

const ChatRepository = AppDataSource.getRepository(ChatEntity);
const JobRepository = AppDataSource.getRepository(JobEntity);

export function setupChat(bot: Telegraf) {
    bot.telegram.setMyCommands([
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
            command: 'job_stats',
            description: 'Get job stats for this chat',
        },
    ]);

    bot.start(async (ctx) => {
        try {
            logger.debug('Received start message!', {
                action: 'onBotStart',
                chatId: ctx.chat.id,
                messageId: ctx.message.message_id,
            });

            const existingChat = await ChatRepository.findOne({
                where: { id: ctx.chat.id },
            });

            if (!existingChat) {
                logger.debug('Existing chat not found! Creating new one!', {
                    action: 'onBotStart',
                    chatId: ctx.chat.id,
                    messageId: ctx.message.message_id,
                });

                await ChatRepository.create({
                    id: ctx.chat.id,
                    type: ctx.chat.type,
                    status: 'active',
                    userId: ctx.from.id,
                    userInfo: ctx.from,
                }).save();
            }

            logger.info(
                `Responding to user ${ctx.from.username || ctx.from.id}`,
                {
                    action: 'onBotStart',
                    chatId: ctx.chat.id,
                    messageId: ctx.message.message_id,
                }
            );

            ctx.reply(
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

        ctx.reply(`Cleanup result: ${result.affected} jobs deleted!`);
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

        ctx.reply(`Cleanup result: ${result.affected} failed jobs deleted!`);
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

        ctx.reply(`Cleanup result: ${result.affected} completed jobs deleted!`);
    });

    bot.command('job_stats', async (ctx) => {
        logger.debug('Received job stats command!', {
            action: 'onJobStatsCommand',
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
        });

        const result = await JobRepository.createQueryBuilder('job')
            .select("SUM(job.status='queued')", 'queued')
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

        ctx.reply(
            `Job stats for this chat:\n\nQueued: ${result.queued}\nIn progress: ${result.inprogress}\nCompleted: ${result.completed}\nFailed: ${result.failed}`
        );
    });
}

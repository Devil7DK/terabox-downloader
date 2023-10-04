import { Telegraf } from 'telegraf';

import { AppDataSource } from '../AppDataSource.js';
import { logger } from '../Logger.js';
import { JobEntity, MessageEntity } from '../entities/index.js';
import { ordinalSuffixOf, parseUrl, scheduleJob } from '../utils/index.js';

const MessageRepository = AppDataSource.getRepository(MessageEntity);
const JobRepository = AppDataSource.getRepository(JobEntity);

export function setupDownloader(bot: Telegraf) {
    bot.on('message', async (ctx) => {
        let urls: string[] = [];

        if (
            ('photo' in ctx.message || 'video' in ctx.message) &&
            ctx.message.caption &&
            ctx.message.caption_entities
        ) {
            logger.debug('Received new photo message!', {
                action: 'onMessage',
                chatId: ctx.chat.id,
                messageId: ctx.message.message_id,
            });
            urls = parseUrl(ctx.message.caption, ctx.message.caption_entities);
        } else if ('text' in ctx.message) {
            logger.debug('Received new text message!', {
                action: 'onMessage',
                chatId: ctx.chat.id,
            });
            urls = parseUrl(ctx.message.text);
        } else {
            logger.debug('Failed to handle message!', {
                action: 'onMessage',
                chatId: ctx.chat.id,
                messageId: ctx.message.message_id,
                messageObj: ctx.message,
            });
            await ctx.reply('Failed to handle message!', {
                reply_to_message_id: ctx.message.message_id,
            });
            return;
        }

        logger.info(`Found ${urls.length} URLs from message!`, {
            action: 'onMessage',
            chatId: ctx.chat.id,
            messageId: ctx.message.message_id,
        });

        if (urls.length) {
            try {
                let message: MessageEntity | undefined;

                try {
                    message = await MessageRepository.create({
                        chatId: ctx.chat.id,
                        messageId: ctx.message.message_id,
                    }).save();
                } catch (error) {
                    logger.error('Failed to create message!', {
                        action: 'onMessage',
                        chatId: ctx.chat.id,
                        messageId: ctx.message.message_id,
                        error,
                    });
                    await ctx.reply('Failed to save message metadata!');
                    throw error;
                }

                for (let i = 0; i < urls.length; i++) {
                    const url = urls[i];

                    logger.debug(`Queuing url ${i + 1}/${urls.length}!`, {
                        action: 'onMessage',
                        chatId: ctx.chat.id,
                        messageId: ctx.message.message_id,
                        url,
                    });

                    const reply = await ctx.reply(
                        `URL: ${url}\nStatus: queued`,
                        { reply_to_message_id: ctx.message.message_id }
                    );

                    const job = await JobRepository.create({
                        chatId: ctx.chat.id,
                        messageId: ctx.message.message_id,
                        messageEntityId: message.id,
                        statusMessageId: reply.message_id,
                        status: 'queued',
                        url,
                    }).save();

                    scheduleJob(job);
                }
            } catch (error) {
                logger.error('Failed to process message!', {
                    action: 'onMessage',
                    chatId: ctx.chat.id,
                    messageId: ctx.message.message_id,
                    error,
                });
            }
        } else {
            await ctx.reply('No URLs found!', {
                reply_to_message_id: ctx.message.message_id,
            });
        }
    });

    bot.action(/retry:(.+)/, async (ctx) => {
        const jobId = ctx.match[1];

        logger.debug('Received retry action!', {
            action: 'onAction',
            chatId: ctx.chat?.id,
            jobId,
        });

        const job = await JobRepository.findOneBy({ id: jobId });

        if (!job) {
            logger.error('Failed to find job!', {
                action: 'onAction',
                chatId: ctx.chat?.id,
                jobId,
            });

            await ctx.answerCbQuery('Failed to find job!');
        } else {
            try {
                job.status = 'queued';

                await job.save();

                scheduleJob(job);

                await ctx.answerCbQuery(
                    `Retrying job for ${ordinalSuffixOf(
                        job.retryCount
                    )} time! Please wait...`
                );
            } catch (error) {
                logger.error('Failed to update job!', {
                    action: 'onAction',
                    chatId: ctx.chat?.id,
                    jobId,
                    error,
                });

                await ctx.answerCbQuery('Failed to update job!');
            }
        }
    });
}

import { Telegraf } from 'telegraf';

import { AppDataSource } from '../AppDataSource.js';
import { ChatEntity } from '../entities/index.js';
import { logger } from '../Logger.js';

const ChatRepository = AppDataSource.getRepository(ChatEntity);

export function setupChat(bot: Telegraf) {
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
}

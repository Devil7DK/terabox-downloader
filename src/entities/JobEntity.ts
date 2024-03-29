import {
    BeforeUpdate,
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';

import { rmSync } from 'fs';
import { Config } from '../Config.js';
import { logger } from '../Logger.js';
import { store } from '../Store.js';
import { DownloadedFile } from '../types/index.js';
import { BaseEntity } from './BaseEntity.js';
import { ChatEntity } from './ChatEntity.js';
import { MessageEntity } from './MessageEntity.js';

@Entity('jobs', { orderBy: { createdOn: 'ASC' } })
export class JobEntity extends BaseEntity {
    @PrimaryGeneratedColumn('uuid')
    public id!: string;

    @Column('bigint')
    public chatId!: number;

    @Column('bigint')
    public messageId!: number;

    @Column()
    public statusMessageId!: number;

    @Column()
    public url!: string;

    @Column('simple-enum', {
        enum: ['queued', 'inprogress', 'completed', 'failed'],
    })
    public status!: 'queued' | 'inprogress' | 'completed' | 'failed';

    @Column({ nullable: true })
    public error?: string;

    @Column('simple-array', { nullable: true })
    public downloadedFiles?: DownloadedFile[];

    @Column()
    public messageEntityId!: string;

    @Column({ default: 0 })
    public retryCount!: number;

    @ManyToOne(() => ChatEntity, { eager: true })
    @JoinColumn({ name: 'chatId' })
    public chat!: ChatEntity;

    @ManyToOne(() => MessageEntity, (message) => message.jobs)
    @JoinColumn({ name: 'messageEntityId' })
    public message?: MessageEntity;

    @BeforeUpdate()
    public async onUpdate() {
        logger.debug('Job entity updated!', {
            action: 'onJobUpdate',
            id: this.id,
            chatId: this.chatId,
            messageId: this.messageId,
        });
        if (store.bot && this.statusMessageId) {
            if (this.status === 'failed') {
                this.retryCount++;
            }

            store.bot.telegram
                .editMessageText(
                    this.chatId,
                    this.statusMessageId,
                    undefined,
                    `URL: ${this.url}\nStatus: ${this.status}${
                        this.status === 'failed'
                            ? `\nRetry count: ${this.retryCount}`
                            : ''
                    }`,
                    this.status === 'failed' &&
                        this.retryCount < Config.JOB_RETRY_COUNT
                        ? {
                              reply_markup: {
                                  inline_keyboard: [
                                      [
                                          {
                                              text: 'Retry',
                                              callback_data: `retry:${this.id}`,
                                          },
                                      ],
                                  ],
                              },
                          }
                        : undefined
                )
                .then(() => {
                    logger.debug('Edited message for updating job status!', {
                        action: 'onJobUpdate',
                        id: this.id,
                        chatId: this.chatId,
                        messageId: this.messageId,
                    });
                })
                .catch((error) => {
                    logger.error(
                        'Failed to edit message for updating job status!',
                        {
                            action: 'onJobUpdate',
                            id: this.id,
                            chatId: this.chatId,
                            messageId: this.messageId,
                            error,
                        }
                    );
                });

            if (
                Array.isArray(this.downloadedFiles) &&
                this.downloadedFiles.length
            ) {
                logger.info(
                    `Sending ${this.downloadedFiles.length} downloded files to user!`,
                    {
                        action: 'onJobUpdate',
                        id: this.id,
                        chatId: this.chatId,
                        messageId: this.messageId,
                    }
                );
                store.bot.telegram
                    .sendMediaGroup(
                        this.chatId,
                        this.downloadedFiles.map((downloadedFile) => ({
                            type: 'document',
                            caption: `URL: ${this.url}`,
                            media: {
                                source: downloadedFile.filePath,
                                filename: downloadedFile.fileName,
                            },
                        })),
                        { reply_to_message_id: this.messageId }
                    )
                    .then(() => {
                        logger.info(
                            `Successfully sent ${
                                this.downloadedFiles?.length || 0
                            }!`,
                            {
                                action: 'onJobUpdate',
                                id: this.id,
                                chatId: this.chatId,
                                messageId: this.messageId,
                            }
                        );

                        try {
                            if (this.downloadedFiles) {
                                for (const file of this.downloadedFiles) {
                                    rmSync(file.filePath);
                                }
                            }

                            store.bot?.telegram
                                .deleteMessage(
                                    this.chatId,
                                    this.statusMessageId
                                )
                                .then(() =>
                                    logger.debug(
                                        `Deleted status message for ${this.url}`,
                                        {
                                            action: 'onJobUpdate',
                                            it: this.id,
                                            chatId: this.chatId,
                                            messageId: this.messageId,
                                            statusMessageId:
                                                this.statusMessageId,
                                        }
                                    )
                                )
                                .catch((error) => {
                                    logger.error(
                                        `Failed to delete status message for ${this.url}`,
                                        {
                                            action: 'onJobUpdate',
                                            it: this.id,
                                            chatId: this.chatId,
                                            messageId: this.messageId,
                                            statusMessageId:
                                                this.statusMessageId,
                                            error,
                                        }
                                    );
                                });
                        } catch (error) {
                            logger.error('Failed to remove uploaded files!', {
                                action: 'onJobUpdate',
                                error,
                            });
                        }
                    })
                    .catch((error) => {
                        logger.error(
                            `Successfully sent ${
                                this.downloadedFiles?.length || 0
                            }!`,
                            {
                                action: 'onJobUpdate',
                                id: this.id,
                                chatId: this.chatId,
                                messageId: this.messageId,
                                error,
                            }
                        );
                    });
            }
        }
    }
}

import telegram from 'telegram';
import { Column, Entity, PrimaryColumn } from 'typeorm';

import { BaseEntity } from './BaseEntity.js';

@Entity('chats')
export class ChatEntity extends BaseEntity {
    @PrimaryColumn('bigint')
    public id!: number;

    @Column('simple-enum', { enum: ['supergroup', 'group', 'private'] })
    public type!: 'supergroup' | 'group' | 'private';

    @Column('simple-enum', { enum: ['active', 'stopped'] })
    public status!: 'active' | 'stopped';

    @Column('bigint')
    public userId!: number;

    @Column('simple-json')
    public userInfo!: Partial<telegram.Api.User>;
}

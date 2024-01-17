import telegram from 'telegram';
import { Column, Entity, OneToOne, PrimaryColumn, Relation } from 'typeorm';

import { BaseEntity } from './BaseEntity.js';
import { ConfigEntity } from './ConfigEntity.js';

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

    @OneToOne(() => ConfigEntity, (config) => config.chat, {
        eager: true,
        cascade: true,
    })
    public config!: Relation<ConfigEntity>;
}

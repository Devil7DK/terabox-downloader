import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';

import { BaseEntity } from './BaseEntity.js';
import { ChatEntity } from './ChatEntity.js';
import type { JobEntity as JobEntityType } from './JobEntity.js';
import { JobEntity } from './JobEntity.js';

@Entity('messages')
export class MessageEntity extends BaseEntity {
    @PrimaryGeneratedColumn('uuid')
    public id!: string;

    @Column('bigint')
    public messageId!: number;

    @Column('bigint')
    public chatId!: number;

    @ManyToOne(() => ChatEntity)
    @JoinColumn({ name: 'chatId' })
    public chat?: ChatEntity;

    @OneToMany(() => JobEntity, (job) => job.message)
    public jobs?: JobEntityType;
}

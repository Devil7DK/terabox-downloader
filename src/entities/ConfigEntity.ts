import {
    Column,
    Entity,
    JoinColumn,
    OneToOne,
    PrimaryGeneratedColumn,
    Relation,
} from 'typeorm';

import { DownloadMethod, TeraboxMirror } from '../types/index.js';
import { BaseEntity } from './BaseEntity.js';
import { ChatEntity } from './ChatEntity.js';

@Entity('config')
export class ConfigEntity extends BaseEntity {
    @PrimaryGeneratedColumn('uuid')
    public id!: string;

    @Column('bigint')
    public chatId!: number;

    @Column('simple-enum', {
        enum: DownloadMethod,
        default: Object.values(DownloadMethod)[0],
    })
    public downloadMethod!: DownloadMethod;

    @Column('simple-enum', {
        enum: TeraboxMirror,
        default: Object.values(TeraboxMirror)[0],
    })
    public mirror!: TeraboxMirror;

    @Column('boolean', { default: false })
    public useProxy!: boolean;

    @OneToOne(() => ChatEntity, (chat) => chat.config)
    @JoinColumn({ name: 'chatId' })
    public chat!: Relation<ChatEntity>;
}

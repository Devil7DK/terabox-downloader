import {
    BeforeInsert,
    BeforeUpdate,
    Column,
    BaseEntity as TypeORMBaseEntity,
} from 'typeorm';

export class BaseEntity extends TypeORMBaseEntity {
    @Column('bigint')
    public createdOn!: number;

    @Column('bigint')
    public updatedOn!: number;

    @BeforeInsert()
    public beforeInsert() {
        this.createdOn = this.updatedOn = Date.now();
    }

    @BeforeUpdate()
    public beforeUpdate() {
        this.updatedOn = Date.now();
    }
}

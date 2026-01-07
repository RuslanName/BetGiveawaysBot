import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'bigint', unique: true })
    chat_id!: number;

    @Column({ type: 'varchar', length: 255, nullable: true })
    first_name!: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    last_name!: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    username!: string | null;

    @Column({ type: 'varchar', length: 12, unique: true })
    betboom_id!: string;

    @CreateDateColumn({ name: 'registered_at' })
    registered_at!: Date;
}


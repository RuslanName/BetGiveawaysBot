import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type BroadcastStatus = 'sending' | 'sent';

@Entity('broadcasts')
export class Broadcast {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'text', nullable: true })
    caption!: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true, name: 'file_id' })
    file_id!: string | null;

    @Column({ type: 'varchar', length: 20, default: 'sending' })
    status!: BroadcastStatus;

    @CreateDateColumn({ name: 'created_at' })
    created_at!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at!: Date;
}


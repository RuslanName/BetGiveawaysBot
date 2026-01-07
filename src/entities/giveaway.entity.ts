import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type GiveawayStatus = 'active' | 'awaiting_review' | 'completed' | 'cancelled';

@Entity('giveaways')
export class Giveaway {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'text' })
    caption!: string;

    @Column({ type: 'varchar', length: 255, nullable: true, name: 'file_id' })
    file_id!: string | null;

    @Column({ type: 'integer', name: 'winners_count' })
    winners_count!: number;

    @Column({ type: 'timestamp', name: 'ended_at' })
    ended_at!: Date;

    @Column({ type: 'varchar', length: 20, default: 'active' })
    status!: GiveawayStatus;

    @CreateDateColumn({ name: 'created_at' })
    created_at!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at!: Date;
}


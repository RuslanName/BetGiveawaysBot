import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type BetEventStatus = 'active' | 'awaiting_review' | 'completed' | 'cancelled';

@Entity('bet_events')
export class BetEvent {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 500 })
    match_name!: string;

    @Column({ type: 'varchar', length: 255 })
    winner_team!: string;

    @Column({ type: 'integer' })
    bet_amount!: number;

    @Column({ type: 'timestamp', name: 'match_started_at' })
    match_started_at!: Date;

    @Column({ type: 'varchar', length: 255, nullable: true, name: 'file_id' })
    file_id!: string | null;

    @Column({ type: 'varchar', length: 20, default: 'active' })
    status!: BetEventStatus;

    @CreateDateColumn({ name: 'created_at' })
    created_at!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at!: Date;
}


import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type BetEventStatus = 'active' | 'completed' | 'cancelled';

export enum BetEventType {
    MAIN_TIME = 'main_time',
    TOTAL_WIN = 'total_win'
}

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

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    coefficient!: number;

    @Column({ type: 'timestamp', name: 'match_started_at' })
    match_started_at!: Date;

    @Column({ type: 'varchar', length: 255, nullable: true, name: 'file_id' })
    file_id!: string | null;

    @Column({ type: 'varchar', length: 500, nullable: true, name: 'betboom_url' })
    betboom_url!: string | null;

    @Column({ type: 'varchar', length: 50, name: 'event_type' })
    event_type!: BetEventType;

    @Column({ type: 'boolean', nullable: true, name: 'is_won' })
    is_won!: boolean | null;

    @Column({ type: 'varchar', length: 20, default: 'active' })
    status!: BetEventStatus;

    @CreateDateColumn({ name: 'created_at' })
    created_at!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at!: Date;
}


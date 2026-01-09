import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type ContestStatus = 'active' | 'match_finished' | 'completed' | 'cancelled';
export type PickedOutcome = 'team_1_win' | 'team_2_win' | 'draw';

@Entity('contests')
export class Contest {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 500, name: 'match_name' })
    match_name!: string;

    @Column({ type: 'varchar', length: 255, name: 'team_1' })
    team_1!: string;

    @Column({ type: 'varchar', length: 255, name: 'team_2' })
    team_2!: string;

    @Column({ type: 'timestamp', name: 'match_started_at' })
    match_started_at!: Date;

    @Column({ type: 'varchar', length: 20, nullable: true, name: 'picked_outcome' })
    picked_outcome!: PickedOutcome | null;

    @Column({ type: 'varchar', length: 20, default: 'active' })
    status!: ContestStatus;

    @CreateDateColumn({ name: 'created_at' })
    created_at!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at!: Date;
}


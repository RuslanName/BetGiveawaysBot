import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './user.entity.js';
import { Contest, type PickedOutcome } from './contest.entity.js';

@Entity('contest_picks')
export class ContestPick {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'integer', name: 'user_id' })
    user_id!: number;

    @Column({ type: 'integer', name: 'contest_id' })
    contest_id!: number;

    @Column({ type: 'varchar', length: 20, name: 'picked_outcome' })
    picked_outcome!: PickedOutcome;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user!: User;

    @ManyToOne(() => Contest)
    @JoinColumn({ name: 'contest_id' })
    contest!: Contest;

    @CreateDateColumn({ name: 'created_at' })
    created_at!: Date;
}


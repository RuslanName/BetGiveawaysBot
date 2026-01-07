import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from './user.entity.js';
import { BetEvent } from './bet-event.entity.js';

@Entity('user_bets')
export class UserBet {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 12, name: 'ticket_id' })
    ticket_id!: string;

    @Column({ type: 'varchar', length: 255, nullable: true, name: 'file_id' })
    file_id!: string | null;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user!: User;

    @Column({ type: 'integer', name: 'user_id' })
    user_id!: number;

    @ManyToOne(() => BetEvent)
    @JoinColumn({ name: 'bet_event_id' })
    bet_event!: BetEvent;

    @Column({ type: 'integer', name: 'bet_event_id' })
    bet_event_id!: number;

    @CreateDateColumn({ name: 'created_at' })
    created_at!: Date;
}


import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity.js';
import { Giveaway } from './giveaway.entity.js';

@Entity('giveaway_winners')
export class GiveawayWinners {
    @PrimaryColumn({ type: 'integer', name: 'giveaway_id' })
    giveaway_id!: number;

    @PrimaryColumn({ type: 'integer', name: 'user_id' })
    user_id!: number;

    @ManyToOne(() => Giveaway)
    @JoinColumn({ name: 'giveaway_id' })
    giveaway!: Giveaway;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'user_id' })
    user!: User;
}


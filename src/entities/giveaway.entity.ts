import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export type GiveawayStatus = 'active' | 'completed';

@Entity('giveaways')
export class Giveaway {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 255, name: 'file_id' })
    file_id!: string;

    @Column({ type: 'varchar', length: 20, default: 'active' })
    status!: GiveawayStatus;

    @CreateDateColumn({ name: 'created_at' })
    created_at!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updated_at!: Date;
}


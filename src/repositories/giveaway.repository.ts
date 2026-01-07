import { Repository } from 'typeorm';
import { AppDataSource } from '../config/db.js';
import { Giveaway, User, UserBet, BetEvent, GiveawayWinners } from '../entities/index.js';

export class GiveawayRepository {
    private repository: Repository<Giveaway>;

    constructor() {
        this.repository = AppDataSource.getRepository(Giveaway);
    }

    async findById(id: number): Promise<Giveaway | null> {
        return this.repository.findOne({ where: { id } });
    }

    async findActiveAndAwaitingReview(): Promise<Giveaway[]> {
        return this.repository.find({
            where: [
                { status: 'active' },
                { status: 'awaiting_review' }
            ],
            order: { created_at: 'DESC' }
        });
    }

    async create(giveaway: Partial<Giveaway>): Promise<Giveaway> {
        const newGiveaway = this.repository.create(giveaway);
        return this.repository.save(newGiveaway);
    }

    async update(id: number, updates: Partial<Giveaway>): Promise<Giveaway> {
        await this.repository.update(id, updates);
        const updated = await this.findById(id);
        if (!updated) throw new Error('Giveaway not found');
        return updated;
    }

    async delete(id: number): Promise<void> {
        await this.repository.update(id, { status: 'cancelled' });
    }

    async getParticipants(giveawayId: number): Promise<Array<{ user_id: number; chat_id: number; username: string | null; betboom_id: string }>> {
        const giveaway = await this.repository.findOne({ where: { id: giveawayId } });
        if (!giveaway) return [];

        const result = await AppDataSource
            .getRepository(User)
            .createQueryBuilder('user')
            .innerJoin(UserBet, 'ub', 'ub.user_id = user.id')
            .innerJoin(BetEvent, 'be', 'ub.bet_event_id = be.id')
            .select([
                'user.id',
                'user.chat_id',
                'user.username',
                'user.betboom_id'
            ])
            .where('be.created_at <= :giveawayCreatedAt', { giveawayCreatedAt: giveaway.created_at })
            .groupBy('user.id')
            .addGroupBy('user.chat_id')
            .addGroupBy('user.username')
            .addGroupBy('user.betboom_id')
            .orderBy('user.id', 'ASC')
            .getRawMany();

        return result.map((row: any) => ({
            user_id: row.user_id,
            chat_id: row.user_chat_id,
            username: row.user_username,
            betboom_id: row.user_betboom_id
        }));
    }

    async setWinners(giveawayId: number, winnerIds: number[]): Promise<void> {
        const giveawayWinnersRepo = AppDataSource.getRepository(GiveawayWinners);
        
        await giveawayWinnersRepo
            .createQueryBuilder()
            .delete()
            .where('giveaway_id = :giveawayId', { giveawayId })
            .execute();

        if (winnerIds.length > 0) {
            const winners = winnerIds.map(userId => ({
                giveaway_id: giveawayId,
                user_id: userId
            }));
            await giveawayWinnersRepo.save(winners);
        }
    }

    async getWinners(giveawayId: number): Promise<Array<{ user_id: number; chat_id: number; username: string | null; betboom_id: string }>> {
        const result = await AppDataSource
            .getRepository(GiveawayWinners)
            .createQueryBuilder('gw')
            .innerJoin('gw.user', 'user')
            .select([
                'user.id',
                'user.chat_id',
                'user.username',
                'user.betboom_id'
            ])
            .where('gw.giveaway_id = :giveawayId', { giveawayId })
            .orderBy('user.id', 'ASC')
            .getRawMany();

        return result.map((row: any) => ({
            user_id: row.user_id,
            chat_id: row.user_chat_id,
            username: row.user_username,
            betboom_id: row.user_betboom_id
        }));
    }

    async findFinishedGiveaways(): Promise<Giveaway[]> {
        const now = new Date();
        return this.repository
            .createQueryBuilder('giveaway')
            .where('giveaway.status = :status', { status: 'active' })
            .andWhere('giveaway.ended_at <= :now', { now })
            .getMany();
    }
}


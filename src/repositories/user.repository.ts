import { Repository } from 'typeorm';
import { AppDataSource } from '../config/db.js';
import { User, UserBet } from '../entities/index.js';

export class UserRepository {
    private repository: Repository<User>;

    constructor() {
        this.repository = AppDataSource.getRepository(User);
    }

    async findByChatId(chatId: number): Promise<User | null> {
        return this.repository.findOne({ where: { chat_id: chatId } });
    }

    async findByBetboomId(betboomId: string): Promise<User | null> {
        return this.repository.findOne({ where: { betboom_id: betboomId } });
    }

    async create(user: Partial<User>): Promise<User> {
        const newUser = this.repository.create(user);
        return this.repository.save(newUser);
    }

    async countByPeriod(startDate: Date, endDate: Date): Promise<number> {
        return this.repository
            .createQueryBuilder('user')
            .where('user.registered_at >= :startDate', { startDate })
            .andWhere('user.registered_at <= :endDate', { endDate })
            .getCount();
    }

    async countRegisteredToday(): Promise<number> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return this.countByPeriod(today, tomorrow);
    }

    async countRegisteredThisWeek(): Promise<number> {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return this.countByPeriod(weekAgo, today);
    }

    async countRegisteredThisMonth(): Promise<number> {
        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return this.countByPeriod(monthAgo, today);
    }

    async countRegisteredThisYear(): Promise<number> {
        const today = new Date();
        const yearAgo = new Date(today);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        return this.countByPeriod(yearAgo, today);
    }

    async getTopUsersByParticipations(limit: number = 10): Promise<Array<{ user: User; count: number }>> {
        const userBetRepository = AppDataSource.getRepository(UserBet);
        
        const statsQuery = userBetRepository
            .createQueryBuilder('ub')
            .select('ub.user_id', 'user_id')
            .addSelect('COUNT(ub.id)', 'count')
            .groupBy('ub.user_id');

        const result = await this.repository
            .createQueryBuilder('user')
            .leftJoin(
                `(${statsQuery.getQuery()})`,
                'ub_stats',
                'ub_stats.user_id = user.id'
            )
            .setParameters(statsQuery.getParameters())
            .select([
                'user.id',
                'user.chat_id',
                'user.first_name',
                'user.last_name',
                'user.username',
                'user.betboom_id',
                'user.registered_at'
            ])
            .addSelect('COALESCE(ub_stats.count, 0)', 'count')
            .orderBy('count', 'DESC')
            .addOrderBy('user.id', 'ASC')
            .limit(limit)
            .getRawMany();

        return result.map((row: any) => ({
            user: {
                id: row.user_id,
                chat_id: row.user_chat_id,
                first_name: row.user_first_name,
                last_name: row.user_last_name,
                username: row.user_username,
                betboom_id: row.user_betboom_id,
                registered_at: row.user_registered_at
            } as User,
            count: parseInt(row.count) || 0
        }));
    }
}


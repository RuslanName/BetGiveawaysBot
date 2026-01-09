import { Repository } from 'typeorm';
import { AppDataSource } from '../config/db.js';
import { UserBet } from '../entities/index.js';

export class UserBetRepository {
    private repository: Repository<UserBet>;

    constructor() {
        this.repository = AppDataSource.getRepository(UserBet);
    }

    async findByTicketIdAndEvent(ticketId: string, eventId: number): Promise<UserBet | null> {
        return this.repository.findOne({ where: { ticket_id: ticketId, bet_event_id: eventId } });
    }

    async create(bet: Partial<UserBet>): Promise<UserBet> {
        const newBet = this.repository.create(bet);
        return this.repository.save(newBet);
    }

    async findByUserIdAndEventId(userId: number, eventId: number): Promise<UserBet | null> {
        return this.repository.findOne({ where: { user_id: userId, bet_event_id: eventId } });
    }

    async countByPeriod(startDate: Date, endDate: Date): Promise<number> {
        return this.repository
            .createQueryBuilder('ub')
            .where('ub.created_at >= :startDate', { startDate })
            .andWhere('ub.created_at <= :endDate', { endDate })
            .getCount();
    }

    async countToday(): Promise<number> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return this.countByPeriod(today, tomorrow);
    }

    async countThisWeek(): Promise<number> {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return this.countByPeriod(weekAgo, today);
    }

    async countThisMonth(): Promise<number> {
        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return this.countByPeriod(monthAgo, today);
    }

    async countThisYear(): Promise<number> {
        const today = new Date();
        const yearAgo = new Date(today);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        return this.countByPeriod(yearAgo, today);
    }

    async findByEventId(eventId: number): Promise<UserBet[]> {
        return this.repository.find({
            where: { bet_event_id: eventId },
            relations: ['user']
        });
    }
}


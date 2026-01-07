import { Repository } from 'typeorm';
import { AppDataSource } from '../config/db.js';
import { BetEvent, UserBet, type BetEventStatus } from '../entities/index.js';

export class BetEventRepository {
    private repository: Repository<BetEvent>;

    constructor() {
        this.repository = AppDataSource.getRepository(BetEvent);
    }

    async findById(id: number): Promise<BetEvent | null> {
        return this.repository.findOne({ where: { id } });
    }

    async findByStatus(status: BetEventStatus): Promise<BetEvent[]> {
        return this.repository.find({ where: { status }, order: { created_at: 'DESC' } });
    }

    async findActiveAndAwaitingReview(): Promise<BetEvent[]> {
        return this.repository.find({
            where: [
                { status: 'active' },
                { status: 'awaiting_review' }
            ],
            order: { created_at: 'DESC' }
        });
    }

    async create(event: Partial<BetEvent>): Promise<BetEvent> {
        const newEvent = this.repository.create(event);
        return this.repository.save(newEvent);
    }

    async update(id: number, updates: Partial<BetEvent>): Promise<BetEvent> {
        await this.repository.update(id, updates);
        const updated = await this.findById(id);
        if (!updated) throw new Error('Event not found');
        return updated;
    }

    async delete(id: number): Promise<void> {
        await this.repository.update(id, { status: 'cancelled' });
    }

    async getParticipants(eventId: number, page: number = 1, limit: number = 20): Promise<Array<{ user: any; ticket_id: string; file_id: string | null }>> {
        const offset = (page - 1) * limit;
        
        const result = await AppDataSource
            .getRepository(UserBet)
            .createQueryBuilder('ub')
            .leftJoin('ub.user', 'user')
            .select([
                'ub.id',
                'ub.ticket_id',
                'ub.file_id',
                'ub.created_at',
                'user.id',
                'user.chat_id',
                'user.username',
                'user.betboom_id'
            ])
            .where('ub.bet_event_id = :eventId', { eventId })
            .orderBy('ub.created_at', 'ASC')
            .skip(offset)
            .take(limit)
            .getRawMany();

        return result.map((row: any) => ({
            user: {
                id: row.user_id,
                chat_id: row.user_chat_id,
                username: row.user_username,
                betboom_id: row.user_betboom_id
            },
            ticket_id: row.ub_ticket_id,
            file_id: row.ub_file_id
        }));
    }

    async getParticipantsCount(eventId: number): Promise<number> {
        return AppDataSource
            .getRepository(UserBet)
            .createQueryBuilder('ub')
            .where('ub.bet_event_id = :eventId', { eventId })
            .getCount();
    }

    async getTotalPages(eventId: number, limit: number = 20): Promise<number> {
        const count = await this.getParticipantsCount(eventId);
        return Math.ceil(count / limit);
    }

    async findFinishedEvents(): Promise<BetEvent[]> {
        const now = new Date();
        return this.repository
            .createQueryBuilder('event')
            .where('event.status = :status', { status: 'active' })
            .andWhere('event.match_started_at <= :now', { now })
            .getMany();
    }
}


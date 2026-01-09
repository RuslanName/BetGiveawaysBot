import { Repository } from 'typeorm';
import { AppDataSource } from '../config/db.js';
import { Contest, type ContestStatus } from '../entities/index.js';

export class ContestRepository {
    private repository: Repository<Contest>;

    constructor() {
        this.repository = AppDataSource.getRepository(Contest);
    }

    async findById(id: number): Promise<Contest | null> {
        return this.repository.findOne({ where: { id } });
    }

    async findByStatus(status: ContestStatus): Promise<Contest[]> {
        return this.repository.find({ where: { status }, order: { created_at: 'DESC' } });
    }

    async findActiveAndMatchFinished(): Promise<Contest[]> {
        return this.repository.find({
            where: [
                { status: 'active' },
                { status: 'match_finished' }
            ],
            order: { created_at: 'DESC' }
        });
    }

    async create(contest: Partial<Contest>): Promise<Contest> {
        const newContest = this.repository.create(contest);
        return this.repository.save(newContest);
    }

    async update(id: number, updates: Partial<Contest>): Promise<Contest> {
        await this.repository.update(id, updates);
        const updated = await this.findById(id);
        if (!updated) throw new Error('Contest not found');
        return updated;
    }

    async delete(id: number): Promise<void> {
        await this.repository.update(id, { status: 'cancelled' });
    }

    async findFinishedContests(): Promise<Contest[]> {
        const now = new Date();
        return this.repository
            .createQueryBuilder('contest')
            .where('contest.status = :status', { status: 'active' })
            .andWhere('contest.match_started_at <= :now', { now })
            .getMany();
    }

    async findAllWithOutcome(): Promise<Contest[]> {
        return this.repository.find({
            where: { status: 'match_finished' },
            order: { created_at: 'DESC' }
        });
    }
}


import { Repository, type FindManyOptions } from 'typeorm';
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

    async findActiveAndCompleted(): Promise<Contest[]> {
        return this.repository.find({
            where: [
                { status: 'active' },
                { status: 'completed' }
            ],
            order: { created_at: 'DESC' }
        });
    }

    async find(conditions: FindManyOptions<Contest>): Promise<Contest[]> {
        return this.repository.find(conditions);
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

}


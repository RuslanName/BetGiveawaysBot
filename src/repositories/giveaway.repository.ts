import { AppDataSource } from '../config/db.js';
import { Repository } from 'typeorm';
import { Giveaway } from '../entities/index.js';

export class GiveawayRepository {
    private repository: Repository<Giveaway>;

    constructor() {
        this.repository = AppDataSource.getRepository(Giveaway);
    }

    async create(data: Partial<Giveaway>): Promise<Giveaway> {
        const giveaway = this.repository.create(data);
        return this.repository.save(giveaway);
    }

    async findById(id: number): Promise<Giveaway | null> {
        return this.repository.findOne({ where: { id } });
    }

    async findActive(): Promise<Giveaway | null> {
        return this.repository.findOne({ where: { status: 'active' } });
    }

    async update(id: number, updates: Partial<Giveaway>): Promise<Giveaway> {
        await this.repository.update(id, updates);
        const updated = await this.repository.findOne({ where: { id } });
        if (!updated) {
            throw new Error('Giveaway not found');
        }
        return updated;
    }
}


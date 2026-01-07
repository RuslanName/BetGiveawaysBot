import { Repository } from 'typeorm';
import { AppDataSource } from '../config/db.js';
import { Broadcast } from '../entities/index.js';

export class BroadcastRepository {
    private repository: Repository<Broadcast>;

    constructor() {
        this.repository = AppDataSource.getRepository(Broadcast);
    }

    async findById(id: number): Promise<Broadcast | null> {
        return this.repository.findOne({ where: { id } });
    }

    async create(broadcast: Partial<Broadcast>): Promise<Broadcast> {
        const newBroadcast = this.repository.create(broadcast);
        return this.repository.save(newBroadcast);
    }

    async update(id: number, updates: Partial<Broadcast>): Promise<Broadcast> {
        await this.repository.update(id, updates);
        const updated = await this.findById(id);
        if (!updated) throw new Error('Broadcast not found');
        return updated;
    }
}


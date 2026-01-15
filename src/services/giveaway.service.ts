import { GiveawayRepository } from '../repositories/giveaway.repository.js';
import { Giveaway } from '../entities/index.js';

export class GiveawayService {
    private giveawayRepo = new GiveawayRepository();

    async createGiveaway(fileId: string): Promise<Giveaway> {
        return this.giveawayRepo.create({
            file_id: fileId,
            status: 'active'
        });
    }

    async getActiveGiveaway(): Promise<Giveaway | null> {
        return this.giveawayRepo.findActive();
    }

    async getGiveawayById(id: number): Promise<Giveaway | null> {
        return this.giveawayRepo.findById(id);
    }

    async updateGiveawayPhoto(id: number, fileId: string): Promise<Giveaway> {
        return this.giveawayRepo.update(id, { file_id: fileId });
    }

    async completeGiveaway(id: number): Promise<void> {
        await this.giveawayRepo.update(id, { status: 'completed' });
    }
}


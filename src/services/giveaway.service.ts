import { GiveawayRepository } from '../repositories/giveaway.repository.js';
import { AppDataSource } from '../config/db.js';
import { Giveaway, User } from '../entities/index.js';
import { Telegraf } from 'telegraf';

export class GiveawayService {
    private giveawayRepo = new GiveawayRepository();

    async createGiveaway(caption: string, winnersCount: number, endedAt: Date, fileId: string | null): Promise<Giveaway> {
        return this.giveawayRepo.create({
            caption,
            winners_count: winnersCount,
            ended_at: endedAt,
            file_id: fileId,
            status: 'active'
        });
    }

    async getGiveawayById(id: number): Promise<Giveaway | null> {
        return this.giveawayRepo.findById(id);
    }

    async getGiveawaysForAdmin(): Promise<Giveaway[]> {
        return this.giveawayRepo.findActiveAndAwaitingReview();
    }

    async cancelGiveaway(id: number): Promise<void> {
        await this.giveawayRepo.delete(id);
    }

    async getResults(giveawayId: number): Promise<{ winners: any[]; winnersCount: number }> {
        const winners = await this.giveawayRepo.getWinners(giveawayId);
        await this.giveawayRepo.update(giveawayId, { status: 'completed' });
        return { winners, winnersCount: winners.length };
    }

    async selectWinners(giveawayId: number): Promise<void> {
        const giveaway = await this.giveawayRepo.findById(giveawayId);
        if (!giveaway) {
            throw new Error('Giveaway not found');
        }

        const participants = await this.giveawayRepo.getParticipants(giveawayId);
        
        if (participants.length === 0) {
            throw new Error('No participants found');
        }

        const shuffled = [...participants].sort(() => Math.random() - 0.5);
        const selectedWinners = shuffled.slice(0, Math.min(giveaway.winners_count, participants.length));
        
        const winnerIds = selectedWinners.map(p => p.user_id);
        await this.giveawayRepo.setWinners(giveawayId, winnerIds);
    }

    async getParticipants(giveawayId: number): Promise<Array<{ user_id: number; chat_id: number; username: string | null; betboom_id: string }>> {
        return this.giveawayRepo.getParticipants(giveawayId);
    }

    async getWinners(giveawayId: number): Promise<Array<{ user_id: number; chat_id: number; username: string | null; betboom_id: string }>> {
        return this.giveawayRepo.getWinners(giveawayId);
    }

    async sendGiveawayNotification(giveawayId: number, bot: Telegraf): Promise<void> {
        const giveaway = await this.giveawayRepo.findById(giveawayId);
        if (!giveaway) {
            throw new Error('Giveaway not found');
        }

        const winners = await this.giveawayRepo.getWinners(giveawayId);
        const userRepository = AppDataSource.getRepository(User);
        const allUsers = await userRepository.find({ select: ['chat_id'] });
        
        for (const userRow of allUsers) {
            try {
                let message = '';
                if (winners.length === 1) {
                    const winner = winners[0];
                    message = `Победитель розыгрыша №${giveawayId} стал @${winner.username || 'пользователь'}, поздравляем победителя!`;
                } else {
                    message = `Победители розыгрыша №${giveawayId} стали:\n`;
                    winners.forEach((winner, index) => {
                        message += `${index + 1}) @${winner.username || 'пользователь'}\n`;
                    });
                    message += 'Поздравляем победителей!';
                }

                await bot.telegram.sendMessage(userRow.chat_id, message);
                
                if (allUsers.indexOf(userRow) % 30 === 0 && allUsers.indexOf(userRow) > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`Failed to send giveaway notification to user ${userRow.chat_id}:`, error);
            }
        }
    }

    async findFinishedGiveaways(): Promise<Giveaway[]> {
        return this.giveawayRepo.findFinishedGiveaways();
    }

    async processFinishedGiveaway(giveawayId: number, bot: Telegraf): Promise<void> {
        try {
            await this.selectWinners(giveawayId);
            await this.sendGiveawayNotification(giveawayId, bot);
        } catch (error) {
            console.error(`Error processing finished giveaway ${giveawayId}:`, error);
        }
    }
}


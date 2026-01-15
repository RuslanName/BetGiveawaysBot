import { ContestRepository } from '../repositories/contest.repository.js';
import { ContestPickRepository } from '../repositories/contest-pick.repository.js';
import {Contest, ContestPick, type PickedOutcome} from '../entities/index.js';
import { Telegraf } from 'telegraf';
import { GiveawayService } from './giveaway.service.js';

export class ContestService {
    private contestRepo = new ContestRepository();
    private pickRepo = new ContestPickRepository();
    private giveawayService = new GiveawayService();

    async createContest(matchName: string, team1: string, team2: string, matchStartedAt: Date, giveawayId: number | null): Promise<Contest> {
        return this.contestRepo.create({
            match_name: matchName,
            team_1: team1,
            team_2: team2,
            match_started_at: matchStartedAt,
            giveaway_id: giveawayId,
            status: 'active',
            picked_outcome: null
        });
    }

    async getContestById(id: number): Promise<Contest | null> {
        return this.contestRepo.findById(id);
    }

    async getContestsForAdmin(): Promise<Contest[]> {
        return this.contestRepo.findActiveAndCompleted();
    }

    async getActiveContests(): Promise<Contest[]> {
        return this.contestRepo.findByStatus('active');
    }

    async cancelContest(id: number): Promise<void> {
        await this.contestRepo.delete(id);
    }

    async updateContest(id: number, updates: Partial<Contest>): Promise<Contest> {
        return this.contestRepo.update(id, updates);
    }

    async addPick(userId: number, contestId: number, pickedOutcome: PickedOutcome): Promise<void> {
        const existing = await this.pickRepo.findByUserIdAndContestId(userId, contestId);
        if (existing) {
            throw new Error('User already picked outcome for this contest');
        }

        await this.pickRepo.create({
            user_id: userId,
            contest_id: contestId,
            picked_outcome: pickedOutcome
        });
    }

    async getUserPick(userId: number, contestId: number): Promise<ContestPick | null> {
        return this.pickRepo.findByUserIdAndContestId(userId, contestId);
    }

    async setContestOutcome(contestId: number, outcome: PickedOutcome): Promise<void> {
        const now = new Date();
        const contest = await this.contestRepo.findById(contestId);
        if (!contest) {
            throw new Error('Contest not found');
        }

        if (contest.match_started_at > now) {
            throw new Error('Match has not started yet');
        }

        await this.contestRepo.update(contestId, {
            picked_outcome: outcome,
            status: 'completed'
        });
    }

    async finalizeContests(bot: Telegraf): Promise<void> {
        const activeGiveaway = await this.giveawayService.getActiveGiveaway();
        if (!activeGiveaway) {
            throw new Error('No active giveaway found');
        }

        const contests = await this.contestRepo.find({
            where: {
                giveaway_id: activeGiveaway.id,
                status: 'completed'
            }
        });

        if (contests.length === 0) {
            throw new Error('No completed contests found');
        }

        const topUsers = await this.pickRepo.getTopUsers(20);

        let message = '*Топ-20 пользователей по итогам розыгрыша:*\n';
        if (topUsers.length === 0) {
            message += 'Нет пользователей\n';
        } else {
            topUsers.forEach((item, index) => {
                const username = item.user.username ? `@${item.user.username}` : 'пользователь';
                message += `${index + 1}) ${username} (BetBoom ID: ${item.user.betboom_id}) - ${item.points}\n`;
            });
        }

        const { ENV } = await import('../config/constants.js');
        const adminIds = ENV.ADMIN_CHAT_IDS.split(',').map(id => parseInt(id.trim()));
        for (const adminId of adminIds) {
            try {
                await bot.telegram.sendMessage(adminId, message, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error(`Failed to send finalization to admin ${adminId}:`, error);
            }
        }

        await this.giveawayService.completeGiveaway(activeGiveaway.id);
    }

    async getTotalParticipantsCount(): Promise<number> {
        return this.pickRepo.getTotalParticipantsCount();
    }

    async canFinalizeContests(): Promise<boolean> {
        const activeGiveaway = await this.giveawayService.getActiveGiveaway();
        if (!activeGiveaway) {
            return false;
        }

        const activeContests = await this.contestRepo.find({
            where: {
                giveaway_id: activeGiveaway.id,
                status: 'active'
            }
        });

        const completedContests = await this.contestRepo.find({
            where: {
                giveaway_id: activeGiveaway.id,
                status: 'completed'
            }
        });

        return activeContests.length === 0 && completedContests.length > 0;
    }
}


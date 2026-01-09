import { ContestRepository } from '../repositories/contest.repository.js';
import { ContestPickRepository } from '../repositories/contest-pick.repository.js';
import {Contest, ContestPick, type PickedOutcome} from '../entities/index.js';
import { Telegraf } from 'telegraf';

export class ContestService {
    private contestRepo = new ContestRepository();
    private pickRepo = new ContestPickRepository();

    async createContest(matchName: string, team1: string, team2: string, matchStartedAt: Date): Promise<Contest> {
        return this.contestRepo.create({
            match_name: matchName,
            team_1: team1,
            team_2: team2,
            match_started_at: matchStartedAt,
            status: 'active',
            picked_outcome: null
        });
    }

    async getContestById(id: number): Promise<Contest | null> {
        return this.contestRepo.findById(id);
    }

    async getContestsForAdmin(): Promise<Contest[]> {
        return this.contestRepo.findActiveAndMatchFinished();
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
            status: 'match_finished'
        });
    }

    async finalizeContests(bot: Telegraf): Promise<void> {
        const contests = await this.contestRepo.findAllWithOutcome();
        if (contests.length === 0) {
            throw new Error('No contests with outcomes found');
        }

        const topUsers = await this.pickRepo.getTopUsers(20);

        let message = '*Топ-20 пользователей по итогам розыгрыша:*\n';
        topUsers.forEach((item, index) => {
            const username = item.user.username ? `@${item.user.username}` : 'пользователь';
            message += `${index + 1}) ${username} (BetBoom ID: ${item.user.betboom_id}) - ${item.points}\n`;
        });

        const { ENV } = await import('../config/constants.js');
        const adminIds = ENV.ADMIN_CHAT_IDS.split(',').map(id => parseInt(id.trim()));
        for (const adminId of adminIds) {
            try {
                await bot.telegram.sendMessage(adminId, message, { parse_mode: 'Markdown' });
            } catch (error) {
                console.error(`Failed to send finalization to admin ${adminId}:`, error);
            }
        }

        for (const contest of contests) {
            await this.contestRepo.update(contest.id, { status: 'completed' });
        }
    }

    async findFinishedContests(): Promise<Contest[]> {
        return this.contestRepo.findFinishedContests();
    }

    async processFinishedContest(contestId: number): Promise<void> {
        const contest = await this.contestRepo.findById(contestId);
        if (!contest) return;

        const now = new Date();
        if (contest.match_started_at <= now && contest.status === 'active') {
            await this.contestRepo.update(contestId, { status: 'match_finished' });
        }
    }

    async getTotalParticipantsCount(): Promise<number> {
        return this.pickRepo.getTotalParticipantsCount();
    }

    async canFinalizeContests(): Promise<boolean> {
        const activeContests = await this.contestRepo.findByStatus('active');
        const matchFinishedContests = await this.contestRepo.findByStatus('match_finished');
        return activeContests.length === 0 && matchFinishedContests.length > 0;
    }
}


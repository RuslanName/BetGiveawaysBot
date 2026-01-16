import { UserRepository } from '../repositories/user.repository.js';
import { User } from '../entities/index.js';

export class UserService {
    private userRepo = new UserRepository();

    async registerUser(chatId: number, firstName: string | null, lastName: string | null, username: string | null, betboomId: string): Promise<User> {
        const existing = await this.userRepo.findByBetboomId(betboomId);
        if (existing) {
            throw new Error('Betboom ID already registered');
        }

        const existingByChat = await this.userRepo.findByChatId(chatId);
        if (existingByChat) {
            throw new Error('User already registered');
        }

        return this.userRepo.create({
            chat_id: chatId,
            first_name: firstName,
            last_name: lastName,
            username: username,
            betboom_id: betboomId.trim()
        });
    }

    async getUserByChatId(chatId: number): Promise<User | null> {
        return this.userRepo.findByChatId(chatId);
    }

    async validateBetboomId(betboomId: string): Promise<boolean> {
        const trimmed = betboomId.trim();
        if (!/^\d{1,12}$/.test(trimmed)) {
            return false;
        }
        const existing = await this.userRepo.findByBetboomId(trimmed);
        return !existing;
    }

    async getStatistics() {
        const { ContestPickRepository } = await import('../repositories/contest-pick.repository.js');
        const pickRepo = new ContestPickRepository();
        const topContestUsers = await pickRepo.getTopUsers(20);
        
        return {
            today: await this.userRepo.countRegisteredToday(),
            week: await this.userRepo.countRegisteredThisWeek(),
            month: await this.userRepo.countRegisteredThisMonth(),
            year: await this.userRepo.countRegisteredThisYear(),
            topUsers: await this.userRepo.getTopUsersByParticipations(10),
            topContestUsers
        };
    }

    async getUserRanking(userId: number): Promise<{ rank: number; points: number; topUsers: Array<{ user_id: number; points: number; user: any }> }> {
        const { ContestPickRepository } = await import('../repositories/contest-pick.repository.js');
        const pickRepo = new ContestPickRepository();
        const topUsers = await pickRepo.getTopUsers(20);
        const rank = await pickRepo.getUserRank(userId);
        const points = await pickRepo.getUserPoints(userId);
        
        return { rank, points, topUsers };
    }
}


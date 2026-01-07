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
            betboom_id: betboomId
        });
    }

    async getUserByChatId(chatId: number): Promise<User | null> {
        return this.userRepo.findByChatId(chatId);
    }

    async validateBetboomId(betboomId: string): Promise<boolean> {
        if (!/^\d{1,12}$/.test(betboomId)) {
            return false;
        }
        const existing = await this.userRepo.findByBetboomId(betboomId);
        return !existing;
    }

    async getStatistics() {
        return {
            today: await this.userRepo.countRegisteredToday(),
            week: await this.userRepo.countRegisteredThisWeek(),
            month: await this.userRepo.countRegisteredThisMonth(),
            year: await this.userRepo.countRegisteredThisYear(),
            topUsers: await this.userRepo.getTopUsersByParticipations(10)
        };
    }
}


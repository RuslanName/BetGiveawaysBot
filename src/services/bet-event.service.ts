import { BetEventRepository } from '../repositories/bet-event.repository.js';
import { UserBetRepository } from '../repositories/user-bet.repository.js';
import { BetEvent } from '../entities/index.js';

export class BetEventService {
    private eventRepo = new BetEventRepository();
    private betRepo = new UserBetRepository();

    async createEvent(matchName: string, winnerTeam: string, betAmount: number, matchStartedAt: Date, fileId: string | null): Promise<BetEvent> {
        return this.eventRepo.create({
            match_name: matchName,
            winner_team: winnerTeam,
            bet_amount: betAmount,
            match_started_at: matchStartedAt,
            file_id: fileId,
            status: 'active'
        });
    }

    async getActiveEvents(): Promise<BetEvent[]> {
        return this.eventRepo.findByStatus('active');
    }

    async getEventById(id: number): Promise<BetEvent | null> {
        return this.eventRepo.findById(id);
    }

    async getEventsForAdmin(): Promise<BetEvent[]> {
        return this.eventRepo.findActiveAndAwaitingReview();
    }

    async cancelEvent(id: number): Promise<void> {
        await this.eventRepo.delete(id);
    }

    async getResults(eventId: number, page: number = 1): Promise<{ participants: any[]; totalPages: number; currentPage: number }> {
        const participants = await this.eventRepo.getParticipants(eventId, page, 20);
        const totalPages = await this.eventRepo.getTotalPages(eventId, 20);
        await this.eventRepo.update(eventId, { status: 'completed' });
        return { participants, totalPages, currentPage: page };
    }

    async addBet(userId: number, eventId: number, ticketId: string, fileId: string | null): Promise<void> {
        const existing = await this.betRepo.findByTicketIdAndEvent(ticketId, eventId);
        if (existing) {
            throw new Error('Ticket ID already exists for this event');
        }

        await this.betRepo.create({
            user_id: userId,
            bet_event_id: eventId,
            ticket_id: ticketId,
            file_id: fileId
        });
    }

    async validateTicketId(ticketId: string, eventId: number): Promise<boolean> {
        if (!/^\d{1,12}$/.test(ticketId)) {
            return false;
        }
        const existing = await this.betRepo.findByTicketIdAndEvent(ticketId, eventId);
        return !existing;
    }

    async getParticipantsCount(eventId: number): Promise<number> {
        return this.eventRepo.getParticipantsCount(eventId);
    }

    async hasUserBet(userId: number, eventId: number): Promise<boolean> {
        const bet = await this.betRepo.findByUserIdAndEventId(userId, eventId);
        return bet !== null;
    }

    async sendResultsToAdmin(eventId: number, adminChatId: number, bot: any): Promise<void> {
        const event = await this.getEventById(eventId);
        if (!event) return;

        const result = await this.getResults(eventId, 1);
        
        if (result.participants.length === 0) {
            await bot.telegram.sendMessage(adminChatId, `Событие "*${event.match_name}*" завершено. Участников нет.`, { parse_mode: 'Markdown' });
            return;
        }

        let message = `Событие "*${event.match_name}*"\n\n`;
        result.participants.forEach((p, index) => {
            const username = p.user.username ? `@${p.user.username}` : 'пользователь';
            message += `${index + 1}) ${username} (ID Betboom: ${p.user.betboom_id}) - ${p.ticket_id}\n`;
        });

        const totalPages = result.totalPages;
        if (totalPages > 1) {
            const pagination = await import('../utils/pagination.js');
            const keyboard = pagination.createPaginationKeyboard(1, totalPages, `admin:event:results:${eventId}`);
            await bot.telegram.sendMessage(adminChatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
        } else {
            await bot.telegram.sendMessage(adminChatId, message, { parse_mode: 'Markdown' });
        }
    }

    async findFinishedEvents(): Promise<BetEvent[]> {
        return this.eventRepo.findFinishedEvents();
    }

    async getParticipantsStats() {
        return {
            today: await this.betRepo.countToday(),
            week: await this.betRepo.countThisWeek(),
            month: await this.betRepo.countThisMonth(),
            year: await this.betRepo.countThisYear()
        };
    }
}


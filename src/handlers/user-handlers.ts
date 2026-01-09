import { Context } from 'telegraf';
import { UserService } from '../services/user.service.js';
import { BetEventService } from '../services/bet-event.service.js';
import { ContestService } from '../services/contest.service.js';
import { updateOrSendMessage } from '../utils/message-updater.js';
import { formatDate } from '../utils/date-parser.js';

interface UserSession {
    state?: 'registering' | 'betting' | 'picking_contest' | null;
    betEventId?: number;
    ticketId?: string;
    contestId?: number;
}

const sessions = new Map<number, UserSession>();

export class UserHandlers {
    private userService = new UserService();
    private betEventService = new BetEventService();
    private contestService = new ContestService();

    async handleStart(ctx: Context) {
        await this.showMainMenu(ctx);
    }

    async handleText(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const session = sessions.get(chatId);
        
        if (session?.state === 'betting') {
            await this.handleBetInput(ctx, chatId, session);
        } else if (session?.state === 'picking_contest') {
            const text = (ctx.message as any).text?.trim();
            if (text === 'Отменить') {
                sessions.set(chatId, { state: null });
                await this.handleGiveawaysButton(ctx);
            }
        }
    }

    private async handleBetInput(ctx: Context, chatId: number, session: UserSession) {
        const text = (ctx.message as any).text?.trim();
        
        if (text === 'Отменить') {
            sessions.set(chatId, { state: null });
            await this.handleEventsButton(ctx);
            return;
        }

        if (!text || !/^\d{1,12}$/.test(text)) {
            await ctx.reply('ID билета должен содержать от 1 до 12 цифр. Попробуйте снова:');
            return;
        }

        if (!session.betEventId) {
            await ctx.reply('Ошибка: событие не выбрано');
            sessions.set(chatId, { state: null });
            return;
        }

        const isValid = await this.betEventService.validateTicketId(text, session.betEventId);
        if (!isValid) {
            await ctx.reply('Такой ID билета уже существует для этого события. Введите другой:');
            return;
        }

        session.ticketId = text;
        await ctx.reply(
            'Приложите скрин',
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'Пропустить', callback_data: 'bet:skip_photo' }
                    ]]
                }
            }
        );
    }

    async handlePhoto(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const session = sessions.get(chatId);
        
        if (session?.state === 'betting' && session.ticketId && session.betEventId) {
            const photo = (ctx.message as any).photo;
            const fileId = photo ? photo[photo.length - 1].file_id : null;

            try {
                const user = await this.userService.getUserByChatId(chatId);
                if (!user) {
                    await ctx.reply('Пользователь не найден');
                    return;
                }

                await this.betEventService.addBet(user.id, session.betEventId, session.ticketId, fileId);
                sessions.set(chatId, { state: null });
                await ctx.deleteMessage().catch(() => {});
                await ctx.reply('Ваша ставка принята!');
                await this.showMainMenu(ctx);
            } catch (error: any) {
                await ctx.reply(error.message || 'Ошибка при добавлении ставки');
            }
        }
    }

    async handleEventsButton(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const user = await this.userService.getUserByChatId(chatId);
        if (!user) return;

        const events = await this.betEventService.getActiveEvents();
        
        if (events.length === 0) {
            await updateOrSendMessage(ctx, 'Нет активных матчей', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Главное меню', callback_data: 'menu:back' }]
                    ]
                }
            });
            return;
        }

        const keyboard: any[] = [];
        for (const event of events) {
            const hasBet = await this.betEventService.hasUserBet(user.id, event.id);
            const buttonText = hasBet ? `${event.match_name} (отправлено)` : event.match_name;
            keyboard.push([{
                text: buttonText,
                callback_data: `event:select:${event.id}`
            }]);
        }
        keyboard.push([{ text: 'Главное меню', callback_data: 'menu:back' }]);

        await updateOrSendMessage(ctx, 'Выберите матч:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    async handleEventSelect(ctx: Context, eventId: number) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const user = await this.userService.getUserByChatId(chatId);
        if (!user) return;

        const event = await this.betEventService.getEventById(eventId);
        if (!event || event.status !== 'active') {
            await ctx.answerCbQuery('Событие не найдено или неактивно', { show_alert: true });
            return;
        }

        const hasBet = await this.betEventService.hasUserBet(user.id, eventId);
        if (hasBet) {
            await ctx.answerCbQuery('Вы уже отправили ставку на это событие. Нельзя отправить ставку дважды.', { show_alert: true });
            return;
        }

        sessions.set(chatId, { state: 'betting', betEventId: eventId });
        
        let message = `Матч «${event.match_name}»\n`;
        message += `Исход матча: ${event.winner_team}\n`;
        message += `Сумма ставки: ${event.bet_amount}\n`;
        message += `Коэффициент: ${event.coefficient}\n`;
        message += `Дата начала матча: ${formatDate(event.match_started_at)}\n\n`;
        message += 'Введите ID билета';
        
        await updateOrSendMessage(
            ctx,
            message,
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'Отменить', callback_data: 'bet:cancel' }
                    ]]
                }
            }
        );
    }

    async handleSkipPhoto(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const session = sessions.get(chatId);
        
        if (session?.state === 'betting' && session.ticketId && session.betEventId) {
            try {
                const user = await this.userService.getUserByChatId(chatId);
                if (!user) {
                    await ctx.reply('Пользователь не найден');
                    return;
                }

                await this.betEventService.addBet(user.id, session.betEventId, session.ticketId, null);
                sessions.set(chatId, { state: null });
                await ctx.deleteMessage().catch(() => {});
                await ctx.reply('Ваша ставка принята!');
                await this.showMainMenu(ctx);
            } catch (error: any) {
                await ctx.reply(error.message || 'Ошибка при добавлении ставки');
            }
        }
    }

    async handleBetCancel(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        sessions.set(chatId, { state: null });
        await ctx.deleteMessage().catch(() => {});
        await this.handleEventsButton(ctx);
    }

    async showMainMenu(ctx: Context) {
        await updateOrSendMessage(ctx, 'Главное меню', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'События для ставки', callback_data: 'menu:events' }],
                    [{ text: 'Розыгрыш фрибетов', callback_data: 'menu:giveaways' }],
                    [{ text: 'Рейтинг', callback_data: 'menu:rating' }]
                ]
            }
        });
    }

    async handleGiveawaysButton(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const user = await this.userService.getUserByChatId(chatId);
        if (!user) return;

        const contests = await this.contestService.getActiveContests();
        
        if (contests.length === 0) {
            await updateOrSendMessage(ctx, 'Нет активных матчей', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Главное меню', callback_data: 'menu:back' }]
                    ]
                }
            });
            return;
        }

        const keyboard: any[] = [];
        for (const contest of contests) {
            const hasPick = await this.contestService.getUserPick(user.id, contest.id);
            const buttonText = hasPick ? `${contest.match_name} (выбрано)` : contest.match_name;
            keyboard.push([{
                text: buttonText,
                callback_data: `contest:select:${contest.id}`
            }]);
        }
        keyboard.push([{ text: 'Главное меню', callback_data: 'menu:back' }]);

        await updateOrSendMessage(ctx, 'Выберите матч:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    async handleContestSelect(ctx: Context, contestId: number) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const user = await this.userService.getUserByChatId(chatId);
        if (!user) return;

        const contest = await this.contestService.getContestById(contestId);
        if (!contest || contest.status !== 'active') {
            await ctx.answerCbQuery('Розыгрыш не найден или неактивен', { show_alert: true });
            return;
        }

        const now = new Date();
        if (contest.match_started_at <= now) {
            await ctx.answerCbQuery('Матч уже начался', { show_alert: true });
            return;
        }

        const hasPick = await this.contestService.getUserPick(user.id, contestId);
        if (hasPick) {
            await ctx.answerCbQuery('Вы уже выбрали исход для этого матча', { show_alert: true });
            return;
        }

        sessions.set(chatId, { state: 'picking_contest', contestId });
        
        let message = `Матч «${contest.match_name}»\n`;
        message += `Дата начала матча: ${formatDate(contest.match_started_at)}\n\n`;
        message += 'Выберите исход матча:';
        
        await updateOrSendMessage(
            ctx,
            message,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `Победа «${contest.team_1}»`, callback_data: `contest:pick:${contestId}:team_1_win` }],
                        [{ text: 'Ничья', callback_data: `contest:pick:${contestId}:draw` }],
                        [{ text: `Победа «${contest.team_2}»`, callback_data: `contest:pick:${contestId}:team_2_win` }],
                        [{ text: 'Отменить', callback_data: 'contest:cancel' }]
                    ]
                }
            }
        );
    }

    async handleContestPick(ctx: Context, contestId: number, outcome: string) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const user = await this.userService.getUserByChatId(chatId);
        if (!user) return;

        try {
            await this.contestService.addPick(user.id, contestId, outcome as any);
            await ctx.answerCbQuery('Исход выбран');
            sessions.set(chatId, { state: null });
            await this.handleGiveawaysButton(ctx);
        } catch (error: any) {
            await ctx.answerCbQuery(error.message || 'Ошибка', { show_alert: true });
        }
    }

    async handleContestCancel(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        sessions.set(chatId, { state: null });
        await this.handleGiveawaysButton(ctx);
    }

    async handleRating(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const user = await this.userService.getUserByChatId(chatId);
        if (!user) return;

        const ranking = await this.userService.getUserRanking(user.id);
        
        let message = '*Топ-20 пользователей:*\n';
        if (ranking.topUsers.length > 0) {
            ranking.topUsers.forEach((item, index) => {
                const displayName = item.user.first_name && item.user.last_name 
                    ? `${item.user.first_name} ${item.user.last_name}`
                    : item.user.first_name || item.user.username || 'Пользователь';
                message += `${index + 1}) ${displayName} (${item.points})\n`;
            });

            if (ranking.rank > 0) {
                message += `\nВаше место в рейтинге - ${ranking.rank} (${ranking.points})!`;
            }
        } else {
            message += 'Нет пользователей\n';
        }

        await updateOrSendMessage(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Главное меню', callback_data: 'menu:back' }]
                ]
            }
        });
    }
}


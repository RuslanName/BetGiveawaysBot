import { Context } from 'telegraf';
import { UserService } from '../services/user.service.js';
import { BetEventService } from '../services/bet-event.service.js';
import { BetEventType } from '../entities/index.js';
import { ContestService } from '../services/contest.service.js';
import { GiveawayService } from '../services/giveaway.service.js';
import { updateOrSendMessage } from '../utils/message-updater.js';
import { formatDate } from '../utils/date-parser.js';
import { ENV } from '../config/constants.js';

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
    private giveawayService = new GiveawayService();

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
                await this.handleGiveawaysMatches(ctx);
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
                await ctx.reply('Вы участвуете!');
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
            const buttonText = hasBet ? `${event.match_name} (участвуете)` : event.match_name;
            keyboard.push([{
                text: buttonText,
                callback_data: `event:select:${event.id}`
            }]);
        }
        keyboard.push([{ text: 'Регистрация в BetBoom', url: ENV.BETBOOM_REGISTRATION_URL }]);
        keyboard.push([{ text: 'Главное меню', callback_data: 'menu:back' }]);

        await updateOrSendMessage(ctx, 'Бесплатная ставка', {
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

        const isMainTime = event.event_type === BetEventType.MAIN_TIME;
        const betType = isMainTime ? 'победу' : 'итоговую победу';
        const timeText = isMainTime ? ' в основное время' : '';
        
        let message = `Для участия в акции вам необходимо поставить ${event.bet_amount} рублей на ${betType} «${event.winner_team}»${timeText} в матче «${event.match_name}»\n\n`;
        message += `В случае, если ставка не сыграет, на ваш игровой счёт вернётся ${event.bet_amount} фрибетом\n\n`;
        message += `Участвовать в акции можно до ${formatDate(event.match_started_at)}`;
        
        const replyMarkup: any = {
            inline_keyboard: [
                [{ text: 'Ввести ID билета для участия', callback_data: `bet:input_ticket:${eventId}` }]
            ]
        };

        if (event.betboom_url) {
            replyMarkup.inline_keyboard.push([{ text: 'Сделать ставку на сайте BetBoom', url: event.betboom_url }]);
        }
        
        replyMarkup.inline_keyboard.push([{ text: 'Назад', callback_data: 'bet:cancel' }]);
        
        await updateOrSendMessage(
            ctx,
            message,
            {
                reply_markup: replyMarkup,
                photo: event.file_id || undefined
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
                await ctx.reply('Вы участвуете!');
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
        await this.handleEventsButton(ctx);
    }

    async handleBetInputTicket(ctx: Context, eventId: number) {
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
        
        await updateOrSendMessage(
            ctx,
            'Введите ID билета',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Отменить', callback_data: 'bet:cancel' }]
                    ]
                }
            }
        );
    }

    async showMainMenu(ctx: Context) {
        await updateOrSendMessage(ctx, 'Выберите событие, в котором хотите поучаствовать', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Бесплатная ставка', callback_data: 'menu:events' }],
                    [{ text: 'Прогнозы на игровой день', callback_data: 'menu:giveaways' }]
                ]
            }
        });
    }

    async handleGiveawaysButton(ctx: Context) {
        await updateOrSendMessage(ctx, 'Прогнозы на игровой день', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Матчи', callback_data: 'menu:giveaways:matches' }],
                    [{ text: 'Рейтинг', callback_data: 'menu:rating' }],
                    [{ text: 'Главное меню', callback_data: 'menu:back' }]
                ]
            }
        });
    }

    async handleGiveawaysMatches(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const user = await this.userService.getUserByChatId(chatId);
        if (!user) return;

        const contests = await this.contestService.getActiveContests();
        
        if (contests.length === 0) {
            await updateOrSendMessage(ctx, 'Нет активных матчей', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Назад', callback_data: 'menu:giveaways' }]
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
        keyboard.push([{ text: 'Назад', callback_data: 'menu:giveaways' }]);

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
        
        let fileId: string | undefined = undefined;
        if (contest.giveaway_id) {
            const giveaway = await this.giveawayService.getGiveawayById(contest.giveaway_id);
            if (giveaway) {
                fileId = giveaway.file_id;
            }
        }
        
        await updateOrSendMessage(
            ctx,
            'Выберите исход матча:',
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `Победа «${contest.team_1}»`, callback_data: `contest:pick:${contestId}:team_1_win` }],
                        [{ text: 'Ничья', callback_data: `contest:pick:${contestId}:draw` }],
                        [{ text: `Победа «${contest.team_2}»`, callback_data: `contest:pick:${contestId}:team_2_win` }],
                        [{ text: 'Отменить', callback_data: 'menu:giveaways:matches' }]
                    ]
                },
                photo: fileId
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
            await this.handleGiveawaysMatches(ctx);
        } catch (error: any) {
            await ctx.answerCbQuery(error.message || 'Ошибка', { show_alert: true });
        }
    }

    async handleContestCancel(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        sessions.set(chatId, { state: null });
        await this.handleGiveawaysMatches(ctx);
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
                    [{ text: 'Назад', callback_data: 'menu:giveaways' }]
                ]
            }
        });
    }
}


import { Context } from 'telegraf';
import { BetEventService } from '../services/bet-event.service.js';
import { ContestService } from '../services/contest.service.js';
import { BroadcastService } from '../services/broadcast.service.js';
import { UserService } from '../services/user.service.js';
import { GiveawayService } from '../services/giveaway.service.js';
import { createPaginationKeyboard } from '../utils/pagination.js';
import { parseDate, formatDate } from '../utils/date-parser.js';
import { updateOrSendMessage } from '../utils/message-updater.js';
import { AppDataSource } from '../config/db.js';
import { Telegraf } from 'telegraf';
import { User, BetEventType } from '../entities/index.js';

interface AdminSession {
    state?: 'creating_event' | 'creating_event_type' | 'creating_contest' | 'creating_giveaway_photo' | 'updating_giveaway_photo' | 'creating_broadcast' | 'editing_event' | 'editing_contest' | 'setting_event_lost_message' | null;
    data?: any;
}

const sessions = new Map<number, AdminSession>();

export class AdminHandlers {
    private betEventService = new BetEventService();
    private contestService = new ContestService();
    private broadcastService = new BroadcastService();
    private userService = new UserService();
    private giveawayService = new GiveawayService();
    private bot: Telegraf;

    constructor(bot: Telegraf) {
        this.bot = bot;
    }

    async showAdminMenu(ctx: Context) {
        await ctx.reply('Административное меню', {
            reply_markup: {
                keyboard: [
                    [{ text: 'События' }, { text: 'Розыгрыши' }],
                    [{ text: 'Рассылки' }, { text: 'Статистика' }]
                ],
                resize_keyboard: true
            }
        });
    }

    async handleEvents(ctx: Context) {
        await updateOrSendMessage(ctx, 'Управление матчами', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Создать', callback_data: 'admin:event:create' }],
                    [{ text: 'Общая информация', callback_data: 'admin:event:list' }]
                ]
            }
        });
    }

    async handleEventCreate(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        sessions.set(chatId, { state: 'creating_event', data: {} });
        await updateOrSendMessage(ctx, 'Отправьте информацию о матче одним сообщением в формате:\nНазвание\nИсход\nСумма ставки\nКоэффициент\nДата начала (ДД.ММ.ГГГГ ЧЧ:ММ)\nСсылка на матч в BetBoom\nФото (опционально)', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Отменить', callback_data: 'admin:event:create_cancel' }]
                ]
            }
        });
    }

    async handleEventList(ctx: Context, page: number = 1) {
        const events = await this.betEventService.getEventsForAdmin();
        const limit = 20;
        const start = (page - 1) * limit;
        const end = start + limit;
        const pageEvents = events.slice(start, end);
        const totalPages = Math.ceil(events.length / limit);

        if (pageEvents.length === 0) {
            await updateOrSendMessage(ctx, 'Нет матчей', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Главное меню', callback_data: 'admin:event:others' }]
                    ]
                }
            });
            return;
        }

        const keyboard: any[] = pageEvents.map(event => [{
            text: event.match_name,
            callback_data: `admin:event:view:${event.id}`
        }]);

        const pagination = createPaginationKeyboard(page, totalPages, 'admin:event:list');
        keyboard.push(...pagination.inline_keyboard);
        keyboard.push([{ text: 'Главное меню', callback_data: 'admin:event:others' }]);

        await updateOrSendMessage(ctx, 'Выберите матч:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    async handleEventView(ctx: Context, eventId: number) {
        const event = await this.betEventService.getEventById(eventId);
        if (!event) {
            await ctx.reply('Событие не найдено');
            return;
        }

        const participantsCount = await this.betEventService.getParticipantsCount(eventId);
        
        let message = `*Матч «${event.match_name}»*\n`;
        message += `Количество участников: ${participantsCount}\n`;
        message += `Исход матча: ${event.winner_team}\n`;
        message += `Сумма ставки: ${event.bet_amount}\n`;
        message += `Коэффициент: ${event.coefficient}\n`;
        message += `Дата начала матча: ${formatDate(event.match_started_at)}`;

        const keyboard: any[] = [];
        
        const now = new Date();
        if (event.match_started_at <= now && event.is_won === null) {
            keyboard.push([{ text: 'Выбрать исход матча', callback_data: `admin:event:pick_outcome:${eventId}` }]);
        }
        
        keyboard.push(
            [{ text: 'Изменить', callback_data: `admin:event:edit:${eventId}` }, { text: 'Удалить', callback_data: `admin:event:delete:${eventId}` }],
            [{ text: 'К списку', callback_data: 'admin:event:list' }]
        );

        if (event.file_id) {
            await updateOrSendMessage(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard },
                photo: event.file_id
            });
        } else {
            await updateOrSendMessage(ctx, message, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    }

    async handleEventResults(ctx: Context, eventId: number, page: number = 1) {
        const result = await this.betEventService.getResults(eventId, page);
        const event = await this.betEventService.getEventById(eventId);
        
        if (!event) {
            await ctx.reply('Событие не найдено');
            return;
        }

        if (result.participants.length === 0) {
            await ctx.reply('Нет участников');
            return;
        }

        let message = `*Матч «${event.match_name}»*\n\n`;
        result.participants.forEach((p, index) => {
            const num = (page - 1) * 20 + index + 1;
            const username = p.user.username ? `@${p.user.username}` : 'пользователь';
            message += `${num}) ${username} (ID BetBoom: ${p.user.betboom_id}) - ${p.ticket_id}\n`;
        });

        const pagination = createPaginationKeyboard(page, result.totalPages, `admin:event:results:${eventId}`);
        
        await updateOrSendMessage(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: pagination
        });
    }

    async handleEventEdit(ctx: Context, eventId: number) {
        const event = await this.betEventService.getEventById(eventId);
        if (!event) {
            await ctx.reply('Событие не найдено');
            return;
        }

        await updateOrSendMessage(ctx, `Что хотите изменить в событии «${event.match_name}»?`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Название матча', callback_data: `admin:event:edit_field:${eventId}:match_name` }],
                    [{ text: 'Исход матча', callback_data: `admin:event:edit_field:${eventId}:winner_team` }],
                    [{ text: 'Сумму ставки', callback_data: `admin:event:edit_field:${eventId}:bet_amount` }],
                    [{ text: 'Коэффициент', callback_data: `admin:event:edit_field:${eventId}:coefficient` }],
                    [{ text: 'Дату начала матча', callback_data: `admin:event:edit_field:${eventId}:match_started_at` }],
                    [{ text: 'Фото', callback_data: `admin:event:edit_field:${eventId}:file_id` }],
                    [{ text: 'Отменить', callback_data: `admin:event:view:${eventId}` }]
                ]
            }
        });
    }

    async handleEventDelete(ctx: Context, eventId: number) {
        const event = await this.betEventService.getEventById(eventId);
        if (!event) {
            await ctx.reply('Событие не найдено');
            return;
        }

        await updateOrSendMessage(ctx, `Точно ли хотите удалить событие «${event.match_name}»?`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Да', callback_data: `admin:event:delete_confirm:${eventId}` }, { text: 'Нет', callback_data: `admin:event:view:${eventId}` }]
                ]
            }
        });
    }

    async handleEventDeleteConfirm(ctx: Context, eventId: number) {
        const event = await this.betEventService.getEventById(eventId);
        await this.betEventService.cancelEvent(eventId);
        
        const messageId = (ctx.callbackQuery?.message as any)?.message_id;
        if (messageId) {
            try {
                await ctx.deleteMessage(messageId);
            } catch (error) {
                // Message might already be deleted
            }
        }
        
        await ctx.reply(`Матч «${event?.match_name || ''}» для события удален`);
        await this.handleEvents(ctx);
    }

    async handleGiveaways(ctx: Context) {
        const keyboard: any[] = [
            [{ text: 'Создать', callback_data: 'admin:contest:create' }]
        ];

        const activeGiveaway = await this.giveawayService.getActiveGiveaway();
        if (activeGiveaway) {
            keyboard.push([{ text: 'Обновить фото расписания', callback_data: 'admin:giveaway:update_photo' }]);
        }

        const canFinalize = await this.contestService.canFinalizeContests();
        if (canFinalize) {
            keyboard.push([{ text: 'Подвести итог', callback_data: 'admin:contest:finalize' }]);
        }

        keyboard.push([{ text: 'Общая информация', callback_data: 'admin:contest:list' }]);

        await updateOrSendMessage(ctx, 'Управление матчами', {
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    }

    async handleContestCreate(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const activeGiveaway = await this.giveawayService.getActiveGiveaway();
        if (!activeGiveaway) {
            sessions.set(chatId, { state: 'creating_giveaway_photo', data: {} });
            await updateOrSendMessage(ctx, 'Приложите фото расписания матчей розыгрыша:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Отменить', callback_data: 'admin:contest:create_cancel' }]
                    ]
                }
            });
            return;
        }

        sessions.set(chatId, { state: 'creating_contest', data: { giveawayId: activeGiveaway.id } });
        await updateOrSendMessage(ctx, 'Отправьте информацию о матче одним сообщением в формате:\nНазвание\nНазвание команды 1\nНазвание команды 2\nДата начала (ДД.ММ.ГГГГ ЧЧ:ММ)', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Отменить', callback_data: 'admin:contest:create_cancel' }]
                ]
            }
        });
    }

    async handleContestList(ctx: Context, page: number = 1) {
        const contests = await this.contestService.getContestsForAdmin();
        const limit = 20;
        const start = (page - 1) * limit;
        const end = start + limit;
        const pageContests = contests.slice(start, end);
        const totalPages = Math.ceil(contests.length / limit);

        if (pageContests.length === 0) {
            await updateOrSendMessage(ctx, 'Нет активных матчей', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Главное меню', callback_data: 'admin:contest:others' }]
                    ]
                }
            });
            return;
        }

        const keyboard: any[] = pageContests.map(contest => [{
            text: `${contest.match_name}`,
            callback_data: `admin:contest:view:${contest.id}`
        }]);

        const pagination = createPaginationKeyboard(page, totalPages, 'admin:contest:list');
        keyboard.push(...pagination.inline_keyboard);
        keyboard.push([{ text: 'Главное меню', callback_data: 'admin:contest:others' }]);

        await updateOrSendMessage(ctx, 'Выберите матч:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    }


    async handleCancel(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const session = sessions.get(chatId);
        if (!session || !session.state) return;

        await ctx.deleteMessage().catch(() => {});

        if (session.state === 'creating_event') {
            sessions.set(chatId, { state: null });
            await updateOrSendMessage(ctx, 'Создание события отменено');
            await this.handleEvents(ctx);
        } else if (session.state === 'creating_contest' || session.state === 'creating_giveaway_photo') {
            sessions.set(chatId, { state: null });
            await updateOrSendMessage(ctx, 'Создание розыгрыша отменено');
            await this.handleGiveaways(ctx);
        } else if (session.state === 'updating_giveaway_photo') {
            sessions.set(chatId, { state: null });
            await updateOrSendMessage(ctx, 'Обновление фото отменено');
            await this.handleGiveaways(ctx);
        } else if (session.state === 'creating_broadcast') {
            sessions.set(chatId, { state: null });
            await updateOrSendMessage(ctx, 'Создание рассылки отменено');
            await this.handleBroadcasts(ctx);
        } else if (session.state === 'editing_event' && session.data?.eventId) {
            sessions.set(chatId, { state: null });
            await updateOrSendMessage(ctx, 'Редактирование отменено');
            await this.handleEventView(ctx, session.data.eventId);
        } else if (session.state === 'editing_contest' && session.data?.contestId) {
            sessions.set(chatId, { state: null });
            await updateOrSendMessage(ctx, 'Редактирование отменено');
            await this.handleContestView(ctx, session.data.contestId);
        } else if (session.state === 'setting_event_lost_message' && session.data?.eventId) {
            sessions.set(chatId, { state: null });
            await updateOrSendMessage(ctx, 'Отменено');
            await this.handleEventView(ctx, session.data.eventId);
        } else {
            sessions.set(chatId, { state: null });
        }
    }

    async handleEventOthers(ctx: Context) {
        await this.handleEvents(ctx);
    }

    async handleContestOthers(ctx: Context) {
        await this.handleGiveaways(ctx);
    }

    async handleEventCreateCancel(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        sessions.set(chatId, { state: null });
        await ctx.answerCbQuery();
        await this.handleEvents(ctx);
    }

    async handleContestCreateCancel(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        sessions.set(chatId, { state: null });
        await ctx.answerCbQuery();
        await this.handleGiveaways(ctx);
    }

    async handleContestView(ctx: Context, contestId: number) {
        const contest = await this.contestService.getContestById(contestId);
        if (!contest) {
            await ctx.reply('Розыгрыш не найден');
            return;
        }

        let message = `*Матч «${contest.match_name}»*\n`;
        message += `Название команды 1: ${contest.team_1}\n`;
        message += `Название команды 2: ${contest.team_2}\n`;
        message += `Дата начала матча: ${formatDate(contest.match_started_at)}\n`;
        if (contest.picked_outcome) {
            const outcomeNames: Record<string, string> = {
                'team_1_win': `Победа «${contest.team_1}»`,
                'team_2_win': `Победа «${contest.team_2}»`,
                'draw': 'Ничья'
            };
            message += `Исход матча: ${outcomeNames[contest.picked_outcome] || contest.picked_outcome}\n`;
        }

        const keyboard: any[] = [];
        
        const now = new Date();
        if (contest.match_started_at <= now && contest.picked_outcome === null) {
            keyboard.push([{ text: 'Выбрать исход матча', callback_data: `admin:contest:pick_outcome:${contestId}` }]);
        }
        
        keyboard.push(
            [{ text: 'Изменить', callback_data: `admin:contest:edit:${contestId}` }, { text: 'Удалить', callback_data: `admin:contest:delete:${contestId}` }],
            [{ text: 'К списку', callback_data: 'admin:contest:list' }]
        );

        await updateOrSendMessage(ctx, message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    async handleContestEdit(ctx: Context, contestId: number) {
        const contest = await this.contestService.getContestById(contestId);
        if (!contest) {
            await ctx.reply('Розыгрыш не найден');
            return;
        }

        await updateOrSendMessage(ctx, `Что хотите изменить в розыгрыше «${contest.match_name}»?`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Название матча', callback_data: `admin:contest:edit_field:${contestId}:match_name` }],
                    [{ text: 'Название команды 1', callback_data: `admin:contest:edit_field:${contestId}:team_1` }],
                    [{ text: 'Название команды 2', callback_data: `admin:contest:edit_field:${contestId}:team_2` }],
                    [{ text: 'Дату начала матча', callback_data: `admin:contest:edit_field:${contestId}:match_started_at` }],
                    [{ text: 'Отменить', callback_data: `admin:contest:view:${contestId}` }]
                ]
            }
        });
    }

    async handleContestDelete(ctx: Context, contestId: number) {
        const contest = await this.contestService.getContestById(contestId);
        if (!contest) {
            await ctx.reply('Розыгрыш не найден');
            return;
        }

        await updateOrSendMessage(ctx, `Точно ли хотите удалить розыгрыш «${contest.match_name}»?`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Да', callback_data: `admin:contest:delete_confirm:${contestId}` }, { text: 'Нет', callback_data: `admin:contest:view:${contestId}` }]
                ]
            }
        });
    }

    async handleContestDeleteConfirm(ctx: Context, contestId: number) {
        const contest = await this.contestService.getContestById(contestId);
        await this.contestService.cancelContest(contestId);
        
        const messageId = (ctx.callbackQuery?.message as any)?.message_id;
        if (messageId) {
            try {
                await ctx.deleteMessage(messageId);
            } catch (error) {
                // Message might already be deleted
            }
        }
        
        await ctx.reply(`Матч «${contest?.match_name || ''}» для розыгрыша удален`);
        await this.handleGiveaways(ctx);
    }

    async handleContestPickOutcome(ctx: Context, contestId: number) {
        const contest = await this.contestService.getContestById(contestId);
        if (!contest) {
            await ctx.answerCbQuery('Розыгрыш не найден', { show_alert: true });
            return;
        }

        await updateOrSendMessage(ctx, `Выберите исход матча «${contest.match_name}»:`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `Победа «${contest.team_1}»`, callback_data: `admin:contest:set_outcome:${contestId}:team_1_win` }],
                    [{ text: 'Ничья', callback_data: `admin:contest:set_outcome:${contestId}:draw` }],
                    [{ text: `Победа «${contest.team_2}»`, callback_data: `admin:contest:set_outcome:${contestId}:team_2_win` }],
                    [{ text: 'Отменить', callback_data: `admin:contest:view:${contestId}` }]
                ]
            }
        });
    }

    async handleContestSetOutcome(ctx: Context, contestId: number, outcome: string) {
        try {
            await this.contestService.setContestOutcome(contestId, outcome as any);
            await ctx.answerCbQuery('Исход матча установлен');
            await this.handleContestList(ctx);
        } catch (error: any) {
            await ctx.answerCbQuery(error.message || 'Ошибка', { show_alert: true });
        }
    }

    async handleContestFinalize(ctx: Context) {
        try {
            await this.contestService.finalizeContests(this.bot);
            await ctx.reply('Итоги розыгрыша подведены');
        } catch (error: any) {
            await ctx.reply(error.message || 'Ошибка при подведении итогов');
        }
    }

    async handleEventPickOutcome(ctx: Context, eventId: number) {
        const event = await this.betEventService.getEventById(eventId);
        if (!event) {
            await ctx.answerCbQuery('Событие не найдено', { show_alert: true });
            return;
        }

        await updateOrSendMessage(ctx, `Выберите исход матча «${event.match_name}»:`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Ставка сыграла', callback_data: `admin:event:set_outcome:${eventId}:won` }],
                    [{ text: 'Ставка не сыграла', callback_data: `admin:event:set_outcome:${eventId}:lost` }],
                    [{ text: 'Отменить', callback_data: `admin:event:view:${eventId}` }]
                ]
            }
        });
    }

    async handleEventSetOutcome(ctx: Context, eventId: number, outcome: string) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        if (outcome === 'won') {
            try {
                await this.betEventService.setEventOutcome(eventId, true);
                await this.betEventService.sendEventResultsToUsers(eventId, this.bot);
                await ctx.answerCbQuery('Исход матча установлен');
                await this.handleEventList(ctx);
            } catch (error: any) {
                await ctx.answerCbQuery(error.message || 'Ошибка', { show_alert: true });
            }
        } else if (outcome === 'lost') {
            const event = await this.betEventService.getEventById(eventId);
            if (!event) {
                await ctx.answerCbQuery('Событие не найдено', { show_alert: true });
                return;
            }

            sessions.set(chatId, { state: 'setting_event_lost_message', data: { eventId } });
            await ctx.answerCbQuery();
            await updateOrSendMessage(ctx, 'Введите текст сообщения для пользователей:', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Отменить', callback_data: `admin:event:view:${eventId}` }]
                    ]
                }
            });
        }
    }

    async handleContestEditField(ctx: Context, contestId: number, field: string) {
        const contest = await this.contestService.getContestById(contestId);
        if (!contest) {
            await ctx.answerCbQuery('Розыгрыш не найден', { show_alert: true });
            return;
        }

        const chatId = ctx.from?.id;
        if (!chatId) return;

        const fieldNames: Record<string, string> = {
            match_name: 'Название матча',
            team_1: 'Название команды 1',
            team_2: 'Название команды 2',
            match_started_at: 'Дата начала матча (ДД.ММ.ГГГГ ЧЧ:ММ)'
        };

        sessions.set(chatId, { 
            state: 'editing_contest', 
            data: { contestId, field } 
        });

        const prompt = `Введите новое значение для «${fieldNames[field] || field}»:`;

        await updateOrSendMessage(ctx, prompt, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Отменить', callback_data: `admin:contest:edit_cancel:${contestId}` }]
                ]
            }
        });
    }

    async handleContestEditCancel(ctx: Context, contestId: number) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        sessions.set(chatId, { state: null });
        await ctx.deleteMessage().catch(() => {});
        await this.handleContestView(ctx, contestId);
    }

    async handleBroadcasts(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        sessions.set(chatId, { state: 'creating_broadcast', data: {} });
        await updateOrSendMessage(ctx, 'Отправьте информацию о рассылке одним сообщением:\nТекст (опционально)\nСсылка Название кнопки (опционально)\nФото (опционально)', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Отменить', callback_data: 'admin:cancel' }]
                ]
            }
        });
    }

    async handleStatistics(ctx: Context) {
        const stats = await this.userService.getStatistics();
        const events = await this.betEventService.getEventsForAdmin();
        const participantsStats = await this.betEventService.getParticipantsStats();

        let message = '*Количество зарегистрированных пользователей за*\n';
        message += `День: ${stats.today}\n`;
        message += `Неделя: ${stats.week}\n`;
        message += `Месяц: ${stats.month}\n`;
        message += `Год: ${stats.year}\n\n`;

        message += '*Количество участников в событиях за*\n';
        message += `День: ${participantsStats.today}\n`;
        message += `Неделя: ${participantsStats.week}\n`;
        message += `Месяц: ${participantsStats.month}\n`;
        message += `Год: ${participantsStats.year}\n\n`;

        for (const event of events) {
            const count = await this.betEventService.getParticipantsCount(event.id);
            message += `Количество участников в событии «${event.match_name}»: ${count}\n`;
        }

        if (events.length > 0) {
            message += '\n';
        }

        const totalContestParticipants = await this.contestService.getTotalParticipantsCount();
        message += `Количество участников в розыгрыше: ${totalContestParticipants}\n\n`;

        const topContestUsers = stats.topContestUsers || [];
        if (topContestUsers.length > 0) {
            message += '*Топ-20 пользователей:*\n';
            topContestUsers.forEach((item: any, index: number) => {
                const username = item.user.username ? `@${item.user.username}` : 'пользователь';
                message += `${index + 1}) ${username} (BetBoom ID: ${item.user.betboom_id}) - ${item.points}\n`;
            });
        } else {
            message += '*Топ-20 пользователей:*\nНет пользователей\n';
        }

        await ctx.reply(message, { parse_mode: 'Markdown' });
    }

    async handleAdminText(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const session = sessions.get(chatId);
        const text = (ctx.message as any).text?.trim() || (ctx.message as any).caption?.trim();
        const photo = (ctx.message as any).photo;

        if (session?.state === 'creating_event') {
            await this.processEventCreation(ctx, text, photo);
        } else if (session?.state === 'creating_giveaway_photo') {
            await this.processGiveawayPhotoCreation(ctx, photo);
        } else if (session?.state === 'updating_giveaway_photo') {
            await this.processGiveawayPhotoUpdate(ctx, photo, session);
        } else if (session?.state === 'creating_contest') {
            await this.processContestCreation(ctx, text);
        } else if (session?.state === 'creating_broadcast') {
            await this.processBroadcastCreation(ctx, text, photo);
        } else if (session?.state === 'editing_event') {
            await this.processEventEdit(ctx, text, photo, session);
        } else if (session?.state === 'editing_contest') {
            await this.processContestEdit(ctx, text, session);
        } else if (session?.state === 'setting_event_lost_message') {
            await this.processEventLostMessage(ctx, text, session);
        }
    }

    private async processEventCreation(ctx: Context, text: string | undefined, photo: any) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        if (!text) {
            await ctx.reply('Отправьте информацию о матче текстом (можно в подписи к фото)');
            return;
        }

        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 6) {
            await ctx.reply('Неверный формат. Отправьте:\nНазвание матча\nИсход матча\nСумма ставки\nКоэффициент\nДата начала матча (ДД.ММ.ГГГГ ЧЧ:ММ)\nСсылка на матч в BetBoom');
            return;
        }

        const [matchName, winnerTeam, betAmountStr, coefficientStr, dateStr, betboomUrl] = lines;
        const betAmount = parseInt(betAmountStr.trim());
        const coefficient = parseFloat(coefficientStr.trim());
        const matchStartedAt = parseDate(dateStr.trim());

        if (isNaN(betAmount) || isNaN(coefficient) || !matchStartedAt) {
            await ctx.reply('Неверный формат суммы ставки, коэффициента или даты');
            return;
        }

        const trimmedMatchName = matchName.trim();
        const trimmedWinnerTeam = winnerTeam.trim();
        const trimmedBetboomUrl = betboomUrl.trim();

        if (!trimmedBetboomUrl || (!trimmedBetboomUrl.startsWith('http://') && !trimmedBetboomUrl.startsWith('https://'))) {
            await ctx.reply('Неверный формат ссылки на матч в BetBoom. Ссылка должна начинаться с http:// или https://');
            return;
        }

        const fileId = photo ? photo[photo.length - 1].file_id : null;

        sessions.set(chatId, { state: 'creating_event_type', data: { matchName: trimmedMatchName, winnerTeam: trimmedWinnerTeam, betAmount, coefficient, matchStartedAt, fileId, betboomUrl: trimmedBetboomUrl } });
        await updateOrSendMessage(ctx, 'Какое типа событие?', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Основное время', callback_data: 'admin:event_type:main_time' }],
                    [{ text: 'Итоговая победа', callback_data: 'admin:event_type:total_win' }],
                    [{ text: 'Отменить', callback_data: 'admin:cancel' }]
                ]
            }
        });
    }

    async handleEventType(ctx: Context, eventType: BetEventType) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const session = sessions.get(chatId);
        if (!session || session.state !== 'creating_event_type') {
            await ctx.answerCbQuery('Ошибка: сессия не найдена', { show_alert: true });
            return;
        }

        const { matchName, winnerTeam, betAmount, coefficient, matchStartedAt, fileId, betboomUrl } = session.data || {};
        if (!matchName || !winnerTeam || !betAmount || !coefficient || !matchStartedAt || !betboomUrl) {
            await ctx.answerCbQuery('Ошибка: данные события не найдены', { show_alert: true });
            sessions.set(chatId, { state: null });
            return;
        }

        try {
            const event = await this.betEventService.createEvent(matchName, winnerTeam, betAmount, coefficient, matchStartedAt, fileId, betboomUrl, eventType);
            
            await ctx.answerCbQuery('Тип события выбран');
            
            const userRepository = AppDataSource.getRepository(User);
            const allUsers = await userRepository.find({ select: ['chat_id'] });
            
            const isMainTime = eventType === BetEventType.MAIN_TIME;
            const betType = isMainTime ? 'победу' : 'итоговую победу';
            const timeText = isMainTime ? ' в основное время' : '';
            
            for (const userRow of allUsers) {
                try {
                    let message = `Для участия в акции вам необходимо поставить ${event.bet_amount} рублей на ${betType} «${event.winner_team}»${timeText} в матче «${event.match_name}»\n\n`;
                    message += `В случае, если ставка не сыграет, на ваш игровой счёт вернётся ${event.bet_amount} фрибетом\n\n`;
                    message += `Участвовать в акции можно до ${formatDate(event.match_started_at)}`;

                    const replyMarkup = {
                        inline_keyboard: [
                            [{ text: 'УЧАСТВОВАТЬ', callback_data: `event:select:${event.id}` }],
                            [{ text: 'Сделать ставку на сайте BetBoom', url: betboomUrl }]
                        ]
                    };

                    if (event.file_id) {
                        await this.bot.telegram.sendPhoto(userRow.chat_id, event.file_id, {
                            caption: message,
                            reply_markup: replyMarkup
                        });
                    } else {
                        await this.bot.telegram.sendMessage(userRow.chat_id, message, {
                            reply_markup: replyMarkup
                        });
                    }

                    if (allUsers.indexOf(userRow) % 30 === 0 && allUsers.indexOf(userRow) > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    console.error(`Failed to send event to user ${userRow.chat_id}:`, error);
                }
            }

            sessions.set(chatId, { state: null });
            await ctx.reply(`Матч «${event.match_name}» для события создан и отправлен пользователям`);
            await this.handleEvents(ctx);
        } catch (error: any) {
            await ctx.answerCbQuery(error.message || 'Ошибка при создании события', { show_alert: true });
            sessions.set(chatId, { state: null });
        }
    }


    private async processGiveawayPhotoCreation(ctx: Context, photo: any) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        if (!photo || !photo.length) {
            await ctx.reply('Отправьте фото');
            return;
        }

        const fileId = photo[photo.length - 1].file_id;

        try {
            const giveaway = await this.giveawayService.createGiveaway(fileId);
            sessions.set(chatId, { state: 'creating_contest', data: { giveawayId: giveaway.id } });
            await updateOrSendMessage(ctx, 'Фото расписания сохранено. Отправьте информацию о матче одним сообщением в формате:\nНазвание\nНазвание команды 1\nНазвание команды 2\nДата начала (ДД.ММ.ГГГГ ЧЧ:ММ)', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Отменить', callback_data: 'admin:contest:create_cancel' }]
                    ]
                }
            });
        } catch (error: any) {
            await ctx.reply(error.message || 'Ошибка при сохранении фото');
        }
    }

    private async processGiveawayPhotoUpdate(ctx: Context, photo: any, session: AdminSession) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const { giveawayId } = session.data || {};
        if (!giveawayId) {
            await ctx.reply('Ошибка: розыгрыш не найден');
            sessions.set(chatId, { state: null });
            return;
        }

        if (!photo || !photo.length) {
            await ctx.reply('Отправьте фото');
            return;
        }

        const fileId = photo[photo.length - 1].file_id;

        try {
            await this.giveawayService.updateGiveawayPhoto(giveawayId, fileId);
            sessions.set(chatId, { state: null });
            await ctx.reply('Фото расписания обновлено');
            await this.handleGiveaways(ctx);
        } catch (error: any) {
            await ctx.reply(error.message || 'Ошибка при обновлении фото');
        }
    }

    private async processContestCreation(ctx: Context, text: string | undefined) {
        const chatId = ctx.from?.id;
        if (!chatId || !text) return;

        const session = sessions.get(chatId);
        const giveawayId = session?.data?.giveawayId || null;

        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 4) {
            await ctx.reply('Неверный формат. Отправьте:\nНазвание\nНазвание команды 1\nНазвание команды 2\nДата начала (ДД.ММ.ГГГГ ЧЧ:ММ)');
            return;
        }

        const [matchName, team1, team2, dateStr] = lines;
        const matchStartedAt = parseDate(dateStr.trim());

        if (!matchStartedAt) {
            await ctx.reply('Неверный формат даты');
            return;
        }

        try {
            await this.contestService.createContest(matchName.trim(), team1.trim(), team2.trim(), matchStartedAt, giveawayId);
            sessions.set(chatId, { state: null });
            await ctx.reply(`Матч «${matchName}» для розыгрыша создан`);
            await this.handleGiveaways(ctx);
        } catch (error: any) {
            await ctx.reply(error.message || 'Ошибка при создании розыгрыша');
        }
    }

    private async processEventLostMessage(ctx: Context, text: string | undefined, session: AdminSession) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const { eventId } = session.data || {};
        if (!eventId) {
            await ctx.reply('Ошибка: событие не найдено');
            sessions.set(chatId, { state: null });
            return;
        }

        if (!text || !text.trim()) {
            await ctx.reply('Введите текст сообщения');
            return;
        }

        try {
            await this.betEventService.setEventOutcome(eventId, false);
            await this.betEventService.sendEventLostMessageToUsers(eventId, text.trim(), this.bot);
            sessions.set(chatId, { state: null });
            await ctx.reply('Сообщение отправлено пользователям');
            await this.handleEventList(ctx);
        } catch (error: any) {
            await ctx.reply(error.message || 'Ошибка при отправке сообщения');
        }
    }

    private async processBroadcastCreation(ctx: Context, text: string | undefined, photo: any) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const fileId = photo ? photo[photo.length - 1].file_id : null;

        if (!text && !fileId) {
            await ctx.reply('Отправьте текст и/или фото');
            return;
        }

        let caption = text?.trim() || null;
        let url: string | null = null;
        let buttonText: string | null = null;

        if (text) {
            const trimmedText = text.trim();
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const matches = trimmedText.match(urlRegex);
            if (matches && matches.length > 0) {
                url = matches[matches.length - 1].trim();
                const lastIndex = trimmedText.lastIndexOf(url);
                if (lastIndex !== -1) {
                    const afterUrl = trimmedText.substring(lastIndex + url.length).trim();
                    if (afterUrl) {
                        buttonText = afterUrl;
                    }
                    caption = trimmedText.substring(0, lastIndex).trim() || null;
                }
            }
        }

        try {
            await this.broadcastService.createBroadcast(caption, fileId, url, buttonText, this.bot);
            await ctx.reply('Рассылка отправлена');
            sessions.set(chatId, { state: null });
        } catch (error: any) {
            await ctx.reply(error.message || 'Ошибка при создании рассылки');
        }
    }

    private async processEventEdit(ctx: Context, text: string | undefined, photo: any, session: AdminSession) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const { eventId, field } = session.data || {};
        if (!eventId || !field) {
            await ctx.reply('Ошибка: данные сессии не найдены');
            sessions.set(chatId, { state: null });
            return;
        }

        const event = await this.betEventService.getEventById(eventId);
        if (!event) {
            await ctx.reply('Событие не найдено');
            sessions.set(chatId, { state: null });
            return;
        }

        let updateData: any = {};

        if (field === 'file_id') {
            if (!photo) {
                await ctx.reply('Отправьте фото');
                return;
            }
            updateData.file_id = photo[photo.length - 1].file_id;
        } else {
            if (!text) {
                await ctx.reply('Введите значение');
                return;
            }

            if (field === 'match_name') {
                updateData.match_name = text.trim();
            } else if (field === 'winner_team') {
                updateData.winner_team = text.trim();
            } else if (field === 'bet_amount') {
                const betAmount = parseInt(text.trim());
                if (isNaN(betAmount)) {
                    await ctx.reply('Неверный формат суммы ставки');
                    return;
                }
                updateData.bet_amount = betAmount;
            } else if (field === 'coefficient') {
                const coefficient = parseFloat(text.trim());
                if (isNaN(coefficient)) {
                    await ctx.reply('Неверный формат коэффициента');
                    return;
                }
                updateData.coefficient = coefficient;
            } else if (field === 'match_started_at') {
                const matchStartedAt = parseDate(text.trim());
                if (!matchStartedAt) {
                    await ctx.reply('Неверный формат даты. Используйте формат: ДД.ММ.ГГГГ ЧЧ:ММ');
                    return;
                }
                updateData.match_started_at = matchStartedAt;
            }
        }

        try {
            await this.betEventService.updateEvent(eventId, updateData);
            const updatedEvent = await this.betEventService.getEventById(eventId);
            sessions.set(chatId, { state: null });
            await ctx.reply(`Матч «${updatedEvent?.match_name || ''}» для события изменен`);
            await this.handleEvents(ctx);
        } catch (error: any) {
            await ctx.reply(error.message || 'Ошибка при обновлении события');
        }
    }

    private async processContestEdit(ctx: Context, text: string | undefined, session: AdminSession) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const { contestId, field } = session.data || {};
        if (!contestId || !field) {
            await ctx.reply('Ошибка: данные сессии не найдены');
            sessions.set(chatId, { state: null });
            return;
        }

        const contest = await this.contestService.getContestById(contestId);
        if (!contest) {
            await ctx.reply('Розыгрыш не найден');
            sessions.set(chatId, { state: null });
            return;
        }

        let updateData: any = {};

        if (!text) {
            await ctx.reply('Введите значение');
            return;
        }

        if (field === 'match_name') {
            updateData.match_name = text.trim();
        } else if (field === 'team_1') {
            updateData.team_1 = text.trim();
        } else if (field === 'team_2') {
            updateData.team_2 = text.trim();
        } else if (field === 'match_started_at') {
            const matchStartedAt = parseDate(text.trim());
            if (!matchStartedAt) {
                await ctx.reply('Неверный формат даты. Используйте формат: ДД.ММ.ГГГГ ЧЧ:ММ');
                return;
            }
            updateData.match_started_at = matchStartedAt;
        }

        try {
            await this.contestService.updateContest(contestId, updateData);
            const updatedContest = await this.contestService.getContestById(contestId);
            sessions.set(chatId, { state: null });
            await ctx.reply(`Матч «${updatedContest?.match_name || ''}» для розыгрыша изменен`);
            await this.handleGiveaways(ctx);
        } catch (error: any) {
            await ctx.reply(error.message || 'Ошибка при обновлении розыгрыша');
        }
    }

    async handleEventEditField(ctx: Context, eventId: number, field: string) {
        const event = await this.betEventService.getEventById(eventId);
        if (!event) {
            await ctx.answerCbQuery('Событие не найдено', { show_alert: true });
            return;
        }

        const chatId = ctx.from?.id;
        if (!chatId) return;

        const fieldNames: Record<string, string> = {
            match_name: 'Название матча',
            winner_team: 'Исход матча',
            bet_amount: 'Сумма ставки',
            coefficient: 'Коэффициент',
            match_started_at: 'Дата начала матча (ДД.ММ.ГГГГ ЧЧ:ММ)',
            file_id: 'Фото'
        };

        sessions.set(chatId, { 
            state: 'editing_event', 
            data: { eventId, field } 
        });

        const prompt = `Введите новое значение для «${fieldNames[field] || field}»:`;

        await updateOrSendMessage(ctx, prompt, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Отменить', callback_data: `admin:event:edit_cancel:${eventId}` }]
                ]
            }
        });
    }


    async handleEventEditCancel(ctx: Context, eventId: number) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        sessions.set(chatId, { state: null });
        await ctx.deleteMessage().catch(() => {});
        await this.handleEventView(ctx, eventId);
    }

    async handleGiveawayUpdatePhoto(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const activeGiveaway = await this.giveawayService.getActiveGiveaway();
        if (!activeGiveaway) {
            await ctx.reply('Активный розыгрыш не найден');
            return;
        }

        sessions.set(chatId, { state: 'updating_giveaway_photo', data: { giveawayId: activeGiveaway.id } });
        await updateOrSendMessage(ctx, 'Приложите новое фото расписания матчей розыгрыша:', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Отменить', callback_data: 'admin:cancel' }]
                ]
            }
        });
    }
}


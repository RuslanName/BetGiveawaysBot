import { Context } from 'telegraf';
import { BetEventService } from '../services/bet-event.service.js';
import { GiveawayService } from '../services/giveaway.service.js';
import { BroadcastService } from '../services/broadcast.service.js';
import { UserService } from '../services/user.service.js';
import { createPaginationKeyboard } from '../utils/pagination.js';
import { parseDate, formatDate } from '../utils/date-parser.js';
import { updateOrSendMessage } from '../utils/message-updater.js';
import { AppDataSource } from '../config/db.js';
import { Telegraf } from 'telegraf';

interface AdminSession {
    state?: 'creating_event' | 'creating_giveaway' | 'creating_broadcast' | 'editing_event' | 'editing_giveaway' | null;
    data?: any;
}

const sessions = new Map<number, AdminSession>();

export class AdminHandlers {
    private betEventService = new BetEventService();
    private giveawayService = new GiveawayService();
    private broadcastService = new BroadcastService();
    private userService = new UserService();
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
        await updateOrSendMessage(ctx, 'Управление событиями', {
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
        await ctx.reply('Отправьте информацию о событии одним сообщением в формате:\nНазвание матча\nКоманда для ставки\nСумма ставки\nДата начала матча (ДД.ММ.ГГГГ ЧЧ:ММ)\nФото (опционально)');
    }

    async handleEventList(ctx: Context, page: number = 1) {
        const events = await this.betEventService.getEventsForAdmin();
        const limit = 20;
        const start = (page - 1) * limit;
        const end = start + limit;
        const pageEvents = events.slice(start, end);
        const totalPages = Math.ceil(events.length / limit);

        if (pageEvents.length === 0) {
            await ctx.reply('Нет событий');
            return;
        }

        const keyboard: any[] = pageEvents.map(event => [{
            text: event.match_name,
            callback_data: `admin:event:view:${event.id}`
        }]);

        const pagination = createPaginationKeyboard(page, totalPages, 'admin:event:list');
        keyboard.push(...pagination.inline_keyboard);

        await updateOrSendMessage(ctx, 'Выберите событие:', {
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
        
        let message = `*Событие «${event.match_name}»*\n`;
        message += `Количество участников: ${participantsCount}\n`;
        message += `Команда для ставки: ${event.winner_team}\n`;
        message += `Сумма ставки: ${event.bet_amount}\n`;
        message += `Дата начала матча: ${formatDate(event.match_started_at)}`;

        const keyboard: any[] = [];
        
        if (event.status === 'awaiting_review') {
            keyboard.push([{ text: 'Узнать результаты', callback_data: `admin:event:results:${eventId}` }]);
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

        let message = `*Событие «${event.match_name}»*\n\n`;
        result.participants.forEach((p, index) => {
            const num = (page - 1) * 20 + index + 1;
            const username = p.user.username ? `@${p.user.username}` : 'пользователь';
            message += `${num}) ${username} (ID Betboom: ${p.user.betboom_id}) - ${p.ticket_id}\n`;
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
                    [{ text: 'Команда для ставки', callback_data: `admin:event:edit_field:${eventId}:winner_team` }],
                    [{ text: 'Сумму ставки', callback_data: `admin:event:edit_field:${eventId}:bet_amount` }],
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
        await this.betEventService.cancelEvent(eventId);
        await ctx.reply('Событие удалено');
        await this.handleEventList(ctx);
    }

    async handleGiveaways(ctx: Context) {
        await updateOrSendMessage(ctx, 'Управление розыгрышами', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Создать', callback_data: 'admin:giveaway:create' }],
                    [{ text: 'Общая информация', callback_data: 'admin:giveaway:list' }]
                ]
            }
        });
    }

    async handleGiveawayCreate(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        sessions.set(chatId, { state: 'creating_giveaway', data: {} });
        await ctx.reply('Отправьте информацию о розыгрыше одним сообщением в формате:\nТекст\nКоличество победителей\nДата завершения (ДД.ММ.ГГГГ ЧЧ:ММ)\nФото (опционально)');
    }

    async handleGiveawayList(ctx: Context, page: number = 1) {
        const giveaways = await this.giveawayService.getGiveawaysForAdmin();
        const limit = 20;
        const start = (page - 1) * limit;
        const end = start + limit;
        const pageGiveaways = giveaways.slice(start, end);
        const totalPages = Math.ceil(giveaways.length / limit);

        if (pageGiveaways.length === 0) {
            await ctx.reply('Нет розыгрышей');
            return;
        }

        const keyboard: any[] = pageGiveaways.map(giveaway => [{
            text: `Розыгрыш №${giveaway.id}`,
            callback_data: `admin:giveaway:view:${giveaway.id}`
        }]);

        const pagination = createPaginationKeyboard(page, totalPages, 'admin:giveaway:list');
        keyboard.push(...pagination.inline_keyboard);

        await updateOrSendMessage(ctx, 'Выберите розыгрыш:', {
            reply_markup: { inline_keyboard: keyboard }
        });
    }

    async handleGiveawayView(ctx: Context, giveawayId: number) {
        const giveaway = await this.giveawayService.getGiveawayById(giveawayId);
        if (!giveaway) {
            await ctx.reply('Розыгрыш не найден');
            return;
        }

        const participants = await this.giveawayService.getParticipants(giveawayId);
        
        let message = `*Розыгрыш №${giveawayId}*\n`;
        message += `Количество участников: ${participants.length}\n`;
        message += `Текст: "${giveaway.caption}"\n`;
        message += `Дата завершения: ${formatDate(giveaway.ended_at)}`;

        const keyboard: any[] = [];
        
        if (giveaway.status === 'awaiting_review') {
            keyboard.push([{ text: 'Узнать результаты', callback_data: `admin:giveaway:results:${giveawayId}` }]);
        }
        
        keyboard.push(
            [{ text: 'Изменить', callback_data: `admin:giveaway:edit:${giveawayId}` }, { text: 'Удалить', callback_data: `admin:giveaway:delete:${giveawayId}` }],
            [{ text: 'К списку', callback_data: 'admin:giveaway:list' }]
        );

        if (giveaway.file_id) {
            await updateOrSendMessage(ctx, message, {
                reply_markup: { inline_keyboard: keyboard },
                photo: giveaway.file_id
            });
        } else {
            await updateOrSendMessage(ctx, message, {
                reply_markup: { inline_keyboard: keyboard }
            });
        }
    }

    async handleGiveawayResults(ctx: Context, giveawayId: number) {
        const giveaway = await this.giveawayService.getGiveawayById(giveawayId);
        if (!giveaway) {
            await ctx.reply('Розыгрыш не найден');
            return;
        }

        const winners = await this.giveawayService.getWinners(giveawayId);
        
        if (winners.length === 0) {
            try {
                await this.giveawayService.selectWinners(giveawayId);
                const result = await this.giveawayService.getResults(giveawayId);
                await this.giveawayService.sendGiveawayNotification(giveawayId, this.bot);
                
                let message = '';
                if (result.winners.length === 1) {
                    const winner = result.winners[0];
                    message = `*Победитель розыгрыша №${giveawayId}:* @${winner.username || 'пользователь'}`;
                } else {
                    message = `*Победители розыгрыша №${giveawayId}:*\n`;
                    result.winners.forEach((winner, index) => {
                        message += `${index + 1}) @${winner.username || 'пользователь'}\n`;
                    });
                }

                await ctx.reply(message, { parse_mode: 'Markdown' });
            } catch (error: any) {
                await ctx.reply(error.message || 'Ошибка при выборе победителей');
            }
        } else {
            let message = '';
            if (winners.length === 1) {
                message = `*Победитель розыгрыша №${giveawayId}:* @${winners[0].username || 'пользователь'}`;
            } else {
                message = `*Победители розыгрыша №${giveawayId}:*\n`;
                winners.forEach((winner, index) => {
                    message += `${index + 1}) @${winner.username || 'пользователь'}\n`;
                });
            }

            await ctx.reply(message, { parse_mode: 'Markdown' });
        }
    }

    async handleGiveawayEdit(ctx: Context, giveawayId: number) {
        const giveaway = await this.giveawayService.getGiveawayById(giveawayId);
        if (!giveaway) {
            await ctx.reply('Розыгрыш не найден');
            return;
        }

        await updateOrSendMessage(ctx, `Что хотите изменить в розыгрыше №${giveawayId}?`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Текст', callback_data: `admin:giveaway:edit_field:${giveawayId}:caption` }],
                    [{ text: 'Количество победителей', callback_data: `admin:giveaway:edit_field:${giveawayId}:winners_count` }],
                    [{ text: 'Дату завершения', callback_data: `admin:giveaway:edit_field:${giveawayId}:ended_at` }],
                    [{ text: 'Фото', callback_data: `admin:giveaway:edit_field:${giveawayId}:file_id` }],
                    [{ text: 'Отменить', callback_data: `admin:giveaway:view:${giveawayId}` }]
                ]
            }
        });
    }

    async handleGiveawayDelete(ctx: Context, giveawayId: number) {
        const giveaway = await this.giveawayService.getGiveawayById(giveawayId);
        if (!giveaway) {
            await ctx.reply('Розыгрыш не найден');
            return;
        }

        await updateOrSendMessage(ctx, `Точно ли хотите удалить розыгрыш №${giveawayId}?`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Да', callback_data: `admin:giveaway:delete_confirm:${giveawayId}` }, { text: 'Нет', callback_data: `admin:giveaway:view:${giveawayId}` }]
                ]
            }
        });
    }

    async handleGiveawayDeleteConfirm(ctx: Context, giveawayId: number) {
        await this.giveawayService.cancelGiveaway(giveawayId);
        await ctx.reply('Розыгрыш удален');
        await this.handleGiveawayList(ctx);
    }

    async handleBroadcasts(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        sessions.set(chatId, { state: 'creating_broadcast', data: {} });
        await ctx.reply('Отправьте текст рассылки (опционально) и/или фото');
    }

    async handleStatistics(ctx: Context) {
        const stats = await this.userService.getStatistics();
        const events = await this.betEventService.getEventsForAdmin();
        const giveaways = await this.giveawayService.getGiveawaysForAdmin();
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

        for (const giveaway of giveaways) {
            const giveawayParticipants = await this.giveawayService.getParticipants(giveaway.id);
            message += `Количество участников в розыгрыше №${giveaway.id}: ${giveawayParticipants.length}\n`;
        }

        if (events.length > 0 || giveaways.length > 0) {
            message += '\n';
        }

        if (stats.topUsers.length > 0) {
            message += '*Топ 10 пользователей:*\n';
            stats.topUsers.forEach((item, index) => {
                const username = item.user.username ? `@${item.user.username}` : 'пользователь';
                message += `${index + 1}) ${username} (ID Betboom: ${item.user.betboom_id})\n`;
            });
        }

        await ctx.reply(message, { parse_mode: 'Markdown' });
    }

    async handleAdminText(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const session = sessions.get(chatId);
        const text = (ctx.message as any).text?.trim();
        const photo = (ctx.message as any).photo;

        if (session?.state === 'creating_event') {
            await this.processEventCreation(ctx, text, photo);
        } else if (session?.state === 'creating_giveaway') {
            await this.processGiveawayCreation(ctx, text, photo);
        } else if (session?.state === 'creating_broadcast') {
            await this.processBroadcastCreation(ctx, text, photo);
        }
    }

    private async processEventCreation(ctx: Context, text: string | undefined, photo: any) {
        const chatId = ctx.from?.id;
        if (!chatId || !text) return;

        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 4) {
            await ctx.reply('Неверный формат. Отправьте:\nНазвание матча\nКоманда для ставки\nСумма ставки\nДата начала матча (ДД.ММ.ГГГГ ЧЧ:ММ)');
            return;
        }

        const [matchName, winnerTeam, betAmountStr, dateStr] = lines;
        const betAmount = parseInt(betAmountStr);
        const matchStartedAt = parseDate(dateStr);

        if (isNaN(betAmount) || !matchStartedAt) {
            await ctx.reply('Неверный формат суммы ставки или даты');
            return;
        }

        const fileId = photo ? photo[photo.length - 1].file_id : null;

        try {
            const event = await this.betEventService.createEvent(matchName, winnerTeam, betAmount, matchStartedAt, fileId);
            
            const { User } = await import('../entities/index.js');
            const userRepository = AppDataSource.getRepository(User);
            const allUsers = await userRepository.find({ select: ['chat_id'] });
            for (const userRow of allUsers) {
                try {
                    let message = `*Новое событие: «${event.match_name}»*\n`;
                    message += `Команда для ставки: ${event.winner_team}\n`;
                    message += `Сумма ставки: ${event.bet_amount}\n`;
                    message += `Дата начала: ${formatDate(event.match_started_at)}`;

                    if (fileId) {
                        await this.bot.telegram.sendPhoto(userRow.chat_id, fileId, {
                            caption: message,
                            parse_mode: 'Markdown'
                        });
                    } else {
                        await this.bot.telegram.sendMessage(userRow.chat_id, message, { parse_mode: 'Markdown' });
                    }

                    if (allUsers.indexOf(userRow) % 30 === 0 && allUsers.indexOf(userRow) > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    console.error(`Failed to send event notification:`, error);
                }
            }

            await ctx.reply('Событие создано и отправлено пользователям');
            sessions.set(chatId, { state: null });
        } catch (error: any) {
            await ctx.reply(error.message || 'Ошибка при создании события');
        }
    }

    private async processGiveawayCreation(ctx: Context, text: string | undefined, photo: any) {
        const chatId = ctx.from?.id;
        if (!chatId || !text) return;

        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 3) {
            await ctx.reply('Неверный формат. Отправьте:\nТекст\nКоличество победителей\nДата завершения (ДД.ММ.ГГГГ ЧЧ:ММ)');
            return;
        }

        const [caption, winnersCountStr, dateStr] = lines;
        const winnersCount = parseInt(winnersCountStr);
        const endedAt = parseDate(dateStr);

        if (isNaN(winnersCount) || !endedAt) {
            await ctx.reply('Неверный формат количества победителей или даты');
            return;
        }

        const fileId = photo ? photo[photo.length - 1].file_id : null;

        try {
            const giveaway = await this.giveawayService.createGiveaway(caption, winnersCount, endedAt, fileId);
            
            const { User } = await import('../entities/index.js');
            const userRepository = AppDataSource.getRepository(User);
            const allUsers = await userRepository.find({ select: ['chat_id'] });
            for (const userRow of allUsers) {
                try {
                    let message = `Новый розыгрыш!\n${giveaway.caption}\n`;
                    message += `Дата завершения: ${formatDate(giveaway.ended_at)}`;

                    if (fileId) {
                        await this.bot.telegram.sendPhoto(userRow.chat_id, fileId, {
                            caption: message
                        });
                    } else {
                        await this.bot.telegram.sendMessage(userRow.chat_id, message);
                    }

                    if (allUsers.indexOf(userRow) % 30 === 0 && allUsers.indexOf(userRow) > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (error) {
                    console.error(`Failed to send giveaway notification:`, error);
                }
            }

            await ctx.reply('Розыгрыш создан и отправлен пользователям');
            sessions.set(chatId, { state: null });
        } catch (error: any) {
            await ctx.reply(error.message || 'Ошибка при создании розыгрыша');
        }
    }

    private async processBroadcastCreation(ctx: Context, text: string | undefined, photo: any) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const fileId = photo ? photo[photo.length - 1].file_id : null;

        if (!text && !fileId) {
            await ctx.reply('Отправьте текст или фото');
            return;
        }

        try {
            await this.broadcastService.createBroadcast(text || null, fileId, this.bot);
            await ctx.reply('Рассылка отправлена');
            sessions.set(chatId, { state: null });
        } catch (error: any) {
            await ctx.reply(error.message || 'Ошибка при создании рассылки');
        }
    }
}


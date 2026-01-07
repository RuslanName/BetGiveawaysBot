import { Context } from 'telegraf';
import { UserService } from '../services/user.service.js';
import { BetEventService } from '../services/bet-event.service.js';
import { updateOrSendMessage } from '../utils/message-updater.js';

interface UserSession {
    state?: 'registering' | 'betting' | null;
    betEventId?: number;
    ticketId?: string;
}

const sessions = new Map<number, UserSession>();

export class UserHandlers {
    private userService = new UserService();
    private betEventService = new BetEventService();

    async handleStart(ctx: Context) {
        await updateOrSendMessage(ctx, 'Активные события для ставки', {
            reply_markup: {
                inline_keyboard: [[
                    { text: 'Посмотреть', callback_data: 'menu:events' }
                ]]
            }
        });
    }

    async handleText(ctx: Context) {
        const chatId = ctx.from?.id;
        if (!chatId) return;

        const session = sessions.get(chatId);
        
        if (session?.state === 'betting') {
            await this.handleBetInput(ctx, chatId, session);
        }
    }

    private async handleBetInput(ctx: Context, chatId: number, session: UserSession) {
        const text = (ctx.message as any).text?.trim();
        
        if (text === 'Отменить') {
            sessions.set(chatId, { state: null });
            await this.showMainMenu(ctx);
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
                await ctx.reply('Ваша ставка принята!');
                sessions.set(chatId, { state: null });
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
            await updateOrSendMessage(ctx, 'Нет активных событий');
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

        await updateOrSendMessage(ctx, 'Выберите событие:', {
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
        
        await updateOrSendMessage(
            ctx,
            'Введите ID билета',
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
                await ctx.reply('Ваша ставка принята!');
                sessions.set(chatId, { state: null });
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
        await this.showMainMenu(ctx);
    }

    async showMainMenu(ctx: Context) {
        await updateOrSendMessage(ctx, 'Главное меню', {
            reply_markup: {
                inline_keyboard: [[
                    { text: 'События', callback_data: 'menu:events' }
                ]]
            }
        });
    }
}


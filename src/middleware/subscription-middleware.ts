import { Context, type MiddlewareFn } from 'telegraf';
import { updateOrSendMessage } from '../utils/message-updater.js';
import { checkRegistration } from './registration-middleware.js';
import { isAdmin } from '../utils/admin.js';

export const checkSubscription = (channelChatId: string, channelUrl: string): MiddlewareFn<Context> => {
    return async (ctx, next) => {
        if (!ctx.from || !ctx.chat) {
            await next();
            return;
        }

        if (ctx.chat.type !== 'private') {
            await next();
            return;
        }

        if (isAdmin(ctx.from.id)) {
            await next();
            return;
        }

        try {
            const member = await ctx.telegram.getChatMember(channelChatId, ctx.from.id);
            const isSubscribed = ['member', 'administrator', 'creator'].includes(member.status);

            if (!isSubscribed) {
                await updateOrSendMessage(
                    ctx,
                    'Для использования бота необходимо быть подписанным на канал «Роганов Хоккей»',
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: 'Подписаться на канал', url: channelUrl }],
                                [{ text: 'Проверить подписку', callback_data: 'check_subscription' }]
                            ]
                        }
                    }
                );
                return;
            }

            await checkRegistration()(ctx, next);
        } catch (error) {
            console.error('Error checking subscription:', error);
        }
    };
};


import { Context, type MiddlewareFn } from 'telegraf';
import { createReadStream } from 'fs';
import { UserService } from '../services/user.service.js';
import { updateOrSendMessage } from '../utils/message-updater.js';
import { isAdmin } from '../utils/admin.js';
import { getRegistrationPhotoFileId, setRegistrationPhotoFileId, getRegistrationPhotoPath } from '../utils/registration-photo.js';

interface RegistrationSession {
    state?: 'registering' | null;
}

const registrationSessions = new Map<number, RegistrationSession>();

export const checkRegistration = (): MiddlewareFn<Context> => {
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

        const userService = new UserService();
        const user = await userService.getUserByChatId(ctx.from.id);

        if (!user) {
            const session = registrationSessions.get(ctx.from.id);
            
            if (session?.state === 'registering') {
                await next();
                return;
            }

            registrationSessions.set(ctx.from.id, { state: 'registering' });
            
            const fileId = getRegistrationPhotoFileId();
            
            if (fileId) {
                await ctx.replyWithPhoto(fileId, {
                    caption: 'Введите свой BetBoom ID'
                });
            } else {
                try {
                    const photoPath = getRegistrationPhotoPath();
                    const photoStream = createReadStream(photoPath);
                    const sentMessage = await ctx.replyWithPhoto({ source: photoStream, filename: 'registration-photo.jpg' }, {
                        caption: 'Введите свой BetBoom ID'
                    });
                    
                    const photo = (sentMessage as any).photo;
                    if (photo && photo.length > 0) {
                        const newFileId = photo[photo.length - 1].file_id;
                        setRegistrationPhotoFileId(newFileId);
                    }
                } catch (error) {
                    await ctx.reply('Введите свой BetBoom ID');
                }
            }
            
            return;
        }

        registrationSessions.delete(ctx.from.id);
        await next();
    };
};

export const handleRegistration = async (ctx: Context): Promise<boolean> => {
    const chatId = ctx.from?.id;
    if (!chatId) return false;

    const session = registrationSessions.get(chatId);
    if (session?.state !== 'registering') return false;

    const betboomId = (ctx.message as any).text?.trim();
    
    if (!betboomId || !/^\d{1,12}$/.test(betboomId)) {
        await updateOrSendMessage(ctx, 'BetBoom ID должен содержать от 1 до 12 цифр. Попробуйте снова:');
        return true;
    }

    const userService = new UserService();
    const isValid = await userService.validateBetboomId(betboomId);
    if (!isValid) {
        await updateOrSendMessage(ctx, 'Такой BetBoom ID уже зарегистрирован. Введите другой:');
        return true;
    }

    try {
        const firstName = ctx.from?.first_name || null;
        const lastName = ctx.from?.last_name || null;
        const username = ctx.from?.username || null;

        const user = await userService.registerUser(chatId, firstName, lastName, username, betboomId);
        
        const displayName = user.first_name || user.username || 'Пользователь';
        await ctx.reply(`*${displayName}*, вы зарегистрированы!`, {
            parse_mode: 'Markdown'
        });
        
        const { UserHandlers } = await import('../handlers/user-handlers.js');
        const userHandlers = new UserHandlers();
        await userHandlers.showMainMenu(ctx);
        
        registrationSessions.set(chatId, { state: null });
        return true;
    } catch (error: any) {
        await updateOrSendMessage(ctx, error.message || 'Ошибка при регистрации');
        return true;
    }
};


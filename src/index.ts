import 'reflect-metadata';
import './config/constants.js';
import { Telegraf } from 'telegraf';
import { initializeDatabase } from './config/db.js';
import { checkSubscription } from './middleware/subscription-middleware.js';
import { handleRegistration } from './middleware/registration-middleware.js';
import { isAdmin } from './utils/admin.js';
import { UserHandlers } from './handlers/user-handlers.js';
import { AdminHandlers } from './handlers/admin-handlers.js';
import { updateOrSendMessage } from './utils/message-updater.js';
import { ENV } from './config/constants.js';
import { initCron } from './utils/cron.js';

const bot = new Telegraf(ENV.BOT_TOKEN);
const userHandlers = new UserHandlers();
const adminHandlers = new AdminHandlers(bot);

bot.use(checkSubscription(ENV.CHANNEL_CHAT_ID, ENV.CHANNEL_URL));

bot.start(async (ctx) => {
    if (isAdmin(ctx.from?.id || 0)) {
        await adminHandlers.showAdminMenu(ctx);
    } else {
        await userHandlers.handleStart(ctx);
    }
});

bot.command('help', async (ctx) => {
    const helpText = `
*Доступные команды:*

/start - Запустить бота и показать главное меню
/help - Показать справку по командам

*Для пользователей:*
• Регистрация через ввод Betboom ID
• Участие в событиях через кнопку "События"
• Просмотр активных событий и отправка ставок

*Для администраторов:*
• Управление событиями (создание, редактирование, просмотр результатов)
• Управление розыгрышами (создание, выбор победителей)
• Создание рассылок для всех пользователей
• Просмотр статистики (регистрации, участники, топ пользователей)
    `;
    
    await ctx.reply(helpText, { parse_mode: 'Markdown' });
});

bot.hears('События', async (ctx) => {
    if (isAdmin(ctx.from?.id || 0)) {
        await adminHandlers.handleEvents(ctx);
    }
});

bot.hears('Розыгрыши', async (ctx) => {
    if (isAdmin(ctx.from?.id || 0)) {
        await adminHandlers.handleGiveaways(ctx);
    }
});

bot.hears('Рассылки', async (ctx) => {
    if (isAdmin(ctx.from?.id || 0)) {
        await adminHandlers.handleBroadcasts(ctx);
    }
});

bot.hears('Статистика', async (ctx) => {
    if (isAdmin(ctx.from?.id || 0)) {
        await adminHandlers.handleStatistics(ctx);
    }
});

bot.on('text', async (ctx) => {
    if (isAdmin(ctx.from?.id || 0)) {
        await adminHandlers.handleAdminText(ctx);
    } else {
        const handled = await handleRegistration(ctx);
        if (!handled) {
            await userHandlers.handleText(ctx);
        }
    }
});

bot.on('photo', async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) {
        await userHandlers.handlePhoto(ctx);
    } else {
        await adminHandlers.handleAdminText(ctx);
    }
});

bot.action(/^menu:events$/, async (ctx) => {
    await ctx.answerCbQuery();
    await userHandlers.handleEventsButton(ctx);
});

bot.action(/^event:select:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const eventId = parseInt(ctx.match[1]);
    await userHandlers.handleEventSelect(ctx, eventId);
});

bot.action(/^bet:skip_photo$/, async (ctx) => {
    await userHandlers.handleSkipPhoto(ctx);
    await ctx.answerCbQuery();
});

bot.action(/^bet:cancel$/, async (ctx) => {
    await userHandlers.handleBetCancel(ctx);
    await ctx.answerCbQuery();
});

bot.action(/^check_subscription$/, async (ctx) => {
    if (!ctx.from || !ctx.chat || ctx.chat.type !== 'private') {
        await ctx.answerCbQuery();
        return;
    }

    try {
        const member = await ctx.telegram.getChatMember(ENV.CHANNEL_CHAT_ID, ctx.from.id);
        const isSubscribed = ['member', 'administrator', 'creator'].includes(member.status);

        if (isSubscribed) {
            await ctx.answerCbQuery('Вы подписаны на канал!', { show_alert: false });
            await ctx.deleteMessage();
            
            const { UserService } = await import('./services/user.service.js');
            const userService = new UserService();
            const user = await userService.getUserByChatId(ctx.from.id);
            if (!user) {
                await updateOrSendMessage(ctx, 'Введите свой Betboom ID');
            }
        } else {
            await ctx.answerCbQuery('Вы не подписаны на канал', { show_alert: true });
        }
    } catch (error) {
        console.error('Error checking subscription:', error);
        await ctx.answerCbQuery('Ошибка при проверке подписки', { show_alert: true });
    }
});

bot.action(/^admin:event:create$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    await adminHandlers.handleEventCreate(ctx);
    await ctx.answerCbQuery();
});

bot.action(/^admin:event:list$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    await adminHandlers.handleEventList(ctx);
    await ctx.answerCbQuery();
});

bot.action(/^admin:event:list:page:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const page = parseInt(ctx.match[1]);
    await adminHandlers.handleEventList(ctx, page);
    await ctx.answerCbQuery();
});

bot.action(/^admin:event:view:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const eventId = parseInt(ctx.match[1]);
    await adminHandlers.handleEventView(ctx, eventId);
    await ctx.answerCbQuery();
});

bot.action(/^admin:event:results:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const eventId = parseInt(ctx.match[1]);
    await adminHandlers.handleEventResults(ctx, eventId);
    await ctx.answerCbQuery();
});

bot.action(/^admin:event:results:(\d+):page:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const eventId = parseInt(ctx.match[1]);
    const page = parseInt(ctx.match[2]);
    await adminHandlers.handleEventResults(ctx, eventId, page);
    await ctx.answerCbQuery();
});

bot.action(/^admin:event:edit:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const eventId = parseInt(ctx.match[1]);
    await adminHandlers.handleEventEdit(ctx, eventId);
    await ctx.answerCbQuery();
});

bot.action(/^admin:event:delete:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const eventId = parseInt(ctx.match[1]);
    await adminHandlers.handleEventDelete(ctx, eventId);
    await ctx.answerCbQuery();
});

bot.action(/^admin:event:delete_confirm:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const eventId = parseInt(ctx.match[1]);
    await adminHandlers.handleEventDeleteConfirm(ctx, eventId);
    await ctx.answerCbQuery();
});

bot.action(/^admin:giveaway:create$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    await adminHandlers.handleGiveawayCreate(ctx);
    await ctx.answerCbQuery();
});

bot.action(/^admin:giveaway:list$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    await adminHandlers.handleGiveawayList(ctx);
    await ctx.answerCbQuery();
});

bot.action(/^admin:giveaway:list:page:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const page = parseInt(ctx.match[1]);
    await adminHandlers.handleGiveawayList(ctx, page);
    await ctx.answerCbQuery();
});

bot.action(/^admin:giveaway:view:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const giveawayId = parseInt(ctx.match[1]);
    await adminHandlers.handleGiveawayView(ctx, giveawayId);
    await ctx.answerCbQuery();
});

bot.action(/^admin:giveaway:results:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const giveawayId = parseInt(ctx.match[1]);
    await adminHandlers.handleGiveawayResults(ctx, giveawayId);
    await ctx.answerCbQuery();
});

bot.action(/^admin:giveaway:edit:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const giveawayId = parseInt(ctx.match[1]);
    await adminHandlers.handleGiveawayEdit(ctx, giveawayId);
    await ctx.answerCbQuery();
});

bot.action(/^admin:giveaway:delete:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const giveawayId = parseInt(ctx.match[1]);
    await adminHandlers.handleGiveawayDelete(ctx, giveawayId);
    await ctx.answerCbQuery();
});

bot.action(/^admin:giveaway:delete_confirm:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const giveawayId = parseInt(ctx.match[1]);
    await adminHandlers.handleGiveawayDeleteConfirm(ctx, giveawayId);
    await ctx.answerCbQuery();
});

async function start() {
    try {
        await initializeDatabase();
        
        await bot.telegram.setMyCommands([
            { command: 'start', description: 'Запустить бота' },
            { command: 'help', description: 'Показать справку' }
        ]);

        initCron(bot);
        
        bot.launch();
        console.log('Bot started!');
    } catch (error) {
        console.error('Error starting bot:', error);
        process.exit(1);
    }
}

start();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

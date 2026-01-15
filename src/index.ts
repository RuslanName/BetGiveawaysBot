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
import { UserService } from './services/user.service.js';

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

bot.action(/^menu:events:matches$/, async (ctx) => {
    await ctx.answerCbQuery();
    await userHandlers.handleEventsMatches(ctx);
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
    await ctx.answerCbQuery();
    await userHandlers.handleBetCancel(ctx);
});

bot.action(/^menu:giveaways$/, async (ctx) => {
    await ctx.answerCbQuery();
    await userHandlers.handleGiveawaysButton(ctx);
});

bot.action(/^menu:giveaways:matches$/, async (ctx) => {
    await ctx.answerCbQuery();
    await userHandlers.handleGiveawaysMatches(ctx);
});

bot.action(/^menu:rating$/, async (ctx) => {
    await ctx.answerCbQuery();
    await userHandlers.handleRating(ctx);
});

bot.action(/^menu:back$/, async (ctx) => {
    await ctx.answerCbQuery();
    await userHandlers.showMainMenu(ctx);
});

bot.action(/^contest:select:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const contestId = parseInt(ctx.match[1]);
    await userHandlers.handleContestSelect(ctx, contestId);
});

bot.action(/^contest:pick:(\d+):(\w+)$/, async (ctx) => {
    const contestId = parseInt(ctx.match[1]);
    const outcome = ctx.match[2];
    await userHandlers.handleContestPick(ctx, contestId, outcome);
});

bot.action(/^contest:cancel$/, async (ctx) => {
    await ctx.answerCbQuery();
    await userHandlers.handleContestCancel(ctx);
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
            
            const userService = new UserService();
            const user = await userService.getUserByChatId(ctx.from.id);
            if (!user) {
                await updateOrSendMessage(ctx, 'Введите свой BetBoom ID');
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

bot.action(/^admin:event:edit_field:(\d+):(\w+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const eventId = parseInt(ctx.match[1]);
    const field = ctx.match[2];
    await adminHandlers.handleEventEditField(ctx, eventId, field);
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

bot.action(/^admin:contest:create$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    await ctx.answerCbQuery();
    await adminHandlers.handleContestCreate(ctx);
});

bot.action(/^admin:contest:list$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    await ctx.answerCbQuery();
    await adminHandlers.handleContestList(ctx);
});

bot.action(/^admin:contest:list:page:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const page = parseInt(ctx.match[1]);
    await ctx.answerCbQuery();
    await adminHandlers.handleContestList(ctx, page);
});

bot.action(/^admin:contest:view:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const contestId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery();
    await adminHandlers.handleContestView(ctx, contestId);
});

bot.action(/^admin:contest:edit:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const contestId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery();
    await adminHandlers.handleContestEdit(ctx, contestId);
});

bot.action(/^admin:contest:edit_field:(\d+):(\w+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const contestId = parseInt(ctx.match[1]);
    const field = ctx.match[2];
    await ctx.answerCbQuery();
    await adminHandlers.handleContestEditField(ctx, contestId, field);
});

bot.action(/^admin:contest:pick_outcome:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const contestId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery();
    await adminHandlers.handleContestPickOutcome(ctx, contestId);
});

bot.action(/^admin:contest:set_outcome:(\d+):(\w+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const contestId = parseInt(ctx.match[1]);
    const outcome = ctx.match[2];
    await adminHandlers.handleContestSetOutcome(ctx, contestId, outcome);
});

bot.action(/^admin:contest:finalize$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    await ctx.answerCbQuery();
    await adminHandlers.handleContestFinalize(ctx);
});

bot.action(/^admin:event:pick_outcome:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const eventId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery();
    await adminHandlers.handleEventPickOutcome(ctx, eventId);
});

bot.action(/^admin:event:set_outcome:(\d+):(\w+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const eventId = parseInt(ctx.match[1]);
    const outcome = ctx.match[2];
    await adminHandlers.handleEventSetOutcome(ctx, eventId, outcome);
});

bot.action(/^admin:event:edit_cancel:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const eventId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery();
    await adminHandlers.handleEventEditCancel(ctx, eventId);
});

bot.action(/^admin:contest:edit_cancel:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const contestId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery();
    await adminHandlers.handleContestEditCancel(ctx, contestId);
});

bot.action(/^admin:contest:delete:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const contestId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery();
    await adminHandlers.handleContestDelete(ctx, contestId);
});

bot.action(/^admin:contest:delete_confirm:(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const contestId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery();
    await adminHandlers.handleContestDeleteConfirm(ctx, contestId);
});

bot.action(/^admin:cancel$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    await ctx.answerCbQuery();
    await adminHandlers.handleCancel(ctx);
});

bot.action(/^admin:event:others$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    await ctx.answerCbQuery();
    await adminHandlers.handleEventOthers(ctx);
});

bot.action(/^admin:contest:others$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    await ctx.answerCbQuery();
    await adminHandlers.handleContestOthers(ctx);
});

bot.action(/^admin:event:create_cancel$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    await ctx.answerCbQuery();
    await adminHandlers.handleEventCreateCancel(ctx);
});

bot.action(/^admin:contest:create_cancel$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    await ctx.answerCbQuery();
    await adminHandlers.handleContestCreateCancel(ctx);
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

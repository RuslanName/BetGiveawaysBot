import { schedule } from 'node-cron';
import { Telegraf } from 'telegraf';
import { ENV } from '../config/constants.js';
import { BetEventService } from '../services/bet-event.service.js';
import { GiveawayService } from '../services/giveaway.service.js';

let botInstance: Telegraf | null = null;

export const initCron = (bot: Telegraf) => {
    botInstance = bot;
    
    const betEventService = new BetEventService();
    const giveawayService = new GiveawayService();

    schedule('*/1 * * * *', async () => {
        if (!botInstance) return;

        try {
            const finishedEvents = await betEventService.findFinishedEvents();
            for (const event of finishedEvents) {
                const adminIds = ENV.ADMIN_CHAT_IDS.split(',').map(id => parseInt(id.trim()));
                for (const adminId of adminIds) {
                    await betEventService.sendResultsToAdmin(event.id, adminId, botInstance);
                }
            }

            const finishedGiveaways = await giveawayService.findFinishedGiveaways();
            for (const giveaway of finishedGiveaways) {
                await giveawayService.processFinishedGiveaway(giveaway.id, botInstance);
            }
        } catch (error) {
            console.error('Error in cron job:', error);
        }
    });
};

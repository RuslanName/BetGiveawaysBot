import { schedule } from 'node-cron';
import { Telegraf } from 'telegraf';
import { ENV } from '../config/constants.js';
import { BetEventService } from '../services/bet-event.service.js';
import { ContestService } from '../services/contest.service.js';

let botInstance: Telegraf | null = null;

export const initCron = (bot: Telegraf) => {
    botInstance = bot;
    
    const betEventService = new BetEventService();
    const contestService = new ContestService();

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

            const finishedContests = await contestService.findFinishedContests();
            for (const contest of finishedContests) {
                await contestService.processFinishedContest(contest.id);
            }
        } catch (error) {
            console.error('Error in cron job:', error);
        }
    });
};

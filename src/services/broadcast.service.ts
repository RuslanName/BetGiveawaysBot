import { BroadcastRepository } from '../repositories/broadcast.repository.js';
import { AppDataSource } from '../config/db.js';
import { Broadcast, User } from '../entities/index.js';
import { Telegraf } from 'telegraf';

export class BroadcastService {
    private broadcastRepo = new BroadcastRepository();

    async createBroadcast(caption: string | null, fileId: string | null, url: string | null, buttonText: string | null, bot: Telegraf): Promise<Broadcast> {
        const broadcast = await this.broadcastRepo.create({
            caption,
            file_id: fileId,
            url,
            button_text: buttonText,
            status: 'sending'
        });

        await this.sendBroadcast(broadcast.id, bot);
        return broadcast;
    }

    async sendBroadcast(broadcastId: number, bot: Telegraf): Promise<void> {
        const broadcast = await this.broadcastRepo.findById(broadcastId);
        if (!broadcast) {
            throw new Error('Broadcast not found');
        }

        const userRepository = AppDataSource.getRepository(User);
        const users = await userRepository.find({ select: ['chat_id'] });
        
        let successCount = 0;
        let failCount = 0;

        const replyMarkup = broadcast.url ? {
            inline_keyboard: [[{ text: broadcast.button_text || 'Открыть ссылку', url: broadcast.url }]]
        } : undefined;

        for (const user of users) {
            try {
                if (broadcast.file_id) {
                    await bot.telegram.sendPhoto(user.chat_id, broadcast.file_id, {
                        caption: broadcast.caption || undefined,
                        reply_markup: replyMarkup
                    });
                } else if (broadcast.caption || broadcast.url) {
                    await bot.telegram.sendMessage(user.chat_id, broadcast.caption || '', {
                        reply_markup: replyMarkup
                    });
                }
                successCount++;
                
                if (successCount % 30 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                failCount++;
                console.error(`Failed to send broadcast to user ${user.chat_id}:`, error);
            }
        }

        await this.broadcastRepo.update(broadcastId, { status: 'sent' });
    }
}


import { ENV } from '../config/constants.js';

export const isAdmin = (chatId: number): boolean => {
    const adminIds = ENV.ADMIN_CHAT_IDS.split(',').map(id => parseInt(id.trim()));
    return adminIds.includes(chatId);
};


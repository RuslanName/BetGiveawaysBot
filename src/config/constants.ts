import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
    MODE: process.env.MODE || 'dev',
    BOT_TOKEN: process.env.BOT_TOKEN!,
    DB_HOST: process.env.DB_HOST!,
    DB_PORT: Number(process.env.DB_PORT!),
    DB_USER: process.env.DB_USER!,
    DB_PASSWORD: process.env.DB_PASSWORD!,
    DB_NAME: process.env.DB_NAME!,
    DB_SCHEMA: process.env.DB_SCHEMA ?? 'public',
    ADMIN_CHAT_IDS: process.env.ADMIN_CHAT_IDS!,
    CHANNEL_CHAT_ID: process.env.CHANNEL_CHAT_ID!,
    CHANNEL_URL: process.env.CHANNEL_URL!
};


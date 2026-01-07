import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User, BetEvent, UserBet, Broadcast, Giveaway, GiveawayWinners } from '../entities/index.js';
import { ENV } from './constants.js';

const isDev = ENV.MODE === 'dev';

export const AppDataSource = new DataSource({
    type: 'postgres',
    host: ENV.DB_HOST,
    port: 5432,
    username: ENV.DB_USERNAME,
    password: ENV.DB_PASSWORD,
    database: ENV.DB_NAME,
    schema: ENV.DB_SCHEMA,
    entities: [User, BetEvent, UserBet, Broadcast, Giveaway, GiveawayWinners],
    synchronize: isDev,
    logging: isDev,
});

export const initializeDatabase = async (retries = 5, delay = 5000) => {
    for (let i = 0; i < retries; i++) {
        try {
            await AppDataSource.initialize();
            return;
        } catch (error) {
            console.error(`Error connecting to database (attempt ${i + 1}/${retries}):`, error);
            if (i < retries - 1) {
                console.log(`Retrying in ${delay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }
};


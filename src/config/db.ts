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

export const initializeDatabase = async () => {
    try {
        await AppDataSource.initialize();
    } catch (error) {
        console.error('Error connecting to database:', error);
        throw error;
    }
};


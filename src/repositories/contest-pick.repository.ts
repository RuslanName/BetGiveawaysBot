import {Repository} from 'typeorm';
import {AppDataSource} from '../config/db.js';
import {ContestPick} from '../entities/index.js';

export class ContestPickRepository {
    private repository: Repository<ContestPick>;

    constructor() {
        this.repository = AppDataSource.getRepository(ContestPick);
    }

    async findByUserIdAndContestId(userId: number, contestId: number): Promise<ContestPick | null> {
        return this.repository.findOne({
            where: { user_id: userId, contest_id: contestId }
        });
    }

    async create(pick: Partial<ContestPick>): Promise<ContestPick> {
        const newPick = this.repository.create(pick);
        return this.repository.save(newPick);
    }

    async getTopUsers(limit: number = 20): Promise<Array<{ user_id: number; points: number; user: any }>> {
        const { Contest } = await import('../entities/index.js');
        const contestRepo = AppDataSource.getRepository(Contest);
        const contests = await contestRepo.find({
            where: { status: 'match_finished' },
            select: ['id']
        });

        const contestIdArray = contests.map(c => c.id);

        if (contestIdArray.length === 0) {
            return [];
        }

        const results = await this.repository
            .createQueryBuilder('pick')
            .leftJoin('pick.user', 'user')
            .leftJoin('pick.contest', 'contest')
            .select('pick.user_id', 'user_id')
            .addSelect('user.id', 'user_id')
            .addSelect('user.username', 'username')
            .addSelect('user.first_name', 'first_name')
            .addSelect('user.last_name', 'last_name')
            .addSelect('user.betboom_id', 'betboom_id')
            .addSelect('COUNT(CASE WHEN pick.picked_outcome = contest.picked_outcome THEN 1 END)', 'points')
            .where('pick.contest_id IN (:...contestIds)', { contestIds: contestIdArray })
            .andWhere('contest.picked_outcome IS NOT NULL')
            .groupBy('pick.user_id')
            .addGroupBy('user.id')
            .addGroupBy('user.username')
            .addGroupBy('user.first_name')
            .addGroupBy('user.last_name')
            .addGroupBy('user.betboom_id')
            .orderBy('points', 'DESC')
            .limit(limit)
            .getRawMany();

        return results.map((row: any) => ({
            user_id: row.user_id || row.pick_user_id,
            points: parseInt(row.points) || 0,
            user: {
                id: row.user_id || row.pick_user_id,
                username: row.username,
                first_name: row.first_name,
                last_name: row.last_name,
                betboom_id: row.betboom_id
            }
        }));
    }

    async getUserRank(userId: number): Promise<number> {
        const { Contest } = await import('../entities/index.js');
        const contestRepo = AppDataSource.getRepository(Contest);
        const contests = await contestRepo.find({
            where: { status: 'match_finished' },
            select: ['id']
        });

        const contestIdArray = contests.map(c => c.id);

        if (contestIdArray.length === 0) {
            return 0;
        }

        const userPoints = await this.repository
            .createQueryBuilder('pick')
            .leftJoin('pick.contest', 'contest')
            .where('pick.user_id = :userId', { userId })
            .andWhere('pick.contest_id IN (:...contestIds)', { contestIds: contestIdArray })
            .andWhere('contest.picked_outcome IS NOT NULL')
            .andWhere('pick.picked_outcome = contest.picked_outcome')
            .getCount();

        const usersWithMorePoints = await this.repository
            .createQueryBuilder('pick')
            .leftJoin('pick.contest', 'contest')
            .select('pick.user_id', 'user_id')
            .addSelect('COUNT(CASE WHEN pick.picked_outcome = contest.picked_outcome THEN 1 END)', 'points')
            .where('pick.contest_id IN (:...contestIds)', { contestIds: contestIdArray })
            .andWhere('contest.picked_outcome IS NOT NULL')
            .groupBy('pick.user_id')
            .having('COUNT(CASE WHEN pick.picked_outcome = contest.picked_outcome THEN 1 END) > :userPoints', { userPoints })
            .getRawMany();

        return usersWithMorePoints.length + 1;
    }

    async getUserPoints(userId: number): Promise<number> {
        const { Contest } = await import('../entities/index.js');
        const contestRepo = AppDataSource.getRepository(Contest);
        const contests = await contestRepo.find({
            where: { status: 'match_finished' },
            select: ['id']
        });

        const contestIdArray = contests.map(c => c.id);

        if (contestIdArray.length === 0) {
            return 0;
        }

        return await this.repository
            .createQueryBuilder('pick')
            .leftJoin('pick.contest', 'contest')
            .where('pick.user_id = :userId', {userId})
            .andWhere('pick.contest_id IN (:...contestIds)', {contestIds: contestIdArray})
            .andWhere('contest.picked_outcome IS NOT NULL')
            .andWhere('pick.picked_outcome = contest.picked_outcome')
            .getCount();
    }

    async getTotalParticipantsCount(): Promise<number> {
        const { Contest } = await import('../entities/index.js');
        const contestRepo = AppDataSource.getRepository(Contest);
        const contests = await contestRepo.find({
            where: [
                { status: 'active' },
                { status: 'match_finished' }
            ],
            select: ['id']
        });

        const contestIdArray = contests.map(c => c.id);

        if (contestIdArray.length === 0) {
            return 0;
        }

        const result = await this.repository
            .createQueryBuilder('pick')
            .select('COUNT(DISTINCT pick.user_id)', 'count')
            .where('pick.contest_id IN (:...contestIds)', { contestIds: contestIdArray })
            .getRawOne();

        return parseInt(result?.count || '0', 10);
    }
}


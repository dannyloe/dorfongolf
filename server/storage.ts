import { db } from "./db";
import { 
  matches, players, scores, users,
  type InsertMatch, type Match, type Player, type Score, type InsertScore, type InsertPlayer
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";

export interface IStorage {
  // Auth methods
  getUser(id: string): Promise<typeof users.$inferSelect | undefined>;
  upsertUser(user: typeof users.$inferInsert): Promise<typeof users.$inferSelect>;

  // App methods
  createMatch(match: InsertMatch): Promise<Match>;
  getMatches(): Promise<Match[]>;
  getMatch(id: number): Promise<Match | undefined>;
  getMatchPlayers(matchId: number): Promise<Player[]>;
  addPlayer(player: InsertPlayer): Promise<Player>;
  getMatchScores(matchId: number): Promise<Score[]>;
  submitScore(score: InsertScore): Promise<Score>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    return authStorage.getUser(id);
  }
  async upsertUser(user: typeof users.$inferInsert) {
    return authStorage.upsertUser(user);
  }

  async createMatch(match: InsertMatch): Promise<Match> {
    const [newMatch] = await db.insert(matches).values(match).returning();
    return newMatch;
  }

  async getMatches(): Promise<Match[]> {
    return db.select().from(matches).orderBy(matches.createdAt);
  }

  async getMatch(id: number): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    return match;
  }

  async getMatchPlayers(matchId: number): Promise<Player[]> {
    return db.select().from(players).where(eq(players.matchId, matchId));
  }

  async addPlayer(player: InsertPlayer): Promise<Player> {
    const [newPlayer] = await db.insert(players).values(player).returning();
    return newPlayer;
  }

  async getMatchScores(matchId: number): Promise<Score[]> {
    return db.select().from(scores).where(eq(scores.matchId, matchId));
  }

  async submitScore(score: InsertScore): Promise<Score> {
    const [existing] = await db.select().from(scores)
      .where(and(
        eq(scores.matchId, score.matchId),
        eq(scores.playerId, score.playerId),
        eq(scores.holeNumber, score.holeNumber)
      ));

    if (existing) {
      const [updated] = await db.update(scores)
        .set({ strokes: score.strokes })
        .where(eq(scores.id, existing.id))
        .returning();
      return updated;
    }

    const [newScore] = await db.insert(scores).values(score).returning();
    return newScore;
  }
}

export const storage = new DatabaseStorage();

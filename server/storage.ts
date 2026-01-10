import { db } from "./db";
import { 
  matches, participants, scores, users,
  type InsertMatch, type Match, type Participant, type Score, type InsertScore
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";

export interface IStorage {
  // Auth methods required by Replit Auth integration
  getUser(id: string): Promise<typeof users.$inferSelect | undefined>;
  upsertUser(user: typeof users.$inferInsert): Promise<typeof users.$inferSelect>;

  // App methods
  createMatch(match: InsertMatch): Promise<Match>;
  getMatches(): Promise<Match[]>;
  getMatch(id: number): Promise<Match | undefined>;
  getMatchParticipants(matchId: number): Promise<Participant[]>;
  joinMatch(matchId: number, userId: string): Promise<Participant>;
  getMatchScores(matchId: number): Promise<Score[]>;
  submitScore(score: InsertScore): Promise<Score>;
}

export class DatabaseStorage implements IStorage {
  // Auth methods delegating to authStorage
  async getUser(id: string) {
    return authStorage.getUser(id);
  }
  async upsertUser(user: typeof users.$inferInsert) {
    return authStorage.upsertUser(user);
  }

  // App methods
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

  async getMatchParticipants(matchId: number): Promise<Participant[]> {
    return db.select().from(participants).where(eq(participants.matchId, matchId));
  }

  async joinMatch(matchId: number, userId: string): Promise<Participant> {
    // Check if already joined
    const [existing] = await db.select().from(participants)
      .where(and(eq(participants.matchId, matchId), eq(participants.userId, userId)));
    
    if (existing) return existing;

    const [participant] = await db.insert(participants)
      .values({ matchId, userId })
      .returning();
    return participant;
  }

  async getMatchScores(matchId: number): Promise<Score[]> {
    return db.select().from(scores).where(eq(scores.matchId, matchId));
  }

  async submitScore(score: InsertScore): Promise<Score> {
    // Check if score exists for this hole/user/match
    const [existing] = await db.select().from(scores)
      .where(and(
        eq(scores.matchId, score.matchId),
        eq(scores.userId, score.userId),
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

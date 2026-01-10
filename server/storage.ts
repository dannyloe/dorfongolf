import { db } from "./db";
import { 
  matches, players, scores, users, eventMatches, teams, teamMembers,
  type InsertMatch, type Match, type Player, type Score, type InsertScore, type InsertPlayer,
  type EventMatch, type Team, type TeamMember, type CreateEventMatchRequest
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";

export interface IStorage {
  // Auth methods
  getUser(id: string): Promise<typeof users.$inferSelect | undefined>;
  upsertUser(user: typeof users.$inferInsert): Promise<typeof users.$inferSelect>;

  // App methods
  createMatch(match: { name: string; courseName: string; creatorId: string }): Promise<Match>;
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

  async createMatch(match: { name: string; courseName: string; creatorId: string }): Promise<Match> {
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

  async deleteMatch(matchId: number): Promise<void> {
    // Delete event match data first
    const eventMatchesList = await db.select().from(eventMatches).where(eq(eventMatches.eventId, matchId));
    for (const em of eventMatchesList) {
      const teamsList = await db.select().from(teams).where(eq(teams.eventMatchId, em.id));
      for (const team of teamsList) {
        await db.delete(teamMembers).where(eq(teamMembers.teamId, team.id));
      }
      await db.delete(teams).where(eq(teams.eventMatchId, em.id));
    }
    await db.delete(eventMatches).where(eq(eventMatches.eventId, matchId));
    // Delete scores
    await db.delete(scores).where(eq(scores.matchId, matchId));
    // Delete players
    await db.delete(players).where(eq(players.matchId, matchId));
    // Delete match
    await db.delete(matches).where(eq(matches.id, matchId));
  }

  async getEventMatches(eventId: number): Promise<EventMatch[]> {
    return db.select().from(eventMatches).where(eq(eventMatches.eventId, eventId));
  }

  async getEventMatchWithTeams(eventMatchId: number) {
    const [eventMatch] = await db.select().from(eventMatches).where(eq(eventMatches.id, eventMatchId));
    if (!eventMatch) return undefined;

    const teamsList = await db.select().from(teams).where(eq(teams.eventMatchId, eventMatchId));
    const teamsWithMembers = await Promise.all(
      teamsList.map(async (team) => {
        const members = await db.select().from(teamMembers).where(eq(teamMembers.teamId, team.id));
        const membersWithPlayers = await Promise.all(
          members.map(async (member) => {
            const [player] = await db.select().from(players).where(eq(players.id, member.playerId));
            return { ...member, player };
          })
        );
        return { ...team, members: membersWithPlayers };
      })
    );

    return { ...eventMatch, teams: teamsWithMembers };
  }

  async createEventMatch(eventId: number, data: CreateEventMatchRequest): Promise<EventMatch> {
    const [newEventMatch] = await db.insert(eventMatches).values({
      eventId,
      name: data.name,
      matchType: data.matchType,
      unitAmount: data.unitAmount || 0,
      autoPressOriginal: data.autoPressOriginal ?? true,
      autoPressAllPresses: data.autoPressAllPresses ?? false,
    }).returning();

    // Create Team A
    const [teamA] = await db.insert(teams).values({
      eventMatchId: newEventMatch.id,
      name: data.teamA.name,
    }).returning();

    for (const playerId of data.teamA.playerIds) {
      await db.insert(teamMembers).values({ teamId: teamA.id, playerId });
    }

    // Create Team B
    const [teamB] = await db.insert(teams).values({
      eventMatchId: newEventMatch.id,
      name: data.teamB.name,
    }).returning();

    for (const playerId of data.teamB.playerIds) {
      await db.insert(teamMembers).values({ teamId: teamB.id, playerId });
    }

    return newEventMatch;
  }

  async deleteEventMatch(eventMatchId: number): Promise<void> {
    const teamsList = await db.select().from(teams).where(eq(teams.eventMatchId, eventMatchId));
    for (const team of teamsList) {
      await db.delete(teamMembers).where(eq(teamMembers.teamId, team.id));
    }
    await db.delete(teams).where(eq(teams.eventMatchId, eventMatchId));
    await db.delete(eventMatches).where(eq(eventMatches.id, eventMatchId));
  }

  async updateEventMatchAutoPress(eventMatchId: number, data: { autoPressOriginal?: boolean; autoPressAllPresses?: boolean }): Promise<EventMatch> {
    const [updated] = await db.update(eventMatches)
      .set(data)
      .where(eq(eventMatches.id, eventMatchId))
      .returning();
    return updated;
  }

  async createPressMatch(parentMatchId: number, startHole: number): Promise<EventMatch> {
    const parentMatch = await this.getEventMatchWithTeams(parentMatchId);
    if (!parentMatch) throw new Error("Parent match not found");

    const [newPressMatch] = await db.insert(eventMatches).values({
      eventId: parentMatch.eventId,
      name: `Press from ${startHole}`,
      matchType: parentMatch.matchType,
      unitAmount: parentMatch.unitAmount,
      parentMatchId: parentMatchId,
      startHole: startHole,
      autoPressOriginal: parentMatch.autoPressOriginal,
      autoPressAllPresses: false,
    }).returning();

    // Copy teams from parent match
    for (const parentTeam of parentMatch.teams) {
      const [newTeam] = await db.insert(teams).values({
        eventMatchId: newPressMatch.id,
        name: parentTeam.name,
      }).returning();

      for (const member of parentTeam.members) {
        await db.insert(teamMembers).values({ teamId: newTeam.id, playerId: member.playerId });
      }
    }

    return newPressMatch;
  }

  async getPresetPlayersClaimed(): Promise<{ presetPlayerName: string; userId: string; userName: string }[]> {
    const usersWithPreset = await db.select().from(users);
    return usersWithPreset
      .filter(u => u.presetPlayerName)
      .map(u => ({
        presetPlayerName: u.presetPlayerName!,
        userId: u.id,
        userName: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Unknown',
      }));
  }

  async claimPresetPlayer(userId: string, presetPlayerName: string | null): Promise<typeof users.$inferSelect> {
    if (presetPlayerName) {
      // Check if already claimed by someone else
      const [existingClaim] = await db.select().from(users)
        .where(eq(users.presetPlayerName, presetPlayerName));
      if (existingClaim && existingClaim.id !== userId) {
        throw new Error(`${presetPlayerName} is already claimed by another user`);
      }
    }

    const [updated] = await db.update(users)
      .set({ presetPlayerName })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();

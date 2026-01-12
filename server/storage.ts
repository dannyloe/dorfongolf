import { db } from "./db";
import { 
  matches, players, scores, users, eventMatches, teams, teamMembers, courses, courseHoles, playerHandicaps, courseTees,
  type InsertMatch, type Match, type Player, type Score, type InsertScore, type InsertPlayer,
  type EventMatch, type Team, type TeamMember, type CreateEventMatchRequest,
  type Course, type CourseHole, type InsertCourse, type InsertCourseHole,
  type PlayerHandicap, type InsertPlayerHandicap,
  type CourseTee, type InsertCourseTee
} from "@shared/schema";
import { eq, and, lt } from "drizzle-orm";
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
    // Auto-complete events older than 7 days
    await this.autoCompleteOldMatches();
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
    // Copy default handicap from player_handicaps if available
    let handicapIndex: number | null = null;
    if (player.name) {
      const defaultHandicap = await this.getPlayerHandicap(player.name);
      if (defaultHandicap?.handicapIndex !== undefined) {
        handicapIndex = defaultHandicap.handicapIndex;
      }
    }
    
    const [newPlayer] = await db.insert(players).values({
      ...player,
      handicapIndex,
    }).returning();
    return newPlayer;
  }

  async updatePlayerHandicapIndex(playerId: number, handicapIndex: number | null): Promise<Player> {
    const [updated] = await db.update(players)
      .set({ handicapIndex })
      .where(eq(players.id, playerId))
      .returning();
    return updated;
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

  async updateMatchStatus(matchId: number, completed: boolean): Promise<Match> {
    const [updated] = await db.update(matches)
      .set({ completed })
      .where(eq(matches.id, matchId))
      .returning();
    return updated;
  }

  async autoCompleteOldMatches(): Promise<void> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    await db.update(matches)
      .set({ completed: true })
      .where(and(
        eq(matches.completed, false),
        lt(matches.createdAt, sevenDaysAgo)
      ));
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

  async getEventMatch(eventMatchId: number): Promise<EventMatch | undefined> {
    const [eventMatch] = await db.select().from(eventMatches).where(eq(eventMatches.id, eventMatchId));
    return eventMatch;
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
      autoPressNassauFront9: data.autoPressNassauFront9 ?? true,
      autoPressNassauBack9: data.autoPressNassauBack9 ?? true,
      autoPressNassauOverall: data.autoPressNassauOverall ?? true,
      useNetScoring: data.useNetScoring ?? false,
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

  async updateEventMatchAutoPress(eventMatchId: number, data: { 
    autoPressOriginal?: boolean; 
    autoPressAllPresses?: boolean;
    autoPressNassauFront9?: boolean;
    autoPressNassauBack9?: boolean;
    autoPressNassauOverall?: boolean;
  }): Promise<EventMatch> {
    const [updated] = await db.update(eventMatches)
      .set(data)
      .where(eq(eventMatches.id, eventMatchId))
      .returning();
    return updated;
  }

  async updateEventMatchNetScoring(eventMatchId: number, useNetScoring: boolean): Promise<EventMatch> {
    const [updated] = await db.update(eventMatches)
      .set({ useNetScoring })
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

  async getLedgerData(startDate?: Date, endDate?: Date) {
    // Get all matches (optionally filtered by date)
    let allMatches = await db.select().from(matches).orderBy(matches.createdAt);
    
    if (startDate) {
      allMatches = allMatches.filter(m => m.createdAt && new Date(m.createdAt) >= startDate);
    }
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      allMatches = allMatches.filter(m => m.createdAt && new Date(m.createdAt) <= endOfDay);
    }

    // Get all event matches with teams for these matches
    const allEventMatches: any[] = [];
    const allScores: Score[] = [];

    for (const match of allMatches) {
      const eventMatchesList = await this.getEventMatches(match.id);
      for (const em of eventMatchesList) {
        const withTeams = await this.getEventMatchWithTeams(em.id);
        if (withTeams) {
          allEventMatches.push(withTeams);
        }
      }
      const matchScores = await this.getMatchScores(match.id);
      allScores.push(...matchScores);
    }

    return {
      matches: allMatches,
      eventMatches: allEventMatches,
      scores: allScores,
    };
  }

  // Course methods
  async getCourses(): Promise<Course[]> {
    return db.select().from(courses).orderBy(courses.name);
  }

  async getCourse(id: number): Promise<Course | undefined> {
    const [course] = await db.select().from(courses).where(eq(courses.id, id));
    return course;
  }

  async getCourseByName(name: string): Promise<Course | undefined> {
    const [course] = await db.select().from(courses).where(eq(courses.name, name));
    return course;
  }

  async getCourseHoles(courseId: number): Promise<CourseHole[]> {
    return db.select().from(courseHoles)
      .where(eq(courseHoles.courseId, courseId))
      .orderBy(courseHoles.holeNumber);
  }

  async createCourse(course: InsertCourse): Promise<Course> {
    const [newCourse] = await db.insert(courses).values(course).returning();
    return newCourse;
  }

  async createCourseHole(hole: InsertCourseHole): Promise<CourseHole> {
    const [newHole] = await db.insert(courseHoles).values(hole).returning();
    return newHole;
  }

  async seedCourseIfNotExists(courseName: string, pars: number[]): Promise<Course> {
    let course = await this.getCourseByName(courseName);
    if (!course) {
      course = await this.createCourse({ name: courseName });
      for (let i = 0; i < 18; i++) {
        await this.createCourseHole({
          courseId: course.id,
          holeNumber: i + 1,
          par: pars[i] || 4,
        });
      }
    }
    return course;
  }

  async getCourseTees(courseId: number): Promise<CourseTee[]> {
    return db.select().from(courseTees).where(eq(courseTees.courseId, courseId));
  }

  async createCourseTee(tee: InsertCourseTee): Promise<CourseTee> {
    const [newTee] = await db.insert(courseTees).values(tee).returning();
    return newTee;
  }

  async seedCourseTeesIfNotExist(courseId: number, tees: { name: string; slopeRating: number; courseRating: number; color?: string }[]): Promise<void> {
    const existingTees = await this.getCourseTees(courseId);
    if (existingTees.length === 0) {
      for (const tee of tees) {
        await this.createCourseTee({
          courseId,
          name: tee.name,
          slopeRating: tee.slopeRating,
          courseRating: tee.courseRating,
          color: tee.color || null,
        });
      }
    }
  }

  async updatePlayerTee(playerId: number, teeId: number | null): Promise<Player> {
    const [updated] = await db.update(players)
      .set({ teeId })
      .where(eq(players.id, playerId))
      .returning();
    return updated;
  }

  async updateCourseTee(courseId: number, teeId: number, data: { name?: string; slopeRating?: number; courseRating?: number; color?: string | null }): Promise<CourseTee | undefined> {
    const [updated] = await db.update(courseTees)
      .set(data)
      .where(and(eq(courseTees.id, teeId), eq(courseTees.courseId, courseId)))
      .returning();
    return updated;
  }

  async deleteCourseTee(courseId: number, teeId: number): Promise<boolean> {
    const result = await db.delete(courseTees).where(and(eq(courseTees.id, teeId), eq(courseTees.courseId, courseId))).returning();
    return result.length > 0;
  }

  async updateCourse(id: number, data: { name?: string }): Promise<Course | undefined> {
    const [updated] = await db.update(courses)
      .set(data)
      .where(eq(courses.id, id))
      .returning();
    return updated;
  }

  async updateCourseHole(courseId: number, holeNumber: number, data: { par?: number; handicap?: number | null }): Promise<CourseHole | undefined> {
    const [updated] = await db.update(courseHoles)
      .set(data)
      .where(and(
        eq(courseHoles.courseId, courseId),
        eq(courseHoles.holeNumber, holeNumber)
      ))
      .returning();
    return updated;
  }

  async deleteCourse(id: number): Promise<void> {
    await db.delete(courseHoles).where(eq(courseHoles.courseId, id));
    await db.delete(courses).where(eq(courses.id, id));
  }

  async createFullCourse(name: string, holes: { holeNumber: number; par: number; handicap?: number | null }[]): Promise<Course> {
    const course = await this.createCourse({ name });
    for (const hole of holes) {
      await db.insert(courseHoles).values({
        courseId: course.id,
        holeNumber: hole.holeNumber,
        par: hole.par,
        handicap: hole.handicap ?? null,
      });
    }
    return course;
  }

  async updateCourseRatings(courseId: number, slopeRating: number | null, courseRating: number | null): Promise<Course | undefined> {
    const [updated] = await db.update(courses)
      .set({ slopeRating, courseRating })
      .where(eq(courses.id, courseId))
      .returning();
    return updated;
  }

  // Player Handicap methods
  async getPlayerHandicaps(): Promise<PlayerHandicap[]> {
    return db.select().from(playerHandicaps).orderBy(playerHandicaps.presetPlayerName);
  }

  async getPlayerHandicap(presetPlayerName: string): Promise<PlayerHandicap | undefined> {
    const [handicap] = await db.select().from(playerHandicaps)
      .where(eq(playerHandicaps.presetPlayerName, presetPlayerName));
    return handicap;
  }

  async upsertPlayerHandicap(data: InsertPlayerHandicap): Promise<PlayerHandicap> {
    const existing = await this.getPlayerHandicap(data.presetPlayerName);
    if (existing) {
      const updateData: Partial<{ handicapIndex: number | null; defaultTeeId: number | null; updatedAt: Date }> = { updatedAt: new Date() };
      if (data.handicapIndex !== undefined) updateData.handicapIndex = data.handicapIndex;
      if (data.defaultTeeId !== undefined) updateData.defaultTeeId = data.defaultTeeId;
      const [updated] = await db.update(playerHandicaps)
        .set(updateData)
        .where(eq(playerHandicaps.presetPlayerName, data.presetPlayerName))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(playerHandicaps).values(data).returning();
    return inserted;
  }

  async getFullPlayerData(): Promise<{
    players: {
      name: string;
      handicapIndex: number | null;
      defaultTeeId: number | null;
      defaultTeeName: string | null;
      aliases: string[];
      claimedByUserId: string | null;
      claimedByName: string | null;
      isAdmin: boolean | null;
    }[];
    availableTees: {
      id: number;
      courseId: number;
      name: string;
      color: string | null;
      slopeRating: number | null;
      courseRating: number | null;
      courseName: string;
    }[];
  }> {
    const { PRESET_PLAYERS, PLAYER_ALIASES } = await import("@shared/models/auth");
    const allHandicaps = await this.getPlayerHandicaps();
    const handicapMap = new Map(allHandicaps.map(h => [h.presetPlayerName, h]));
    const claimedList = await this.getPresetPlayersClaimed();
    const claimedMap = new Map(claimedList.map(c => [c.presetPlayerName, c]));
    
    // Get all users to fetch isAdmin status
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    
    // Build reverse alias map
    const aliasesMap: Record<string, string[]> = {};
    for (const [alias, canonical] of Object.entries(PLAYER_ALIASES)) {
      if (!aliasesMap[canonical]) aliasesMap[canonical] = [];
      aliasesMap[canonical].push(alias);
    }
    
    // Get all tees and courses for default tee name lookup
    const allTees = await db.select().from(courseTees);
    const allCourses = await db.select().from(courses);
    const courseMap = new Map(allCourses.map(c => [c.id, c]));
    const teeMap = new Map(allTees.map(t => [t.id, t]));
    
    const playerList = PRESET_PLAYERS.map(name => {
      const handicapData = handicapMap.get(name);
      const claimed = claimedMap.get(name);
      const defaultTee = handicapData?.defaultTeeId ? teeMap.get(handicapData.defaultTeeId) : null;
      const linkedUser = claimed?.userId ? userMap.get(claimed.userId) : null;
      
      return {
        name,
        handicapIndex: handicapData?.handicapIndex ?? null,
        defaultTeeId: handicapData?.defaultTeeId ?? null,
        defaultTeeName: defaultTee?.name ?? null,
        aliases: aliasesMap[name] || [],
        claimedByUserId: claimed?.userId ?? null,
        claimedByName: claimed?.userName ?? null,
        isAdmin: linkedUser?.isAdmin ?? null,
      };
    });
    
    const availableTees = allTees.map(tee => ({
      id: tee.id,
      courseId: tee.courseId,
      name: tee.name,
      color: tee.color,
      slopeRating: tee.slopeRating,
      courseRating: tee.courseRating,
      courseName: courseMap.get(tee.courseId)?.name ?? "Unknown",
    }));
    
    return { players: playerList, availableTees };
  }

  async setUserAdmin(userId: string, isAdmin: boolean): Promise<{ userId: string; isAdmin: boolean } | null> {
    const [updated] = await db.update(users)
      .set({ isAdmin })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) return null;
    return { userId: updated.id, isAdmin: updated.isAdmin ?? false };
  }

  async isUserAdmin(userId: string): Promise<boolean> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user?.isAdmin ?? false;
  }

  async getTeeById(teeId: number): Promise<CourseTee | undefined> {
    const [tee] = await db.select().from(courseTees).where(eq(courseTees.id, teeId));
    return tee;
  }

  async deletePlayerHandicap(presetPlayerName: string): Promise<void> {
    await db.delete(playerHandicaps).where(eq(playerHandicaps.presetPlayerName, presetPlayerName));
  }

  async updateMatchHandicapped(matchId: number, isHandicapped: boolean): Promise<Match> {
    const [updated] = await db.update(matches)
      .set({ isHandicapped })
      .where(eq(matches.id, matchId))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();

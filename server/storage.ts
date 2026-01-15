import { db } from "./db";
import { 
  matches, players, scores, users, eventMatches, teams, teamMembers, courses, courseHoles, playerHandicaps, courseTees, matchPlayerHandicaps, playerCourseDefaults, groups, presetPlayers, playerAliases, matchRoles,
  verificationCodes, notificationPreferences, messages,
  ryderCupEvents, ryderCupTeams, ryderCupTeamMembers, ryderCupDays, ryderCupPairings, ryderCupPairingSides, ryderCupPairingResults, ryderCupSkins,
  type InsertMatch, type Match, type Player, type Score, type InsertScore, type InsertPlayer,
  type EventMatch, type Team, type TeamMember, type CreateEventMatchRequest,
  type Course, type CourseHole, type InsertCourse, type InsertCourseHole,
  type PlayerHandicap, type InsertPlayerHandicap,
  type CourseTee, type InsertCourseTee,
  type MatchPlayerHandicap, type InsertMatchPlayerHandicap,
  type PlayerCourseDefault, type InsertPlayerCourseDefault,
  type Group, type InsertGroup,
  type PresetPlayer, type InsertPresetPlayer,
  type PlayerAlias, type InsertPlayerAlias,
  type MatchRole, type InsertMatchRole,
  type VerificationCode, type NotificationPreferences, type Message,
  type RyderCupEvent, type RyderCupTeam, type RyderCupTeamMember, type RyderCupDay, 
  type RyderCupPairing, type RyderCupPairingSide, type RyderCupPairingResult, type RyderCupSkin,
  type CreateRyderCupEventRequest, type RyderCupEventResponse, type AddSideMatchRequest, type RecordPairingResultRequest
} from "@shared/schema";
import { eq, and, lt, inArray, or, isNull, desc, gte } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";

export interface IStorage {
  // Auth methods
  getUser(id: string): Promise<typeof users.$inferSelect | undefined>;
  upsertUser(user: typeof users.$inferInsert): Promise<typeof users.$inferSelect>;
  claimPresetPlayer(userId: string, presetPlayerName: string | null): Promise<typeof users.$inferSelect>;
  claimPresetPlayerWithName(userId: string, presetPlayerName: string, firstName: string, lastName: string): Promise<typeof users.$inferSelect>;
  updateUserProfile(userId: string, data: { firstName?: string; lastName?: string; email?: string; phone?: string; phoneVerified?: boolean }): Promise<typeof users.$inferSelect>;

  // App methods
  createMatch(match: { name: string | null; courseName: string; creatorId: string; groupId?: number | null; ryderCupEventId?: number | null; ryderCupDayNumber?: number | null; courseId?: number | null; isHandicapped?: boolean }): Promise<Match>;
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

  async createMatch(match: { name: string | null; courseName: string; creatorId: string; groupId?: number | null; ryderCupEventId?: number | null; ryderCupDayNumber?: number | null; courseId?: number | null; isHandicapped?: boolean }): Promise<Match> {
    // Look up courseId from courseName if not already provided
    let courseId: number | null = match.courseId ?? null;
    if (!courseId && match.courseName) {
      const [course] = await db.select().from(courses).where(eq(courses.name, match.courseName));
      if (course) {
        courseId = course.id;
      }
    }
    const [newMatch] = await db.insert(matches).values({ 
      name: match.name,
      courseName: match.courseName,
      creatorId: match.creatorId,
      courseId,
      groupId: match.groupId ?? null,
      ryderCupEventId: match.ryderCupEventId ?? null,
      ryderCupDayNumber: match.ryderCupDayNumber ?? null,
      isHandicapped: match.isHandicapped ?? false,
    }).returning();
    return newMatch;
  }

  async getMatches(): Promise<Match[]> {
    // Auto-complete events older than 7 days
    await this.autoCompleteOldMatches();
    return db.select().from(matches).orderBy(matches.createdAt);
  }

  async getMatchesWithPlayers(): Promise<(Match & { players: Player[] })[]> {
    await this.autoCompleteOldMatches();
    const allMatches = await db.select().from(matches).orderBy(matches.createdAt);
    const allPlayers = await db.select().from(players);
    
    const playersByMatch = new Map<number, Player[]>();
    for (const player of allPlayers) {
      if (!playersByMatch.has(player.matchId)) {
        playersByMatch.set(player.matchId, []);
      }
      playersByMatch.get(player.matchId)!.push(player);
    }
    
    return allMatches.map(match => ({
      ...match,
      players: playersByMatch.get(match.id) || [],
    }));
  }

  async getMatch(id: number): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    return match;
  }

  async getMatchPlayers(matchId: number): Promise<Player[]> {
    return db.select().from(players).where(eq(players.matchId, matchId));
  }

  async addPlayer(player: InsertPlayer, courseId?: number): Promise<Player> {
    // Copy default handicap and tee from player_handicaps if not already provided
    let handicapIndex: number | null = player.handicapIndex ?? null;
    let teeId: number | null = player.teeId ?? null;
    if (player.name) {
      const defaultHandicap = await this.getPlayerHandicap(player.name);
      // Only use defaults if not explicitly provided
      if (handicapIndex === null && defaultHandicap?.handicapIndex !== undefined) {
        handicapIndex = defaultHandicap.handicapIndex;
      }
      // Check for course-specific tee default first, then fall back to general default
      if (teeId === null && courseId) {
        const courseDefault = await this.getPlayerCourseDefaultForCourse(player.name, courseId);
        if (courseDefault?.teeId !== undefined) {
          teeId = courseDefault.teeId;
        }
      }
      if (teeId === null && defaultHandicap?.defaultTeeId !== undefined) {
        teeId = defaultHandicap.defaultTeeId;
      }
    }
    
    const [newPlayer] = await db.insert(players).values({
      ...player,
      handicapIndex,
      teeId,
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

    // Check if using multiple teams (for 5-5-5-3)
    if (data.teams && data.teams.length > 0) {
      // Create all teams from the teams array
      for (const teamData of data.teams) {
        const [team] = await db.insert(teams).values({
          eventMatchId: newEventMatch.id,
          name: teamData.name,
        }).returning();

        for (const playerId of teamData.playerIds) {
          await db.insert(teamMembers).values({ teamId: team.id, playerId });
        }
      }
    } else {
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

  async claimPresetPlayerWithName(userId: string, presetPlayerName: string, firstName: string, lastName: string): Promise<typeof users.$inferSelect> {
    // Check if already claimed by someone else
    const [existingClaim] = await db.select().from(users)
      .where(eq(users.presetPlayerName, presetPlayerName));
    if (existingClaim && existingClaim.id !== userId) {
      throw new Error(`${presetPlayerName} is already claimed by another user`);
    }

    const [updated] = await db.update(users)
      .set({ presetPlayerName, firstName, lastName })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async updateUserProfile(userId: string, data: { firstName?: string; lastName?: string; email?: string; phone?: string; phoneVerified?: boolean }): Promise<typeof users.$inferSelect> {
    const updateData: Partial<typeof users.$inferInsert> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.phoneVerified !== undefined) updateData.phoneVerified = data.phoneVerified;

    const [updated] = await db.update(users)
      .set(updateData)
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
    const courseDataMap: Map<number, { holes: CourseHole[]; tees: CourseTee[] }> = new Map();

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
      
      // Get course data for net scoring
      if (match.courseId && !courseDataMap.has(match.courseId)) {
        const holes = await this.getCourseHoles(match.courseId);
        const tees = await this.getCourseTees(match.courseId);
        courseDataMap.set(match.courseId, { holes, tees });
      }
    }

    // Convert courseDataMap to serializable object
    const courseData: Record<number, { holes: CourseHole[]; tees: CourseTee[] }> = {};
    courseDataMap.forEach((data, courseId) => {
      courseData[courseId] = data;
    });

    return {
      matches: allMatches,
      eventMatches: allEventMatches,
      scores: allScores,
      courseData,
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
      showInRoster: boolean;
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
    
    // Get database-stored preset players
    const dbPresetPlayers = await db.select().from(presetPlayers);
    const dbPlayerNames = dbPresetPlayers.map(p => p.name);
    const dbPresetMap = new Map(dbPresetPlayers.map(p => [p.name, p]));
    
    // Merge hardcoded and database players (no duplicates)
    const allPlayerNames = [...PRESET_PLAYERS, ...dbPlayerNames.filter(n => !PRESET_PLAYERS.includes(n as any))];
    
    // Get all users to fetch isAdmin status
    const allUsers = await db.select().from(users);
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    
    // Build reverse alias map from hardcoded aliases
    const aliasesMap: Record<string, string[]> = {};
    for (const [alias, canonical] of Object.entries(PLAYER_ALIASES)) {
      if (!aliasesMap[canonical]) aliasesMap[canonical] = [];
      aliasesMap[canonical].push(alias);
    }
    
    // Merge database aliases
    const dbAliases = await db.select().from(playerAliases);
    for (const dbAlias of dbAliases) {
      if (!aliasesMap[dbAlias.canonicalName]) aliasesMap[dbAlias.canonicalName] = [];
      // Avoid duplicates
      if (!aliasesMap[dbAlias.canonicalName].includes(dbAlias.alias.toLowerCase())) {
        aliasesMap[dbAlias.canonicalName].push(dbAlias.alias.toLowerCase());
      }
    }
    
    // Get all tees and courses for default tee name lookup
    const allTees = await db.select().from(courseTees);
    const allCourses = await db.select().from(courses);
    const courseMap = new Map(allCourses.map(c => [c.id, c]));
    const teeMap = new Map(allTees.map(t => [t.id, t]));
    
    const playerList = allPlayerNames.map(name => {
      const handicapData = handicapMap.get(name);
      const claimed = claimedMap.get(name);
      const defaultTee = handicapData?.defaultTeeId ? teeMap.get(handicapData.defaultTeeId) : null;
      const linkedUser = claimed?.userId ? userMap.get(claimed.userId) : null;
      const dbPreset = dbPresetMap.get(name);
      // Hardcoded players default to showing in roster, db players use their stored value
      const showInRoster = dbPreset?.showInRoster ?? true;
      
      return {
        name,
        handicapIndex: handicapData?.handicapIndex ?? null,
        defaultTeeId: handicapData?.defaultTeeId ?? null,
        defaultTeeName: defaultTee?.name ?? null,
        aliases: aliasesMap[name] || [],
        claimedByUserId: claimed?.userId ?? null,
        claimedByName: claimed?.userName ?? null,
        isAdmin: linkedUser?.isAdmin ?? null,
        showInRoster,
      };
    });
    
    // Clean up orphaned tees (tees whose course no longer exists) and only include valid tees
    const orphanedTeeIds = allTees.filter(tee => !courseMap.has(tee.courseId)).map(tee => tee.id);
    if (orphanedTeeIds.length > 0) {
      // Delete orphaned tees in the background
      db.delete(courseTees).where(inArray(courseTees.id, orphanedTeeIds)).execute().catch(() => {});
    }
    
    const availableTees = allTees
      .filter(tee => courseMap.has(tee.courseId))
      .map(tee => ({
        id: tee.id,
        courseId: tee.courseId,
        name: tee.name,
        color: tee.color,
        slopeRating: tee.slopeRating,
        courseRating: tee.courseRating,
        courseName: courseMap.get(tee.courseId)!.name,
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

  async updateMatchDetails(matchId: number, data: { name?: string | null; courseId?: number; courseName?: string; createdAt?: Date; groupId?: number | null }): Promise<Match> {
    const updateData: Partial<{ name: string | null; courseId: number; courseName: string; createdAt: Date; groupId: number | null }> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.courseId !== undefined) updateData.courseId = data.courseId;
    if (data.courseName !== undefined) updateData.courseName = data.courseName;
    if (data.createdAt !== undefined) updateData.createdAt = data.createdAt;
    if (data.groupId !== undefined) updateData.groupId = data.groupId;
    
    const [updated] = await db.update(matches)
      .set(updateData)
      .where(eq(matches.id, matchId))
      .returning();
    return updated;
  }

  // Match-specific player handicap overrides
  async getMatchPlayerHandicaps(eventMatchId: number): Promise<MatchPlayerHandicap[]> {
    return db.select().from(matchPlayerHandicaps).where(eq(matchPlayerHandicaps.eventMatchId, eventMatchId));
  }

  async upsertMatchPlayerHandicap(data: InsertMatchPlayerHandicap): Promise<MatchPlayerHandicap> {
    const existing = await db.select().from(matchPlayerHandicaps)
      .where(and(
        eq(matchPlayerHandicaps.eventMatchId, data.eventMatchId),
        eq(matchPlayerHandicaps.playerId, data.playerId)
      ));
    if (existing.length > 0) {
      const [updated] = await db.update(matchPlayerHandicaps)
        .set({ courseHandicap: data.courseHandicap })
        .where(and(
          eq(matchPlayerHandicaps.eventMatchId, data.eventMatchId),
          eq(matchPlayerHandicaps.playerId, data.playerId)
        ))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(matchPlayerHandicaps).values(data).returning();
    return inserted;
  }

  async deleteMatchPlayerHandicap(eventMatchId: number, playerId: number): Promise<void> {
    await db.delete(matchPlayerHandicaps)
      .where(and(
        eq(matchPlayerHandicaps.eventMatchId, eventMatchId),
        eq(matchPlayerHandicaps.playerId, playerId)
      ));
  }

  // Per-course default tees for players
  async getPlayerCourseDefaults(presetPlayerName: string): Promise<PlayerCourseDefault[]> {
    return db.select().from(playerCourseDefaults).where(eq(playerCourseDefaults.presetPlayerName, presetPlayerName));
  }

  async getPlayerCourseDefaultForCourse(presetPlayerName: string, courseId: number): Promise<PlayerCourseDefault | undefined> {
    const [result] = await db.select().from(playerCourseDefaults)
      .where(and(
        eq(playerCourseDefaults.presetPlayerName, presetPlayerName),
        eq(playerCourseDefaults.courseId, courseId)
      ));
    return result;
  }

  async upsertPlayerCourseDefault(data: InsertPlayerCourseDefault): Promise<PlayerCourseDefault> {
    const existing = await db.select().from(playerCourseDefaults)
      .where(and(
        eq(playerCourseDefaults.presetPlayerName, data.presetPlayerName),
        eq(playerCourseDefaults.courseId, data.courseId)
      ));
    if (existing.length > 0) {
      const [updated] = await db.update(playerCourseDefaults)
        .set({ teeId: data.teeId, updatedAt: new Date() })
        .where(and(
          eq(playerCourseDefaults.presetPlayerName, data.presetPlayerName),
          eq(playerCourseDefaults.courseId, data.courseId)
        ))
        .returning();
      return updated;
    }
    const [inserted] = await db.insert(playerCourseDefaults).values(data).returning();
    return inserted;
  }

  async deletePlayerCourseDefault(presetPlayerName: string, courseId: number): Promise<void> {
    await db.delete(playerCourseDefaults)
      .where(and(
        eq(playerCourseDefaults.presetPlayerName, presetPlayerName),
        eq(playerCourseDefaults.courseId, courseId)
      ));
  }

  async getAllPlayerCourseDefaults(): Promise<PlayerCourseDefault[]> {
    return db.select().from(playerCourseDefaults);
  }

  async cloneEvent(sourceEventId: number, creatorId: string): Promise<Match> {
    const sourceMatch = await this.getMatch(sourceEventId);
    if (!sourceMatch) {
      throw new Error("Source event not found");
    }

    const today = new Date();
    const newName = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const [newMatch] = await db.insert(matches).values({
      name: newName,
      courseName: sourceMatch.courseName,
      courseId: sourceMatch.courseId,
      creatorId: creatorId,
      isHandicapped: sourceMatch.isHandicapped,
    }).returning();

    const sourcePlayers = await this.getMatchPlayers(sourceEventId);
    const playerIdMap = new Map<number, number>();

    for (const player of sourcePlayers) {
      const [newPlayer] = await db.insert(players).values({
        matchId: newMatch.id,
        userId: player.userId,
        name: player.name,
        handicapIndex: player.handicapIndex,
        teeId: player.teeId,
      }).returning();
      playerIdMap.set(player.id, newPlayer.id);
    }

    const sourceEventMatches = await this.getEventMatches(sourceEventId);
    const eventMatchIdMap = new Map<number, number>();

    const parentMatches = sourceEventMatches.filter(em => !em.parentMatchId);
    const childMatches = sourceEventMatches.filter(em => em.parentMatchId);

    for (const em of [...parentMatches, ...childMatches]) {
      const sourceWithTeams = await this.getEventMatchWithTeams(em.id);
      
      const [newEventMatch] = await db.insert(eventMatches).values({
        eventId: newMatch.id,
        name: em.name,
        matchType: em.matchType,
        unitAmount: em.unitAmount,
        parentMatchId: em.parentMatchId ? eventMatchIdMap.get(em.parentMatchId) ?? null : null,
        startHole: em.startHole,
        autoPressOriginal: em.autoPressOriginal,
        autoPressAllPresses: em.autoPressAllPresses,
        autoPressNassauFront9: em.autoPressNassauFront9,
        autoPressNassauBack9: em.autoPressNassauBack9,
        autoPressNassauOverall: em.autoPressNassauOverall,
        useNetScoring: em.useNetScoring,
      }).returning();
      eventMatchIdMap.set(em.id, newEventMatch.id);

      if (sourceWithTeams?.teams) {
        for (const team of sourceWithTeams.teams) {
          const [newTeam] = await db.insert(teams).values({
            eventMatchId: newEventMatch.id,
            name: team.name,
          }).returning();

          for (const member of team.members) {
            const newPlayerId = playerIdMap.get(member.playerId);
            if (newPlayerId) {
              await db.insert(teamMembers).values({
                teamId: newTeam.id,
                playerId: newPlayerId,
              });
            }
          }
        }
      }
    }

    return newMatch;
  }

  async copyBetsFromEvent(targetEventId: number, sourceEventId: number): Promise<void> {
    const targetMatch = await this.getMatch(targetEventId);
    const sourceMatch = await this.getMatch(sourceEventId);
    if (!targetMatch || !sourceMatch) {
      throw new Error("Target or source event not found");
    }

    const targetPlayers = await this.getMatchPlayers(targetEventId);
    const sourcePlayers = await this.getMatchPlayers(sourceEventId);

    const playerNameToTargetId = new Map<string, number>();
    for (const player of targetPlayers) {
      playerNameToTargetId.set(player.name, player.id);
    }

    const sourcePlayerIdToName = new Map<number, string>();
    for (const player of sourcePlayers) {
      sourcePlayerIdToName.set(player.id, player.name);
    }

    const sourceEventMatches = await this.getEventMatches(sourceEventId);
    const eventMatchIdMap = new Map<number, number>();

    const parentMatches = sourceEventMatches.filter(em => !em.parentMatchId);
    const childMatches = sourceEventMatches.filter(em => em.parentMatchId);

    for (const em of [...parentMatches, ...childMatches]) {
      const sourceWithTeams = await this.getEventMatchWithTeams(em.id);
      
      const [newEventMatch] = await db.insert(eventMatches).values({
        eventId: targetEventId,
        name: em.name,
        matchType: em.matchType,
        unitAmount: em.unitAmount,
        parentMatchId: em.parentMatchId ? eventMatchIdMap.get(em.parentMatchId) ?? null : null,
        startHole: em.startHole,
        autoPressOriginal: em.autoPressOriginal,
        autoPressAllPresses: em.autoPressAllPresses,
        autoPressNassauFront9: em.autoPressNassauFront9,
        autoPressNassauBack9: em.autoPressNassauBack9,
        autoPressNassauOverall: em.autoPressNassauOverall,
        useNetScoring: em.useNetScoring,
      }).returning();
      eventMatchIdMap.set(em.id, newEventMatch.id);

      if (sourceWithTeams?.teams) {
        for (const team of sourceWithTeams.teams) {
          const [newTeam] = await db.insert(teams).values({
            eventMatchId: newEventMatch.id,
            name: team.name,
          }).returning();

          for (const member of team.members) {
            const sourceName = sourcePlayerIdToName.get(member.playerId);
            if (sourceName) {
              const targetPlayerId = playerNameToTargetId.get(sourceName);
              if (targetPlayerId) {
                await db.insert(teamMembers).values({
                  teamId: newTeam.id,
                  playerId: targetPlayerId,
                });
              }
            }
          }
        }
      }
    }
  }

  // Groups
  async getGroups(): Promise<Group[]> {
    return db.select().from(groups).orderBy(groups.name);
  }

  async createGroup(name: string): Promise<Group> {
    const [newGroup] = await db.insert(groups).values({ name }).returning();
    return newGroup;
  }

  async getGroupById(id: number): Promise<Group | undefined> {
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    return group;
  }

  async updateMatchGroup(matchId: number, groupId: number | null): Promise<Match> {
    const [updated] = await db.update(matches)
      .set({ groupId })
      .where(eq(matches.id, matchId))
      .returning();
    return updated;
  }

  // Dynamic preset players
  async getDynamicPresetPlayers(): Promise<PresetPlayer[]> {
    return db.select().from(presetPlayers).orderBy(presetPlayers.name);
  }

  async createPresetPlayer(name: string, showInRoster: boolean = true): Promise<PresetPlayer> {
    const [newPlayer] = await db.insert(presetPlayers).values({ name, showInRoster }).returning();
    return newPlayer;
  }

  async presetPlayerExists(name: string): Promise<boolean> {
    const { PRESET_PLAYERS } = await import("@shared/models/auth");
    // Check hardcoded list
    if (PRESET_PLAYERS.includes(name as any)) return true;
    // Check database
    const [existing] = await db.select().from(presetPlayers).where(eq(presetPlayers.name, name));
    return !!existing;
  }

  // Player aliases
  async getPlayerAliases(canonicalName: string): Promise<PlayerAlias[]> {
    return db.select().from(playerAliases).where(eq(playerAliases.canonicalName, canonicalName));
  }

  async setPlayerAliases(canonicalName: string, aliases: string[]): Promise<void> {
    // Delete existing database aliases for this player
    await db.delete(playerAliases).where(eq(playerAliases.canonicalName, canonicalName));
    
    // Insert new aliases (excluding empty strings)
    const validAliases = aliases.filter(a => a.trim().length > 0);
    if (validAliases.length > 0) {
      await db.insert(playerAliases).values(
        validAliases.map(alias => ({
          alias: alias.toLowerCase().trim(),
          canonicalName,
        }))
      );
    }
  }

  async updatePresetPlayerShowInRoster(name: string, showInRoster: boolean): Promise<void> {
    // Check if player exists in database
    const [existing] = await db.select().from(presetPlayers).where(eq(presetPlayers.name, name));
    
    if (existing) {
      // Update existing record
      await db.update(presetPlayers)
        .set({ showInRoster })
        .where(eq(presetPlayers.name, name));
    } else {
      // Create new record for hardcoded player
      await db.insert(presetPlayers).values({ name, showInRoster });
    }
  }

  async renamePresetPlayer(oldName: string, newName: string): Promise<{ oldName: string; newName: string }> {
    // Check if new name already exists
    const newNameExists = await this.presetPlayerExists(newName);
    if (newNameExists && oldName.toLowerCase() !== newName.toLowerCase()) {
      throw new Error(`Player "${newName}" already exists`);
    }
    
    // Update in presetPlayers table
    const [existing] = await db.select().from(presetPlayers).where(eq(presetPlayers.name, oldName));
    if (existing) {
      await db.update(presetPlayers)
        .set({ name: newName })
        .where(eq(presetPlayers.name, oldName));
    } else {
      // Create new record with new name
      await db.insert(presetPlayers).values({ name: newName, showInRoster: true });
    }
    
    // Update player_handicaps table
    await db.update(playerHandicaps)
      .set({ presetPlayerName: newName })
      .where(eq(playerHandicaps.presetPlayerName, oldName));
    
    // Update player_aliases canonical name
    await db.update(playerAliases)
      .set({ canonicalName: newName })
      .where(eq(playerAliases.canonicalName, oldName));
    
    // Update player_course_defaults
    await db.update(playerCourseDefaults)
      .set({ presetPlayerName: newName })
      .where(eq(playerCourseDefaults.presetPlayerName, oldName));
    
    // Update users presetPlayerName
    await db.update(users)
      .set({ presetPlayerName: newName })
      .where(eq(users.presetPlayerName, oldName));
    
    return { oldName, newName };
  }

  // === RYDER CUP EVENT METHODS ===

  async getRyderCupEvents(): Promise<RyderCupEvent[]> {
    return db.select().from(ryderCupEvents).orderBy(ryderCupEvents.createdAt);
  }

  async getRyderCupEvent(id: number): Promise<RyderCupEvent | undefined> {
    const [event] = await db.select().from(ryderCupEvents).where(eq(ryderCupEvents.id, id));
    return event;
  }

  async getRyderCupEventFull(id: number): Promise<RyderCupEventResponse | undefined> {
    const event = await this.getRyderCupEvent(id);
    if (!event) return undefined;

    const teamsList = await db.select().from(ryderCupTeams).where(eq(ryderCupTeams.eventId, id));
    const teamsWithMembers = await Promise.all(
      teamsList.map(async (team) => {
        const members = await db.select().from(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.teamId, team.id));
        return { ...team, members };
      })
    );

    const daysList = await db.select().from(ryderCupDays).where(eq(ryderCupDays.eventId, id)).orderBy(ryderCupDays.dayNumber);
    const daysWithPairings = await Promise.all(
      daysList.map(async (day) => {
        const pairingsList = await db.select().from(ryderCupPairings).where(eq(ryderCupPairings.dayId, day.id)).orderBy(ryderCupPairings.matchNumber);
        const pairingsWithDetails = await Promise.all(
          pairingsList.map(async (pairing) => {
            const sides = await db.select().from(ryderCupPairingSides).where(eq(ryderCupPairingSides.pairingId, pairing.id));
            const [result] = await db.select().from(ryderCupPairingResults).where(eq(ryderCupPairingResults.pairingId, pairing.id));
            return { ...pairing, sides, result };
          })
        );
        return { ...day, pairings: pairingsWithDetails };
      })
    );

    return { ...event, teams: teamsWithMembers, days: daysWithPairings };
  }

  async createRyderCupEvent(data: CreateRyderCupEventRequest, creatorId: string): Promise<RyderCupEvent> {
    // Look up courseId from courseName if not provided
    let courseId = data.courseId || null;
    if (!courseId && data.courseName) {
      const course = await this.getCourseByName(data.courseName);
      if (course) courseId = course.id;
    }

    const [event] = await db.insert(ryderCupEvents).values({
      name: data.name,
      courseName: data.courseName,
      courseId,
      creatorId,
      buyInAmount: data.buyInAmount ?? 30000,
      teamWinBonus: data.teamWinBonus ?? 12500,
      matchWinBonus: data.matchWinBonus ?? 2500,
      matchTieBonus: data.matchTieBonus ?? 1250,
      dailySkinsPot: data.dailySkinsPot ?? 21250,
      targetPoints: data.targetPoints ?? 65,
      useHandicaps: data.useHandicaps ?? false,
    }).returning();

    // Create Team A
    const [teamA] = await db.insert(ryderCupTeams).values({
      eventId: event.id,
      name: data.teamA.name,
      color: data.teamA.color || "#3b82f6",
    }).returning();

    for (const member of data.teamA.members) {
      await db.insert(ryderCupTeamMembers).values({
        teamId: teamA.id,
        playerName: member.playerName,
        handicapIndex: member.handicapIndex ?? null,
      });
    }

    // Create Team B
    const [teamB] = await db.insert(ryderCupTeams).values({
      eventId: event.id,
      name: data.teamB.name,
      color: data.teamB.color || "#ef4444",
    }).returning();

    for (const member of data.teamB.members) {
      await db.insert(ryderCupTeamMembers).values({
        teamId: teamB.id,
        playerName: member.playerName,
        handicapIndex: member.handicapIndex ?? null,
      });
    }

    // Create days (default 4)
    const numberOfDays = data.numberOfDays ?? 4;
    for (let dayNum = 1; dayNum <= numberOfDays; dayNum++) {
      // Check for per-day course config
      const dayConfig = data.dayConfigs?.find(d => d.dayNumber === dayNum);
      await db.insert(ryderCupDays).values({
        eventId: event.id,
        dayNumber: dayNum,
        courseId: dayConfig?.courseId ?? courseId,
        courseName: dayConfig?.courseName ?? data.courseName,
      });
    }

    return event;
  }

  async generateRyderCupSchedule(eventId: number): Promise<void> {
    const event = await this.getRyderCupEventFull(eventId);
    if (!event) throw new Error("Event not found");
    if (event.teams.length !== 2) throw new Error("Event must have exactly 2 teams");

    const teamA = event.teams[0];
    const teamB = event.teams[1];
    const teamAPlayers = teamA.members.map(m => m.playerName);
    const teamBPlayers = teamB.members.map(m => m.playerName);

    if (teamAPlayers.length !== 6 || teamBPlayers.length !== 6) {
      throw new Error("Each team must have exactly 6 players");
    }

    // Generate pairings using rotation algorithm
    // Each player plays with 4 of 5 teammates over 4 days (3 matches per day = 12 total)
    // Partner rotation ensures variety
    const schedule = this.generateRotationSchedule(teamAPlayers, teamBPlayers);

    for (let dayIdx = 0; dayIdx < 4; dayIdx++) {
      const day = event.days[dayIdx];
      if (!day) continue;

      for (let matchIdx = 0; matchIdx < 3; matchIdx++) {
        const matchPairing = schedule[dayIdx * 3 + matchIdx];
        if (!matchPairing) continue;

        // Create pairing
        const [pairing] = await db.insert(ryderCupPairings).values({
          dayId: day.id,
          matchNumber: matchIdx + 1,
          isPrimary: true,
          matchFormat: "match_play_1_ball",
          useNetScoring: event.useHandicaps,
          pointValue: 10, // 1.0 point
        }).returning();

        // Create sides
        await db.insert(ryderCupPairingSides).values({
          pairingId: pairing.id,
          teamId: teamA.id,
          player1Name: matchPairing.teamA[0],
          player2Name: matchPairing.teamA[1],
        });

        await db.insert(ryderCupPairingSides).values({
          pairingId: pairing.id,
          teamId: teamB.id,
          player1Name: matchPairing.teamB[0],
          player2Name: matchPairing.teamB[1],
        });
      }
    }

    // Update event status to active
    await db.update(ryderCupEvents).set({ status: "active" }).where(eq(ryderCupEvents.id, eventId));
  }

  private generateRotationSchedule(teamAPlayers: string[], teamBPlayers: string[]): { teamA: string[]; teamB: string[] }[] {
    // Pre-defined rotation that ensures:
    // - Each player plays with 4 of 5 teammates
    // - Maximum variety in opponents
    // Player indices: 0-5 for each team
    const pairingPattern = [
      // Day 1
      { a: [0, 1], b: [0, 1] },
      { a: [2, 3], b: [2, 3] },
      { a: [4, 5], b: [4, 5] },
      // Day 2
      { a: [0, 2], b: [1, 3] },
      { a: [1, 4], b: [0, 5] },
      { a: [3, 5], b: [2, 4] },
      // Day 3
      { a: [0, 3], b: [2, 5] },
      { a: [1, 5], b: [1, 4] },
      { a: [2, 4], b: [0, 3] },
      // Day 4
      { a: [0, 4], b: [3, 5] },
      { a: [1, 3], b: [0, 2] },
      { a: [2, 5], b: [1, 4] },
    ];

    return pairingPattern.map(p => ({
      teamA: [teamAPlayers[p.a[0]], teamAPlayers[p.a[1]]],
      teamB: [teamBPlayers[p.b[0]], teamBPlayers[p.b[1]]],
    }));
  }

  async addRyderCupSideMatch(data: AddSideMatchRequest, eventId: number): Promise<RyderCupPairing> {
    const event = await this.getRyderCupEventFull(eventId);
    if (!event) throw new Error("Event not found");

    // Get max match number for the day
    const existingPairings = await db.select().from(ryderCupPairings).where(eq(ryderCupPairings.dayId, data.dayId));
    const maxMatchNum = Math.max(0, ...existingPairings.map(p => p.matchNumber));

    const [pairing] = await db.insert(ryderCupPairings).values({
      dayId: data.dayId,
      matchNumber: maxMatchNum + 1,
      isPrimary: false,
      matchFormat: data.matchFormat,
      useNetScoring: data.useNetScoring ?? false,
      pointValue: 0, // Side matches don't count toward cup
      purseAmount: data.purseAmount ?? null,
    }).returning();

    // Find team IDs
    const teamA = event.teams[0];
    const teamB = event.teams[1];

    await db.insert(ryderCupPairingSides).values({
      pairingId: pairing.id,
      teamId: teamA.id,
      player1Name: data.sideA.playerNames[0],
      player2Name: data.sideA.playerNames[1] || null,
    });

    await db.insert(ryderCupPairingSides).values({
      pairingId: pairing.id,
      teamId: teamB.id,
      player1Name: data.sideB.playerNames[0],
      player2Name: data.sideB.playerNames[1] || null,
    });

    return pairing;
  }

  async recordPairingResult(pairingId: number, data: RecordPairingResultRequest): Promise<RyderCupPairingResult> {
    // Get pairing and check if primary
    const [pairing] = await db.select().from(ryderCupPairings).where(eq(ryderCupPairings.id, pairingId));
    if (!pairing) throw new Error("Pairing not found");

    // Check if result already exists
    const [existing] = await db.select().from(ryderCupPairingResults).where(eq(ryderCupPairingResults.pairingId, pairingId));

    const pointsAwarded = data.winningSideId ? pairing.pointValue : Math.floor(pairing.pointValue / 2); // Half for tie

    if (existing) {
      const [updated] = await db.update(ryderCupPairingResults)
        .set({
          winningSideId: data.winningSideId ?? null,
          winningMargin: data.winningMargin ?? null,
          pointsAwarded,
        })
        .where(eq(ryderCupPairingResults.id, existing.id))
        .returning();

      await this.updateTeamPoints(pairingId);
      return updated;
    }

    const [result] = await db.insert(ryderCupPairingResults).values({
      pairingId,
      winningSideId: data.winningSideId ?? null,
      winningMargin: data.winningMargin ?? null,
      pointsAwarded,
    }).returning();

    // Update pairing status
    await db.update(ryderCupPairings).set({ status: "completed" }).where(eq(ryderCupPairings.id, pairingId));

    // Update team points
    await this.updateTeamPoints(pairingId);

    return result;
  }

  private async updateTeamPoints(pairingId: number): Promise<void> {
    // Get pairing info
    const [pairing] = await db.select().from(ryderCupPairings).where(eq(ryderCupPairings.id, pairingId));
    if (!pairing || !pairing.isPrimary) return; // Only update for primary matches

    const [day] = await db.select().from(ryderCupDays).where(eq(ryderCupDays.id, pairing.dayId));
    if (!day) return;

    // Get all completed primary pairings for this event
    const allDays = await db.select().from(ryderCupDays).where(eq(ryderCupDays.eventId, day.eventId));
    const dayIds = allDays.map(d => d.id);

    const allPairings = await db.select().from(ryderCupPairings)
      .where(and(
        inArray(ryderCupPairings.dayId, dayIds),
        eq(ryderCupPairings.isPrimary, true)
      ));

    const teams = await db.select().from(ryderCupTeams).where(eq(ryderCupTeams.eventId, day.eventId));
    const teamPoints: Record<number, number> = {};
    teams.forEach(t => { teamPoints[t.id] = 0; });

    for (const p of allPairings) {
      const [result] = await db.select().from(ryderCupPairingResults).where(eq(ryderCupPairingResults.pairingId, p.id));
      if (!result) continue;

      if (result.winningSideId) {
        // Get winning side's team
        const [winningSide] = await db.select().from(ryderCupPairingSides).where(eq(ryderCupPairingSides.id, result.winningSideId));
        if (winningSide) {
          teamPoints[winningSide.teamId] += result.pointsAwarded;
        }
      } else {
        // Tie - split points
        const sides = await db.select().from(ryderCupPairingSides).where(eq(ryderCupPairingSides.pairingId, p.id));
        for (const side of sides) {
          teamPoints[side.teamId] += Math.floor(result.pointsAwarded / 2);
        }
      }
    }

    // Update team totals
    for (const team of teams) {
      await db.update(ryderCupTeams)
        .set({ totalPoints: teamPoints[team.id] || 0 })
        .where(eq(ryderCupTeams.id, team.id));
    }

    // Check for winner
    const event = await this.getRyderCupEvent(day.eventId);
    if (!event) return;

    for (const team of teams) {
      if (teamPoints[team.id] >= event.targetPoints) {
        await db.update(ryderCupEvents)
          .set({ status: "completed", winningTeamId: team.id })
          .where(eq(ryderCupEvents.id, day.eventId));
        break;
      }
    }
  }

  async recordRyderCupSkin(dayId: number, holeNumber: number, winnerName: string | null): Promise<RyderCupSkin> {
    // Check if skin already recorded
    const [existing] = await db.select().from(ryderCupSkins)
      .where(and(
        eq(ryderCupSkins.dayId, dayId),
        eq(ryderCupSkins.holeNumber, holeNumber)
      ));

    if (existing) {
      const [updated] = await db.update(ryderCupSkins)
        .set({ winnerName })
        .where(eq(ryderCupSkins.id, existing.id))
        .returning();
      return updated;
    }

    const [skin] = await db.insert(ryderCupSkins).values({
      dayId,
      holeNumber,
      winnerName,
    }).returning();

    return skin;
  }

  async getRyderCupDaySkins(dayId: number): Promise<RyderCupSkin[]> {
    return db.select().from(ryderCupSkins).where(eq(ryderCupSkins.dayId, dayId)).orderBy(ryderCupSkins.holeNumber);
  }

  async getMatchesByRyderCupEvent(eventId: number): Promise<Match[]> {
    return db.select().from(matches).where(eq(matches.ryderCupEventId, eventId)).orderBy(matches.createdAt);
  }

  async updateRyderCupEventHandicaps(eventId: number, useHandicaps: boolean): Promise<RyderCupEvent> {
    const [updated] = await db.update(ryderCupEvents)
      .set({ useHandicaps })
      .where(eq(ryderCupEvents.id, eventId))
      .returning();
    return updated;
  }

  async deleteRyderCupEvent(eventId: number): Promise<void> {
    // Delete all related data
    const days = await db.select().from(ryderCupDays).where(eq(ryderCupDays.eventId, eventId));
    for (const day of days) {
      const pairings = await db.select().from(ryderCupPairings).where(eq(ryderCupPairings.dayId, day.id));
      for (const pairing of pairings) {
        await db.delete(ryderCupPairingResults).where(eq(ryderCupPairingResults.pairingId, pairing.id));
        await db.delete(ryderCupPairingSides).where(eq(ryderCupPairingSides.pairingId, pairing.id));
      }
      await db.delete(ryderCupPairings).where(eq(ryderCupPairings.dayId, day.id));
      await db.delete(ryderCupSkins).where(eq(ryderCupSkins.dayId, day.id));
    }
    await db.delete(ryderCupDays).where(eq(ryderCupDays.eventId, eventId));

    const teams = await db.select().from(ryderCupTeams).where(eq(ryderCupTeams.eventId, eventId));
    for (const team of teams) {
      await db.delete(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.teamId, team.id));
    }
    await db.delete(ryderCupTeams).where(eq(ryderCupTeams.eventId, eventId));

    await db.delete(ryderCupEvents).where(eq(ryderCupEvents.id, eventId));
  }

  // === MATCH ROLE METHODS ===

  async getMatchRole(matchId: number, userId: string): Promise<MatchRole | undefined> {
    const [role] = await db.select().from(matchRoles)
      .where(and(eq(matchRoles.matchId, matchId), eq(matchRoles.userId, userId)));
    return role;
  }

  async listMatchRoles(matchId: number): Promise<MatchRole[]> {
    return db.select().from(matchRoles).where(eq(matchRoles.matchId, matchId));
  }

  async upsertMatchRole(matchId: number, userId: string, role: string): Promise<MatchRole> {
    const existing = await this.getMatchRole(matchId, userId);
    if (existing) {
      const [updated] = await db.update(matchRoles)
        .set({ role })
        .where(and(eq(matchRoles.matchId, matchId), eq(matchRoles.userId, userId)))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(matchRoles)
        .values({ matchId, userId, role })
        .returning();
      return created;
    }
  }

  async deleteMatchRole(matchId: number, userId: string): Promise<void> {
    await db.delete(matchRoles)
      .where(and(eq(matchRoles.matchId, matchId), eq(matchRoles.userId, userId)));
  }

  // === VERIFICATION CODE METHODS ===

  async createVerificationCode(phone: string, code: string): Promise<VerificationCode> {
    // Delete any existing codes for this phone
    await db.delete(verificationCodes).where(eq(verificationCodes.phone, phone));
    
    // Create new code that expires in 10 minutes
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const [verificationCode] = await db.insert(verificationCodes)
      .values({ phone, code, expiresAt })
      .returning();
    return verificationCode;
  }

  async verifyCode(phone: string, code: string): Promise<boolean> {
    const [verificationCode] = await db.select().from(verificationCodes)
      .where(and(
        eq(verificationCodes.phone, phone),
        eq(verificationCodes.code, code),
        gte(verificationCodes.expiresAt, new Date()),
        eq(verificationCodes.verified, false)
      ));
    
    if (!verificationCode) return false;
    
    // Mark as verified
    await db.update(verificationCodes)
      .set({ verified: true })
      .where(eq(verificationCodes.id, verificationCode.id));
    
    return true;
  }

  // === NOTIFICATION PREFERENCES METHODS ===

  async getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined> {
    const [prefs] = await db.select().from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));
    return prefs;
  }

  async upsertNotificationPreferences(userId: string, prefs: Partial<{
    matchInvitations: boolean;
    scoreUpdates: boolean;
    betResults: boolean;
    matchReminders: boolean;
  }>): Promise<NotificationPreferences> {
    const existing = await this.getNotificationPreferences(userId);
    
    if (existing) {
      const [updated] = await db.update(notificationPreferences)
        .set({ ...prefs, updatedAt: new Date() })
        .where(eq(notificationPreferences.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(notificationPreferences)
        .values({
          userId,
          matchInvitations: prefs.matchInvitations ?? true,
          scoreUpdates: prefs.scoreUpdates ?? false,
          betResults: prefs.betResults ?? true,
          matchReminders: prefs.matchReminders ?? true,
        })
        .returning();
      return created;
    }
  }

  // === MESSAGE METHODS ===

  async getMessages(userId: string): Promise<(Message & { senderName: string | null })[]> {
    const userMessages = await db.select().from(messages)
      .where(or(
        eq(messages.senderId, userId),
        eq(messages.recipientId, userId),
        isNull(messages.recipientId) // Group messages
      ))
      .orderBy(desc(messages.createdAt));
    
    // Get sender names
    const senderIds = Array.from(new Set(userMessages.map(m => m.senderId)));
    const senders = senderIds.length > 0 
      ? await db.select().from(users).where(inArray(users.id, senderIds))
      : [];
    const senderMap = new Map(senders.map(s => [s.id, s.presetPlayerName || s.firstName || 'Unknown']));
    
    return userMessages.map(m => ({
      ...m,
      senderName: senderMap.get(m.senderId) || null,
    }));
  }

  async getMatchMessages(matchId: number): Promise<(Message & { senderName: string | null })[]> {
    const matchMessages = await db.select().from(messages)
      .where(eq(messages.matchId, matchId))
      .orderBy(desc(messages.createdAt));
    
    // Get sender names
    const senderIds = Array.from(new Set(matchMessages.map(m => m.senderId)));
    const senders = senderIds.length > 0 
      ? await db.select().from(users).where(inArray(users.id, senderIds))
      : [];
    const senderMap = new Map(senders.map(s => [s.id, s.presetPlayerName || s.firstName || 'Unknown']));
    
    return matchMessages.map(m => ({
      ...m,
      senderName: senderMap.get(m.senderId) || null,
    }));
  }

  async createMessage(senderId: string, content: string, matchId?: number, recipientId?: string): Promise<Message> {
    const [message] = await db.insert(messages)
      .values({
        senderId,
        content,
        matchId: matchId ?? null,
        recipientId: recipientId ?? null,
      })
      .returning();
    return message;
  }

  async markMessageRead(messageId: number, userId: string): Promise<boolean> {
    const [message] = await db.select().from(messages).where(eq(messages.id, messageId));
    if (!message || (message.recipientId && message.recipientId !== userId)) {
      return false;
    }
    
    await db.update(messages)
      .set({ readAt: new Date() })
      .where(eq(messages.id, messageId));
    return true;
  }

  // Get users with phone numbers for a match (for notifications)
  async getMatchParticipantsWithPhone(matchId: number): Promise<{ userId: string; phone: string; name: string }[]> {
    const matchPlayers = await this.getMatchPlayers(matchId);
    const userIds = matchPlayers.filter(p => p.userId).map(p => p.userId!);
    
    if (userIds.length === 0) return [];
    
    const usersWithPhone = await db.select().from(users)
      .where(and(
        inArray(users.id, userIds),
        // Only users with verified phone numbers
      ));
    
    return usersWithPhone
      .filter(u => u.phone)
      .map(u => ({
        userId: u.id,
        phone: u.phone!,
        name: u.presetPlayerName || u.firstName || 'User',
      }));
  }
}

export const storage = new DatabaseStorage();

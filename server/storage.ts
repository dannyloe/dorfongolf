import { db } from "./db";
import { 
  matches, players, scores, users, eventMatches, eventMatchResults, teams, teamMembers, courses, courseHoles, playerHandicaps, courseTees, matchPlayerHandicaps, playerCourseDefaults, groups, presetPlayers, playerAliases, matchRoles,
  groupMemberships, groupJoinRequests, groupPlayers,
  verificationCodes, notificationPreferences, messages,
  ryderCupEvents, ryderCupTeams, ryderCupTeamMembers, ryderCupDays, ryderCupPairings, ryderCupPairingSides, ryderCupPairingResults, ryderCupSkins, ryderCupPairingScores, ryderCupTransactions, ryderCupTransactionSplits, ryderCupClosestToHole,
  manualBets, manualBetEntries,
  settlements, settlementPayments,
  type InsertMatch, type Match, type Player, type Score, type InsertScore, type InsertPlayer,
  type EventMatch, type EventMatchResult, type InsertEventMatchResult, type Team, type TeamMember, type CreateEventMatchRequest,
  type Course, type CourseHole, type InsertCourse, type InsertCourseHole,
  type PlayerHandicap, type InsertPlayerHandicap,
  type CourseTee, type InsertCourseTee,
  type MatchPlayerHandicap, type InsertMatchPlayerHandicap,
  type PlayerCourseDefault, type InsertPlayerCourseDefault,
  type Group, type InsertGroup,
  type GroupMembership, type GroupJoinRequest, type GroupPlayer, type GroupWithDetails,
  type PresetPlayer, type InsertPresetPlayer,
  type PlayerAlias, type InsertPlayerAlias,
  type MatchRole, type InsertMatchRole,
  type VerificationCode, type NotificationPreferences, type Message,
  type RyderCupEvent, type RyderCupTeam, type RyderCupTeamMember, type RyderCupDay, 
  type RyderCupPairing, type RyderCupPairingSide, type RyderCupPairingResult, type RyderCupSkin, type RyderCupPairingScore,
  type RyderCupTransaction, type RyderCupTransactionSplit, type RyderCupClosestToHole,
  type ManualBet, type ManualBetEntry, type ManualBetWithEntries,
  type Settlement, type SettlementPayment, type SettlementWithPayments,
  type CreateRyderCupEventRequest, type RyderCupEventResponse, type AddSideMatchRequest, type RecordPairingResultRequest
} from "@shared/schema";
import { eq, and, lt, inArray, or, isNull, desc, gte, sql } from "drizzle-orm";
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
  
  // Ryder Cup Team methods
  getRyderCupTeam(teamId: number): Promise<RyderCupTeam | null>;
  updateRyderCupTeam(teamId: number, updates: { name?: string; color?: string }): Promise<RyderCupTeam | null>;
  updateRyderCupTeamMemberHandicap(memberId: number, handicapIndex: number | null): Promise<RyderCupTeamMember | null>;
  updateRyderCupTeamMemberName(memberId: number, playerName: string): Promise<RyderCupTeamMember | null>;
  
  updateRyderCupEventStatus(eventId: number, status: string): Promise<RyderCupEvent>;
  
  // Ryder Cup Payout methods
  updateRyderCupEventPayouts(eventId: number, payouts: {
    buyInAmount?: number;
    teamWinBonus?: number;
    matchWinBonus?: number;
    matchTieBonus?: number;
    dailySkinsPot?: number;
    closestToHolePayout?: number;
    includeBuyInInLedger?: boolean;
  }): Promise<RyderCupEvent>;
  
  // Ryder Cup scores for side matches
  getRyderCupScoresForSideMatch(eventId: number, dayNumber: number, players: Player[]): Promise<Score[]>;
  
  // Closest to Hole methods
  recordClosestToHoleWinner(dayId: number, holeNumber: number, winnerName: string): Promise<RyderCupClosestToHole>;
  getClosestToHoleWinners(dayId: number): Promise<RyderCupClosestToHole[]>;
  getAllClosestToHoleWinners(eventId: number): Promise<RyderCupClosestToHole[]>;
  
  // Manual Bet methods
  getManualBets(ryderCupEventId?: number): Promise<ManualBetWithEntries[]>;
  createManualBet(description: string, entries: { playerName: string; presetPlayerId?: number; amount: number }[], creatorId?: number, ryderCupEventId?: number): Promise<ManualBetWithEntries>;
  deleteManualBet(betId: number): Promise<boolean>;
  
  // Event Match Results methods (stored/cached bet results)
  getEventMatchResults(eventMatchId: number): Promise<EventMatchResult[]>;
  getEventMatchResultsByEventMatchIds(eventMatchIds: number[]): Promise<EventMatchResult[]>;
  saveEventMatchResults(eventMatchId: number, results: InsertEventMatchResult[]): Promise<EventMatchResult[]>;
  deleteEventMatchResults(eventMatchId: number): Promise<void>;
  
  // Settlement methods
  getSettlements(): Promise<SettlementWithPayments[]>;
  getActiveSettlement(eventId?: number): Promise<SettlementWithPayments | null>;
  getArchivedSettlements(eventId?: number): Promise<SettlementWithPayments[]>;
  createSettlement(name: string | null, payments: { fromPlayerName: string; fromPresetPlayerId?: number | null; toPlayerName: string; toPresetPlayerId?: number | null; amount: number }[], creatorId?: string, eventId?: number): Promise<SettlementWithPayments>;
  archiveSettlement(settlementId: number): Promise<boolean>;
  togglePaymentComplete(paymentId: number): Promise<SettlementPayment | null>;
  deleteSettlement(settlementId: number): Promise<boolean>;

  // Group membership methods
  getGroupsForUser(userId: string): Promise<GroupWithDetails[]>;
  createGroupWithMembership(name: string, description: string | null, createdBy: string): Promise<Group>;
  getGroupById(id: number): Promise<Group | undefined>;
  updateGroup(groupId: number, data: { name?: string; description?: string | null }): Promise<Group>;
  deleteGroup(groupId: number): Promise<boolean>;
  
  // Group membership
  getGroupMembers(groupId: number): Promise<(GroupMembership & { user?: { id: string; firstName: string | null; lastName: string | null; presetPlayerName: string | null; profileImageUrl: string | null } })[]>;
  addGroupMember(groupId: number, userId: string, role: string): Promise<GroupMembership>;
  removeGroupMember(groupId: number, userId: string): Promise<boolean>;
  updateGroupMemberRole(groupId: number, userId: string, role: string): Promise<GroupMembership | null>;
  getGroupMembership(groupId: number, userId: string): Promise<GroupMembership | null>;
  
  // Group join requests
  createJoinRequest(groupId: number, userId: string): Promise<GroupJoinRequest>;
  getPendingJoinRequests(groupId: number): Promise<(GroupJoinRequest & { user?: { id: string; firstName: string | null; lastName: string | null; presetPlayerName: string | null; profileImageUrl: string | null } })[]>;
  resolveJoinRequest(requestId: number, status: string): Promise<GroupJoinRequest>;
  
  // Group invite codes
  getGroupByInviteCode(code: string): Promise<Group | undefined>;
  regenerateInviteCode(groupId: number): Promise<Group>;
  
  // Group players (preset players linked to groups)
  getGroupPlayers(groupId: number): Promise<(GroupPlayer & { presetPlayer?: { id: number; name: string } })[]>;
  addGroupPlayer(groupId: number, presetPlayerId: number, addedBy?: string): Promise<GroupPlayer>;
  removeGroupPlayer(groupId: number, presetPlayerId: number): Promise<boolean>;
  getPresetPlayersForGroups(groupIds: number[]): Promise<{ id: number; name: string; groupId: number }[]>;
  getPresetPlayerByName(name: string): Promise<PresetPlayer | undefined>;
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
    let presetPlayerId: number | null = null;
    
    // Get available tees for this course to validate tee selection
    // If courseId not provided, derive it from the match
    let effectiveCourseId = courseId;
    if (!effectiveCourseId && player.matchId) {
      const match = await this.getMatch(player.matchId);
      effectiveCourseId = match?.courseId ?? undefined;
    }
    
    let courseTeeIds: Set<number> = new Set();
    let firstCourseTeeId: number | null = null;
    if (effectiveCourseId) {
      // Order by id for deterministic selection of first tee
      const availableTees = await db.select().from(courseTees)
        .where(eq(courseTees.courseId, effectiveCourseId))
        .orderBy(courseTees.id);
      courseTeeIds = new Set(availableTees.map(t => t.id));
      if (availableTees.length > 0) {
        firstCourseTeeId = availableTees[0].id;
      }
    }
    
    if (player.name) {
      // Look up preset player ID for dynamic name updates
      const [preset] = await db.select().from(presetPlayers).where(eq(presetPlayers.name, player.name));
      if (preset) {
        presetPlayerId = preset.id;
      }
      
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
    
    // Validate that the selected teeId belongs to this course, otherwise use first available
    if (effectiveCourseId && teeId !== null && !courseTeeIds.has(teeId)) {
      console.log(`[addPlayer] teeId ${teeId} not found in course ${effectiveCourseId}, falling back to first available tee ${firstCourseTeeId}`);
      teeId = firstCourseTeeId;
    }
    
    const [newPlayer] = await db.insert(players).values({
      ...player,
      handicapIndex,
      teeId,
      presetPlayerId,
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
      startOnBack9: data.startOnBack9 ?? false,
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

  async markEventMatchReplicated(eventMatchId: number): Promise<EventMatch> {
    const [updated] = await db.update(eventMatches)
      .set({ hasBeenReplicated: true })
      .where(eq(eventMatches.id, eventMatchId))
      .returning();
    return updated;
  }

  async updateEventMatchUnitAmount(eventMatchId: number, unitAmount: number): Promise<EventMatch> {
    const [updated] = await db.update(eventMatches)
      .set({ unitAmount })
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

    // Get Ryder Cup player data for any matches associated with Ryder Cup events
    // This is needed for correct net scoring calculations in the Ledger
    const ryderCupEventIds = Array.from(new Set(allMatches.filter(m => m.ryderCupEventId).map(m => m.ryderCupEventId!)));
    const ryderCupPlayerDataByEventAndDay: Record<number, Record<number, Record<string, { handicapIndex: number | null; teeId: number | null }>>> = {};
    
    for (const eventId of ryderCupEventIds) {
      ryderCupPlayerDataByEventAndDay[eventId] = {};
      
      // Get all days for this event
      const days = await db.select().from(ryderCupDays).where(eq(ryderCupDays.eventId, eventId));
      
      for (const day of days) {
        ryderCupPlayerDataByEventAndDay[eventId][day.dayNumber] = {};
        
        // Get all pairings for this day
        const pairings = await db.select().from(ryderCupPairings).where(eq(ryderCupPairings.dayId, day.id));
        
        for (const pairing of pairings) {
          // Get all sides for this pairing
          const sides = await db.select().from(ryderCupPairingSides).where(eq(ryderCupPairingSides.pairingId, pairing.id));
          
          for (const side of sides) {
            // Look up current player names from team members if IDs are set
            let player1Name = side.player1Name;
            let player2Name = side.player2Name;
            
            if (side.player1Id) {
              const [member1] = await db.select().from(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.id, side.player1Id));
              if (member1) player1Name = member1.playerName;
            }
            if (side.player2Id) {
              const [member2] = await db.select().from(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.id, side.player2Id));
              if (member2) player2Name = member2.playerName;
            }
            
            // Map player1 handicap data
            if (player1Name) {
              ryderCupPlayerDataByEventAndDay[eventId][day.dayNumber][player1Name] = {
                handicapIndex: side.player1HandicapIndex,
                teeId: side.player1TeeId,
              };
            }
            
            // Map player2 handicap data
            if (player2Name) {
              ryderCupPlayerDataByEventAndDay[eventId][day.dayNumber][player2Name] = {
                handicapIndex: side.player2HandicapIndex,
                teeId: side.player2TeeId,
              };
            }
          }
        }
      }
    }

    // Also get Ryder Cup scores for score conversion (needed for side match calculations)
    const ryderCupScoresByEventAndDay: Record<number, Record<number, Record<string, Record<number, number>>>> = {};
    
    for (const eventId of ryderCupEventIds) {
      ryderCupScoresByEventAndDay[eventId] = {};
      
      // Get all days for this event
      const days = await db.select().from(ryderCupDays).where(eq(ryderCupDays.eventId, eventId));
      
      for (const day of days) {
        ryderCupScoresByEventAndDay[eventId][day.dayNumber] = {};
        
        // Get all pairings for this day
        const pairings = await db.select().from(ryderCupPairings).where(eq(ryderCupPairings.dayId, day.id));
        
        for (const pairing of pairings) {
          // Get all sides for this pairing
          const sides = await db.select().from(ryderCupPairingSides).where(eq(ryderCupPairingSides.pairingId, pairing.id));
          
          for (const side of sides) {
            // Look up current player names from team members if IDs are set
            let player1Name = side.player1Name;
            let player2Name = side.player2Name;
            
            if (side.player1Id) {
              const [member1] = await db.select().from(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.id, side.player1Id));
              if (member1) player1Name = member1.playerName;
            }
            if (side.player2Id) {
              const [member2] = await db.select().from(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.id, side.player2Id));
              if (member2) player2Name = member2.playerName;
            }
            
            // Get scores for this side
            const sideScores = await db.select().from(ryderCupPairingScores).where(eq(ryderCupPairingScores.sideId, side.id));
            
            for (const score of sideScores) {
              if (player1Name && score.player1Strokes !== null) {
                if (!ryderCupScoresByEventAndDay[eventId][day.dayNumber][player1Name]) {
                  ryderCupScoresByEventAndDay[eventId][day.dayNumber][player1Name] = {};
                }
                ryderCupScoresByEventAndDay[eventId][day.dayNumber][player1Name][score.holeNumber] = score.player1Strokes;
              }
              if (player2Name && score.player2Strokes !== null) {
                if (!ryderCupScoresByEventAndDay[eventId][day.dayNumber][player2Name]) {
                  ryderCupScoresByEventAndDay[eventId][day.dayNumber][player2Name] = {};
                }
                ryderCupScoresByEventAndDay[eventId][day.dayNumber][player2Name][score.holeNumber] = score.player2Strokes;
              }
            }
          }
        }
      }
    }

    return {
      matches: allMatches,
      eventMatches: allEventMatches,
      scores: allScores,
      courseData,
      ryderCupPlayerDataByEventAndDay,
      ryderCupScoresByEventAndDay,
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

  async seedCourseTeesIfNotExist(courseId: number, tees: { name: string; slopeRating: number; courseRating: number; yardage?: number | null; color?: string }[]): Promise<void> {
    const existingTees = await this.getCourseTees(courseId);
    if (existingTees.length === 0) {
      for (const tee of tees) {
        await this.createCourseTee({
          courseId,
          name: tee.name,
          slopeRating: tee.slopeRating,
          courseRating: tee.courseRating,
          yardage: tee.yardage || null,
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

  async updateCourseTee(courseId: number, teeId: number, data: { name?: string; slopeRating?: number; courseRating?: number; yardage?: number | null; color?: string | null }): Promise<CourseTee | undefined> {
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
    const [newGroup] = await db.insert(groups).values({ name, createdBy: '' }).returning();
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

  async getGroupsForUser(userId: string): Promise<GroupWithDetails[]> {
    const memberships = await db.select().from(groupMemberships).where(eq(groupMemberships.userId, userId));
    if (memberships.length === 0) return [];
    
    const groupIds = memberships.map(m => m.groupId);
    const userGroups = await db.select().from(groups).where(inArray(groups.id, groupIds));
    
    const result: GroupWithDetails[] = [];
    for (const group of userGroups) {
      const membership = memberships.find(m => m.groupId === group.id);
      const memberCount = await db.select().from(groupMemberships).where(eq(groupMemberships.groupId, group.id));
      const playerCount = await db.select().from(groupPlayers).where(eq(groupPlayers.groupId, group.id));
      
      result.push({
        ...group,
        memberCount: memberCount.length,
        playerCount: playerCount.length,
        role: membership?.role || 'member',
      });
    }
    return result;
  }

  async createGroupWithMembership(name: string, description: string | null, createdBy: string): Promise<Group> {
    const inviteCode = this.generateInviteCode();
    const [newGroup] = await db.insert(groups).values({ 
      name, 
      description, 
      inviteCode,
      createdBy,
    }).returning();
    
    await db.insert(groupMemberships).values({
      groupId: newGroup.id,
      userId: createdBy,
      role: 'admin',
    });
    
    return newGroup;
  }

  private generateInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  async updateGroup(groupId: number, data: { name?: string; description?: string | null }): Promise<Group> {
    const updateData: Partial<{ name: string; description: string | null }> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    
    const [updated] = await db.update(groups).set(updateData).where(eq(groups.id, groupId)).returning();
    return updated;
  }

  async deleteGroup(groupId: number): Promise<boolean> {
    await db.delete(groupMemberships).where(eq(groupMemberships.groupId, groupId));
    await db.delete(groupJoinRequests).where(eq(groupJoinRequests.groupId, groupId));
    await db.delete(groupPlayers).where(eq(groupPlayers.groupId, groupId));
    await db.delete(groups).where(eq(groups.id, groupId));
    return true;
  }

  async getGroupMembers(groupId: number) {
    const members = await db.select().from(groupMemberships).where(eq(groupMemberships.groupId, groupId));
    const result = [];
    for (const member of members) {
      const [user] = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        presetPlayerName: users.presetPlayerName,
        profileImageUrl: users.profileImageUrl,
      }).from(users).where(eq(users.id, member.userId));
      result.push({ ...member, user: user || undefined });
    }
    return result;
  }

  async addGroupMember(groupId: number, userId: string, role: string = 'member'): Promise<GroupMembership> {
    const [membership] = await db.insert(groupMemberships).values({
      groupId,
      userId,
      role,
    }).returning();
    return membership;
  }

  async removeGroupMember(groupId: number, userId: string): Promise<boolean> {
    await db.delete(groupMemberships)
      .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)));
    return true;
  }

  async updateGroupMemberRole(groupId: number, userId: string, role: string): Promise<GroupMembership | null> {
    const [updated] = await db.update(groupMemberships)
      .set({ role })
      .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)))
      .returning();
    return updated || null;
  }

  async getGroupMembership(groupId: number, userId: string): Promise<GroupMembership | null> {
    const [membership] = await db.select().from(groupMemberships)
      .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)));
    return membership || null;
  }

  async createJoinRequest(groupId: number, userId: string): Promise<GroupJoinRequest> {
    const [request] = await db.insert(groupJoinRequests).values({
      groupId,
      userId,
    }).returning();
    return request;
  }

  async getPendingJoinRequests(groupId: number) {
    const requests = await db.select().from(groupJoinRequests)
      .where(and(eq(groupJoinRequests.groupId, groupId), eq(groupJoinRequests.status, 'pending')));
    const result = [];
    for (const req of requests) {
      const [user] = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        presetPlayerName: users.presetPlayerName,
        profileImageUrl: users.profileImageUrl,
      }).from(users).where(eq(users.id, req.userId));
      result.push({ ...req, user: user || undefined });
    }
    return result;
  }

  async resolveJoinRequest(requestId: number, status: string): Promise<GroupJoinRequest> {
    const [updated] = await db.update(groupJoinRequests)
      .set({ status, resolvedAt: new Date() })
      .where(eq(groupJoinRequests.id, requestId))
      .returning();
    return updated;
  }

  async getGroupByInviteCode(code: string): Promise<Group | undefined> {
    const [group] = await db.select().from(groups).where(eq(groups.inviteCode, code));
    return group;
  }

  async regenerateInviteCode(groupId: number): Promise<Group> {
    const newCode = this.generateInviteCode();
    const [updated] = await db.update(groups).set({ inviteCode: newCode }).where(eq(groups.id, groupId)).returning();
    return updated;
  }

  async getGroupPlayers(groupId: number) {
    const gps = await db.select().from(groupPlayers).where(eq(groupPlayers.groupId, groupId));
    const result = [];
    for (const gp of gps) {
      const [pp] = await db.select({ id: presetPlayers.id, name: presetPlayers.name })
        .from(presetPlayers).where(eq(presetPlayers.id, gp.presetPlayerId));
      result.push({ ...gp, presetPlayer: pp || undefined });
    }
    return result;
  }

  async addGroupPlayer(groupId: number, presetPlayerId: number, addedBy?: string): Promise<GroupPlayer> {
    const [gp] = await db.insert(groupPlayers).values({
      groupId,
      presetPlayerId,
      addedBy: addedBy || null,
    }).returning();
    return gp;
  }

  async removeGroupPlayer(groupId: number, presetPlayerId: number): Promise<boolean> {
    await db.delete(groupPlayers)
      .where(and(eq(groupPlayers.groupId, groupId), eq(groupPlayers.presetPlayerId, presetPlayerId)));
    return true;
  }

  async getPresetPlayersForGroups(groupIds: number[]) {
    if (groupIds.length === 0) return [];
    const gps = await db.select().from(groupPlayers).where(inArray(groupPlayers.groupId, groupIds));
    const result = [];
    for (const gp of gps) {
      const [pp] = await db.select({ id: presetPlayers.id, name: presetPlayers.name })
        .from(presetPlayers).where(eq(presetPlayers.id, gp.presetPlayerId));
      if (pp) {
        result.push({ ...pp, groupId: gp.groupId });
      }
    }
    return result;
  }

  // Dynamic preset players
  async getDynamicPresetPlayers(): Promise<PresetPlayer[]> {
    return db.select().from(presetPlayers).orderBy(presetPlayers.name);
  }

  async createPresetPlayer(name: string, showInRoster: boolean = true): Promise<PresetPlayer> {
    const [newPlayer] = await db.insert(presetPlayers).values({ name, showInRoster }).returning();
    return newPlayer;
  }

  async getPresetPlayerByName(name: string): Promise<PresetPlayer | undefined> {
    const [player] = await db.select().from(presetPlayers).where(
      sql`LOWER(${presetPlayers.name}) = LOWER(${name})`
    );
    return player;
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
    
    // Get the preset player ID for the new name
    const [presetPlayer] = await db.select().from(presetPlayers).where(eq(presetPlayers.name, newName));
    const presetPlayerId = presetPlayer?.id ?? null;
    
    // Update ryderCupTeamMembers to cascade name changes AND link presetPlayerId
    await db.update(ryderCupTeamMembers)
      .set({ playerName: newName, presetPlayerId })
      .where(eq(ryderCupTeamMembers.playerName, oldName));
    
    // Also update members that have this presetPlayerId to get the new name
    if (presetPlayerId) {
      await db.update(ryderCupTeamMembers)
        .set({ playerName: newName })
        .where(eq(ryderCupTeamMembers.presetPlayerId, presetPlayerId));
    }
    
    // Update ryderCupPairingSides player1Name
    await db.update(ryderCupPairingSides)
      .set({ player1Name: newName })
      .where(eq(ryderCupPairingSides.player1Name, oldName));
    
    // Update ryderCupPairingSides player2Name
    await db.update(ryderCupPairingSides)
      .set({ player2Name: newName })
      .where(eq(ryderCupPairingSides.player2Name, oldName));
    
    // Update ryderCupSkins winnerName by name AND by presetPlayerId
    await db.update(ryderCupSkins)
      .set({ winnerName: newName, winnerPresetPlayerId: presetPlayerId })
      .where(eq(ryderCupSkins.winnerName, oldName));
    if (presetPlayerId) {
      await db.update(ryderCupSkins)
        .set({ winnerName: newName })
        .where(eq(ryderCupSkins.winnerPresetPlayerId, presetPlayerId));
    }
    
    // Update ryderCupClosestToHole winnerName by name AND by presetPlayerId
    await db.update(ryderCupClosestToHole)
      .set({ winnerName: newName, winnerPresetPlayerId: presetPlayerId })
      .where(eq(ryderCupClosestToHole.winnerName, oldName));
    if (presetPlayerId) {
      await db.update(ryderCupClosestToHole)
        .set({ winnerName: newName })
        .where(eq(ryderCupClosestToHole.winnerPresetPlayerId, presetPlayerId));
    }
    
    // Update regular match players by name AND by presetPlayerId
    await db.update(players)
      .set({ name: newName, presetPlayerId })
      .where(eq(players.name, oldName));
    if (presetPlayerId) {
      await db.update(players)
        .set({ name: newName })
        .where(eq(players.presetPlayerId, presetPlayerId));
    }
    
    // Update ryderCupTransactions payerName by name AND by presetPlayerId
    await db.update(ryderCupTransactions)
      .set({ payerName: newName, payerPresetPlayerId: presetPlayerId })
      .where(eq(ryderCupTransactions.payerName, oldName));
    if (presetPlayerId) {
      await db.update(ryderCupTransactions)
        .set({ payerName: newName })
        .where(eq(ryderCupTransactions.payerPresetPlayerId, presetPlayerId));
    }
    
    // Update ryderCupTransactionSplits playerName by name AND by presetPlayerId
    await db.update(ryderCupTransactionSplits)
      .set({ playerName: newName, presetPlayerId })
      .where(eq(ryderCupTransactionSplits.playerName, oldName));
    if (presetPlayerId) {
      await db.update(ryderCupTransactionSplits)
        .set({ playerName: newName })
        .where(eq(ryderCupTransactionSplits.presetPlayerId, presetPlayerId));
    }
    
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

  async getRyderCupDay(dayId: number): Promise<RyderCupDay | undefined> {
    const [day] = await db.select().from(ryderCupDays).where(eq(ryderCupDays.id, dayId));
    return day;
  }

  async replacePlayerInRyderCupEvent(
    eventId: number,
    oldPresetPlayerId: number,
    newPresetPlayerId: number
  ): Promise<{ oldPlayerName: string; newPlayerName: string }> {
    // Validate: Can't replace player with themselves
    if (oldPresetPlayerId === newPresetPlayerId) {
      throw new Error("Cannot replace a player with themselves");
    }

    // Look up both players by their preset IDs
    const [oldPresetPlayer] = await db.select().from(presetPlayers).where(eq(presetPlayers.id, oldPresetPlayerId));
    const [newPresetPlayer] = await db.select().from(presetPlayers).where(eq(presetPlayers.id, newPresetPlayerId));

    if (!oldPresetPlayer) {
      throw new Error("Old player not found in preset players");
    }
    if (!newPresetPlayer) {
      throw new Error("New player not found in preset players");
    }

    const oldPlayerName = oldPresetPlayer.name;
    const newPlayerName = newPresetPlayer.name;

    // Get teams for this event
    const teams = await db.select().from(ryderCupTeams).where(eq(ryderCupTeams.eventId, eventId));
    const teamIds = teams.map(t => t.id);

    // Validate: Check if old player is actually in the event
    if (teamIds.length > 0) {
      const [oldMember] = await db.select().from(ryderCupTeamMembers).where(and(
        inArray(ryderCupTeamMembers.teamId, teamIds),
        eq(ryderCupTeamMembers.presetPlayerId, oldPresetPlayerId)
      ));
      if (!oldMember) {
        throw new Error("Player to replace is not a member of any team in this event");
      }

      // Validate: Check if new player is already in the event
      const [existingMember] = await db.select().from(ryderCupTeamMembers).where(and(
        inArray(ryderCupTeamMembers.teamId, teamIds),
        eq(ryderCupTeamMembers.presetPlayerId, newPresetPlayerId)
      ));
      if (existingMember) {
        throw new Error("Replacement player is already a member of a team in this event");
      }
    }

    // Update ryderCupTeamMembers - replace old player with new player using presetPlayerId (primary)
    if (teamIds.length > 0) {
      await db.update(ryderCupTeamMembers)
        .set({ playerName: newPlayerName, presetPlayerId: newPresetPlayerId })
        .where(and(
          inArray(ryderCupTeamMembers.teamId, teamIds),
          eq(ryderCupTeamMembers.presetPlayerId, oldPresetPlayerId)
        ));
      // Fallback: also update by name for legacy records without presetPlayerId
      await db.update(ryderCupTeamMembers)
        .set({ playerName: newPlayerName, presetPlayerId: newPresetPlayerId })
        .where(and(
          inArray(ryderCupTeamMembers.teamId, teamIds),
          eq(ryderCupTeamMembers.playerName, oldPlayerName)
        ));
    }

    // Get days for this event to scope pairing updates
    const days = await db.select().from(ryderCupDays).where(eq(ryderCupDays.eventId, eventId));
    const dayIds = days.map(d => d.id);

    if (dayIds.length > 0) {
      // Get pairings for these days
      const pairings = await db.select().from(ryderCupPairings).where(inArray(ryderCupPairings.dayId, dayIds));
      const pairingIds = pairings.map(p => p.id);

      if (pairingIds.length > 0) {
        // Update ryderCupPairingSides player1Name
        await db.update(ryderCupPairingSides)
          .set({ player1Name: newPlayerName })
          .where(and(
            inArray(ryderCupPairingSides.pairingId, pairingIds),
            eq(ryderCupPairingSides.player1Name, oldPlayerName)
          ));

        // Update ryderCupPairingSides player2Name
        await db.update(ryderCupPairingSides)
          .set({ player2Name: newPlayerName })
          .where(and(
            inArray(ryderCupPairingSides.pairingId, pairingIds),
            eq(ryderCupPairingSides.player2Name, oldPlayerName)
          ));
      }

      // Update ryderCupSkins winnerName using presetPlayerId (primary)
      await db.update(ryderCupSkins)
        .set({ winnerName: newPlayerName, winnerPresetPlayerId: newPresetPlayerId })
        .where(and(
          inArray(ryderCupSkins.dayId, dayIds),
          eq(ryderCupSkins.winnerPresetPlayerId, oldPresetPlayerId)
        ));
      // Fallback: also update by name for legacy records without presetPlayerId
      await db.update(ryderCupSkins)
        .set({ winnerName: newPlayerName, winnerPresetPlayerId: newPresetPlayerId })
        .where(and(
          inArray(ryderCupSkins.dayId, dayIds),
          eq(ryderCupSkins.winnerName, oldPlayerName)
        ));

      // Update ryderCupClosestToHole winnerName using presetPlayerId (primary)
      await db.update(ryderCupClosestToHole)
        .set({ winnerName: newPlayerName, winnerPresetPlayerId: newPresetPlayerId })
        .where(and(
          inArray(ryderCupClosestToHole.dayId, dayIds),
          eq(ryderCupClosestToHole.winnerPresetPlayerId, oldPresetPlayerId)
        ));
      // Fallback: also update by name for legacy records without presetPlayerId
      await db.update(ryderCupClosestToHole)
        .set({ winnerName: newPlayerName, winnerPresetPlayerId: newPresetPlayerId })
        .where(and(
          inArray(ryderCupClosestToHole.dayId, dayIds),
          eq(ryderCupClosestToHole.winnerName, oldPlayerName)
        ));
    }

    // Update ryderCupTransactions payerName using presetPlayerId (primary)
    await db.update(ryderCupTransactions)
      .set({ payerName: newPlayerName, payerPresetPlayerId: newPresetPlayerId })
      .where(and(
        eq(ryderCupTransactions.eventId, eventId),
        eq(ryderCupTransactions.payerPresetPlayerId, oldPresetPlayerId)
      ));
    // Fallback: also update by name for legacy records without presetPlayerId
    await db.update(ryderCupTransactions)
      .set({ payerName: newPlayerName, payerPresetPlayerId: newPresetPlayerId })
      .where(and(
        eq(ryderCupTransactions.eventId, eventId),
        eq(ryderCupTransactions.payerName, oldPlayerName)
      ));

    // Update ryderCupTransactionSplits using presetPlayerId (primary)
    const transactions = await db.select().from(ryderCupTransactions).where(eq(ryderCupTransactions.eventId, eventId));
    const transactionIds = transactions.map(t => t.id);

    if (transactionIds.length > 0) {
      await db.update(ryderCupTransactionSplits)
        .set({ playerName: newPlayerName, presetPlayerId: newPresetPlayerId })
        .where(and(
          inArray(ryderCupTransactionSplits.transactionId, transactionIds),
          eq(ryderCupTransactionSplits.presetPlayerId, oldPresetPlayerId)
        ));
      // Fallback: also update by name for legacy records without presetPlayerId
      await db.update(ryderCupTransactionSplits)
        .set({ playerName: newPlayerName, presetPlayerId: newPresetPlayerId })
        .where(and(
          inArray(ryderCupTransactionSplits.transactionId, transactionIds),
          eq(ryderCupTransactionSplits.playerName, oldPlayerName)
        ));
    }

    // Update players in side matches linked to this Ryder Cup event using presetPlayerId (primary)
    const sideMatchContainers = await db.select().from(matches).where(eq(matches.ryderCupEventId, eventId));
    const sideMatchIds = sideMatchContainers.map(m => m.id);
    
    if (sideMatchIds.length > 0) {
      await db.update(players)
        .set({ name: newPlayerName, presetPlayerId: newPresetPlayerId })
        .where(and(
          inArray(players.matchId, sideMatchIds),
          eq(players.presetPlayerId, oldPresetPlayerId)
        ));
      // Fallback: also update by name for legacy records without presetPlayerId
      await db.update(players)
        .set({ name: newPlayerName, presetPlayerId: newPresetPlayerId })
        .where(and(
          inArray(players.matchId, sideMatchIds),
          eq(players.name, oldPlayerName)
        ));
    }

    return { oldPlayerName, newPlayerName };
  }

  async updateRyderCupDayCourse(dayId: number, courseId: number, courseName: string): Promise<RyderCupDay> {
    const [updated] = await db.update(ryderCupDays)
      .set({ courseId, courseName })
      .where(eq(ryderCupDays.id, dayId))
      .returning();
    
    // Also update all side matches linked to this day
    // Get the event ID and day number from the day record
    if (updated) {
      await db.update(matches)
        .set({ courseId, courseName })
        .where(and(
          eq(matches.ryderCupEventId, updated.eventId),
          eq(matches.ryderCupDayNumber, updated.dayNumber)
        ));
    }
    
    return updated;
  }

  async updateRyderCupDaySchedule(dayId: number, date?: string, teeTimes?: string[]): Promise<RyderCupDay> {
    const updateData: Partial<RyderCupDay> = {};
    if (date !== undefined) {
      updateData.date = new Date(date);
    }
    if (teeTimes !== undefined) {
      updateData.teeTimes = teeTimes;
      
      // Auto-assign tee times to pairings in order (first tee time → first match, etc.)
      const pairings = await db.select().from(ryderCupPairings)
        .where(and(
          eq(ryderCupPairings.dayId, dayId),
          eq(ryderCupPairings.isPrimary, true)
        ));
      
      // Sort pairings by match number
      const sortedPairings = pairings.sort((a, b) => a.matchNumber - b.matchNumber);
      
      // Assign tee times in order
      for (let i = 0; i < sortedPairings.length; i++) {
        const teeTime = i < teeTimes.length ? teeTimes[i] : null;
        await db.update(ryderCupPairings)
          .set({ teeTime })
          .where(eq(ryderCupPairings.id, sortedPairings[i].id));
      }
    }
    const [updated] = await db.update(ryderCupDays)
      .set(updateData)
      .where(eq(ryderCupDays.id, dayId))
      .returning();
    return updated;
  }

  async updateRyderCupDayStartOnBack9(dayId: number, startOnBack9: boolean): Promise<RyderCupDay> {
    const [updated] = await db.update(ryderCupDays)
      .set({ startOnBack9 })
      .where(eq(ryderCupDays.id, dayId))
      .returning();
    return updated;
  }

  async getRyderCupPairing(pairingId: number): Promise<RyderCupPairing | undefined> {
    const [pairing] = await db.select().from(ryderCupPairings).where(eq(ryderCupPairings.id, pairingId));
    return pairing;
  }

  async updateRyderCupPairingTeeTime(pairingId: number, teeTime: string | null): Promise<RyderCupPairing> {
    const [updated] = await db.update(ryderCupPairings)
      .set({ teeTime })
      .where(eq(ryderCupPairings.id, pairingId))
      .returning();
    return updated;
  }

  async reorderRyderCupPairings(dayId: number, pairingOrder: number[]): Promise<void> {
    // Update match numbers based on the new order
    // pairingOrder is an array of pairing IDs in the desired order
    for (let i = 0; i < pairingOrder.length; i++) {
      const pairingId = pairingOrder[i];
      const matchNumber = i + 1;
      await db.update(ryderCupPairings)
        .set({ matchNumber })
        .where(eq(ryderCupPairings.id, pairingId));
    }
    
    // Re-assign tee times based on new order
    const day = await this.getRyderCupDay(dayId);
    if (day?.teeTimes && day.teeTimes.length > 0) {
      for (let i = 0; i < pairingOrder.length; i++) {
        const pairingId = pairingOrder[i];
        const teeTime = i < day.teeTimes.length ? day.teeTimes[i] : null;
        await db.update(ryderCupPairings)
          .set({ teeTime })
          .where(eq(ryderCupPairings.id, pairingId));
      }
    }
  }

  async getRyderCupPairingSide(sideId: number): Promise<RyderCupPairingSide | undefined> {
    const [side] = await db.select().from(ryderCupPairingSides).where(eq(ryderCupPairingSides.id, sideId));
    return side;
  }

  async updateRyderCupSidePlayer(
    sideId: number,
    playerNumber: 1 | 2,
    handicapIndex?: number | null,
    teeId?: number | null
  ): Promise<RyderCupPairingSide> {
    const updateData: Record<string, number | null> = {};
    if (playerNumber === 1) {
      if (handicapIndex !== undefined) updateData.player1HandicapIndex = handicapIndex;
      if (teeId !== undefined) updateData.player1TeeId = teeId;
    } else {
      if (handicapIndex !== undefined) updateData.player2HandicapIndex = handicapIndex;
      if (teeId !== undefined) updateData.player2TeeId = teeId;
    }
    const [updated] = await db.update(ryderCupPairingSides)
      .set(updateData)
      .where(eq(ryderCupPairingSides.id, sideId))
      .returning();
    return updated;
  }

  async saveRyderCupPairingScores(
    sideId: number,
    scores: { holeNumber: number; player1Strokes: number | null; player2Strokes: number | null }[]
  ): Promise<void> {
    // Upsert scores for each hole - preserve existing scores when only one player is being updated
    for (const score of scores) {
      const [existing] = await db.select()
        .from(ryderCupPairingScores)
        .where(and(
          eq(ryderCupPairingScores.sideId, sideId),
          eq(ryderCupPairingScores.holeNumber, score.holeNumber)
        ));
      
      if (existing) {
        // Only update the fields that are provided (not null), preserve existing values otherwise
        const updateData: { player1Strokes?: number | null; player2Strokes?: number | null } = {};
        if (score.player1Strokes !== null) {
          updateData.player1Strokes = score.player1Strokes;
        }
        if (score.player2Strokes !== null) {
          updateData.player2Strokes = score.player2Strokes;
        }
        if (Object.keys(updateData).length > 0) {
          await db.update(ryderCupPairingScores)
            .set(updateData)
            .where(eq(ryderCupPairingScores.id, existing.id));
        }
      } else {
        await db.insert(ryderCupPairingScores).values({
          sideId,
          holeNumber: score.holeNumber,
          player1Strokes: score.player1Strokes,
          player2Strokes: score.player2Strokes,
        });
      }
    }
  }

  async getRyderCupPairingScorecard(pairingId: number): Promise<{
    pairing: RyderCupPairing;
    sides: (RyderCupPairingSide & { scores: RyderCupPairingScore[] })[];
    course: Course | null;
    courseHoles: CourseHole[];
    courseTees: CourseTee[];
    eventId: number | null;
  } | null> {
    const pairing = await this.getRyderCupPairing(pairingId);
    if (!pairing) return null;

    const sides = await db.select().from(ryderCupPairingSides).where(eq(ryderCupPairingSides.pairingId, pairingId));
    const sidesWithScores = await Promise.all(
      sides.map(async (side) => {
        const scores = await db.select()
          .from(ryderCupPairingScores)
          .where(eq(ryderCupPairingScores.sideId, side.id))
          .orderBy(ryderCupPairingScores.holeNumber);
        return { ...side, scores };
      })
    );

    // Get course and event from the day
    const day = await this.getRyderCupDay(pairing.dayId);
    let course: Course | null = null;
    let courseHolesData: CourseHole[] = [];
    let courseTeesData: CourseTee[] = [];
    let eventId: number | null = null;
    if (day) {
      eventId = day.eventId;
      if (day.courseId) {
        course = await this.getCourse(day.courseId) || null;
        courseHolesData = await this.getCourseHoles(day.courseId);
        courseTeesData = await this.getCourseTees(day.courseId);
      }
    }

    return { pairing, sides: sidesWithScores, course, courseHoles: courseHolesData, courseTees: courseTeesData, eventId };
  }

  async getRyderCupEventFull(id: number): Promise<RyderCupEventResponse | undefined> {
    const event = await this.getRyderCupEvent(id);
    if (!event) return undefined;

    const teamsList = await db.select().from(ryderCupTeams).where(eq(ryderCupTeams.eventId, id));
    const teamsWithMembers = await Promise.all(
      teamsList.map(async (team) => {
        const membersRaw = await db.select().from(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.teamId, team.id));
        const members = await Promise.all(
          membersRaw.map(async (member) => {
            let displayName = member.playerName;
            if (member.presetPlayerId) {
              const [preset] = await db.select().from(presetPlayers).where(eq(presetPlayers.id, member.presetPlayerId));
              if (preset) displayName = preset.name;
            }
            return { ...member, playerName: displayName };
          })
        );
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
            const sidesWithScores = await Promise.all(
              sides.map(async (side) => {
                const scores = await db.select()
                  .from(ryderCupPairingScores)
                  .where(eq(ryderCupPairingScores.sideId, side.id))
                  .orderBy(ryderCupPairingScores.holeNumber);
                
                // Look up current player names from presetPlayers via team members if IDs are set
                let player1Name = side.player1Name;
                let player2Name = side.player2Name;
                
                if (side.player1Id) {
                  const [member1] = await db.select().from(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.id, side.player1Id));
                  if (member1) {
                    if (member1.presetPlayerId) {
                      const [preset1] = await db.select().from(presetPlayers).where(eq(presetPlayers.id, member1.presetPlayerId));
                      if (preset1) player1Name = preset1.name;
                    } else {
                      player1Name = member1.playerName;
                    }
                  }
                }
                if (side.player2Id) {
                  const [member2] = await db.select().from(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.id, side.player2Id));
                  if (member2) {
                    if (member2.presetPlayerId) {
                      const [preset2] = await db.select().from(presetPlayers).where(eq(presetPlayers.id, member2.presetPlayerId));
                      if (preset2) player2Name = preset2.name;
                    } else {
                      player2Name = member2.playerName;
                    }
                  }
                }
                
                return { ...side, player1Name, player2Name, scores };
              })
            );
            const [result] = await db.select().from(ryderCupPairingResults).where(eq(ryderCupPairingResults.pairingId, pairing.id));
            return { ...pairing, sides: sidesWithScores, result };
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
      groupId: data.groupId ?? null,
      courseName: data.courseName,
      courseId,
      creatorId,
      buyInAmount: data.buyInAmount ?? 30000,
      teamWinBonus: data.teamWinBonus ?? 12500,
      matchWinBonus: data.matchWinBonus ?? 2500,
      matchTieBonus: data.matchTieBonus ?? 1250,
      dailySkinsPot: data.dailySkinsPot ?? 21250,
      closestToHolePayout: data.closestToHolePayout ?? 0,
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
      const [preset] = await db.select().from(presetPlayers).where(eq(presetPlayers.name, member.playerName));
      await db.insert(ryderCupTeamMembers).values({
        teamId: teamA.id,
        playerName: member.playerName,
        presetPlayerId: preset?.id ?? null,
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
      const [preset] = await db.select().from(presetPlayers).where(eq(presetPlayers.name, member.playerName));
      await db.insert(ryderCupTeamMembers).values({
        teamId: teamB.id,
        playerName: member.playerName,
        presetPlayerId: preset?.id ?? null,
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
        date: dayConfig?.date ? new Date(dayConfig.date) : null,
        teeTimes: dayConfig?.teeTimes ?? null,
        courseId: dayConfig?.courseId ?? courseId,
        courseName: dayConfig?.courseName ?? data.courseName,
      });
    }

    return event;
  }

  private async getPlayerIdByName(teamId: number, playerName: string): Promise<number | null> {
    const [member] = await db.select()
      .from(ryderCupTeamMembers)
      .where(and(
        eq(ryderCupTeamMembers.teamId, teamId),
        eq(ryderCupTeamMembers.playerName, playerName)
      ));
    return member?.id || null;
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

    // Shuffle players randomly to assign slots (A1, A2, etc.)
    const shuffleArray = <T>(array: T[]): T[] => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    const shuffledTeamA = shuffleArray(teamAPlayers);
    const shuffledTeamB = shuffleArray(teamBPlayers);

    // Generate pairings using rotation algorithm
    // Each player plays with 4 of 5 teammates over 4 days (3 matches per day = 12 total)
    // Partner rotation ensures variety
    const schedule = this.generateRotationSchedule(shuffledTeamA, shuffledTeamB);

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

        // Create sides with player IDs for dynamic name updates
        const player1IdA = await this.getPlayerIdByName(teamA.id, matchPairing.teamA[0]);
        const player2IdA = await this.getPlayerIdByName(teamA.id, matchPairing.teamA[1]);
        const player1IdB = await this.getPlayerIdByName(teamB.id, matchPairing.teamB[0]);
        const player2IdB = await this.getPlayerIdByName(teamB.id, matchPairing.teamB[1]);

        await db.insert(ryderCupPairingSides).values({
          pairingId: pairing.id,
          teamId: teamA.id,
          player1Name: matchPairing.teamA[0],
          player2Name: matchPairing.teamA[1],
          player1Id: player1IdA,
          player2Id: player2IdA,
        });

        await db.insert(ryderCupPairingSides).values({
          pairingId: pairing.id,
          teamId: teamB.id,
          player1Name: matchPairing.teamB[0],
          player2Name: matchPairing.teamB[1],
          player1Id: player1IdB,
          player2Id: player2IdB,
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
    // Player indices: 0-5 for each team (A1=0, A2=1, ... A6=5, B1=0, B2=1, ... B6=5)
    const pairingPattern = [
      // Day 1
      { a: [0, 1], b: [0, 1] }, // A1-A2 vs B1-B2
      { a: [2, 3], b: [2, 3] }, // A3-A4 vs B3-B4
      { a: [4, 5], b: [4, 5] }, // A5-A6 vs B5-B6
      // Day 2
      { a: [0, 2], b: [1, 4] }, // A1-A3 vs B2-B5
      { a: [1, 4], b: [0, 2] }, // A2-A5 vs B1-B3
      { a: [3, 5], b: [3, 5] }, // A4-A6 vs B4-B6
      // Day 3
      { a: [0, 3], b: [0, 3] }, // A1-A4 vs B1-B4
      { a: [1, 5], b: [2, 4] }, // A2-A6 vs B3-B5
      { a: [2, 4], b: [1, 5] }, // A3-A5 vs B2-B6
      // Day 4
      { a: [0, 4], b: [2, 5] }, // A1-A5 vs B3-B6
      { a: [1, 3], b: [1, 3] }, // A2-A4 vs B2-B4
      { a: [2, 5], b: [0, 4] }, // A3-A6 vs B1-B5
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

    // Look up player IDs for dynamic name updates
    const player1IdA = await this.getPlayerIdByName(teamA.id, data.sideA.playerNames[0]);
    const player2IdA = data.sideA.playerNames[1] ? await this.getPlayerIdByName(teamA.id, data.sideA.playerNames[1]) : null;
    const player1IdB = await this.getPlayerIdByName(teamB.id, data.sideB.playerNames[0]);
    const player2IdB = data.sideB.playerNames[1] ? await this.getPlayerIdByName(teamB.id, data.sideB.playerNames[1]) : null;

    await db.insert(ryderCupPairingSides).values({
      pairingId: pairing.id,
      teamId: teamA.id,
      player1Name: data.sideA.playerNames[0],
      player2Name: data.sideA.playerNames[1] || null,
      player1Id: player1IdA,
      player2Id: player2IdA,
    });

    await db.insert(ryderCupPairingSides).values({
      pairingId: pairing.id,
      teamId: teamB.id,
      player1Name: data.sideB.playerNames[0],
      player2Name: data.sideB.playerNames[1] || null,
      player1Id: player1IdB,
      player2Id: player2IdB,
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
        // Tie - each team gets the halved points (pointsAwarded is already half the match value for ties)
        const sides = await db.select().from(ryderCupPairingSides).where(eq(ryderCupPairingSides.pairingId, p.id));
        for (const side of sides) {
          teamPoints[side.teamId] += result.pointsAwarded;
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
    // Look up preset player ID for dynamic name updates
    let winnerPresetPlayerId: number | null = null;
    if (winnerName) {
      const [preset] = await db.select().from(presetPlayers).where(eq(presetPlayers.name, winnerName));
      if (preset) {
        winnerPresetPlayerId = preset.id;
      }
    }
    
    // Check if skin already recorded
    const [existing] = await db.select().from(ryderCupSkins)
      .where(and(
        eq(ryderCupSkins.dayId, dayId),
        eq(ryderCupSkins.holeNumber, holeNumber)
      ));

    if (existing) {
      const [updated] = await db.update(ryderCupSkins)
        .set({ winnerName, winnerPresetPlayerId })
        .where(eq(ryderCupSkins.id, existing.id))
        .returning();
      return updated;
    }

    const [skin] = await db.insert(ryderCupSkins).values({
      dayId,
      holeNumber,
      winnerName,
      winnerPresetPlayerId,
    }).returning();

    return skin;
  }

  async getRyderCupDaySkins(dayId: number): Promise<RyderCupSkin[]> {
    return db.select().from(ryderCupSkins).where(eq(ryderCupSkins.dayId, dayId)).orderBy(ryderCupSkins.holeNumber);
  }

  async recordClosestToHoleWinner(dayId: number, holeNumber: number, winnerName: string | null): Promise<RyderCupClosestToHole> {
    // Look up preset player ID for dynamic name updates
    let winnerPresetPlayerId: number | null = null;
    if (winnerName) {
      const [preset] = await db.select().from(presetPlayers).where(eq(presetPlayers.name, winnerName));
      if (preset) {
        winnerPresetPlayerId = preset.id;
      }
    }
    
    // Check if entry exists
    const [existing] = await db.select().from(ryderCupClosestToHole)
      .where(and(
        eq(ryderCupClosestToHole.dayId, dayId),
        eq(ryderCupClosestToHole.holeNumber, holeNumber)
      ));
    
    if (existing) {
      const [updated] = await db.update(ryderCupClosestToHole)
        .set({ winnerName, winnerPresetPlayerId })
        .where(eq(ryderCupClosestToHole.id, existing.id))
        .returning();
      return updated;
    }
    
    const [cth] = await db.insert(ryderCupClosestToHole).values({
      dayId,
      holeNumber,
      winnerName,
      winnerPresetPlayerId,
    }).returning();

    return cth;
  }

  async getClosestToHoleWinners(dayId: number): Promise<RyderCupClosestToHole[]> {
    return db.select().from(ryderCupClosestToHole)
      .where(eq(ryderCupClosestToHole.dayId, dayId))
      .orderBy(ryderCupClosestToHole.holeNumber);
  }

  async getAllClosestToHoleWinners(eventId: number): Promise<RyderCupClosestToHole[]> {
    // Get all days for this event, then all CTH winners for those days
    const days = await db.select().from(ryderCupDays).where(eq(ryderCupDays.eventId, eventId));
    const dayIds = days.map(d => d.id);
    if (dayIds.length === 0) return [];
    return db.select().from(ryderCupClosestToHole)
      .where(inArray(ryderCupClosestToHole.dayId, dayIds))
      .orderBy(ryderCupClosestToHole.dayId, ryderCupClosestToHole.holeNumber);
  }

  async getMatchesByRyderCupEvent(eventId: number): Promise<Match[]> {
    return db.select().from(matches).where(eq(matches.ryderCupEventId, eventId)).orderBy(matches.createdAt);
  }

  async getSideMatchLedgerData(eventId: number) {
    const allMatches = await db.select().from(matches).where(eq(matches.ryderCupEventId, eventId)).orderBy(matches.createdAt);

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
      
      if (match.courseId && !courseDataMap.has(match.courseId)) {
        const holes = await this.getCourseHoles(match.courseId);
        const tees = await this.getCourseTees(match.courseId);
        courseDataMap.set(match.courseId, { holes, tees });
      }
    }

    const courseData: Record<number, { holes: CourseHole[]; tees: CourseTee[] }> = {};
    courseDataMap.forEach((data, courseId) => {
      courseData[courseId] = data;
    });

    // Get Ryder Cup pairing scores for this event
    // Build a map of player name -> scores per hole, grouped by day number
    const ryderCupScoresByDay: Record<number, Record<string, Record<number, number>>> = {};
    
    // Build a map of player name -> handicap/tee data from Ryder Cup pairings, grouped by day number
    // This is the authoritative source for handicap data in side matches
    const ryderCupPlayerDataByDay: Record<number, Record<string, { handicapIndex: number | null; teeId: number | null }>> = {};
    
    // Build a map of day number -> startOnBack9 setting
    const startOnBack9ByDay: Record<number, boolean> = {};
    
    // Get all days for this event
    const days = await db.select().from(ryderCupDays).where(eq(ryderCupDays.eventId, eventId));
    
    for (const day of days) {
      ryderCupScoresByDay[day.dayNumber] = {};
      ryderCupPlayerDataByDay[day.dayNumber] = {};
      startOnBack9ByDay[day.dayNumber] = day.startOnBack9 ?? false;
      
      // Get all pairings for this day
      const pairings = await db.select().from(ryderCupPairings).where(eq(ryderCupPairings.dayId, day.id));
      
      for (const pairing of pairings) {
        // Get all sides for this pairing
        const sides = await db.select().from(ryderCupPairingSides).where(eq(ryderCupPairingSides.pairingId, pairing.id));
        
        for (const side of sides) {
          // Get scores for this side
          const scores = await db.select().from(ryderCupPairingScores).where(eq(ryderCupPairingScores.sideId, side.id));
          
          // Look up current player names from team members if IDs are set
          let player1Name = side.player1Name;
          let player2Name = side.player2Name;
          
          if (side.player1Id) {
            const [member1] = await db.select().from(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.id, side.player1Id));
            if (member1) player1Name = member1.playerName;
          }
          if (side.player2Id) {
            const [member2] = await db.select().from(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.id, side.player2Id));
            if (member2) player2Name = member2.playerName;
          }
          
          // Map player1 scores and handicap data
          if (player1Name) {
            if (!ryderCupScoresByDay[day.dayNumber][player1Name]) {
              ryderCupScoresByDay[day.dayNumber][player1Name] = {};
            }
            for (const score of scores) {
              if (score.player1Strokes !== null) {
                ryderCupScoresByDay[day.dayNumber][player1Name][score.holeNumber] = score.player1Strokes;
              }
            }
            // Store handicap and tee data from the pairing side (authoritative source)
            ryderCupPlayerDataByDay[day.dayNumber][player1Name] = {
              handicapIndex: side.player1HandicapIndex,
              teeId: side.player1TeeId,
            };
          }
          
          // Map player2 scores and handicap data
          if (player2Name) {
            if (!ryderCupScoresByDay[day.dayNumber][player2Name]) {
              ryderCupScoresByDay[day.dayNumber][player2Name] = {};
            }
            for (const score of scores) {
              if (score.player2Strokes !== null) {
                ryderCupScoresByDay[day.dayNumber][player2Name][score.holeNumber] = score.player2Strokes;
              }
            }
            // Store handicap and tee data from the pairing side (authoritative source)
            ryderCupPlayerDataByDay[day.dayNumber][player2Name] = {
              handicapIndex: side.player2HandicapIndex,
              teeId: side.player2TeeId,
            };
          }
        }
      }
    }

    // Fetch handicap overrides for all event matches
    const eventMatchIds = allEventMatches.map((em: any) => em.id);
    const handicapOverrides: Record<number, Record<number, number>> = {};
    
    if (eventMatchIds.length > 0) {
      const overrides = await db.select().from(matchPlayerHandicaps)
        .where(inArray(matchPlayerHandicaps.eventMatchId, eventMatchIds));
      
      for (const override of overrides) {
        if (!handicapOverrides[override.eventMatchId]) {
          handicapOverrides[override.eventMatchId] = {};
        }
        handicapOverrides[override.eventMatchId][override.playerId] = override.courseHandicap;
      }
    }

    return {
      matches: allMatches,
      eventMatches: allEventMatches,
      scores: allScores,
      courseData,
      ryderCupScoresByDay,
      ryderCupPlayerDataByDay,
      startOnBack9ByDay,
      handicapOverrides,
    };
  }

  async updateRyderCupEventHandicaps(eventId: number, useHandicaps: boolean): Promise<RyderCupEvent> {
    const [updated] = await db.update(ryderCupEvents)
      .set({ useHandicaps })
      .where(eq(ryderCupEvents.id, eventId))
      .returning();
    return updated;
  }

  async updateRyderCupEventStatus(eventId: number, status: string): Promise<RyderCupEvent> {
    const [updated] = await db.update(ryderCupEvents)
      .set({ status })
      .where(eq(ryderCupEvents.id, eventId))
      .returning();
    return updated;
  }

  async updateRyderCupEventClosestToHolePayout(eventId: number, closestToHolePayout: number): Promise<RyderCupEvent> {
    const [updated] = await db.update(ryderCupEvents)
      .set({ closestToHolePayout })
      .where(eq(ryderCupEvents.id, eventId))
      .returning();
    return updated;
  }

  async updateRyderCupEventPayouts(eventId: number, payouts: {
    buyInAmount?: number;
    teamWinBonus?: number;
    matchWinBonus?: number;
    matchTieBonus?: number;
    dailySkinsPot?: number;
    closestToHolePayout?: number;
    includeBuyInInLedger?: boolean;
  }): Promise<RyderCupEvent> {
    const [updated] = await db.update(ryderCupEvents)
      .set(payouts)
      .where(eq(ryderCupEvents.id, eventId))
      .returning();
    return updated;
  }

  async updateRyderCupTeam(teamId: number, updates: { name?: string; color?: string }): Promise<RyderCupTeam | null> {
    const [updated] = await db.update(ryderCupTeams)
      .set(updates)
      .where(eq(ryderCupTeams.id, teamId))
      .returning();
    return updated || null;
  }

  async getRyderCupTeam(teamId: number): Promise<RyderCupTeam | null> {
    const [team] = await db.select().from(ryderCupTeams).where(eq(ryderCupTeams.id, teamId));
    return team || null;
  }

  async updateRyderCupTeamMemberHandicap(memberId: number, handicapIndex: number | null): Promise<RyderCupTeamMember | null> {
    const [updated] = await db.update(ryderCupTeamMembers)
      .set({ handicapIndex })
      .where(eq(ryderCupTeamMembers.id, memberId))
      .returning();
    return updated || null;
  }

  async updateRyderCupTeamMemberName(memberId: number, playerName: string): Promise<RyderCupTeamMember | null> {
    const [preset] = await db.select().from(presetPlayers).where(eq(presetPlayers.name, playerName));
    const [updated] = await db.update(ryderCupTeamMembers)
      .set({ playerName, presetPlayerId: preset?.id ?? null })
      .where(eq(ryderCupTeamMembers.id, memberId))
      .returning();
    return updated || null;
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

  // Ryder Cup Transaction methods
  async getRyderCupTransactions(eventId: number): Promise<(RyderCupTransaction & { splits: RyderCupTransactionSplit[] })[]> {
    const transactions = await db.select().from(ryderCupTransactions)
      .where(eq(ryderCupTransactions.eventId, eventId))
      .orderBy(desc(ryderCupTransactions.createdAt));
    
    const result: (RyderCupTransaction & { splits: RyderCupTransactionSplit[] })[] = [];
    
    for (const transaction of transactions) {
      const splits = await db.select().from(ryderCupTransactionSplits)
        .where(eq(ryderCupTransactionSplits.transactionId, transaction.id));
      result.push({ ...transaction, splits });
    }
    
    return result;
  }

  async createRyderCupTransaction(
    eventId: number,
    payerName: string,
    description: string,
    amount: number,
    splitPlayerNames: string[]
  ): Promise<RyderCupTransaction> {
    // Look up payer's presetPlayerId
    const [payerPreset] = await db.select().from(presetPlayers).where(eq(presetPlayers.name, payerName));
    const payerPresetPlayerId = payerPreset?.id ?? null;
    
    const [transaction] = await db.insert(ryderCupTransactions)
      .values({ eventId, payerName, payerPresetPlayerId, description, amount })
      .returning();
    
    // Calculate split amount (evenly divided)
    const splitAmount = Math.floor(amount / splitPlayerNames.length);
    const remainder = amount % splitPlayerNames.length;
    
    // Create splits for each player
    for (let i = 0; i < splitPlayerNames.length; i++) {
      const playerAmount = splitAmount + (i < remainder ? 1 : 0); // Distribute remainder
      // Look up each split player's presetPlayerId
      const [splitPlayerPreset] = await db.select().from(presetPlayers).where(eq(presetPlayers.name, splitPlayerNames[i]));
      const presetPlayerId = splitPlayerPreset?.id ?? null;
      
      await db.insert(ryderCupTransactionSplits)
        .values({
          transactionId: transaction.id,
          playerName: splitPlayerNames[i],
          presetPlayerId,
          amount: playerAmount,
        });
    }
    
    return transaction;
  }

  async deleteRyderCupTransaction(transactionId: number): Promise<void> {
    // Delete splits first (child records)
    await db.delete(ryderCupTransactionSplits)
      .where(eq(ryderCupTransactionSplits.transactionId, transactionId));
    
    // Delete transaction
    await db.delete(ryderCupTransactions)
      .where(eq(ryderCupTransactions.id, transactionId));
  }

  async getRyderCupTransaction(transactionId: number): Promise<RyderCupTransaction | null> {
    const [transaction] = await db.select().from(ryderCupTransactions)
      .where(eq(ryderCupTransactions.id, transactionId));
    return transaction || null;
  }

  async getRyderCupScoresForSideMatch(eventId: number, dayNumber: number, matchPlayers: Player[]): Promise<Score[]> {
    const convertedScores: Score[] = [];
    
    // Get the day for this event
    const [day] = await db.select().from(ryderCupDays)
      .where(and(
        eq(ryderCupDays.eventId, eventId),
        eq(ryderCupDays.dayNumber, dayNumber)
      ));
    
    if (!day) return [];
    
    // Get all pairings for this day
    const pairingsForDay = await db.select().from(ryderCupPairings)
      .where(eq(ryderCupPairings.dayId, day.id));
    
    // Build a map of player name -> their scores by hole
    const scoresByPlayerName: Record<string, Record<number, number>> = {};
    
    for (const pairing of pairingsForDay) {
      // Get all sides for this pairing
      const sides = await db.select().from(ryderCupPairingSides)
        .where(eq(ryderCupPairingSides.pairingId, pairing.id));
      
      for (const side of sides) {
        // Get scores for this side
        const sideScores = await db.select().from(ryderCupPairingScores)
          .where(eq(ryderCupPairingScores.sideId, side.id));
        
        // Look up current player names from team members if IDs are set
        let player1Name = side.player1Name;
        let player2Name = side.player2Name;
        
        if (side.player1Id) {
          const [member1] = await db.select().from(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.id, side.player1Id));
          if (member1) player1Name = member1.playerName;
        }
        if (side.player2Id) {
          const [member2] = await db.select().from(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.id, side.player2Id));
          if (member2) player2Name = member2.playerName;
        }
        
        // Map player1 scores
        if (player1Name) {
          if (!scoresByPlayerName[player1Name]) {
            scoresByPlayerName[player1Name] = {};
          }
          for (const score of sideScores) {
            if (score.player1Strokes !== null) {
              scoresByPlayerName[player1Name][score.holeNumber] = score.player1Strokes;
            }
          }
        }
        
        // Map player2 scores
        if (player2Name) {
          if (!scoresByPlayerName[player2Name]) {
            scoresByPlayerName[player2Name] = {};
          }
          for (const score of sideScores) {
            if (score.player2Strokes !== null) {
              scoresByPlayerName[player2Name][score.holeNumber] = score.player2Strokes;
            }
          }
        }
      }
    }
    
    // Convert to Score format by matching player names to match player IDs
    for (const player of matchPlayers) {
      const playerScores = scoresByPlayerName[player.name];
      if (playerScores) {
        for (const [holeStr, strokes] of Object.entries(playerScores)) {
          const holeNumber = parseInt(holeStr);
          convertedScores.push({
            id: 0, // Virtual score, not in database
            playerId: player.id,
            matchId: player.matchId,
            holeNumber,
            strokes,
          });
        }
      }
    }
    
    return convertedScores;
  }
  
  // Manual Bet methods
  async getManualBets(ryderCupEventId?: number): Promise<ManualBetWithEntries[]> {
    let bets;
    if (ryderCupEventId !== undefined) {
      bets = await db.select().from(manualBets)
        .where(eq(manualBets.ryderCupEventId, ryderCupEventId))
        .orderBy(desc(manualBets.createdAt));
    } else {
      bets = await db.select().from(manualBets).orderBy(desc(manualBets.createdAt));
    }
    
    if (bets.length === 0) {
      return [];
    }
    
    const betIds = bets.map(b => b.id);
    const entries = await db.select().from(manualBetEntries)
      .where(inArray(manualBetEntries.betId, betIds));
    
    // Group entries by betId
    const entriesByBetId = new Map<number, ManualBetEntry[]>();
    for (const entry of entries) {
      if (!entriesByBetId.has(entry.betId)) {
        entriesByBetId.set(entry.betId, []);
      }
      entriesByBetId.get(entry.betId)!.push(entry);
    }
    
    return bets.map(bet => ({
      ...bet,
      entries: entriesByBetId.get(bet.id) || [],
    }));
  }
  
  async createManualBet(
    description: string, 
    entries: { playerName: string; presetPlayerId?: number; amount: number }[], 
    creatorId?: number,
    ryderCupEventId?: number
  ): Promise<ManualBetWithEntries> {
    // Create the bet
    const [bet] = await db.insert(manualBets).values({
      description,
      creatorId: creatorId ?? null,
      ryderCupEventId: ryderCupEventId ?? null,
    }).returning();
    
    // Create entries, looking up presetPlayerId if not provided
    const createdEntries: ManualBetEntry[] = [];
    for (const entry of entries) {
      let presetPlayerId = entry.presetPlayerId ?? null;
      
      // If no presetPlayerId provided, try to look it up by name
      if (!presetPlayerId) {
        const [preset] = await db.select()
          .from(presetPlayers)
          .where(eq(presetPlayers.name, entry.playerName));
        if (preset) {
          presetPlayerId = preset.id;
        }
      }
      
      const [created] = await db.insert(manualBetEntries).values({
        betId: bet.id,
        playerName: entry.playerName,
        presetPlayerId,
        amount: entry.amount,
      }).returning();
      createdEntries.push(created);
    }
    
    return {
      ...bet,
      entries: createdEntries,
    };
  }
  
  async deleteManualBet(betId: number): Promise<boolean> {
    // Delete entries first
    await db.delete(manualBetEntries).where(eq(manualBetEntries.betId, betId));
    // Delete the bet
    const result = await db.delete(manualBets).where(eq(manualBets.id, betId)).returning();
    return result.length > 0;
  }

  // Event Match Results - stored/cached bet calculation results
  async getEventMatchResults(eventMatchId: number): Promise<EventMatchResult[]> {
    return db.select().from(eventMatchResults).where(eq(eventMatchResults.eventMatchId, eventMatchId));
  }

  async saveEventMatchResults(eventMatchId: number, results: InsertEventMatchResult[]): Promise<EventMatchResult[]> {
    // Delete existing results for this event match first
    await db.delete(eventMatchResults).where(eq(eventMatchResults.eventMatchId, eventMatchId));
    
    // Insert new results
    if (results.length === 0) {
      return [];
    }
    
    const inserted = await db.insert(eventMatchResults).values(results).returning();
    return inserted;
  }

  async deleteEventMatchResults(eventMatchId: number): Promise<void> {
    await db.delete(eventMatchResults).where(eq(eventMatchResults.eventMatchId, eventMatchId));
  }

  async getEventMatchResultsByEventMatchIds(eventMatchIds: number[]): Promise<EventMatchResult[]> {
    if (eventMatchIds.length === 0) {
      return [];
    }
    return db.select().from(eventMatchResults).where(inArray(eventMatchResults.eventMatchId, eventMatchIds));
  }

  // Settlement methods
  async getSettlements(): Promise<SettlementWithPayments[]> {
    const allSettlements = await db.select().from(settlements).orderBy(desc(settlements.createdAt));
    
    if (allSettlements.length === 0) {
      return [];
    }
    
    const settlementIds = allSettlements.map(s => s.id);
    const allPayments = await db.select().from(settlementPayments)
      .where(inArray(settlementPayments.settlementId, settlementIds));
    
    const paymentsBySettlementId = new Map<number, SettlementPayment[]>();
    for (const payment of allPayments) {
      if (!paymentsBySettlementId.has(payment.settlementId)) {
        paymentsBySettlementId.set(payment.settlementId, []);
      }
      paymentsBySettlementId.get(payment.settlementId)!.push(payment);
    }
    
    return allSettlements.map(settlement => ({
      ...settlement,
      payments: paymentsBySettlementId.get(settlement.id) || [],
    }));
  }

  async getActiveSettlement(eventId?: number): Promise<SettlementWithPayments | null> {
    // Get the most recent settlement that is active, optionally filtered by eventId
    const conditions = [eq(settlements.status, "active")];
    if (eventId !== undefined) {
      conditions.push(eq(settlements.eventId, eventId));
    }
    
    const [settlement] = await db.select().from(settlements)
      .where(and(...conditions))
      .orderBy(desc(settlements.createdAt))
      .limit(1);
    
    if (!settlement) {
      return null;
    }
    
    const payments = await db.select().from(settlementPayments)
      .where(eq(settlementPayments.settlementId, settlement.id));
    
    return {
      ...settlement,
      payments,
    };
  }
  
  async getArchivedSettlements(eventId?: number): Promise<SettlementWithPayments[]> {
    const statusCondition = or(eq(settlements.status, "archived"), eq(settlements.status, "completed"));
    const conditions = eventId !== undefined 
      ? and(statusCondition, eq(settlements.eventId, eventId))
      : statusCondition;
    
    const archivedSettlements = await db.select().from(settlements)
      .where(conditions)
      .orderBy(desc(settlements.createdAt));
    
    if (archivedSettlements.length === 0) {
      return [];
    }
    
    const settlementIds = archivedSettlements.map(s => s.id);
    const allPayments = await db.select().from(settlementPayments)
      .where(inArray(settlementPayments.settlementId, settlementIds));
    
    const paymentsBySettlementId = new Map<number, SettlementPayment[]>();
    for (const payment of allPayments) {
      if (!paymentsBySettlementId.has(payment.settlementId)) {
        paymentsBySettlementId.set(payment.settlementId, []);
      }
      paymentsBySettlementId.get(payment.settlementId)!.push(payment);
    }
    
    return archivedSettlements.map(settlement => ({
      ...settlement,
      payments: paymentsBySettlementId.get(settlement.id) || [],
    }));
  }
  
  async archiveSettlement(settlementId: number): Promise<boolean> {
    const result = await db.update(settlements)
      .set({ status: "archived" })
      .where(eq(settlements.id, settlementId))
      .returning();
    return result.length > 0;
  }

  async createSettlement(
    name: string | null,
    payments: { fromPlayerName: string; fromPresetPlayerId?: number | null; toPlayerName: string; toPresetPlayerId?: number | null; amount: number }[],
    creatorId?: string,
    eventId?: number
  ): Promise<SettlementWithPayments> {
    // Create the settlement
    const [settlement] = await db.insert(settlements).values({
      name,
      creatorId: creatorId ?? null,
      eventId: eventId ?? null,
    }).returning();
    
    // Create all payments
    const createdPayments: SettlementPayment[] = [];
    for (const payment of payments) {
      const [created] = await db.insert(settlementPayments).values({
        settlementId: settlement.id,
        fromPlayerName: payment.fromPlayerName,
        fromPresetPlayerId: payment.fromPresetPlayerId ?? null,
        toPlayerName: payment.toPlayerName,
        toPresetPlayerId: payment.toPresetPlayerId ?? null,
        amount: payment.amount,
      }).returning();
      createdPayments.push(created);
    }
    
    return {
      ...settlement,
      payments: createdPayments,
    };
  }

  async togglePaymentComplete(paymentId: number): Promise<SettlementPayment | null> {
    // Get current state
    const [payment] = await db.select().from(settlementPayments)
      .where(eq(settlementPayments.id, paymentId));
    
    if (!payment) {
      return null;
    }
    
    // Toggle the completed state
    const newCompleted = !payment.completed;
    const [updated] = await db.update(settlementPayments)
      .set({
        completed: newCompleted,
        completedAt: newCompleted ? new Date() : null,
      })
      .where(eq(settlementPayments.id, paymentId))
      .returning();
    
    // Check if all payments in this settlement are complete
    const allPayments = await db.select().from(settlementPayments)
      .where(eq(settlementPayments.settlementId, payment.settlementId));
    
    const allComplete = allPayments.every(p => p.id === paymentId ? newCompleted : p.completed);
    
    if (allComplete) {
      await db.update(settlements)
        .set({ completedAt: new Date(), status: "completed" })
        .where(eq(settlements.id, payment.settlementId));
    } else {
      // If not all complete, make sure settlement is not marked as complete
      await db.update(settlements)
        .set({ completedAt: null, status: "active" })
        .where(eq(settlements.id, payment.settlementId));
    }
    
    return updated;
  }

  async deleteSettlement(settlementId: number): Promise<boolean> {
    // Delete payments first
    await db.delete(settlementPayments).where(eq(settlementPayments.settlementId, settlementId));
    // Delete the settlement
    const result = await db.delete(settlements).where(eq(settlements.id, settlementId)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();

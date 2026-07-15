import { randomBytes } from "crypto";
import { db } from "./db";
import { PRESET_PLAYERS, PLAYER_ALIASES } from "@shared/models/auth";
import { 
  matches, players, scores, users, eventMatches, eventMatchResults, teams, teamMembers, courses, courseHoles, playerHandicaps, courseTees, matchPlayerHandicaps, playerCourseDefaults, groups, presetPlayers, playerAliases, matchRoles,
  groupMemberships, groupJoinRequests, groupPlayers, groupDeletionDismissals, groupMembershipInvites, people,
  verificationCodes, notificationPreferences, messages, devicePushTokens, notifications,
  events, ryderCupTeams, ryderCupTeamMembers, ryderCupDays, ryderCupPairings, ryderCupPairingSides, ryderCupPairingResults, ryderCupSkins, ryderCupPairingScores, ryderCupTransactions, ryderCupTransactionSplits, ryderCupClosestToHole,
  manualBets, manualBetEntries,
  settlements, settlementPayments,
  pendingScorecardScans,
  pendingSmsBets,
  smsOptIns,
  scanCorrectionLogs,
  scanPatterns,
  scanComparisons,
  appSettings,
  eventPlayingGroups, eventPlayingGroupMembers,
  apiKeys,
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
  type VerificationCode, type NotificationPreferences, type Message, type Notification,
  type RyderCupEvent, type RyderCupTeam, type RyderCupTeamMember, type RyderCupDay, 
  type RyderCupPairing, type RyderCupPairingSide, type RyderCupPairingResult, type RyderCupSkin, type RyderCupPairingScore,
  type RyderCupTransaction, type RyderCupTransactionSplit, type RyderCupClosestToHole,
  type ManualBet, type ManualBetEntry, type ManualBetWithEntries,
  type Settlement, type SettlementPayment, type SettlementWithPayments,
  type PendingScorecardScan,
  type Person,
  type PendingSmsBet, type ParsedSmsBet,
  type SmsOptIn,
  type ScanCorrectionLog,
  type ScanPattern,
  type ScanComparison,
  type EventPlayingGroup, type EventPlayingGroupMember, type EventPlayingGroupWithMembers,
  type CreateRyderCupEventRequest, type RyderCupEventResponse, type AddSideMatchRequest, type RecordPairingResultRequest,
  type ApiKey,
  type DevicePushToken
} from "@shared/schema";
import { eq, and, lt, lte, inArray, or, isNull, isNotNull, desc, gte, sql, ilike } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth/storage";

export interface IStorage {
  // Auth methods
  getUser(id: string): Promise<typeof users.$inferSelect | undefined>;
  upsertUser(user: typeof users.$inferInsert): Promise<typeof users.$inferSelect>;
  claimPresetPlayer(userId: string, presetPlayerName: string | null): Promise<typeof users.$inferSelect>;
  claimPresetPlayerWithName(userId: string, presetPlayerName: string, firstName: string, lastName: string): Promise<typeof users.$inferSelect>;
  updateUserProfile(userId: string, data: { firstName?: string; lastName?: string; email?: string; phone?: string; phoneVerified?: boolean; handicapIndex?: number | null; teePreference?: string | null; discoverable?: boolean; displayName?: string | null }): Promise<typeof users.$inferSelect>;
  deleteUserAccount(userId: string): Promise<void>;

  // App methods
  createMatch(match: { name: string | null; courseName: string; creatorId: string; groupId?: number | null; eventId?: number | null; eventDayNumber?: number | null; courseId?: number | null; isHandicapped?: boolean }): Promise<Match>;
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
  getRyderCupTeamsForEvent(eventId: number): Promise<RyderCupTeam[]>;
  findOrCreatePersonForNewPlayer(name: string, userId?: string | null): Promise<number>;
  savePerson(personId: number): Promise<Person>;
  checkForSaveNudge(name: string, excludePersonId: number): Promise<Person | null>;
  searchSavedPeople(query: string): Promise<Person[]>;
  generatePersonClaimCode(personId: number): Promise<string>;
  claimPersonByCode(claimCode: string, userId: string): Promise<Person | null>;
  createRyderCupTeam(eventId: number, name: string, color?: string | null): Promise<RyderCupTeam>;
  deleteRyderCupTeam(teamId: number): Promise<void>;
  addRyderCupTeamMember(teamId: number, playerName: string, handicapIndex?: number | null): Promise<RyderCupTeamMember>;
  removeRyderCupTeamMember(memberId: number): Promise<void>;

  getRyderCupEventsForUser(userId: string): Promise<RyderCupEvent[]>;
  userCanAccessRyderCupEvent(eventId: number, userId: string): Promise<boolean>;
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
  getManualBets(eventId?: number): Promise<ManualBetWithEntries[]>;
  createManualBet(description: string, entries: { playerName: string; presetPlayerId?: number; amount: number }[], creatorId?: number, eventId?: number): Promise<ManualBetWithEntries>;
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
  // Group deletion (soft-delete + 14-day claim-admin window for non-solo groups)
  requestGroupDeletion(groupId: number, requestedBy: string, staysAsMember?: boolean): Promise<{ group: Group; immediatelyDeleted: boolean }>;
  claimGroupAdmin(groupId: number, userId: string): Promise<Group>;
  dismissGroupDeletionWarning(groupId: number, userId: string): Promise<void>;
  getPendingDeletionWarningsForUser(userId: string): Promise<Array<{ group: Group; requestedByDisplayName: string }>>;
  // Membership invites — see groupMembershipInvites comment in shared/schema.ts
  createMembershipInviteIfNeeded(groupId: number, userId: string): Promise<void>;
  getPendingMembershipInvitesForUser(userId: string): Promise<Array<{ group: Group; addedByDisplayName: string }>>;
  acceptMembershipInvite(groupId: number, userId: string): Promise<void>;
  dismissMembershipInvite(groupId: number, userId: string): Promise<void>;

  // Group membership
  getGroupMembers(groupId: number): Promise<(GroupMembership & { user?: { id: string; displayName: string | null; firstName: string | null; lastName: string | null; presetPlayerName: string | null; profileImageUrl: string | null } })[]>;
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
  getGroupPlayers(groupId: number): Promise<(GroupPlayer & { presetPlayer?: { id: number; name: string }; timesPlayed: number })[]>;
  addGroupPlayer(groupId: number, presetPlayerId: number, addedBy?: string): Promise<GroupPlayer>;
  addGroupPlayerFromPreset(groupId: number, presetPlayerId: number, addedBy?: string): Promise<GroupPlayer>;
  removeGroupPlayer(groupId: number, presetPlayerId: number): Promise<boolean>;
  getPresetPlayersForGroups(groupIds: number[]): Promise<{ id: number; name: string; groupId: number }[]>;
  // Phase 4 — group-scoped roster: three add-player paths + search + removal by row id
  addGroupPlayerGuest(groupId: number, name: string, opts?: { handicapIndex?: number | null; teePreference?: string | null; addedBy?: string }): Promise<GroupPlayer>;
  addGroupPlayerFromUser(groupId: number, targetUserId: string, addedBy?: string): Promise<GroupPlayer>;
  getCopyFromMyGroupsCandidates(adminUserId: string, targetGroupId: number): Promise<GroupPlayer[]>;
  searchDiscoverableUsers(query: string, excludeUserId?: string): Promise<Array<{ id: string; displayName: string }>>;
  removeGroupPlayerById(groupId: number, groupPlayerId: number): Promise<boolean>;
  getPresetPlayerByName(name: string): Promise<PresetPlayer | undefined>;
  // Phase 4 — guest claim flow: single-use personal code per guest roster row
  generateGuestClaimCode(groupId: number, groupPlayerId: number): Promise<string>;
  claimGuestPlayer(code: string, userId: string): Promise<GroupPlayer>;

  // Hidden / auto-created player management
  getHiddenPlayers(): Promise<Array<PresetPlayer & { matchCount: number }>>;
  promoteHiddenPlayer(id: number): Promise<PresetPlayer>;
  deletePresetPlayerById(id: number, force: boolean): Promise<{ deleted: boolean; hasHistory: boolean }>;
  bulkDeleteInactivePlayers(inactiveDays: number, dryRun: boolean): Promise<Array<PresetPlayer & { matchCount: number }>>;
  getGroupAutoCreatedPlayers(groupId: number): Promise<Array<PresetPlayer & { matchCount: number }>>;

  // Pairing: link a user account to a preset player (FK sync)
  pairUserToPresetPlayer(presetPlayerId: number, userId: string): Promise<PresetPlayer>;
  unpairUserFromPresetPlayer(presetPlayerId: number): Promise<PresetPlayer>;
  tryAutoLinkUserToGroupPlayer(groupId: number, userId: string): Promise<boolean>;
  tryAutoLinkGroupPlayerToMembers(groupId: number, presetPlayerId: number): Promise<boolean>;
  getGroupPairings(groupId: number): Promise<{
    linkedPairs: Array<{ presetPlayer: { id: number; name: string; userId: string | null }; user: { id: string; firstName: string | null; lastName: string | null; presetPlayerName: string | null } }>;
    unlinkedUsers: Array<{ id: string; firstName: string | null; lastName: string | null; presetPlayerName: string | null }>;
    unlinkedPlayers: Array<{ id: number; name: string }>;
    brokenLegacyLinks: Array<{ userId: string; presetPlayerName: string; firstName: string | null; lastName: string | null }>;
  }>;
  getPresetPlayerById(id: number): Promise<PresetPlayer | undefined>;

  // Match code methods
  getMatchByCode(code: string): Promise<Match | undefined>;
  backfillMatchCodes(): Promise<number>;

  // Pending scorecard scans
  createPendingScan(data: { matchId: number; fromPhone: string; mediaUrl: string; resolvedByPhone?: boolean }): Promise<PendingScorecardScan>;
  updatePendingScan(id: number, data: Partial<{ status: string; scanResult: string | null; errorMessage: string | null; imageUrl: string | null; correctionLogId: number | null }>): Promise<PendingScorecardScan>;
  listPendingScans(matchId: number): Promise<PendingScorecardScan[]>;
  getPendingScan(id: number): Promise<PendingScorecardScan | undefined>;
  deletePendingScan(id: number): Promise<boolean>;

  // Pending SMS bets (text-based bet descriptions)
  createPendingSmsBet(data: { matchId: number; fromPhone: string; senderName: string; rawText: string; parsedBets: ParsedSmsBet[] | null; status?: string; duplicateOf?: string | null; resolvedByPhone?: boolean }): Promise<PendingSmsBet>;
  getPendingSmsBet(id: number): Promise<PendingSmsBet | undefined>;
  listPendingSmsBets(matchId: number): Promise<PendingSmsBet[]>;
  updatePendingSmsBet(id: number, data: Partial<{ status: string; parsedBets: ParsedSmsBet[] | null; duplicateOf: string | null }>): Promise<PendingSmsBet>;
  deletePendingSmsBet(id: number): Promise<boolean>;
  getUserByPhone(phone: string): Promise<typeof users.$inferSelect | undefined>;
  getActiveMatchesByPhone(phone: string): Promise<Match[]>;
  getGroupMembersWithPhone(groupId: number): Promise<{ phone: string; firstName: string | null; lastName: string | null; presetPlayerName: string | null }[]>;

  // SMS opt-in
  createSmsOptIn(data: { phoneNumber: string; consentGiven: boolean; userId?: string | null }): Promise<SmsOptIn>;

  // Scan correction logs
  createScanCorrectionLog(data: {
    matchId?: number | null;
    pendingScanId?: number | null;
    source: "camera" | "mms" | "bet_slip";
    scanProvider?: "gemini" | "grok" | null;
    courseName: string;
    imageUrl?: string | null;
    geminiOutput: Array<any>;
    appliedOutput: Array<any>;
    playerNames: string[];
    geminiRawText?: string | null;
  }): Promise<ScanCorrectionLog>;
  updateScanCorrectionLog(id: number, matchId: number, data: {
    appliedOutput: Array<{ playerName: string; playerId: number; holes: Array<{ holeNumber: number; strokes: number }> }>;
    playerNames: string[];
    imageUrl?: string | null;
    geminiRawText?: string | null;
  }): Promise<ScanCorrectionLog | undefined>;
  listScanCorrectionLogs(): Promise<(ScanCorrectionLog & { matchName: string | null })[]>;
  listScanPatterns(): Promise<ScanPattern[]>;
  upsertScanPatterns(patterns: Array<{
    patternType: string;
    patternKey: string;
    description: string;
    promptRule: string;
    occurrences: number;
    exampleLogIds: number[];
    machineGenerated?: boolean;
  }>): Promise<ScanPattern[]>;
  markPatternAddressed(id: number, addressed: boolean): Promise<ScanPattern | undefined>;
  getActiveScanPatternRules(): Promise<string[]>;
  createScanComparison(data: {
    playerNames: string[];
    imageThumbnail?: string | null;
    geminiResult: ScanComparison["geminiResult"];
    grokResult: ScanComparison["grokResult"];
    totalHoles: number;
    matchedHoles: number;
  }): Promise<ScanComparison>;
  listScanComparisons(): Promise<ScanComparison[]>;
  getScanComparison(id: number): Promise<ScanComparison | undefined>;

  // Event Playing Groups
  getEventPlayingGroups(eventId: number): Promise<EventPlayingGroupWithMembers[]>;
  saveEventPlayingGroups(eventId: number, groups: { members: { playerName: string; teamMemberId?: number | null }[]; lockedPlayerNames: string[] }[]): Promise<EventPlayingGroupWithMembers[]>;
  deleteEventPlayingGroups(eventId: number): Promise<void>;

  // API Keys
  createApiKey(userId: string, name: string, keyHash: string): Promise<ApiKey>;
  getApiKeys(userId: string): Promise<ApiKey[]>;
  deleteApiKey(id: number, userId: string): Promise<boolean>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  updateApiKeyLastUsed(id: number): Promise<void>;

  // Export data
  getExportScores(userId: string, start?: Date, end?: Date): Promise<Array<{ date: Date; courseName: string; matchName: string | null; playerName: string; holeNumber: number; strokes: number }>>;
  getExportBetResults(userId: string): Promise<Array<{ date: Date; courseName: string; matchName: string | null; eventMatchName: string; betType: string | null; unitAmountCents: number; teamAName: string; teamBName: string; teamANetCents: number; teamBNetCents: number; isComplete: boolean }>>;

  // App settings
  getAppSetting(key: string): Promise<string | null>;
  setAppSetting(key: string, value: string): Promise<void>;

  // Device push tokens
  registerDevicePushToken(userId: string, token: string, platform: string): Promise<DevicePushToken>;
  unregisterDevicePushToken(token: string, userId?: string): Promise<boolean>;
  getDevicePushTokensForUser(userId: string): Promise<DevicePushToken[]>;

  // In-app notification feed
  createNotification(userId: string, title: string, body: string, route?: string | null): Promise<Notification>;
  getNotificationsForUser(userId: string, limit?: number): Promise<Notification[]>;
  markNotificationRead(id: number, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    return authStorage.getUser(id);
  }
  async upsertUser(user: typeof users.$inferInsert) {
    return authStorage.upsertUser(user);
  }

  // Generates an unambiguous 4-char match code (no 0/O/1/I) and retries on collision
  private generateMatchCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }

  async getMatchByCode(code: string): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.matchCode, code.toUpperCase()));
    return match;
  }

  async backfillMatchCodes(): Promise<number> {
    // Check the column exists before querying it — production DB may lag behind dev schema
    const { pool } = await import("./db");
    const colCheck = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'matches' AND column_name = 'match_code' LIMIT 1`
    );
    if (colCheck.rowCount === 0) return 0;

    const uncodedMatches = await db.select({ id: matches.id }).from(matches).where(isNull(matches.matchCode));
    for (const m of uncodedMatches) {
      let attempts = 0;
      let code: string;
      do {
        code = this.generateMatchCode();
        attempts++;
        const existing = await db.select({ id: matches.id }).from(matches).where(eq(matches.matchCode, code)).limit(1);
        if (existing.length === 0) break;
      } while (attempts < 20);
      await db.update(matches).set({ matchCode: code! }).where(eq(matches.id, m.id));
    }
    return uncodedMatches.length;
  }

  async createMatch(match: { name: string | null; courseName: string; creatorId: string; groupId?: number | null; eventId?: number | null; eventDayNumber?: number | null; courseId?: number | null; isHandicapped?: boolean }): Promise<Match> {
    // Look up courseId from courseName if not already provided
    let courseId: number | null = match.courseId ?? null;
    if (!courseId && match.courseName) {
      const [course] = await db.select().from(courses).where(eq(courses.name, match.courseName));
      if (course) {
        courseId = course.id;
      }
    }
    // Generate a unique 4-char match code with collision retry
    let matchCode: string | undefined;
    let attempts = 0;
    do {
      matchCode = this.generateMatchCode();
      attempts++;
      const existing = await db.select({ id: matches.id }).from(matches).where(eq(matches.matchCode, matchCode)).limit(1);
      if (existing.length === 0) break;
    } while (attempts < 20);

    const [newMatch] = await db.insert(matches).values({ 
      name: match.name,
      courseName: match.courseName,
      creatorId: match.creatorId,
      courseId,
      groupId: match.groupId ?? null,
      eventId: match.eventId ?? null,
      eventDayNumber: match.eventDayNumber ?? null,
      isHandicapped: match.isHandicapped ?? false,
      matchCode,
    }).returning();
    return newMatch;
  }

  async createPendingScan(data: { matchId: number; fromPhone: string; mediaUrl: string; resolvedByPhone?: boolean }): Promise<PendingScorecardScan> {
    const [scan] = await db.insert(pendingScorecardScans).values({
      matchId: data.matchId,
      fromPhone: data.fromPhone,
      mediaUrl: data.mediaUrl,
      status: 'pending',
      resolvedByPhone: data.resolvedByPhone ?? false,
    }).returning();
    return scan;
  }

  async updatePendingScan(id: number, data: Partial<{ status: string; scanResult: string | null; errorMessage: string | null; imageUrl: string | null; correctionLogId: number | null }>): Promise<PendingScorecardScan> {
    const [updated] = await db.update(pendingScorecardScans)
      .set(data)
      .where(eq(pendingScorecardScans.id, id))
      .returning();
    return updated;
  }

  async listPendingScans(matchId: number): Promise<PendingScorecardScan[]> {
    return db.select().from(pendingScorecardScans)
      .where(eq(pendingScorecardScans.matchId, matchId))
      .orderBy(desc(pendingScorecardScans.createdAt));
  }

  async getPendingScan(id: number): Promise<PendingScorecardScan | undefined> {
    const [scan] = await db.select().from(pendingScorecardScans).where(eq(pendingScorecardScans.id, id));
    return scan;
  }

  async deletePendingScan(id: number): Promise<boolean> {
    const result = await db.delete(pendingScorecardScans).where(eq(pendingScorecardScans.id, id)).returning();
    return result.length > 0;
  }

  async createPendingSmsBet(data: { matchId: number; fromPhone: string; senderName: string; rawText: string; parsedBets: ParsedSmsBet[] | null; status?: string; duplicateOf?: string | null; resolvedByPhone?: boolean }): Promise<PendingSmsBet> {
    const [row] = await db.insert(pendingSmsBets).values({
      matchId: data.matchId,
      fromPhone: data.fromPhone,
      senderName: data.senderName,
      rawText: data.rawText,
      parsedBets: data.parsedBets,
      status: data.status ?? 'pending',
      duplicateOf: data.duplicateOf ?? null,
      resolvedByPhone: data.resolvedByPhone ?? false,
    }).returning();
    return row;
  }

  async getPendingSmsBet(id: number): Promise<PendingSmsBet | undefined> {
    const [row] = await db.select().from(pendingSmsBets).where(eq(pendingSmsBets.id, id));
    return row;
  }

  async listPendingSmsBets(matchId: number): Promise<PendingSmsBet[]> {
    return db.select().from(pendingSmsBets)
      .where(eq(pendingSmsBets.matchId, matchId))
      .orderBy(desc(pendingSmsBets.createdAt));
  }

  async updatePendingSmsBet(id: number, data: Partial<{ status: string; parsedBets: ParsedSmsBet[] | null; duplicateOf: string | null }>): Promise<PendingSmsBet> {
    const setData: Record<string, unknown> = {};
    if (data.status !== undefined) setData.status = data.status;
    if (data.parsedBets !== undefined) setData.parsedBets = data.parsedBets;
    if (data.duplicateOf !== undefined) setData.duplicateOf = data.duplicateOf;
    const [updated] = await db.update(pendingSmsBets)
      .set(setData)
      .where(eq(pendingSmsBets.id, id))
      .returning();
    return updated;
  }

  async deletePendingSmsBet(id: number): Promise<boolean> {
    const result = await db.delete(pendingSmsBets).where(eq(pendingSmsBets.id, id)).returning();
    return result.length > 0;
  }

  async getUserByPhone(phone: string): Promise<typeof users.$inferSelect | undefined> {
    const digits = phone.replace(/\D/g, '');
    // Try exact match, +1-prefixed, or digits-only
    const candidates = [phone, `+1${digits}`, digits].filter(Boolean);
    for (const candidate of candidates) {
      const [user] = await db.select().from(users).where(eq(users.phone, candidate));
      if (user) return user;
    }
    return undefined;
  }

  async getActiveMatchesByPhone(phone: string): Promise<Match[]> {
    const matchIdSet = new Set<number>();

    // Normalize the phone number variants to try
    const digits = phone.replace(/\D/g, '');
    const phoneCandidates = [...new Set([phone, `+1${digits}`, digits].filter(Boolean))];

    // --- Path 1: user-account-based lookup ---
    const user = await this.getUserByPhone(phone);
    if (user) {
      // Matches created by this user
      const createdMatches = await db
        .select({ id: matches.id })
        .from(matches)
        .where(and(eq(matches.creatorId, user.id), eq(matches.completed, false)));
      createdMatches.forEach(m => matchIdSet.add(m.id));

      // Matches where user has a matchRole (organizer/viewer)
      const roleMatches = await db
        .select({ matchId: matchRoles.matchId })
        .from(matchRoles)
        .innerJoin(matches, eq(matchRoles.matchId, matches.id))
        .where(and(eq(matchRoles.userId, user.id), eq(matches.completed, false)));
      roleMatches.forEach(m => matchIdSet.add(m.matchId));

      // Matches where user is a player record (by userId)
      const playerUserMatches = await db
        .select({ matchId: players.matchId })
        .from(players)
        .innerJoin(matches, eq(players.matchId, matches.id))
        .where(and(eq(players.userId, user.id), eq(matches.completed, false)));
      playerUserMatches.forEach(m => matchIdSet.add(m.matchId));
    }

    // --- Path 2: presetPlayer-based lookup (independent of user account) ---
    // Two sub-paths to find the relevant presetPlayer ID:
    //   2a. Direct phone match on presetPlayers.phone (admin-added players without accounts)
    //   2b. Via the linked user account (userId link, then presetPlayerName fallback)
    let resolvedPresetPlayerId: number | null = null;

    // 2a: Direct lookup by phone stored on the presetPlayers row
    for (const candidate of phoneCandidates) {
      const [ppByPhone] = await db
        .select({ id: presetPlayers.id })
        .from(presetPlayers)
        .where(eq(presetPlayers.phone, candidate));
      if (ppByPhone) {
        resolvedPresetPlayerId = ppByPhone.id;
        break;
      }
    }

    // 2b: Via the user's linked presetPlayer (when no direct phone match)
    if (resolvedPresetPlayerId === null && user) {
      // Primary: explicit userId link on the presetPlayers row
      const [ppByUserId] = await db
        .select({ id: presetPlayers.id })
        .from(presetPlayers)
        .where(eq(presetPlayers.userId, user.id));
      if (ppByUserId) {
        resolvedPresetPlayerId = ppByUserId.id;
      } else if (user.presetPlayerName) {
        // Fallback: match by the name the user claimed (handles edge cases where
        // presetPlayers.userId hasn't been synced yet)
        const [ppByName] = await db
          .select({ id: presetPlayers.id })
          .from(presetPlayers)
          .where(eq(presetPlayers.name, user.presetPlayerName));
        if (ppByName) resolvedPresetPlayerId = ppByName.id;
      }
    }

    if (resolvedPresetPlayerId !== null) {
      const presetPlayerMatches = await db
        .select({ matchId: players.matchId })
        .from(players)
        .innerJoin(matches, eq(players.matchId, matches.id))
        .where(and(eq(players.presetPlayerId, resolvedPresetPlayerId), eq(matches.completed, false)));
      presetPlayerMatches.forEach(m => matchIdSet.add(m.matchId));
    }

    if (matchIdSet.size === 0) return [];

    return db.select().from(matches).where(inArray(matches.id, Array.from(matchIdSet)));
  }

  async createSmsOptIn(data: { phoneNumber: string; consentGiven: boolean; userId?: string | null }): Promise<SmsOptIn> {
    const [row] = await db.insert(smsOptIns).values({
      phoneNumber: data.phoneNumber,
      consentGiven: data.consentGiven,
      userId: data.userId ?? null,
    }).returning();
    return row;
  }

  async createScanCorrectionLog(data: {
    matchId?: number | null;
    pendingScanId?: number | null;
    source: "camera" | "mms" | "bet_slip";
    scanProvider?: "gemini" | "grok" | null;
    courseName: string;
    imageUrl?: string | null;
    geminiOutput: Array<any>;
    appliedOutput: Array<any>;
    playerNames: string[];
    geminiRawText?: string | null;
  }): Promise<ScanCorrectionLog> {
    const [row] = await db.insert(scanCorrectionLogs).values({
      matchId: data.matchId ?? null,
      pendingScanId: data.pendingScanId ?? null,
      source: data.source,
      scanProvider: data.scanProvider ?? null,
      courseName: data.courseName,
      imageUrl: data.imageUrl ?? null,
      geminiOutput: data.geminiOutput,
      appliedOutput: data.appliedOutput,
      playerNames: data.playerNames,
      geminiRawText: data.geminiRawText ?? null,
    }).returning();
    return row;
  }

  async updateScanCorrectionLog(id: number, matchId: number, data: {
    appliedOutput: Array<{ playerName: string; playerId: number; holes: Array<{ holeNumber: number; strokes: number }> }>;
    playerNames: string[];
    imageUrl?: string | null;
    geminiRawText?: string | null;
  }): Promise<ScanCorrectionLog | undefined> {
    const setData: Record<string, unknown> = {
      appliedOutput: data.appliedOutput,
      playerNames: data.playerNames,
    };
    if (data.imageUrl !== undefined) setData.imageUrl = data.imageUrl;
    if (data.geminiRawText !== undefined) setData.geminiRawText = data.geminiRawText;
    const [row] = await db.update(scanCorrectionLogs)
      .set(setData)
      .where(and(eq(scanCorrectionLogs.id, id), eq(scanCorrectionLogs.matchId, matchId)))
      .returning();
    return row;
  }

  async listScanCorrectionLogs(): Promise<(ScanCorrectionLog & { matchName: string | null })[]> {
    const rows = await db
      .select({
        id: scanCorrectionLogs.id,
        matchId: scanCorrectionLogs.matchId,
        pendingScanId: scanCorrectionLogs.pendingScanId,
        source: scanCorrectionLogs.source,
        scanProvider: scanCorrectionLogs.scanProvider,
        courseName: scanCorrectionLogs.courseName,
        imageUrl: scanCorrectionLogs.imageUrl,
        geminiOutput: scanCorrectionLogs.geminiOutput,
        appliedOutput: scanCorrectionLogs.appliedOutput,
        playerNames: scanCorrectionLogs.playerNames,
        geminiRawText: scanCorrectionLogs.geminiRawText,
        createdAt: scanCorrectionLogs.createdAt,
        matchName: matches.name,
      })
      .from(scanCorrectionLogs)
      .leftJoin(matches, eq(scanCorrectionLogs.matchId, matches.id))
      .orderBy(desc(scanCorrectionLogs.createdAt));
    return rows as (ScanCorrectionLog & { matchName: string | null })[];
  }

  async listScanPatterns(): Promise<ScanPattern[]> {
    return db.select().from(scanPatterns).orderBy(desc(scanPatterns.occurrences));
  }

  async upsertScanPatterns(patterns: Array<{
    patternType: string;
    patternKey: string;
    description: string;
    promptRule: string;
    occurrences: number;
    exampleLogIds: number[];
    machineGenerated?: boolean;
  }>): Promise<ScanPattern[]> {
    const results: ScanPattern[] = [];
    for (const p of patterns) {
      const existing = await db
        .select()
        .from(scanPatterns)
        .where(eq(scanPatterns.patternKey, p.patternKey))
        .limit(1);
      if (existing.length > 0) {
        const [updated] = await db
          .update(scanPatterns)
          .set({
            description: p.description,
            occurrences: p.occurrences,
            exampleLogIds: p.exampleLogIds,
            updatedAt: new Date(),
          })
          .where(eq(scanPatterns.patternKey, p.patternKey))
          .returning();
        results.push(updated);
      } else {
        const [created] = await db
          .insert(scanPatterns)
          .values({
            patternType: p.patternType,
            patternKey: p.patternKey,
            description: p.description,
            promptRule: p.promptRule,
            occurrences: p.occurrences,
            exampleLogIds: p.exampleLogIds,
            machineGenerated: p.machineGenerated ?? false,
          })
          .returning();
        results.push(created);
      }
    }
    return results;
  }

  async markPatternAddressed(id: number, addressed: boolean): Promise<ScanPattern | undefined> {
    const [updated] = await db
      .update(scanPatterns)
      .set({
        addressed,
        addressedAt: addressed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(scanPatterns.id, id))
      .returning();
    return updated;
  }

  async getActiveScanPatternRules(): Promise<string[]> {
    const rows = await db
      .select({ promptRule: scanPatterns.promptRule })
      .from(scanPatterns)
      .where(eq(scanPatterns.addressed, false));
    return rows.map(r => r.promptRule);
  }

  async getGroupMembersWithPhone(groupId: number): Promise<{ phone: string; firstName: string | null; lastName: string | null; presetPlayerName: string | null }[]> {
    const memberships = await db.select({
      userId: groupMemberships.userId,
    }).from(groupMemberships).where(eq(groupMemberships.groupId, groupId));

    if (memberships.length === 0) return [];

    const userIds = memberships.map(m => m.userId);
    const userRows = await db.select({
      phone: users.phone,
      phoneVerified: users.phoneVerified,
      firstName: users.firstName,
      lastName: users.lastName,
      presetPlayerName: users.presetPlayerName,
    }).from(users).where(inArray(users.id, userIds));

    // Only include users with verified phones; dedupe by phone number
    const seen = new Set<string>();
    const result: { phone: string; firstName: string | null; lastName: string | null; presetPlayerName: string | null }[] = [];
    for (const u of userRows) {
      if (!u.phone || !u.phoneVerified) continue;
      if (seen.has(u.phone)) continue;
      seen.add(u.phone);
      result.push({ phone: u.phone, firstName: u.firstName, lastName: u.lastName, presetPlayerName: u.presetPlayerName });
    }
    return result;
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
    return db.select().from(players).where(
      and(eq(players.matchId, matchId), isNull(players.deletedAt))
    );
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
      // Look up preset player ID for dynamic name updates — case-insensitive to avoid duplicates
      const [preset] = await db.select().from(presetPlayers)
        .where(sql`LOWER(${presetPlayers.name}) = LOWER(${player.name})`);
      if (preset) {
        presetPlayerId = preset.id;
        // Update lastActivityAt on the preset player
        await db.update(presetPlayers)
          .set({ lastActivityAt: new Date() })
          .where(eq(presetPlayers.id, preset.id));
      } else if (!player.userId) {
        // No preset player found and this is a guest name — auto-create a hidden preset player
        const [newPreset] = await db.insert(presetPlayers).values({
          name: player.name,
          showInRoster: false,
          isAutoCreated: true,
          lastActivityAt: new Date(),
        }).returning();
        presetPlayerId = newPreset.id;
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
    
    // Phase B dual-write (global player identity): link/create a canonical
    // people row for this new match player going forward.
    const personId = await this.findOrCreatePersonForNewPlayer(player.name, player.userId ?? null);

    const [newPlayer] = await db.insert(players).values({
      ...player,
      handicapIndex,
      teeId,
      presetPlayerId,
      personId,
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
    const [result] = await db.insert(scores).values(score)
      .onConflictDoUpdate({
        target: [scores.matchId, scores.playerId, scores.holeNumber],
        set: { strokes: sql`excluded.strokes` },
      })
      .returning();
    return result;
  }

  async submitScoresBulk(matchId: number, entries: Array<{ playerId: number; holeNumber: number; strokes: number }>): Promise<Score[]> {
    if (entries.length === 0) return [];

    const dedup = new Map<string, { playerId: number; holeNumber: number; strokes: number }>();
    for (const e of entries) dedup.set(`${e.playerId}-${e.holeNumber}`, e);
    const deduped = Array.from(dedup.values());

    const vals: InsertScore[] = deduped.map(e => ({
      matchId,
      playerId: e.playerId,
      holeNumber: e.holeNumber,
      strokes: e.strokes,
    }));

    return db.insert(scores).values(vals)
      .onConflictDoUpdate({
        target: [scores.matchId, scores.playerId, scores.holeNumber],
        set: { strokes: sql`excluded.strokes` },
      })
      .returning();
  }
  async getAllMatchPlayerHandicapsForMatch(matchId: number): Promise<MatchPlayerHandicap[]> {
    const eventMatchRows = await db.select({ id: eventMatches.id }).from(eventMatches).where(eq(eventMatches.eventId, matchId));
    const ids = eventMatchRows.map(r => r.id);
    if (ids.length === 0) return [];
    return db.select().from(matchPlayerHandicaps).where(inArray(matchPlayerHandicaps.eventMatchId, ids));
  }

  async getEventMatchesWithTeamsBulk(matchId: number) {
    const ems = await db.select().from(eventMatches).where(eq(eventMatches.eventId, matchId));
    if (ems.length === 0) return [];
    const emIds = ems.map(e => e.id);

    const allTeams = await db.select().from(teams).where(inArray(teams.eventMatchId, emIds));
    const teamIds = allTeams.map(t => t.id);

    const allMembers = teamIds.length > 0
      ? await db.select().from(teamMembers).where(inArray(teamMembers.teamId, teamIds))
      : [];

    const playerIds = Array.from(new Set(allMembers.map(m => m.playerId)));
    const allPlayers = playerIds.length > 0
      ? await db.select().from(players).where(inArray(players.id, playerIds))
      : [];
    const playerMap = new Map(allPlayers.map(p => [p.id, p]));

    const membersByTeam = new Map<number, Array<TeamMember & { player: Player | undefined }>>();
    for (const m of allMembers) {
      const arr = membersByTeam.get(m.teamId) ?? [];
      arr.push({ ...m, player: playerMap.get(m.playerId) });
      membersByTeam.set(m.teamId, arr);
    }

    const teamsByEm = new Map<number, Array<Team & { members: Array<TeamMember & { player: Player | undefined }> }>>();
    for (const t of allTeams) {
      const arr = teamsByEm.get(t.eventMatchId) ?? [];
      arr.push({ ...t, members: membersByTeam.get(t.id) ?? [] });
      teamsByEm.set(t.eventMatchId, arr);
    }

    // Attach SMS source info for round-robin generated matches
    const smsBetIds = Array.from(new Set(
      ems.map(e => e.sourceSmsBetId).filter((id): id is number => id != null)
    ));
    const smsMap = new Map<number, { senderName: string; rawText: string }>();
    if (smsBetIds.length > 0) {
      const smsBets = await db
        .select({ id: pendingSmsBets.id, senderName: pendingSmsBets.senderName, rawText: pendingSmsBets.rawText })
        .from(pendingSmsBets)
        .where(inArray(pendingSmsBets.id, smsBetIds));
      for (const s of smsBets) {
        smsMap.set(s.id, { senderName: s.senderName, rawText: s.rawText });
      }
    }

    return ems.map(em => {
      const smsInfo = em.sourceSmsBetId != null ? smsMap.get(em.sourceSmsBetId) : undefined;
      return {
        ...em,
        teams: teamsByEm.get(em.id) ?? [],
        smsSenderName: smsInfo?.senderName ?? null,
        smsRawText: smsInfo?.rawText ?? null,
      };
    });
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

  async removePlayerFromMatch(matchId: number, playerId: number): Promise<void> {
    // Soft-delete: stamp deleted_at so the player is hidden from active queries
    // but scores and bet history remain intact for historical records.
    await db.update(players)
      .set({ deletedAt: new Date() })
      .where(and(eq(players.id, playerId), eq(players.matchId, matchId)));
  }

  async deleteMatch(matchId: number): Promise<void> {
    // Bulk delete: a few queries scoped by IN (...) instead of hundreds of small per-row deletes.
    const eventMatchRows = await db.select({ id: eventMatches.id }).from(eventMatches).where(eq(eventMatches.eventId, matchId));
    const eventMatchIds = eventMatchRows.map(r => r.id);

    if (eventMatchIds.length > 0) {
      const teamRows = await db.select({ id: teams.id }).from(teams).where(inArray(teams.eventMatchId, eventMatchIds));
      const teamIds = teamRows.map(r => r.id);

      if (teamIds.length > 0) {
        await db.delete(teamMembers).where(inArray(teamMembers.teamId, teamIds));
        await db.delete(teams).where(inArray(teams.id, teamIds));
      }

      // Clean up rows that reference event_matches so they don't become orphans.
      await db.delete(matchPlayerHandicaps).where(inArray(matchPlayerHandicaps.eventMatchId, eventMatchIds));
      await db.delete(eventMatchResults).where(inArray(eventMatchResults.eventMatchId, eventMatchIds));
      await db.delete(eventMatches).where(inArray(eventMatches.id, eventMatchIds));
    }

    await db.delete(scores).where(eq(scores.matchId, matchId));
    await db.delete(players).where(eq(players.matchId, matchId));
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
      isRoundRobinGenerated: data.isRoundRobinGenerated ?? false,
      sourceSmsBetId: data.sourceSmsBetId ?? null,
      deathMatchBaseBet: data.deathMatchBaseBet ?? null,
      deathMatchBestBallBet: data.deathMatchBestBallBet ?? null,
      deathMatchSecondBallBet: data.deathMatchSecondBallBet ?? null,
      deathMatchFirstPressBet: data.deathMatchFirstPressBet ?? null,
      deathMatchSubsequentPressBet: data.deathMatchSubsequentPressBet ?? null,
      deathMatchSecondBallPressBet: data.deathMatchSecondBallPressBet ?? null,
      twoThreeBallTwoBallBet: data.twoThreeBallTwoBallBet ?? null,
      twoThreeBallThreeBallBet: data.twoThreeBallThreeBallBet ?? null,
      autoPressTwoBallFront9: data.autoPressTwoBallFront9 ?? true,
      autoPressTwoBallBack9: data.autoPressTwoBallBack9 ?? true,
      autoPressTwoBallOverall: data.autoPressTwoBallOverall ?? true,
      autoPressThreeBallFront9: data.autoPressThreeBallFront9 ?? true,
      autoPressThreeBallBack9: data.autoPressThreeBallBack9 ?? true,
      autoPressThreeBallOverall: data.autoPressThreeBallOverall ?? true,
      oneTwoThreeBallOneBallBet: data.oneTwoThreeBallOneBallBet ?? null,
      oneTwoThreeBallTwoThirdBallBet: data.oneTwoThreeBallTwoThirdBallBet ?? null,
      autoPressOneBallFront9: data.autoPressOneBallFront9 ?? true,
      autoPressOneBallBack9: data.autoPressOneBallBack9 ?? true,
      autoPressOneBallOverall: data.autoPressOneBallOverall ?? true,
      autoPressTwoThirdBallFront9: data.autoPressTwoThirdBallFront9 ?? true,
      autoPressTwoThirdBallBack9: data.autoPressTwoThirdBallBack9 ?? true,
      autoPressTwoThirdBallOverall: data.autoPressTwoThirdBallOverall ?? true,
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
    autoPressTwoBallFront9?: boolean;
    autoPressTwoBallBack9?: boolean;
    autoPressTwoBallOverall?: boolean;
    autoPressThreeBallFront9?: boolean;
    autoPressThreeBallBack9?: boolean;
    autoPressThreeBallOverall?: boolean;
    autoPressOneBallFront9?: boolean;
    autoPressOneBallBack9?: boolean;
    autoPressOneBallOverall?: boolean;
    autoPressTwoThirdBallFront9?: boolean;
    autoPressTwoThirdBallBack9?: boolean;
    autoPressTwoThirdBallOverall?: boolean;
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

  async updateEventMatchType(eventMatchId: number, matchType: string): Promise<EventMatch> {
    const [updated] = await db.update(eventMatches)
      .set({ matchType })
      .where(eq(eventMatches.id, eventMatchId))
      .returning();
    return updated;
  }

  async createPressMatch(parentMatchId: number, startHole: number, customName?: string | null, pressSegment?: string | null): Promise<EventMatch> {
    // Manual-press semantics by bet type:
    //   - Match Play (1 / 2 ball): a fresh match-play bet starting at `startHole`.
    //   - Stroke Play: a fresh stroke-play bet over holes startHole..18.
    //   - Nassau: a fresh Nassau (Front 9 / Back 9 / Overall) starting at `startHole`.
    //     Legs whose hole range falls entirely before `startHole` (e.g. Front 9 when
    //     startHole > 9) settle as no-bets (0). Auto-press toggles are inherited from
    //     the parent so the press follows the same Auto Press preferences.
    //   - Skins: a fresh skins game over holes startHole..18 with the same player pool.
    //   - Death Match: existing behavior — the press is a separate bet at the correct
    //     first/subsequent press amount; both Best Ball and Second Ball share the
    //     parent's hole range.
    //   - 5-5-5-3: a fresh 5-5-5-3 over holes startHole..18 (the per-hole best-ball
    //     count is still based on physical hole number).
    //   - 2 Ball / 3 Ball: like Nassau but for both nested Nassaus.
    // All bet-type-specific configuration fields are copied so the child settles using
    // the same engine as the parent.
    const parentMatch = await this.getEventMatchWithTeams(parentMatchId);
    if (!parentMatch) throw new Error("Parent match not found");

    // For Death Match presses, determine the correct press amount
    let pressUnitAmount = parentMatch.unitAmount;
    if (parentMatch.matchType === 'death_match') {
      // Count existing presses to determine if this is the first or subsequent
      const existingPresses = await db.select().from(eventMatches)
        .where(eq(eventMatches.parentMatchId, parentMatchId));
      if (existingPresses.length === 0) {
        // First press - use first press amount
        pressUnitAmount = parentMatch.deathMatchFirstPressBet || Math.round((parentMatch.deathMatchBaseBet || parentMatch.unitAmount) / 2);
      } else {
        // Subsequent press - use subsequent press amount
        pressUnitAmount = parentMatch.deathMatchSubsequentPressBet || Math.round((parentMatch.deathMatchBaseBet || parentMatch.unitAmount) / 4);
      }
    }

    const trimmedCustomName = customName?.trim();
    const [newPressMatch] = await db.insert(eventMatches).values({
      eventId: parentMatch.eventId,
      name: `Press from ${startHole}`,
      customName: trimmedCustomName ? trimmedCustomName : null,
      matchType: parentMatch.matchType,
      unitAmount: pressUnitAmount,
      parentMatchId: parentMatchId,
      startHole: startHole,
      pressSegment: pressSegment ?? null,
      autoPressOriginal: parentMatch.autoPressOriginal,
      autoPressAllPresses: false,
      // Inherit Nassau auto-press toggles so a Nassau press follows parent settings.
      autoPressNassauFront9: parentMatch.autoPressNassauFront9,
      autoPressNassauBack9: parentMatch.autoPressNassauBack9,
      autoPressNassauOverall: parentMatch.autoPressNassauOverall,
      // Inherit net-scoring + back-9 + handicapping flags so the press scores the same way.
      useNetScoring: parentMatch.useNetScoring,
      startOnBack9: parentMatch.startOnBack9,
      // Death Match bet config
      deathMatchBaseBet: parentMatch.deathMatchBaseBet,
      deathMatchBestBallBet: parentMatch.deathMatchBestBallBet,
      deathMatchSecondBallBet: parentMatch.deathMatchSecondBallBet,
      deathMatchFirstPressBet: parentMatch.deathMatchFirstPressBet,
      deathMatchSubsequentPressBet: parentMatch.deathMatchSubsequentPressBet,
      deathMatchSecondBallPressBet: parentMatch.deathMatchSecondBallPressBet,
      // 2 Ball / 3 Ball bet config + auto-press toggles
      twoThreeBallTwoBallBet: parentMatch.twoThreeBallTwoBallBet,
      twoThreeBallThreeBallBet: parentMatch.twoThreeBallThreeBallBet,
      autoPressTwoBallFront9: parentMatch.autoPressTwoBallFront9,
      autoPressTwoBallBack9: parentMatch.autoPressTwoBallBack9,
      autoPressTwoBallOverall: parentMatch.autoPressTwoBallOverall,
      autoPressThreeBallFront9: parentMatch.autoPressThreeBallFront9,
      autoPressThreeBallBack9: parentMatch.autoPressThreeBallBack9,
      autoPressThreeBallOverall: parentMatch.autoPressThreeBallOverall,
      // 1 Ball / 2nd3rd Ball bet config + auto-press toggles
      oneTwoThreeBallOneBallBet: parentMatch.oneTwoThreeBallOneBallBet,
      oneTwoThreeBallTwoThirdBallBet: parentMatch.oneTwoThreeBallTwoThirdBallBet,
      autoPressOneBallFront9: parentMatch.autoPressOneBallFront9,
      autoPressOneBallBack9: parentMatch.autoPressOneBallBack9,
      autoPressOneBallOverall: parentMatch.autoPressOneBallOverall,
      autoPressTwoThirdBallFront9: parentMatch.autoPressTwoThirdBallFront9,
      autoPressTwoThirdBallBack9: parentMatch.autoPressTwoThirdBallBack9,
      autoPressTwoThirdBallOverall: parentMatch.autoPressTwoThirdBallOverall,
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

  async deletePressMatch(pressMatchId: number): Promise<void> {
    // Recursively delete any child presses (e.g. press of a press) so we don't
    // leave orphaned rows referencing this press as their parent.
    const children = await db.select().from(eventMatches)
      .where(eq(eventMatches.parentMatchId, pressMatchId));
    for (const child of children) {
      await this.deletePressMatch(child.id);
    }

    // Cached results + per-match handicap overrides for this press
    await db.delete(eventMatchResults).where(eq(eventMatchResults.eventMatchId, pressMatchId));
    await db.delete(matchPlayerHandicaps).where(eq(matchPlayerHandicaps.eventMatchId, pressMatchId));

    // Teams + team members for the press
    const teamsList = await db.select().from(teams).where(eq(teams.eventMatchId, pressMatchId));
    for (const team of teamsList) {
      await db.delete(teamMembers).where(eq(teamMembers.teamId, team.id));
    }
    await db.delete(teams).where(eq(teams.eventMatchId, pressMatchId));

    // Finally remove the press event_match row itself
    await db.delete(eventMatches).where(eq(eventMatches.id, pressMatchId));
  }

  async renamePressMatch(pressMatchId: number, customName: string | null): Promise<EventMatch> {
    const trimmed = customName?.trim();
    const [updated] = await db.update(eventMatches)
      .set({ customName: trimmed ? trimmed : null })
      .where(eq(eventMatches.id, pressMatchId))
      .returning();
    return updated;
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
      // Check if already claimed by someone else via the string index
      const [existingClaim] = await db.select().from(users)
        .where(eq(users.presetPlayerName, presetPlayerName));
      if (existingClaim && existingClaim.id !== userId) {
        throw new Error(`${presetPlayerName} is already claimed by another user`);
      }

      // Check if the preset player FK is already held by a different user — fail atomically
      const [ppRow] = await db.select().from(presetPlayers)
        .where(eq(presetPlayers.name, presetPlayerName));
      if (ppRow && ppRow.userId && ppRow.userId !== userId) {
        throw new Error(`${presetPlayerName} is already linked to another account`);
      }
    }

    const [updated] = await db.update(users)
      .set({ presetPlayerName })
      .where(eq(users.id, userId))
      .returning();

    // Keep the FK in sync: write preset_players.userId whenever the string is set/cleared
    if (presetPlayerName) {
      // Set FK on the matching preset player only if unowned or already owned by this user
      await db.update(presetPlayers)
        .set({ userId })
        .where(and(
          eq(presetPlayers.name, presetPlayerName),
          or(isNull(presetPlayers.userId), eq(presetPlayers.userId, userId))
        ));
    } else {
      // Unclaiming: clear FK on any preset player that was linked to this user
      await db.update(presetPlayers)
        .set({ userId: null })
        .where(eq(presetPlayers.userId, userId));
    }

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

    // Sync FK
    await db.update(presetPlayers)
      .set({ userId })
      .where(eq(presetPlayers.name, presetPlayerName));

    return updated;
  }

  async updateUserProfile(userId: string, data: { firstName?: string; lastName?: string; email?: string; phone?: string; phoneVerified?: boolean; handicapIndex?: number | null; teePreference?: string | null; discoverable?: boolean; displayName?: string | null }): Promise<typeof users.$inferSelect> {
    const updateData: Partial<typeof users.$inferInsert> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.phoneVerified !== undefined) updateData.phoneVerified = data.phoneVerified;
    if (data.handicapIndex !== undefined) updateData.handicapIndex = data.handicapIndex;
    if (data.teePreference !== undefined) updateData.teePreference = data.teePreference;
    if (data.discoverable !== undefined) updateData.discoverable = data.discoverable;
    if (data.displayName !== undefined) updateData.displayName = data.displayName;

    const [updated] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async deleteUserAccount(userId: string): Promise<void> {
    // Anonymize PII and soft-delete. Scores and match history remain
    // under the player rows but the user identity is scrubbed.
    await db.update(users).set({
      deletedAt: new Date(),
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
      phoneVerified: false,
      presetPlayerName: null,
    }).where(eq(users.id, userId));
  }

  async getLedgerData(startDate?: Date, endDate?: Date) {
    // Build date conditions and push them into the SQL WHERE clause
    const dateConditions = [];
    if (startDate) {
      dateConditions.push(gte(matches.createdAt, startDate));
    }
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      dateConditions.push(lte(matches.createdAt, endOfDay));
    }
    const whereClause = dateConditions.length > 0 ? and(...dateConditions) : undefined;

    const allMatches = await db.select().from(matches).where(whereClause).orderBy(matches.createdAt);

    const allMatchIds = allMatches.map(m => m.id);

    // ── Step 1: Bulk-fetch event matches, teams, team members, players, and scores ──

    const allEventMatchRows = allMatchIds.length > 0
      ? await db.select().from(eventMatches).where(inArray(eventMatches.eventId, allMatchIds))
      : [];

    const allEmIds = allEventMatchRows.map(em => em.id);

    const [allTeamRows, allScores] = await Promise.all([
      allEmIds.length > 0
        ? db.select().from(teams).where(inArray(teams.eventMatchId, allEmIds))
        : Promise.resolve([]),
      allMatchIds.length > 0
        ? db.select().from(scores).where(inArray(scores.matchId, allMatchIds))
        : Promise.resolve([]),
    ]);

    const allTeamIds = allTeamRows.map(t => t.id);

    const allMemberRows = allTeamIds.length > 0
      ? await db.select().from(teamMembers).where(inArray(teamMembers.teamId, allTeamIds))
      : [];

    const allPlayerIds = Array.from(new Set(allMemberRows.map(m => m.playerId)));
    const allPlayerRows = allPlayerIds.length > 0
      ? await db.select().from(players).where(inArray(players.id, allPlayerIds))
      : [];

    // Build lookup maps
    const playerMap = new Map(allPlayerRows.map(p => [p.id, p]));

    const membersByTeamId = new Map<number, Array<typeof allMemberRows[0] & { player: typeof allPlayerRows[0] | undefined }>>();
    for (const m of allMemberRows) {
      const arr = membersByTeamId.get(m.teamId) ?? [];
      arr.push({ ...m, player: playerMap.get(m.playerId) });
      membersByTeamId.set(m.teamId, arr);
    }

    const teamsByEmId = new Map<number, Array<typeof allTeamRows[0] & { members: Array<typeof allMemberRows[0] & { player: typeof allPlayerRows[0] | undefined }> }>>();
    for (const t of allTeamRows) {
      const arr = teamsByEmId.get(t.eventMatchId) ?? [];
      arr.push({ ...t, members: membersByTeamId.get(t.id) ?? [] });
      teamsByEmId.set(t.eventMatchId, arr);
    }

    const allEventMatches = allEventMatchRows.map(em => ({ ...em, teams: teamsByEmId.get(em.id) ?? [] }));

    // ── Step 2: Bulk-fetch course data ──

    const uniqueCourseIds = Array.from(new Set(allMatches.map(m => m.courseId).filter((id): id is number => id != null)));

    const [allCourseHoleRows, allCourseTeeRows] = await Promise.all([
      uniqueCourseIds.length > 0
        ? db.select().from(courseHoles).where(inArray(courseHoles.courseId, uniqueCourseIds)).orderBy(courseHoles.holeNumber)
        : Promise.resolve([]),
      uniqueCourseIds.length > 0
        ? db.select().from(courseTees).where(inArray(courseTees.courseId, uniqueCourseIds))
        : Promise.resolve([]),
    ]);

    const courseData: Record<number, { holes: CourseHole[]; tees: CourseTee[] }> = {};
    for (const id of uniqueCourseIds) {
      courseData[id] = { holes: [], tees: [] };
    }
    for (const h of allCourseHoleRows) courseData[h.courseId].holes.push(h);
    for (const t of allCourseTeeRows) courseData[t.courseId].tees.push(t);

    // ── Step 3: Bulk-fetch Ryder Cup structural data ──

    const ryderCupEventIds = Array.from(new Set(allMatches.filter(m => m.eventId).map(m => m.eventId!)));
    const ryderCupPlayerDataByEventAndDay: Record<number, Record<number, Record<string, { handicapIndex: number | null; teeId: number | null }>>> = {};
    const ryderCupScoresByEventAndDay: Record<number, Record<number, Record<string, Record<number, number>>>> = {};

    if (ryderCupEventIds.length > 0) {
      const allDayRows = await db.select().from(ryderCupDays).where(inArray(ryderCupDays.eventId, ryderCupEventIds));
      const allDayIds = allDayRows.map(d => d.id);

      const allPairingRows = allDayIds.length > 0
        ? await db.select().from(ryderCupPairings).where(inArray(ryderCupPairings.dayId, allDayIds))
        : [];
      const allPairingIds = allPairingRows.map(p => p.id);

      const allSideRows = allPairingIds.length > 0
        ? await db.select().from(ryderCupPairingSides).where(inArray(ryderCupPairingSides.pairingId, allPairingIds))
        : [];
      const allSideIds = allSideRows.map(s => s.id);

      // ── Step 4: Bulk-fetch team members and pairing scores ──

      const allRcMemberIds = Array.from(new Set([
        ...allSideRows.map(s => s.player1Id).filter((id): id is number => id != null),
        ...allSideRows.map(s => s.player2Id).filter((id): id is number => id != null),
      ]));

      const [allRcMemberRows, allPairingScoreRows] = await Promise.all([
        allRcMemberIds.length > 0
          ? db.select().from(ryderCupTeamMembers).where(inArray(ryderCupTeamMembers.id, allRcMemberIds))
          : Promise.resolve([]),
        allSideIds.length > 0
          ? db.select().from(ryderCupPairingScores).where(inArray(ryderCupPairingScores.sideId, allSideIds))
          : Promise.resolve([]),
      ]);

      const rcMemberMap = new Map(allRcMemberRows.map(m => [m.id, m]));

      // Build day → event and day → dayNumber lookup
      const dayById = new Map(allDayRows.map(d => [d.id, d]));
      // Build pairing → dayId lookup
      const pairingById = new Map(allPairingRows.map(p => [p.id, p]));
      // Build scores by sideId
      const scoresBySideId = new Map<number, typeof allPairingScoreRows>();
      for (const score of allPairingScoreRows) {
        const arr = scoresBySideId.get(score.sideId) ?? [];
        arr.push(score);
        scoresBySideId.set(score.sideId, arr);
      }

      // Initialize output maps
      for (const eventId of ryderCupEventIds) {
        ryderCupPlayerDataByEventAndDay[eventId] = {};
        ryderCupScoresByEventAndDay[eventId] = {};
      }
      for (const day of allDayRows) {
        ryderCupPlayerDataByEventAndDay[day.eventId][day.dayNumber] = {};
        ryderCupScoresByEventAndDay[day.eventId][day.dayNumber] = {};
      }

      // Reconstruct maps from bulk data
      for (const side of allSideRows) {
        const pairing = pairingById.get(side.pairingId);
        if (!pairing) continue;
        const day = dayById.get(pairing.dayId);
        if (!day) continue;
        const { eventId, dayNumber } = day;

        let player1Name = side.player1Name;
        let player2Name = side.player2Name;

        if (side.player1Id) {
          const m = rcMemberMap.get(side.player1Id);
          if (m) player1Name = m.playerName;
        }
        if (side.player2Id) {
          const m = rcMemberMap.get(side.player2Id);
          if (m) player2Name = m.playerName;
        }

        if (player1Name) {
          ryderCupPlayerDataByEventAndDay[eventId][dayNumber][player1Name] = {
            handicapIndex: side.player1HandicapIndex,
            teeId: side.player1TeeId,
          };
        }
        if (player2Name) {
          ryderCupPlayerDataByEventAndDay[eventId][dayNumber][player2Name] = {
            handicapIndex: side.player2HandicapIndex,
            teeId: side.player2TeeId,
          };
        }

        const sideScores = scoresBySideId.get(side.id) ?? [];
        for (const score of sideScores) {
          if (player1Name && score.player1Strokes !== null) {
            if (!ryderCupScoresByEventAndDay[eventId][dayNumber][player1Name]) {
              ryderCupScoresByEventAndDay[eventId][dayNumber][player1Name] = {};
            }
            ryderCupScoresByEventAndDay[eventId][dayNumber][player1Name][score.holeNumber] = score.player1Strokes;
          }
          if (player2Name && score.player2Strokes !== null) {
            if (!ryderCupScoresByEventAndDay[eventId][dayNumber][player2Name]) {
              ryderCupScoresByEventAndDay[eventId][dayNumber][player2Name] = {};
            }
            ryderCupScoresByEventAndDay[eventId][dayNumber][player2Name][score.holeNumber] = score.player2Strokes;
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

  async updateCourse(id: number, data: { name?: string; scorecardNotes?: string | null }): Promise<Course | undefined> {
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
      // Carry over the source player's personId directly (this is literally
      // the same person, not a new addition) rather than creating a new one.
      const [newPlayer] = await db.insert(players).values({
        matchId: newMatch.id,
        userId: player.userId,
        name: player.name,
        handicapIndex: player.handicapIndex,
        teeId: player.teeId,
        personId: player.personId,
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
    if (!group) return group;
    return this.checkAndFinalizeGroupDeletion(group);
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
    let userGroups = await db.select().from(groups).where(inArray(groups.id, groupIds));

    // Lazy enforcement: a group whose 14-day claim-admin window has expired
    // with nobody claiming admin gets soft-deleted right here, on read,
    // rather than via a background job (no cron infra in this app yet).
    userGroups = await Promise.all(userGroups.map(g => this.checkAndFinalizeGroupDeletion(g)));
    userGroups = userGroups.filter(g => !g.deletedAt);

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
    result.sort((a, b) => a.memberCount - b.memberCount || a.name.localeCompare(b.name));
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

    // The creator is a group admin (can manage the group) but that is a
    // separate concept from being on the roster (group_players — who can
    // actually be picked as a player in a match). Without this, the creator
    // is never pickable in their own group. Added 2026-07-13 after finding
    // 0 group_players rows existed for any group creator in production.
    await this.addGroupPlayerFromUser(newGroup.id, createdBy, createdBy).catch(() => {});

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

  // How long a non-solo group waits, after an admin requests deletion, for
  // some other member to claim admin before it's soft-deleted for real.
  private static readonly GROUP_DELETION_WAIT_DAYS = 14;
  // (referenced below as DatabaseStorage.GROUP_DELETION_WAIT_DAYS)

  // If a group has a pending deletion request older than the wait window,
  // finalize it (soft-delete) right now and return the updated row. Called
  // from every read path (getGroupById, getGroupsForUser) instead of a
  // background job — this app has no cron infra, and groups are read often
  // enough that "checked on next read" is good enough for a 2-week window.
  private async checkAndFinalizeGroupDeletion(group: Group): Promise<Group> {
    if (!group.deletionRequestedAt || group.deletedAt) return group;
    const ageMs = Date.now() - new Date(group.deletionRequestedAt).getTime();
    const waitMs = DatabaseStorage.GROUP_DELETION_WAIT_DAYS * 24 * 60 * 60 * 1000;
    if (ageMs < waitMs) return group;

    const [finalized] = await db.update(groups)
      .set({ deletedAt: new Date() })
      .where(eq(groups.id, group.id))
      .returning();
    return finalized;
  }

  // Admin requests deletion. Solo groups (creator is the only member) delete
  // immediately — there's no one else who'd want a heads-up. Non-solo groups
  // start the 14-day claim-admin window instead of deleting right away.
  // staysAsMember: captured from the requester at request time — if another
  // member later claims admin and rescues this group, should the requester
  // remain in it as a regular member (true), or have their membership removed
  // entirely while keeping their roster/history intact (false)? Irrelevant for
  // the immediate-delete (solo group) path since there's no one left to claim it.
  async requestGroupDeletion(groupId: number, requestedBy: string, staysAsMember?: boolean): Promise<{ group: Group; immediatelyDeleted: boolean }> {
    const members = await db.select().from(groupMemberships).where(eq(groupMemberships.groupId, groupId));
    const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
    if (!group) throw new Error("Group not found");

    if (members.length <= 1) {
      const [finalized] = await db.update(groups)
        .set({ deletedAt: new Date(), deletionRequestedAt: null, deletionRequestedBy: null, deletionRequesterStaysAsMember: null })
        .where(eq(groups.id, groupId))
        .returning();
      return { group: finalized, immediatelyDeleted: true };
    }

    const [updated] = await db.update(groups)
      .set({ deletionRequestedAt: new Date(), deletionRequestedBy: requestedBy, deletionRequesterStaysAsMember: staysAsMember ?? true })
      .where(eq(groups.id, groupId))
      .returning();
    // Clear old dismissals — this is a new deletion request, so anyone who
    // dismissed a *previous* request should see the new warning.
    await db.delete(groupDeletionDismissals).where(eq(groupDeletionDismissals.groupId, groupId));
    return { group: updated, immediatelyDeleted: false };
  }

  // Any member can claim admin while a deletion request is pending — that's
  // the whole point of the window. Claiming cancels the pending deletion.
  // Also resolves what happens to the original requester per their own stated
  // preference (deletionRequesterStaysAsMember, captured at request time):
  // true/null (default, back-compat with requests made before this field
  // existed) -> requester is left alone, still admin, same as original
  // behavior. false -> requester's group_memberships row is removed entirely
  // (their group_players roster row is untouched, so history/pickability stays)
  // and they no longer show up as a member or admin of this group.
  //
  // Note this deliberately bypasses the "creator can never leave/be removed/
  // have their role changed" guard enforced on the manual member-management
  // routes in routes.ts — that guard protects against another admin
  // unilaterally acting on the creator. This is different: the creator/
  // requester pre-declared their own preference at the moment they asked to
  // delete the group, so it's self-determined, not imposed.
  async claimGroupAdmin(groupId: number, userId: string): Promise<Group> {
    const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
    if (!group) throw new Error("Group not found");
    if (!group.deletionRequestedAt) throw new Error("No pending deletion request on this group");

    const membership = await this.getGroupMembership(groupId, userId);
    if (!membership) throw new Error("Not a member of this group");

    await db.update(groupMemberships)
      .set({ role: 'admin' })
      .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, userId)));

    const requesterId = group.deletionRequestedBy;
    const requesterStays = group.deletionRequesterStaysAsMember;
    if (requesterId && requesterId !== userId) {
      if (requesterStays === false) {
        await db.delete(groupMemberships)
          .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.userId, requesterId)));
      }
      // true or null: leave the requester's membership/role untouched.
    }

    const [updated] = await db.update(groups)
      .set({ deletionRequestedAt: null, deletionRequestedBy: null, deletionRequesterStaysAsMember: null })
      .where(eq(groups.id, groupId))
      .returning();
    await db.delete(groupDeletionDismissals).where(eq(groupDeletionDismissals.groupId, groupId));
    return updated;
  }

  async dismissGroupDeletionWarning(groupId: number, userId: string): Promise<void> {
    const existing = await db.select().from(groupDeletionDismissals)
      .where(and(eq(groupDeletionDismissals.groupId, groupId), eq(groupDeletionDismissals.userId, userId)));
    if (existing.length > 0) return;
    await db.insert(groupDeletionDismissals).values({ groupId, userId });
  }

  // Powers an app-open / login banner: every group this user belongs to
  // that has a live (non-expired, non-dismissed-by-them) deletion request.
  async getPendingDeletionWarningsForUser(userId: string): Promise<Array<{ group: Group; requestedByDisplayName: string }>> {
    const memberships = await db.select().from(groupMemberships).where(eq(groupMemberships.userId, userId));
    if (memberships.length === 0) return [];
    const groupIds = memberships.map(m => m.groupId);

    let candidateGroups = await db.select().from(groups)
      .where(and(inArray(groups.id, groupIds), isNotNull(groups.deletionRequestedAt)));
    candidateGroups = await Promise.all(candidateGroups.map(g => this.checkAndFinalizeGroupDeletion(g)));
    candidateGroups = candidateGroups.filter(g => g.deletionRequestedAt && !g.deletedAt);
    if (candidateGroups.length === 0) return [];

    const dismissals = await db.select().from(groupDeletionDismissals)
      .where(and(inArray(groupDeletionDismissals.groupId, candidateGroups.map(g => g.id)), eq(groupDeletionDismissals.userId, userId)));
    const dismissedGroupIds = new Set(dismissals.map(d => d.groupId));

    const result: Array<{ group: Group; requestedByDisplayName: string }> = [];
    for (const group of candidateGroups) {
      if (dismissedGroupIds.has(group.id)) continue;
      const [requester] = await db.select().from(users).where(eq(users.id, group.deletionRequestedBy!));
      const requestedByDisplayName = requester?.displayName || requester?.presetPlayerName || [requester?.firstName, requester?.lastName].filter(Boolean).join(' ') || "A group admin";
      result.push({ group, requestedByDisplayName });
    }
    return result;
  }

  // Queues a "join as a member?" prompt for an admin-initiated roster link
  // (search / copy / bulk-import). No-op if the user is already a member,
  // or already has a pending invite for this group — safe to call every
  // time addGroupPlayerFromUser runs, including for the group's own creator
  // (who is already a member by the time this would ever fire for them).
  async createMembershipInviteIfNeeded(groupId: number, userId: string): Promise<void> {
    const existingMembership = await this.getGroupMembership(groupId, userId);
    if (existingMembership) return;

    const existingInvite = await db.select().from(groupMembershipInvites)
      .where(and(
        eq(groupMembershipInvites.groupId, groupId),
        eq(groupMembershipInvites.userId, userId),
        eq(groupMembershipInvites.status, 'pending'),
      ));
    if (existingInvite.length > 0) return;

    await db.insert(groupMembershipInvites).values({ groupId, userId });
  }

  // Powers an app-open banner, parallel to getPendingDeletionWarningsForUser.
  // Also resolves who added them, same fallback chain as the deletion banner's
  // requestedByDisplayName, so the banner can say "Danny added you" instead of
  // a generic "a group admin" — pulled from group_players.addedBy, since the
  // invite row itself doesn't store who triggered it.
  async getPendingMembershipInvitesForUser(userId: string): Promise<Array<{ group: Group; addedByDisplayName: string }>> {
    const invites = await db.select().from(groupMembershipInvites)
      .where(and(eq(groupMembershipInvites.userId, userId), eq(groupMembershipInvites.status, 'pending')));
    if (invites.length === 0) return [];

    const groupIds = invites.map(i => i.groupId);
    let candidateGroups = await db.select().from(groups).where(inArray(groups.id, groupIds));
    // Skip groups that got soft-deleted or are mid-deletion since the invite was queued.
    candidateGroups = await Promise.all(candidateGroups.map(g => this.checkAndFinalizeGroupDeletion(g)));
    candidateGroups = candidateGroups.filter(g => !g.deletedAt);
    if (candidateGroups.length === 0) return [];

    const result: Array<{ group: Group; addedByDisplayName: string }> = [];
    for (const group of candidateGroups) {
      const [rosterRow] = await db.select().from(groupPlayers)
        .where(and(eq(groupPlayers.groupId, group.id), eq(groupPlayers.linkedUserId, userId)));
      let addedByDisplayName = "A group admin";
      if (rosterRow?.addedBy) {
        const [adder] = await db.select().from(users).where(eq(users.id, rosterRow.addedBy));
        addedByDisplayName = adder?.displayName || adder?.presetPlayerName || [adder?.firstName, adder?.lastName].filter(Boolean).join(' ') || "A group admin";
      }
      result.push({ group, addedByDisplayName });
    }
    return result;
  }

  async acceptMembershipInvite(groupId: number, userId: string): Promise<void> {
    const existingMembership = await this.getGroupMembership(groupId, userId);
    if (!existingMembership) {
      await db.insert(groupMemberships).values({ groupId, userId, role: 'member' });
    }
    await db.update(groupMembershipInvites)
      .set({ status: 'accepted', respondedAt: new Date() })
      .where(and(
        eq(groupMembershipInvites.groupId, groupId),
        eq(groupMembershipInvites.userId, userId),
        eq(groupMembershipInvites.status, 'pending'),
      ));
  }

  async dismissMembershipInvite(groupId: number, userId: string): Promise<void> {
    await db.update(groupMembershipInvites)
      .set({ status: 'dismissed', respondedAt: new Date() })
      .where(and(
        eq(groupMembershipInvites.groupId, groupId),
        eq(groupMembershipInvites.userId, userId),
        eq(groupMembershipInvites.status, 'pending'),
      ));
  }

  async getGroupMembers(groupId: number) {
    const members = await db.select().from(groupMemberships).where(eq(groupMemberships.groupId, groupId));
    const result = [];
    for (const member of members) {
      const [user] = await db.select({
        id: users.id,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
        presetPlayerName: users.presetPlayerName,
        username: users.username,
        email: users.email,
        profileImageUrl: users.profileImageUrl,
        phone: users.phone,
        phoneVerified: users.phoneVerified,
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

    // "Most used" support (2026-07-13): one grouped query counting how many
    // match-player rows point back at each roster row via groupPlayerId
    // (only populated for players added through the from-roster path going
    // forward — pre-existing matches won't retroactively count, no backfill
    // attempted). Computed once here rather than per-row to avoid N+1s on
    // top of the existing presetPlayer/displayName lookups below.
    const rosterIds = gps.map(g => g.id);
    const playCounts = new Map<number, number>();
    if (rosterIds.length > 0) {
      const counts = await db.select({
        groupPlayerId: players.groupPlayerId,
        count: sql<number>`count(*)`.mapWith(Number),
      }).from(players)
        .where(inArray(players.groupPlayerId, rosterIds))
        .groupBy(players.groupPlayerId);
      for (const c of counts) {
        if (c.groupPlayerId != null) playCounts.set(c.groupPlayerId, c.count);
      }
    }

    const result = [];
    for (const gp of gps) {
      // presetPlayerId is optional now (Phase 4) — guests and user-search adds
      // may not have one, so skip the lookup rather than querying with null.
      let pp: { id: number; name: string } | undefined;
      if (gp.presetPlayerId != null) {
        [pp] = await db.select({ id: presetPlayers.id, name: presetPlayers.name })
          .from(presetPlayers).where(eq(presetPlayers.id, gp.presetPlayerId));
      }
      // Linked real accounts: resolve the LIVE users.displayName rather than
      // trusting whatever was copied into this row when they were added.
      // group_players.displayName was a point-in-time snapshot, so it goes
      // stale the moment someone updates their profile (or the fallback logic
      // itself changes, as happened 2026-07-12 with the email-in-roster bug).
      // Guests have no linkedUserId, so they keep using the stored value —
      // it's their only source of truth.
      let displayName = gp.displayName;
      if (gp.linkedUserId) {
        const [u] = await db.select({ displayName: users.displayName })
          .from(users).where(eq(users.id, gp.linkedUserId));
        if (u?.displayName) displayName = u.displayName;
      }
      result.push({ ...gp, displayName, presetPlayer: pp || undefined, timesPlayed: playCounts.get(gp.id) ?? 0 });
    }
    return result;
  }

  // Phase 4 (2026-07-13): the legacy addGroupPlayer() below only ever sets
  // presetPlayerId, never linkedUserId — so a preset player already claimed
  // by a real account would still show up as a "Guest" in the roster
  // (isGuest checks linkedUserId, not presetPlayerId). This wrapper checks
  // claim status first: if the preset player has a claiming user, route
  // through addGroupPlayerFromUser so the roster row is properly linked;
  // otherwise fall back to the legacy guest-shaped insert. Used by the
  // bulk preset-player import path (AddGroupPlayerSheet's "Import" tab).
  async addGroupPlayerFromPreset(groupId: number, presetPlayerId: number, addedBy?: string): Promise<GroupPlayer> {
    const [preset] = await db.select({ userId: presetPlayers.userId })
      .from(presetPlayers).where(eq(presetPlayers.id, presetPlayerId));
    if (preset?.userId) {
      return this.addGroupPlayerFromUser(groupId, preset.userId, addedBy);
    }
    return this.addGroupPlayer(groupId, presetPlayerId, addedBy);
  }

  async addGroupPlayer(groupId: number, presetPlayerId: number, addedBy?: string): Promise<GroupPlayer> {
    const [preset] = await db.select().from(presetPlayers).where(eq(presetPlayers.id, presetPlayerId));
    // Phase B dual-write: reuse/create the people row for a claimed account,
    // else a brand-new guest people row (see findOrCreatePersonForNewPlayer).
    const personId = await this.findOrCreatePersonForNewPlayer(preset?.name ?? "Player", preset?.userId ?? null);
    const [gp] = await db.insert(groupPlayers).values({
      groupId,
      presetPlayerId,
      addedBy: addedBy || null,
      personId,
    }).returning();
    return gp;
  }

  // Phase 4 — Path 1: "Add guest". No account, no preset player row. The
  // group_players row IS the record; displayName/handicapIndex/teePreference
  // live directly on it.
  async addGroupPlayerGuest(
    groupId: number,
    name: string,
    // personId: pass the SOURCE row's personId through when this call is really
    // "copy this existing person into another group" (see copy-from-my-groups
    // route) rather than a brand-new guest — same person, don't mint a new one.
    opts: { handicapIndex?: number | null; teePreference?: string | null; addedBy?: string; personId?: number } = {}
  ): Promise<GroupPlayer> {
    const personId = opts.personId ?? await this.findOrCreatePersonForNewPlayer(name, null);
    const [gp] = await db.insert(groupPlayers).values({
      groupId,
      displayName: name,
      handicapIndex: opts.handicapIndex ?? null,
      teePreference: opts.teePreference ?? null,
      addedBy: opts.addedBy || null,
      personId,
    }).returning();
    return gp;
  }

  // Phase 4 — Path 2: "Search globally". Adds a real user account to the
  // group's roster, pre-populated from their canonical profile and linked
  // by linkedUserId (not a name-string guess).
  async addGroupPlayerFromUser(
    groupId: number,
    targetUserId: string,
    addedBy?: string
  ): Promise<GroupPlayer> {
    const existing = await db.select().from(groupPlayers)
      .where(and(eq(groupPlayers.groupId, groupId), eq(groupPlayers.linkedUserId, targetUserId)));
    if (existing.length > 0) {
      // Roster link already existed — still make sure a membership invite
      // is queued if one never was (e.g. this ran before the invite system
      // existed, or an earlier invite was dismissed and this is a fresh add).
      await this.createMembershipInviteIfNeeded(groupId, targetUserId).catch(() => {});
      return existing[0];
    }

    const [targetUser] = await db.select().from(users).where(eq(users.id, targetUserId));
    if (!targetUser) throw new Error("User not found");

    // Never falls back to email — this is what shows in the roster.
    const displayName = targetUser.displayName
      || targetUser.presetPlayerName
      || `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim()
      || targetUser.username
      || "Player";

    // Phase B dual-write: real account, so reuse/create the people row keyed
    // on userId — safe, correct dedup (unlike name-based guest matching).
    const personId = await this.findOrCreatePersonForNewPlayer(displayName, targetUserId);
    const [gp] = await db.insert(groupPlayers).values({
      groupId,
      linkedUserId: targetUserId,
      displayName,
      handicapIndex: targetUser.handicapIndex ?? null,
      teePreference: targetUser.teePreference ?? null,
      addedBy: addedBy || null,
      personId,
    }).returning();

    // Admin-initiated link (search / copy / bulk-import) — the target user
    // didn't do anything themselves, so queue a "join as member?" prompt
    // instead of silently enrolling them. No-ops if they're already a
    // member (e.g. this is the group's own creator).
    await this.createMembershipInviteIfNeeded(groupId, targetUserId).catch(() => {});

    return gp;
  }

  // Phase 4 — Path 3: "Copy from my groups". Roster of everyone already in a
  // group this admin manages, excluding the target group and anyone already
  // in it — so the client can offer "add someone you already know" without
  // re-searching or re-typing them.
  async getCopyFromMyGroupsCandidates(adminUserId: string, targetGroupId: number) {
    const myMemberships = await db.select().from(groupMemberships)
      .where(and(eq(groupMemberships.userId, adminUserId), eq(groupMemberships.role, 'admin')));
    const otherGroupIds = myMemberships.map(m => m.groupId).filter(id => id !== targetGroupId);
    if (otherGroupIds.length === 0) return [];

    const alreadyInTarget = await db.select().from(groupPlayers).where(eq(groupPlayers.groupId, targetGroupId));
    const alreadyLinkedUserIds = new Set(alreadyInTarget.map(gp => gp.linkedUserId).filter(Boolean));
    const alreadyDisplayNames = new Set(alreadyInTarget.map(gp => gp.displayName?.toLowerCase()).filter(Boolean));

    const candidates = await db.select().from(groupPlayers).where(inArray(groupPlayers.groupId, otherGroupIds));

    // Dedup by linkedUserId first (reliable), then by display name (best-effort for guests)
    const seen = new Set<string>();
    const result: GroupPlayer[] = [];
    for (const c of candidates) {
      if (c.linkedUserId && alreadyLinkedUserIds.has(c.linkedUserId)) continue;
      if (!c.linkedUserId && c.displayName && alreadyDisplayNames.has(c.displayName.toLowerCase())) continue;
      const dedupeKey = c.linkedUserId || c.displayName?.toLowerCase() || `gp-${c.id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      result.push(c);
    }
    return result;
  }

  // Phase 4 — global player search. Discoverable users only, name only,
  // no group affiliation or private data in the result.
  //
  // Matches preset_player_name / first+last name first, but falls back to
  // username and email — most accounts right now (test signups, early real
  // accounts) have never had a name set, so name-only matching found nobody.
  // Email/username are still only used to MATCH the search query; the
  // returned displayName never exposes them unless there's truly nothing
  // else to show (same fallback chain used at match-creation time).
  async searchDiscoverableUsers(query: string, excludeUserId?: string): Promise<Array<{ id: string; displayName: string }>> {
    const trimmed = query.trim();
    if (trimmed.length < 3) return [];
    const rows = await db.select({
      id: users.id,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      presetPlayerName: users.presetPlayerName,
      username: users.username,
      email: users.email,
    }).from(users)
      // Switched from hand-written raw sql`` to Drizzle's own ilike()/or()/and()
      // helpers — two earlier attempts at a raw SQL fragment here both threw a
      // Postgres syntax error at runtime despite the equivalent SQL working fine
      // run directly in psql (caught + reproduced 2026-07-12). Using the tested
      // query-builder operators instead of debugging Drizzle's raw-sql templating
      // further. Loses the "first + last name concatenated" match (can't express
      // that without raw SQL), but firstName/lastName are still each matched
      // individually, which covers the practical case.
      //
      // We still search email (people know each other's emails), but email is
      // never shown — the displayName fallback below stops at username, never
      // falls through to the email address. 2026-07-12: added displayName as
      // the primary match/display field now that registration actually sets it.
      .where(and(
        eq(users.discoverable, true),
        or(
          ilike(users.displayName, `%${trimmed}%`),
          ilike(users.presetPlayerName, `%${trimmed}%`),
          ilike(users.firstName, `%${trimmed}%`),
          ilike(users.lastName, `%${trimmed}%`),
          ilike(users.username, `%${trimmed}%`),
          ilike(users.email, `%${trimmed}%`),
        )
      ));
    return rows
      .filter(r => r.id !== excludeUserId)
      .map(r => ({
        id: r.id,
        displayName: r.displayName
          || r.presetPlayerName
          || `${r.firstName || ''} ${r.lastName || ''}`.trim()
          || r.username
          || 'Player',
      }));
  }

  // Phase 4 guest claim flow (2026-07-13) — a single-use personal invite
  // code for ONE guest roster row. Separate concept from groups.inviteCode
  // (the broad "anyone can join this group" code): this one identifies a
  // specific already-tracked guest, so claiming it auto-links linkedUserId
  // instead of the new signer having to search-and-pick their own row.
  //
  // Uses crypto.randomBytes rather than the shorter Math.random-based codes
  // used for match codes / group invite codes — this token gets embedded in
  // a shareable link rather than typed by hand, so collision-resistance and
  // unguessability matter more than brevity here.
  async generateGuestClaimCode(groupId: number, groupPlayerId: number): Promise<string> {
    const [gp] = await db.select().from(groupPlayers)
      .where(and(eq(groupPlayers.id, groupPlayerId), eq(groupPlayers.groupId, groupId)));
    if (!gp) throw new Error("Group player not found");
    if (gp.linkedUserId) throw new Error("This roster entry is already linked to an account");

    const code = randomBytes(16).toString("hex");
    await db.update(groupPlayers)
      .set({ guestClaimCode: code, guestClaimCodeClaimedAt: null })
      .where(eq(groupPlayers.id, groupPlayerId));
    return code;
  }

  // Consuming a code: single-use (rejects if already claimed), and links the
  // CALLING user's account — never forces a new signup, and never overwrites
  // an already-linked row. If the calling account happens to already be
  // linked to a different roster row in this same group, that's allowed;
  // linkedUserId is scoped per group_players row, not globally unique.
  async claimGuestPlayer(code: string, userId: string): Promise<GroupPlayer> {
    const [gp] = await db.select().from(groupPlayers).where(eq(groupPlayers.guestClaimCode, code));
    if (!gp) throw new Error("Invite code not found");
    if (gp.guestClaimCodeClaimedAt) throw new Error("This invite code has already been used");
    if (gp.linkedUserId) throw new Error("This roster entry is already linked to an account");

    const [updated] = await db.update(groupPlayers)
      .set({ linkedUserId: userId, guestClaimCodeClaimedAt: new Date() })
      .where(eq(groupPlayers.id, gp.id))
      .returning();

    // User-initiated (they entered the code themselves) — add membership
    // right away, no invite prompt needed. Contrast with addGroupPlayerFromUser,
    // which is admin-initiated and queues an invite instead.
    const existingMembership = await this.getGroupMembership(gp.groupId, userId);
    if (!existingMembership) {
      await this.addGroupMember(gp.groupId, userId, 'member').catch(() => {});
    }

    return updated;
  }

  // Preferred going forward — works for every group_players row (guest,
  // user-search, or legacy preset-player-linked) since it keys off the
  // roster row's own id rather than assuming a presetPlayerId exists.
  async removeGroupPlayerById(groupId: number, groupPlayerId: number): Promise<boolean> {
    await db.delete(groupPlayers)
      .where(and(eq(groupPlayers.groupId, groupId), eq(groupPlayers.id, groupPlayerId)));
    return true;
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

  async getHiddenPlayers(): Promise<Array<PresetPlayer & { matchCount: number }>> {
    const rows = await db
      .select({
        id: presetPlayers.id,
        name: presetPlayers.name,
        showInRoster: presetPlayers.showInRoster,
        isAutoCreated: presetPlayers.isAutoCreated,
        lastActivityAt: presetPlayers.lastActivityAt,
        createdAt: presetPlayers.createdAt,
        userId: presetPlayers.userId,
        matchCount: sql<number>`COUNT(DISTINCT ${players.matchId})::int`,
      })
      .from(presetPlayers)
      .leftJoin(players, eq(players.presetPlayerId, presetPlayers.id))
      .where(and(eq(presetPlayers.isAutoCreated, true), eq(presetPlayers.showInRoster, false)))
      .groupBy(presetPlayers.id)
      .orderBy(desc(presetPlayers.lastActivityAt));
    return rows as Array<PresetPlayer & { matchCount: number }>;
  }

  async promoteHiddenPlayer(id: number): Promise<PresetPlayer> {
    const [updated] = await db
      .update(presetPlayers)
      .set({ showInRoster: true })
      .where(eq(presetPlayers.id, id))
      .returning();
    if (!updated) throw new Error("Player not found");
    return updated;
  }

  async deletePresetPlayerById(id: number, force: boolean): Promise<{ deleted: boolean; hasHistory: boolean }> {
    // Check match history
    const [countRow] = await db
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(players)
      .where(eq(players.presetPlayerId, id));
    const hasHistory = (countRow?.cnt ?? 0) > 0;

    if (hasHistory && !force) {
      return { deleted: false, hasHistory: true };
    }

    // If forcing, clear the FK reference on match player rows so history is preserved
    if (hasHistory && force) {
      await db
        .update(players)
        .set({ presetPlayerId: null })
        .where(eq(players.presetPlayerId, id));
    }

    // Also clean up group_players references
    await db.delete(groupPlayers).where(eq(groupPlayers.presetPlayerId, id));

    await db.delete(presetPlayers).where(eq(presetPlayers.id, id));
    return { deleted: true, hasHistory };
  }

  async bulkDeleteInactivePlayers(inactiveDays: number, dryRun: boolean): Promise<Array<PresetPlayer & { matchCount: number }>> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - inactiveDays);

    const rows = await db
      .select({
        id: presetPlayers.id,
        name: presetPlayers.name,
        showInRoster: presetPlayers.showInRoster,
        isAutoCreated: presetPlayers.isAutoCreated,
        lastActivityAt: presetPlayers.lastActivityAt,
        createdAt: presetPlayers.createdAt,
        userId: presetPlayers.userId,
        matchCount: sql<number>`COUNT(DISTINCT ${players.matchId})::int`,
      })
      .from(presetPlayers)
      .leftJoin(players, eq(players.presetPlayerId, presetPlayers.id))
      .where(
        and(
          eq(presetPlayers.isAutoCreated, true),
          eq(presetPlayers.showInRoster, false),
          or(
            isNull(presetPlayers.lastActivityAt),
            lt(presetPlayers.lastActivityAt, cutoff)
          )
        )
      )
      .groupBy(presetPlayers.id)
      .orderBy(desc(presetPlayers.lastActivityAt));

    if (dryRun) {
      return rows as Array<PresetPlayer & { matchCount: number }>;
    }

    // Actually delete them (force delete — clearing FK refs)
    for (const row of rows) {
      await this.deletePresetPlayerById(row.id, true);
    }
    return rows as Array<PresetPlayer & { matchCount: number }>;
  }

  async getGroupAutoCreatedPlayers(groupId: number): Promise<Array<PresetPlayer & { matchCount: number }>> {
    // Find auto-created preset players who appeared in this group's matches
    const rows = await db
      .select({
        id: presetPlayers.id,
        name: presetPlayers.name,
        showInRoster: presetPlayers.showInRoster,
        isAutoCreated: presetPlayers.isAutoCreated,
        lastActivityAt: presetPlayers.lastActivityAt,
        createdAt: presetPlayers.createdAt,
        userId: presetPlayers.userId,
        matchCount: sql<number>`COUNT(DISTINCT ${players.matchId})::int`,
      })
      .from(presetPlayers)
      .innerJoin(players, eq(players.presetPlayerId, presetPlayers.id))
      .innerJoin(matches, eq(players.matchId, matches.id))
      .where(
        and(
          eq(presetPlayers.isAutoCreated, true),
          eq(presetPlayers.showInRoster, false),
          eq(matches.groupId, groupId)
        )
      )
      .groupBy(presetPlayers.id)
      .orderBy(desc(presetPlayers.lastActivityAt));
    return rows as Array<PresetPlayer & { matchCount: number }>;
  }

  async getPresetPlayerByName(name: string): Promise<PresetPlayer | undefined> {
    const [player] = await db.select().from(presetPlayers).where(
      sql`LOWER(${presetPlayers.name}) = LOWER(${name})`
    );
    return player;
  }

  async getPresetPlayerById(id: number): Promise<PresetPlayer | undefined> {
    const [player] = await db.select().from(presetPlayers).where(eq(presetPlayers.id, id));
    return player;
  }

  async pairUserToPresetPlayer(presetPlayerId: number, userId: string): Promise<PresetPlayer> {
    // Check the user exists
    const targetUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (targetUser.length === 0) throw new Error("User not found");

    // Check the preset player exists
    const [pp] = await db.select().from(presetPlayers).where(eq(presetPlayers.id, presetPlayerId));
    if (!pp) throw new Error("Preset player not found");

    // Check if another preset player is already linked to this user
    const [existingLinkForUser] = await db.select().from(presetPlayers)
      .where(eq(presetPlayers.userId, userId));
    if (existingLinkForUser && existingLinkForUser.id !== presetPlayerId) {
      throw new Error(`User is already linked to player "${existingLinkForUser.name}". Unpair first.`);
    }

    // If the preset player is currently linked to a different user, clear that user's string first
    if (pp.userId && pp.userId !== userId) {
      await db.update(users)
        .set({ presetPlayerName: null })
        .where(eq(users.id, pp.userId));
    }

    // Write the FK
    const [updated] = await db.update(presetPlayers)
      .set({ userId })
      .where(eq(presetPlayers.id, presetPlayerId))
      .returning();

    // Keep preset_player_name string in sync on the new user row
    await db.update(users)
      .set({ presetPlayerName: pp.name })
      .where(eq(users.id, userId));

    return updated;
  }

  async unpairUserFromPresetPlayer(presetPlayerId: number): Promise<PresetPlayer> {
    const [pp] = await db.select().from(presetPlayers).where(eq(presetPlayers.id, presetPlayerId));
    if (!pp) throw new Error("Preset player not found");

    // Clear the string on the user row if it matches this player
    if (pp.userId) {
      await db.update(users)
        .set({ presetPlayerName: null })
        .where(eq(users.id, pp.userId));
    }

    const [updated] = await db.update(presetPlayers)
      .set({ userId: null })
      .where(eq(presetPlayers.id, presetPlayerId))
      .returning();

    return updated;
  }

  async getGroupPairings(groupId: number): Promise<{
    linkedPairs: Array<{ presetPlayer: { id: number; name: string; userId: string | null }; user: { id: string; firstName: string | null; lastName: string | null; presetPlayerName: string | null } }>;
    unlinkedUsers: Array<{ id: string; firstName: string | null; lastName: string | null; presetPlayerName: string | null }>;
    unlinkedPlayers: Array<{ id: number; name: string }>;
    brokenLegacyLinks: Array<{ userId: string; presetPlayerName: string; firstName: string | null; lastName: string | null }>;
  }> {
    // Get all group members
    const memberships = await db.select().from(groupMemberships).where(eq(groupMemberships.groupId, groupId));
    const memberUserIds = memberships.map(m => m.userId);

    // Get all group players (preset players)
    const gps = await db.select().from(groupPlayers).where(eq(groupPlayers.groupId, groupId));
    const groupPresetPlayerIds = gps.map(gp => gp.presetPlayerId);

    // Fetch user rows for members
    const memberUsers = memberUserIds.length > 0
      ? await db.select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          presetPlayerName: users.presetPlayerName,
        }).from(users).where(inArray(users.id, memberUserIds))
      : [];

    // Fetch preset player rows for group players
    const groupPPs = groupPresetPlayerIds.length > 0
      ? await db.select({ id: presetPlayers.id, name: presetPlayers.name, userId: presetPlayers.userId })
          .from(presetPlayers).where(inArray(presetPlayers.id, groupPresetPlayerIds))
      : [];

    // Build lookup maps
    const userMap = new Map(memberUsers.map(u => [u.id, u]));
    const ppByUserId = new Map(groupPPs.filter(pp => pp.userId).map(pp => [pp.userId!, pp]));

    const linkedPairs: Array<{ presetPlayer: { id: number; name: string; userId: string | null }; user: { id: string; firstName: string | null; lastName: string | null; presetPlayerName: string | null } }> = [];
    const unlinkedPlayers: Array<{ id: number; name: string }> = [];

    for (const pp of groupPPs) {
      if (pp.userId && userMap.has(pp.userId)) {
        linkedPairs.push({ presetPlayer: pp, user: userMap.get(pp.userId)! });
      } else if (pp.userId && !userMap.has(pp.userId)) {
        // Player linked to user outside this group — still show as unlinked player in this group
        unlinkedPlayers.push({ id: pp.id, name: pp.name });
      } else {
        unlinkedPlayers.push({ id: pp.id, name: pp.name });
      }
    }

    // Unlinked users: group members who have no preset_player FK globally (not just in this group).
    // A member linked to a player outside this group should not show as "unlinked".
    const globallyLinkedRows = memberUserIds.length > 0
      ? await db.select({ userId: presetPlayers.userId })
          .from(presetPlayers)
          .where(inArray(presetPlayers.userId, memberUserIds))
      : [];
    const globallyLinkedUserIds = new Set(globallyLinkedRows.map(r => r.userId).filter(Boolean) as string[]);
    const unlinkedUsers = memberUsers.filter(u => !globallyLinkedUserIds.has(u.id));

    // Broken legacy links: users with preset_player_name that doesn't match any preset player's FK
    const brokenLegacyLinks: Array<{ userId: string; presetPlayerName: string; firstName: string | null; lastName: string | null }> = [];
    for (const u of memberUsers) {
      if (!u.presetPlayerName) continue;
      // Find if there's a preset player in the DB with this name that has this user linked
      const matchingPP = groupPPs.find(pp => pp.name === u.presetPlayerName);
      const linkedPP = ppByUserId.get(u.id);
      // Broken = user claims a name via string but the FK doesn't agree
      if (u.presetPlayerName && (!linkedPP || linkedPP.name !== u.presetPlayerName)) {
        brokenLegacyLinks.push({
          userId: u.id,
          presetPlayerName: u.presetPlayerName,
          firstName: u.firstName,
          lastName: u.lastName,
        });
      }
    }

    return { linkedPairs, unlinkedUsers, unlinkedPlayers, brokenLegacyLinks };
  }

  async tryAutoLinkUserToGroupPlayer(groupId: number, userId: string): Promise<boolean> {
    // Skip if user is already linked to any preset player globally
    const [existingLink] = await db.select().from(presetPlayers).where(eq(presetPlayers.userId, userId));
    if (existingLink) return false;

    // Get the user's name
    const [userRow] = await db.select({
      firstName: users.firstName,
      lastName: users.lastName,
    }).from(users).where(eq(users.id, userId));
    if (!userRow) return false;

    const { firstName, lastName } = userRow;
    if (!firstName && !lastName) return false;

    const fullName = [firstName, lastName].filter(Boolean).join(' ').toLowerCase().trim();
    if (!fullName) return false;

    // Get unlinked preset players in this group
    const gps = await db.select().from(groupPlayers).where(eq(groupPlayers.groupId, groupId));
    if (gps.length === 0) return false;
    const ppIds = gps.map(gp => gp.presetPlayerId);

    const unlinkedPPs = await db.select({ id: presetPlayers.id, name: presetPlayers.name })
      .from(presetPlayers)
      .where(and(inArray(presetPlayers.id, ppIds), isNull(presetPlayers.userId)));

    // Find exact name matches (case-insensitive)
    const matches = unlinkedPPs.filter(pp => pp.name.toLowerCase().trim() === fullName);

    if (matches.length !== 1) return false;

    // Exactly one match — auto-link
    try {
      await this.pairUserToPresetPlayer(matches[0].id, userId);
      return true;
    } catch {
      return false;
    }
  }

  async tryAutoLinkGroupPlayerToMembers(groupId: number, presetPlayerId: number): Promise<boolean> {
    // Skip if the preset player is already linked to a user
    const [pp] = await db.select({ id: presetPlayers.id, name: presetPlayers.name, userId: presetPlayers.userId })
      .from(presetPlayers).where(eq(presetPlayers.id, presetPlayerId));
    if (!pp || pp.userId) return false;

    const playerName = pp.name.toLowerCase().trim();

    // Get all group members
    const members = await db.select({ userId: groupMemberships.userId })
      .from(groupMemberships).where(eq(groupMemberships.groupId, groupId));
    if (members.length === 0) return false;

    const memberUserIds = members.map(m => m.userId);

    // Get user records for all members, excluding those already linked to a preset player
    const memberUsers = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    }).from(users).where(inArray(users.id, memberUserIds));

    // Filter out users already linked to any preset player
    const linkedUserIds = await db.select({ userId: presetPlayers.userId })
      .from(presetPlayers).where(isNotNull(presetPlayers.userId));
    const linkedSet = new Set(linkedUserIds.map(r => r.userId).filter(Boolean));

    const matches = memberUsers.filter(u => {
      if (linkedSet.has(u.id)) return false;
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').toLowerCase().trim();
      return fullName === playerName;
    });

    if (matches.length !== 1) return false;

    try {
      await this.pairUserToPresetPlayer(presetPlayerId, matches[0].id);
      return true;
    } catch {
      return false;
    }
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
    return db.select().from(events).orderBy(events.createdAt);
  }

  // Scoped list: a trip is visible to whoever created it, or whoever is linked
  // (via presetPlayerId -> presetPlayers.userId) to a team member on it — same
  // participation model as a Match player (name, optionally linked to a real
  // account). No separate "event participant" concept; being rostered IS being
  // a participant. Was previously unscoped (every trip visible to every user) —
  // same class of bug already fixed on /api/groups/my.
  async getRyderCupEventsForUser(userId: string): Promise<RyderCupEvent[]> {
    const created = await db.select().from(events).where(eq(events.creatorId, userId));

    const linkedRows = await db.select({ eventId: ryderCupTeams.eventId })
      .from(ryderCupTeamMembers)
      .innerJoin(presetPlayers, eq(ryderCupTeamMembers.presetPlayerId, presetPlayers.id))
      .innerJoin(ryderCupTeams, eq(ryderCupTeamMembers.teamId, ryderCupTeams.id))
      .where(eq(presetPlayers.userId, userId));

    const linkedEventIds = Array.from(new Set(linkedRows.map((r) => r.eventId)));
    const linkedEvents = linkedEventIds.length > 0
      ? await db.select().from(events).where(inArray(events.id, linkedEventIds))
      : [];

    const merged = new Map<number, RyderCupEvent>();
    for (const e of [...created, ...linkedEvents]) merged.set(e.id, e);
    return Array.from(merged.values()).sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return at - bt;
    });
  }

  // Whether a given user is allowed to see a specific event: creator, or linked
  // via presetPlayerId -> presetPlayers.userId to any team member on it.
  async userCanAccessRyderCupEvent(eventId: number, userId: string): Promise<boolean> {
    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (!event) return false;
    if (event.creatorId === userId) return true;
    const [linked] = await db.select({ id: ryderCupTeamMembers.id })
      .from(ryderCupTeamMembers)
      .innerJoin(presetPlayers, eq(ryderCupTeamMembers.presetPlayerId, presetPlayers.id))
      .innerJoin(ryderCupTeams, eq(ryderCupTeamMembers.teamId, ryderCupTeams.id))
      .where(and(eq(ryderCupTeams.eventId, eventId), eq(presetPlayers.userId, userId)));
    return !!linked;
  }

  async getRyderCupEvent(id: number): Promise<RyderCupEvent | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
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
    const sideMatchContainers = await db.select().from(matches).where(eq(matches.eventId, eventId));
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
          eq(matches.eventId, updated.eventId),
          eq(matches.eventDayNumber, updated.dayNumber)
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

    const eventType = data.eventType ?? 'ryder_cup';
    
    const [event] = await db.insert(events).values({
      name: data.name,
      eventType,
      groupId: data.groupId ?? null,
      courseName: data.courseName,
      courseId,
      creatorId,
      buyInAmount: data.buyInAmount ?? 30000,
      teamWinBonus: data.teamWinBonus ?? (eventType === 'ryder_cup' ? 12500 : 0),
      matchWinBonus: data.matchWinBonus ?? 2500,
      matchTieBonus: data.matchTieBonus ?? 1250,
      dailySkinsPot: data.dailySkinsPot ?? 21250,
      closestToHolePayout: data.closestToHolePayout ?? 0,
      targetPoints: data.targetPoints ?? (eventType === 'ryder_cup' ? 65 : 0),
      useHandicaps: data.useHandicaps ?? false,
    }).returning();

    if (data.teamA && data.teamB) {
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
    await db.update(events).set({ status: "active" }).where(eq(events.id, eventId));
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
        await db.update(events)
          .set({ status: "completed", winningTeamId: team.id })
          .where(eq(events.id, day.eventId));
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
    return db.select().from(matches).where(eq(matches.eventId, eventId)).orderBy(matches.createdAt);
  }

  async getSideMatchLedgerData(eventId: number) {
    // Fetch matches and days in parallel — both are independent of each other
    const [allMatches, days] = await Promise.all([
      db.select().from(matches).where(eq(matches.eventId, eventId)).orderBy(matches.createdAt),
      db.select().from(ryderCupDays).where(eq(ryderCupDays.eventId, eventId)),
    ]);

    const matchIds = allMatches.map((m) => m.id);
    const dayIds = days.map((d) => d.id);

    // --- Phase 1: bulk-fetch all match-related data in parallel ---
    const [
      allEventMatchRows,
      allScores,
      allPairings,
    ] = await Promise.all([
      matchIds.length > 0
        ? db.select().from(eventMatches).where(inArray(eventMatches.eventId, matchIds))
        : Promise.resolve([]),
      matchIds.length > 0
        ? db.select().from(scores).where(inArray(scores.matchId, matchIds))
        : Promise.resolve([]),
      dayIds.length > 0
        ? db.select().from(ryderCupPairings).where(inArray(ryderCupPairings.dayId, dayIds))
        : Promise.resolve([]),
    ]);

    // Bulk-fetch teams and pairing sides in parallel
    const eventMatchIds = allEventMatchRows.map((em) => em.id);
    const pairingIds = allPairings.map((p) => p.id);

    const [allTeams, allPairingSides] = await Promise.all([
      eventMatchIds.length > 0
        ? db.select().from(teams).where(inArray(teams.eventMatchId, eventMatchIds))
        : Promise.resolve([]),
      pairingIds.length > 0
        ? db.select().from(ryderCupPairingSides).where(inArray(ryderCupPairingSides.pairingId, pairingIds))
        : Promise.resolve([]),
    ]);

    // Bulk-fetch team members, pairing scores, and handicap overrides in parallel
    const teamIds = allTeams.map((t) => t.id);
    const sideIds = allPairingSides.map((s) => s.id);

    // Collect all ryderCupTeamMember IDs referenced by sides
    const referencedMemberIds = Array.from(
      new Set(
        allPairingSides.flatMap((s) =>
          [s.player1Id, s.player2Id].filter((id): id is number => id !== null)
        )
      )
    );

    const [allTeamMembers, allPairingScores, allTeamMemberRows, handicapOverrideRows] = await Promise.all([
      teamIds.length > 0
        ? db.select().from(teamMembers).where(inArray(teamMembers.teamId, teamIds))
        : Promise.resolve([]),
      sideIds.length > 0
        ? db.select().from(ryderCupPairingScores).where(inArray(ryderCupPairingScores.sideId, sideIds))
        : Promise.resolve([]),
      referencedMemberIds.length > 0
        ? db.select().from(ryderCupTeamMembers).where(inArray(ryderCupTeamMembers.id, referencedMemberIds))
        : Promise.resolve([]),
      eventMatchIds.length > 0
        ? db.select().from(matchPlayerHandicaps).where(inArray(matchPlayerHandicaps.eventMatchId, eventMatchIds))
        : Promise.resolve([]),
    ]);

    // Bulk-fetch players for all team members
    const playerIds = Array.from(new Set(allTeamMembers.map((m) => m.playerId)));
    const allPlayers = playerIds.length > 0
      ? await db.select().from(players).where(inArray(players.id, playerIds))
      : [];

    // Bulk-fetch course data for all unique course IDs
    const uniqueCourseIds = Array.from(new Set(allMatches.map((m) => m.courseId).filter((id): id is number => id !== null)));
    const [allCourseHoles, allCourseTees] = await Promise.all([
      uniqueCourseIds.length > 0
        ? db.select().from(courseHoles).where(inArray(courseHoles.courseId, uniqueCourseIds)).orderBy(courseHoles.holeNumber)
        : Promise.resolve([]),
      uniqueCourseIds.length > 0
        ? db.select().from(courseTees).where(inArray(courseTees.courseId, uniqueCourseIds))
        : Promise.resolve([]),
    ]);

    // --- Phase 2: assemble in-memory data structures ---

    // Build player lookup map
    const playerMap = new Map(allPlayers.map((p) => [p.id, p]));

    // Build ryderCupTeamMember lookup map
    const rcMemberMap = new Map(allTeamMemberRows.map((m) => [m.id, m]));

    // Build team members grouped by teamId
    const membersByTeamId = new Map<number, typeof allTeamMembers>();
    for (const member of allTeamMembers) {
      if (!membersByTeamId.has(member.teamId)) membersByTeamId.set(member.teamId, []);
      membersByTeamId.get(member.teamId)!.push(member);
    }

    // Build teams grouped by eventMatchId
    const teamsByEventMatchId = new Map<number, typeof allTeams>();
    for (const team of allTeams) {
      if (!teamsByEventMatchId.has(team.eventMatchId)) teamsByEventMatchId.set(team.eventMatchId, []);
      teamsByEventMatchId.get(team.eventMatchId)!.push(team);
    }

    // Assemble allEventMatches with teams and members (mirrors getEventMatchWithTeams shape)
    const allEventMatches: any[] = allEventMatchRows.map((em) => {
      const emTeams = teamsByEventMatchId.get(em.id) ?? [];
      const teamsWithMembers = emTeams.map((team) => {
        const members = membersByTeamId.get(team.id) ?? [];
        const membersWithPlayers = members.map((member) => ({
          ...member,
          player: playerMap.get(member.playerId),
        }));
        return { ...team, members: membersWithPlayers };
      });
      return { ...em, teams: teamsWithMembers };
    });

    // Build course data map
    const courseData: Record<number, { holes: CourseHole[]; tees: CourseTee[] }> = {};
    for (const courseId of uniqueCourseIds) {
      courseData[courseId] = {
        holes: allCourseHoles.filter((h) => h.courseId === courseId),
        tees: allCourseTees.filter((t) => t.courseId === courseId),
      };
    }

    // Build pairing scores grouped by sideId
    const pairingScoresBySideId = new Map<number, typeof allPairingScores>();
    for (const ps of allPairingScores) {
      if (!pairingScoresBySideId.has(ps.sideId)) pairingScoresBySideId.set(ps.sideId, []);
      pairingScoresBySideId.get(ps.sideId)!.push(ps);
    }

    // Build pairing sides grouped by pairingId
    const sidesByPairingId = new Map<number, typeof allPairingSides>();
    for (const side of allPairingSides) {
      if (!sidesByPairingId.has(side.pairingId)) sidesByPairingId.set(side.pairingId, []);
      sidesByPairingId.get(side.pairingId)!.push(side);
    }

    // Build pairings grouped by dayId
    const pairingsByDayId = new Map<number, typeof allPairings>();
    for (const pairing of allPairings) {
      if (!pairingsByDayId.has(pairing.dayId)) pairingsByDayId.set(pairing.dayId, []);
      pairingsByDayId.get(pairing.dayId)!.push(pairing);
    }

    // Build Ryder Cup score/player-data/startOnBack9 maps from bulk-fetched data
    const ryderCupScoresByDay: Record<number, Record<string, Record<number, number>>> = {};
    const ryderCupPlayerDataByDay: Record<number, Record<string, { handicapIndex: number | null; teeId: number | null }>> = {};
    const startOnBack9ByDay: Record<number, boolean> = {};

    for (const day of days) {
      ryderCupScoresByDay[day.dayNumber] = {};
      ryderCupPlayerDataByDay[day.dayNumber] = {};
      startOnBack9ByDay[day.dayNumber] = day.startOnBack9 ?? false;

      const dayPairings = pairingsByDayId.get(day.id) ?? [];
      for (const pairing of dayPairings) {
        const sides = sidesByPairingId.get(pairing.id) ?? [];
        for (const side of sides) {
          const sideScores = pairingScoresBySideId.get(side.id) ?? [];

          let player1Name = side.player1Name;
          let player2Name = side.player2Name;

          if (side.player1Id) {
            const member = rcMemberMap.get(side.player1Id);
            if (member) player1Name = member.playerName;
          }
          if (side.player2Id) {
            const member = rcMemberMap.get(side.player2Id);
            if (member) player2Name = member.playerName;
          }

          if (player1Name) {
            if (!ryderCupScoresByDay[day.dayNumber][player1Name]) {
              ryderCupScoresByDay[day.dayNumber][player1Name] = {};
            }
            for (const score of sideScores) {
              if (score.player1Strokes !== null) {
                ryderCupScoresByDay[day.dayNumber][player1Name][score.holeNumber] = score.player1Strokes;
              }
            }
            ryderCupPlayerDataByDay[day.dayNumber][player1Name] = {
              handicapIndex: side.player1HandicapIndex,
              teeId: side.player1TeeId,
            };
          }

          if (player2Name) {
            if (!ryderCupScoresByDay[day.dayNumber][player2Name]) {
              ryderCupScoresByDay[day.dayNumber][player2Name] = {};
            }
            for (const score of sideScores) {
              if (score.player2Strokes !== null) {
                ryderCupScoresByDay[day.dayNumber][player2Name][score.holeNumber] = score.player2Strokes;
              }
            }
            ryderCupPlayerDataByDay[day.dayNumber][player2Name] = {
              handicapIndex: side.player2HandicapIndex,
              teeId: side.player2TeeId,
            };
          }
        }
      }
    }

    // Assemble handicap overrides map
    const handicapOverrides: Record<number, Record<number, number>> = {};
    for (const override of handicapOverrideRows) {
      if (!handicapOverrides[override.eventMatchId]) {
        handicapOverrides[override.eventMatchId] = {};
      }
      handicapOverrides[override.eventMatchId][override.playerId] = override.courseHandicap;
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
    const [updated] = await db.update(events)
      .set({ useHandicaps })
      .where(eq(events.id, eventId))
      .returning();
    return updated;
  }

  async updateRyderCupEventStatus(eventId: number, status: string): Promise<RyderCupEvent> {
    const [updated] = await db.update(events)
      .set({ status })
      .where(eq(events.id, eventId))
      .returning();
    return updated;
  }

  async updateRyderCupEventClosestToHolePayout(eventId: number, closestToHolePayout: number): Promise<RyderCupEvent> {
    const [updated] = await db.update(events)
      .set({ closestToHolePayout })
      .where(eq(events.id, eventId))
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
    const [updated] = await db.update(events)
      .set(payouts)
      .where(eq(events.id, eventId))
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

  // === GLOBAL PLAYER IDENTITY — Phase B dual-write (2026-07-15) ===
  // Every "add a player" path (group roster, event team, match) calls this so
  // new rows going forward get a personId immediately, instead of waiting on
  // another backfill later. See PLAYER_IDENTITY_MIGRATION_PLAN.md.
  //
  // If a real account is known (userId), reuse-or-create is safe and correct —
  // userId is a true unique identifier, not a name guess. Two different add
  // paths for the SAME real user will always resolve to the SAME people row.
  //
  // If there's no account (a guest/custom name), this deliberately creates a
  // BRAND NEW people row every time rather than searching by name. This is the
  // plan's "no automatic matching" principle: two different guests who happen
  // to share a name are never silently merged by this function. Connecting
  // them is a deliberate human action — Phase C's "save as a player" /
  // same-name nudge, or Phase D's manual merge tool — not a guess made here.
  async findOrCreatePersonForNewPlayer(name: string, userId?: string | null): Promise<number> {
    const trimmedName = (name || "Player").trim() || "Player";
    if (userId) {
      const [existing] = await db.select().from(people).where(eq(people.userId, userId));
      if (existing) return existing.id;
      // Real accounts are always "saved" — they're a full user, not a
      // one-off, so they should always be findable in the "add existing
      // person" search (Phase C, plan §3b).
      const [created] = await db.insert(people).values({ userId, primaryName: trimmedName, saved: true }).returning();
      return created.id;
    }
    // Guests default to saved=false — a one-off until someone deliberately
    // saves them (see savePerson / checkForSaveNudge below).
    const [created] = await db.insert(people).values({ primaryName: trimmedName }).returning();
    return created.id;
  }

  // Phase C: deliberate "save this player" action (plan §3c, moment 3 — the
  // manual escape hatch) or the accepted nudge (moment 2). Flips a one-off
  // guest into a real, searchable saved person. No-op if already saved.
  async savePerson(personId: number): Promise<Person> {
    const [updated] = await db.update(people)
      .set({ saved: true })
      .where(eq(people.id, personId))
      .returning();
    return updated;
  }

  // Phase C, plan §3c moment 2: "you've added this name before" nudge. Fires
  // when the same (case-insensitive) name shows up on a second, different
  // NOT-YET-SAVED people row — i.e. real signal of a repeat, not a guess.
  // Excludes the row just created/used so it doesn't nudge against itself,
  // and excludes already-saved people (already found via search, no nudge
  // needed) and merged-away rows.
  async checkForSaveNudge(name: string, excludePersonId: number): Promise<Person | null> {
    const trimmedName = (name || "").trim();
    if (!trimmedName) return null;
    const candidates = await db.select().from(people)
      .where(and(
        eq(people.saved, false),
        isNull(people.mergedIntoPersonId),
        isNull(people.userId),
        sql`lower(${people.primaryName}) = lower(${trimmedName})`,
      ));
    const other = candidates.find(p => p.id !== excludePersonId);
    return other ?? null;
  }

  // Phase C, plan §3a: the "add existing person" search. Only ever returns
  // saved=true people — one-off guests stay invisible here by design.
  async searchSavedPeople(query: string): Promise<Person[]> {
    const trimmedQuery = (query || "").trim();
    if (!trimmedQuery) return [];
    return db.select().from(people)
      .where(and(
        eq(people.saved, true),
        isNull(people.mergedIntoPersonId),
        sql`lower(${people.primaryName}) LIKE lower(${'%' + trimmedQuery + '%'})`,
      ))
      .limit(20);
  }

  // Phase C: one claim code per person (plan §4, Phase C), replacing the
  // old per-group guestClaimCode. Generating a code for someone also saves
  // them (an outstanding invite is a strong signal they're worth finding).
  async generatePersonClaimCode(personId: number): Promise<string> {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    await db.update(people)
      .set({ claimCode: code, saved: true })
      .where(eq(people.id, personId));
    return code;
  }

  // Redeeming a code links this person's `people` row to the redeemer's real
  // account — "claim once, recognized everywhere" (plan §1), since every
  // group/trip/match row already points at this same people.id.
  //
  // The common case isn't "brand new user's first identity" — most real
  // users already have their own `people` row by the time they redeem a
  // code, from being added as a player somewhere else first (e.g. a friend
  // adds "Big Foot" to a new group before realizing that's already you).
  // In that case this isn't a simple update, it's a merge: the guest row and
  // the claimer's existing row are the same person and need to become one —
  // a self-service version of Phase D's manual merge tool, triggered by
  // redeeming a code instead of an admin picking two rows by hand.
  async claimPersonByCode(claimCode: string, userId: string): Promise<Person | null> {
    const [guestPerson] = await db.select().from(people).where(eq(people.claimCode, claimCode));
    if (!guestPerson) return null;
    if (guestPerson.claimCodeClaimedAt) return null; // single-use
    if (guestPerson.userId) return null; // already linked to someone

    const [existingCanonical] = await db.select().from(people).where(eq(people.userId, userId));

    if (!existingCanonical) {
      // No existing people row for this user yet — the simple case, just
      // link the guest row directly.
      const [updated] = await db.update(people)
        .set({ userId, claimCodeClaimedAt: new Date(), saved: true })
        .where(eq(people.id, guestPerson.id))
        .returning();
      return updated;
    }

    // Merge case: repoint every context row that pointed at the guest
    // identity over to the claimer's real, existing identity, then mark the
    // guest row merged (kept for audit trail, never deleted — plan §3).
    return db.transaction(async (tx) => {
      await tx.update(groupPlayers).set({ personId: existingCanonical.id }).where(eq(groupPlayers.personId, guestPerson.id));
      await tx.update(ryderCupTeamMembers).set({ personId: existingCanonical.id }).where(eq(ryderCupTeamMembers.personId, guestPerson.id));
      await tx.update(players).set({ personId: existingCanonical.id }).where(eq(players.personId, guestPerson.id));

      await tx.update(people)
        .set({ mergedIntoPersonId: existingCanonical.id, claimCodeClaimedAt: new Date() })
        .where(eq(people.id, guestPerson.id));

      const [finalCanonical] = await tx.update(people)
        .set({ saved: true })
        .where(eq(people.id, existingCanonical.id))
        .returning();
      return finalCanonical;
    });
  }

  // Event-level teams (Phase 2 of the multi-day event wrapper): create/add/remove
  // teams and members independent of the rigid 6-per-side Ryder Cup setup flow, so
  // Buddy Trip/Tournament events can have any number of teams of any size. These
  // teams are a default/pre-fill only — bet creation still allows any subset of
  // players, so nothing here restricts match/bet participant selection.
  async getRyderCupTeamsForEvent(eventId: number): Promise<RyderCupTeam[]> {
    return db.select().from(ryderCupTeams).where(eq(ryderCupTeams.eventId, eventId));
  }

  async createRyderCupTeam(eventId: number, name: string, color?: string | null): Promise<RyderCupTeam> {
    const trimmedName = name.trim();
    const existingTeams = await db.select().from(ryderCupTeams).where(eq(ryderCupTeams.eventId, eventId));
    const duplicate = existingTeams.some((t) => t.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (duplicate) {
      throw new Error(`DUPLICATE_TEAM_NAME: A team named "${trimmedName}" already exists in this trip.`);
    }
    const [team] = await db.insert(ryderCupTeams).values({
      eventId,
      name: trimmedName,
      color: color ?? null,
    }).returning();
    return team;
  }

  async deleteRyderCupTeam(teamId: number): Promise<void> {
    await db.delete(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.teamId, teamId));
    await db.delete(ryderCupTeams).where(eq(ryderCupTeams.id, teamId));
  }

  async addRyderCupTeamMember(teamId: number, playerName: string, handicapIndex?: number | null): Promise<RyderCupTeamMember> {
    const [preset] = await db.select().from(presetPlayers).where(eq(presetPlayers.name, playerName));
    let resolvedHandicap = handicapIndex ?? null;
    if (resolvedHandicap === null) {
      const [ph] = await db.select().from(playerHandicaps).where(eq(playerHandicaps.presetPlayerName, playerName));
      resolvedHandicap = ph?.handicapIndex ?? null;
    }
    // Phase B dual-write: if this name matches an already-claimed preset
    // player, reuse/create the people row for that real account; otherwise
    // this is a new guest and gets a brand-new people row (see
    // findOrCreatePersonForNewPlayer's "no automatic matching" comment).
    const personId = await this.findOrCreatePersonForNewPlayer(playerName, preset?.userId ?? null);
    const [member] = await db.insert(ryderCupTeamMembers).values({
      teamId,
      playerName,
      presetPlayerId: preset?.id ?? null,
      handicapIndex: resolvedHandicap,
      personId,
    }).returning();
    return member;
  }

  async removeRyderCupTeamMember(memberId: number): Promise<void> {
    await db.delete(ryderCupTeamMembers).where(eq(ryderCupTeamMembers.id, memberId));
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

    await db.delete(events).where(eq(events.id, eventId));
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
  async getManualBets(eventId?: number): Promise<ManualBetWithEntries[]> {
    let bets;
    if (eventId !== undefined) {
      bets = await db.select().from(manualBets)
        .where(eq(manualBets.eventId, eventId))
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
    eventId?: number
  ): Promise<ManualBetWithEntries> {
    // Create the bet
    const [bet] = await db.insert(manualBets).values({
      description,
      creatorId: creatorId ?? null,
      eventId: eventId ?? null,
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

  async getEventPlayingGroups(eventId: number): Promise<EventPlayingGroupWithMembers[]> {
    const groups = await db.select()
      .from(eventPlayingGroups)
      .where(eq(eventPlayingGroups.eventId, eventId))
      .orderBy(eventPlayingGroups.groupNumber);

    if (groups.length === 0) return [];

    const groupIds = groups.map((g) => g.id);
    const members = await db.select()
      .from(eventPlayingGroupMembers)
      .where(inArray(eventPlayingGroupMembers.groupId, groupIds))
      .orderBy(eventPlayingGroupMembers.memberIndex);

    const membersByGroup = new Map<number, EventPlayingGroupMember[]>();
    for (const m of members) {
      if (!membersByGroup.has(m.groupId)) membersByGroup.set(m.groupId, []);
      membersByGroup.get(m.groupId)!.push(m);
    }

    return groups.map((g) => ({
      ...g,
      members: membersByGroup.get(g.id) || [],
    }));
  }

  async saveEventPlayingGroups(
    eventId: number,
    groupsData: { members: { playerName: string; teamMemberId?: number | null }[]; lockedPlayerNames: string[] }[],
  ): Promise<EventPlayingGroupWithMembers[]> {
    return db.transaction(async (tx) => {
      const existing = await tx.select({ id: eventPlayingGroups.id })
        .from(eventPlayingGroups)
        .where(eq(eventPlayingGroups.eventId, eventId));

      if (existing.length > 0) {
        const ids = existing.map((g) => g.id);
        await tx.delete(eventPlayingGroupMembers).where(inArray(eventPlayingGroupMembers.groupId, ids));
        await tx.delete(eventPlayingGroups).where(eq(eventPlayingGroups.eventId, eventId));
      }

      const result: EventPlayingGroupWithMembers[] = [];

      for (let i = 0; i < groupsData.length; i++) {
        const { members, lockedPlayerNames } = groupsData[i];
        const lockedSet = new Set(lockedPlayerNames);

        const [group] = await tx.insert(eventPlayingGroups)
          .values({ eventId, groupNumber: i + 1 })
          .returning();

        const memberValues = members.map((m, idx) => ({
          groupId: group.id,
          playerName: m.playerName,
          teamMemberId: m.teamMemberId ?? null,
          memberIndex: idx,
          isLocked: lockedSet.has(m.playerName),
        }));

        const savedMembers = memberValues.length > 0
          ? await tx.insert(eventPlayingGroupMembers).values(memberValues).returning()
          : [];

        result.push({ ...group, members: savedMembers });
      }

      return result;
    });
  }

  async deleteEventPlayingGroups(eventId: number): Promise<void> {
    await db.transaction(async (tx) => {
      const existing = await tx.select({ id: eventPlayingGroups.id })
        .from(eventPlayingGroups)
        .where(eq(eventPlayingGroups.eventId, eventId));

      if (existing.length > 0) {
        const ids = existing.map((g) => g.id);
        await tx.delete(eventPlayingGroupMembers).where(inArray(eventPlayingGroupMembers.groupId, ids));
        await tx.delete(eventPlayingGroups).where(eq(eventPlayingGroups.eventId, eventId));
      }
    });
  }

  async createApiKey(userId: string, name: string, keyHash: string): Promise<ApiKey> {
    const [key] = await db.insert(apiKeys).values({ userId, name, keyHash }).returning();
    return key;
  }

  async getApiKeys(userId: string): Promise<ApiKey[]> {
    return db.select().from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt));
  }

  async deleteApiKey(id: number, userId: string): Promise<boolean> {
    const result = await db.delete(apiKeys).where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId))).returning();
    return result.length > 0;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    return key;
  }

  async updateApiKeyLastUsed(id: number): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  private async getAccessibleMatchIds(userId: string): Promise<number[]> {
    const [roleRows, playerRows, creatorRows] = await Promise.all([
      db.select({ matchId: matchRoles.matchId }).from(matchRoles).where(eq(matchRoles.userId, userId)),
      db.select({ matchId: players.matchId }).from(players).where(eq(players.userId, userId)),
      db.select({ id: matches.id }).from(matches).where(eq(matches.creatorId, userId)),
    ]);
    const ids = new Set<number>();
    for (const r of roleRows) ids.add(r.matchId);
    for (const r of playerRows) ids.add(r.matchId);
    for (const r of creatorRows) ids.add(r.id);
    return Array.from(ids);
  }

  async getExportScores(userId: string, start?: Date, end?: Date): Promise<Array<{ date: Date; courseName: string; matchName: string | null; playerName: string; holeNumber: number; strokes: number }>> {
    const allMatchIds = await this.getAccessibleMatchIds(userId);
    if (allMatchIds.length === 0) return [];

    const conditions = [inArray(scores.matchId, allMatchIds)];
    if (start) conditions.push(gte(matches.createdAt, start));
    if (end) conditions.push(lte(matches.createdAt, end));

    const rows = await db
      .select({
        date: matches.createdAt,
        courseName: matches.courseName,
        matchName: matches.name,
        playerName: players.name,
        holeNumber: scores.holeNumber,
        strokes: scores.strokes,
      })
      .from(scores)
      .innerJoin(players, eq(scores.playerId, players.id))
      .innerJoin(matches, eq(scores.matchId, matches.id))
      .where(and(...conditions))
      .orderBy(matches.createdAt, matches.id, players.id, scores.holeNumber);

    return rows.map(r => ({
      date: r.date ?? new Date(),
      courseName: r.courseName,
      matchName: r.matchName,
      playerName: r.playerName,
      holeNumber: r.holeNumber,
      strokes: r.strokes,
    }));
  }

  async getExportBetResults(userId: string): Promise<Array<{ date: Date; courseName: string; matchName: string | null; eventMatchName: string; betType: string | null; unitAmountCents: number; teamAName: string; teamBName: string; teamANetCents: number; teamBNetCents: number; isComplete: boolean }>> {
    const allMatchIds = await this.getAccessibleMatchIds(userId);
    if (allMatchIds.length === 0) return [];

    const emRows = await db.select().from(eventMatches).where(inArray(eventMatches.eventId, allMatchIds));
    if (emRows.length === 0) return [];
    const emIds = emRows.map(em => em.id);

    const [resultRows, teamRows, matchRows] = await Promise.all([
      db.select().from(eventMatchResults).where(inArray(eventMatchResults.eventMatchId, emIds)),
      db.select().from(teams).where(inArray(teams.eventMatchId, emIds)),
      db.select({ id: matches.id, createdAt: matches.createdAt, courseName: matches.courseName, name: matches.name })
        .from(matches).where(inArray(matches.id, allMatchIds)),
    ]);

    const matchMap = new Map(matchRows.map(m => [m.id, m]));
    const emMap = new Map(emRows.map(em => [em.id, em]));

    // Build team name lookup: emId -> { 0: teamName, 1: teamName }
    const teamNameMap = new Map<number, Record<number, string>>();
    for (const t of teamRows) {
      const idx = t.name.toLowerCase().includes('b') || (teams as any).index === 1 ? undefined : undefined;
      const existing = teamNameMap.get(t.eventMatchId) ?? {};
      // Determine team index by order of insertion: first team is index 0, second is index 1
      const currentKeys = Object.keys(existing).length;
      existing[currentKeys] = t.name;
      teamNameMap.set(t.eventMatchId, existing);
    }

    // Group results by emId + betType
    type GroupKey = string;
    const grouped = new Map<GroupKey, { emId: number; betType: string | null; teamANet: number; teamBNet: number; isComplete: boolean }>();
    for (const r of resultRows) {
      const key = `${r.eventMatchId}|${r.betType ?? ''}`;
      if (!grouped.has(key)) {
        grouped.set(key, { emId: r.eventMatchId, betType: r.betType, teamANet: 0, teamBNet: 0, isComplete: r.isComplete });
      }
      const g = grouped.get(key)!;
      if (r.teamIndex === 0) g.teamANet += r.amount;
      else if (r.teamIndex === 1) g.teamBNet += r.amount;
      if (r.isComplete) g.isComplete = true;
    }

    const output: Array<{ date: Date; courseName: string; matchName: string | null; eventMatchName: string; betType: string | null; unitAmountCents: number; teamAName: string; teamBName: string; teamANetCents: number; teamBNetCents: number; isComplete: boolean }> = [];
    for (const g of grouped.values()) {
      const em = emMap.get(g.emId);
      if (!em) continue;
      const match = matchMap.get(em.eventId);
      if (!match) continue;
      const teamNames = teamNameMap.get(g.emId) ?? {};
      output.push({
        date: match.createdAt ?? new Date(),
        courseName: match.courseName,
        matchName: match.name,
        eventMatchName: em.name,
        betType: g.betType,
        unitAmountCents: em.unitAmount,
        teamAName: teamNames[0] ?? 'Team A',
        teamBName: teamNames[1] ?? 'Team B',
        teamANetCents: g.teamANet,
        teamBNetCents: g.teamBNet,
        isComplete: g.isComplete,
      });
    }
    output.sort((a, b) => a.date.getTime() - b.date.getTime());
    return output;
  }

  async getAppSetting(key: string): Promise<string | null> {
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return rows[0]?.value ?? null;
  }

  async setAppSetting(key: string, value: string): Promise<void> {
    await db.insert(appSettings).values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } });
  }

  async createScanComparison(data: {
    playerNames: string[];
    imageThumbnail?: string | null;
    geminiResult: ScanComparison["geminiResult"];
    grokResult: ScanComparison["grokResult"];
    totalHoles: number;
    matchedHoles: number;
  }): Promise<ScanComparison> {
    const [row] = await db.insert(scanComparisons).values(data).returning();
    return row;
  }

  async listScanComparisons(): Promise<ScanComparison[]> {
    return db.select().from(scanComparisons).orderBy(desc(scanComparisons.createdAt));
  }

  async getScanComparison(id: number): Promise<ScanComparison | undefined> {
    const rows = await db.select().from(scanComparisons).where(eq(scanComparisons.id, id));
    return rows[0];
  }

  async registerDevicePushToken(userId: string, token: string, platform: string): Promise<DevicePushToken> {
    const [row] = await db
      .insert(devicePushTokens)
      .values({ userId, token, platform })
      .onConflictDoUpdate({ target: devicePushTokens.token, set: { userId, platform } })
      .returning();
    return row;
  }

  async unregisterDevicePushToken(token: string, userId?: string): Promise<boolean> {
    const condition = userId
      ? and(eq(devicePushTokens.token, token), eq(devicePushTokens.userId, userId))
      : eq(devicePushTokens.token, token);
    const result = await db.delete(devicePushTokens).where(condition).returning();
    return result.length > 0;
  }

  async getDevicePushTokensForUser(userId: string): Promise<DevicePushToken[]> {
    return db.select().from(devicePushTokens).where(eq(devicePushTokens.userId, userId));
  }

  async createNotification(userId: string, title: string, body: string, route?: string | null): Promise<Notification> {
    const [row] = await db
      .insert(notifications)
      .values({ userId, title, body, route: route ?? null })
      .returning();
    return row;
  }

  async getNotificationsForUser(userId: string, limit = 50): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async markNotificationRead(id: number, userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  }
}

export const storage = new DatabaseStorage();

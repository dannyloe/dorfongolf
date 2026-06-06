import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
export * from "./models/auth";
import { users } from "./models/auth";

// === TABLE DEFINITIONS ===

export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  inviteCode: text("invite_code").unique(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const groupMemberships = pgTable("group_memberships", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const groupJoinRequests = pgTable("group_join_requests", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  userId: text("user_id").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const groupPlayers = pgTable("group_players", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(),
  presetPlayerId: integer("preset_player_id").notNull(),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slopeRating: integer("slope_rating"),
  courseRating: integer("course_rating"), // Stored as tenths (e.g., 721 = 72.1)
});

export const courseHoles = pgTable("course_holes", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  holeNumber: integer("hole_number").notNull(),
  par: integer("par").notNull(),
  handicap: integer("handicap"),
});

export const courseTees = pgTable("course_tees", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  name: text("name").notNull(), // e.g., "Blue", "White", "Gold", "Red"
  slopeRating: integer("slope_rating").notNull(), // e.g., 131
  courseRating: integer("course_rating").notNull(), // Stored as tenths (e.g., 721 = 72.1)
  yardage: integer("yardage"), // Total yardage for the tee
  color: text("color"), // Optional hex color for display
});

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  name: text("name"),
  courseName: text("course_name").notNull(),
  courseId: integer("course_id"),
  groupId: integer("group_id"),
  ryderCupEventId: integer("ryder_cup_event_id"), // Links to Ryder Cup event for side matches
  ryderCupDayNumber: integer("ryder_cup_day_number"), // Which day of the Ryder Cup event
  creatorId: text("creator_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  completed: boolean("completed").default(false),
  isHandicapped: boolean("is_handicapped").default(false),
  matchCode: text("match_code").unique(), // 4-char code for texting in scorecard photos
});

// Pending SMS bet descriptions submitted via text message — awaiting organizer review
export const pendingSmsBets = pgTable("pending_sms_bets", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  fromPhone: text("from_phone").notNull(),
  senderName: text("sender_name").notNull().default("Unknown"),
  rawText: text("raw_text").notNull(),
  parsedBets: jsonb("parsed_bets").$type<Array<{ betType: string; amountCents: number; players: string[]; description: string }>>(),
  status: text("status").notNull().default("pending"), // pending | applied | dismissed | duplicate
  duplicateOf: text("duplicate_of"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Pending scorecard scans submitted via MMS (text message)
export const pendingScorecardScans = pgTable("pending_scorecard_scans", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  fromPhone: text("from_phone").notNull(), // masked sender phone
  mediaUrl: text("media_url").notNull(), // provider media URL
  imageUrl: text("image_url"), // Permanent Object Storage URL (null until uploaded)
  correctionLogId: integer("correction_log_id"), // FK to scan_correction_logs row created at scan time
  status: text("status").notNull().default("pending"), // pending, processing, done, error
  scanResult: text("scan_result"), // JSON string of scan result
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  userId: text("user_id"), 
  name: text("name").notNull(),
  presetPlayerId: integer("preset_player_id"), // References presetPlayers.id for dynamic name updates
  handicapIndex: integer("handicap_index"), // Stored as tenths (e.g., 124 = 12.4), copied from player_handicaps on add
  teeId: integer("tee_id"), // References courseTees for handicap calculations
});

export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  playerId: integer("player_id").notNull(), 
  holeNumber: integer("hole_number").notNull(), 
  strokes: integer("strokes").notNull(),
});

export const eventMatches = pgTable("event_matches", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  name: text("name").notNull(),
  customName: text("custom_name"), // Optional user-supplied label for manual presses
  matchType: text("match_type").notNull().default("match_play"),
  unitAmount: integer("unit_amount").notNull().default(0),
  parentMatchId: integer("parent_match_id"),
  startHole: integer("start_hole").notNull().default(1),
  autoPressOriginal: boolean("auto_press_original").notNull().default(true),
  autoPressAllPresses: boolean("auto_press_all_presses").notNull().default(false),
  // Nassau-specific auto press toggles (initialized from autoPressOriginal)
  autoPressNassauFront9: boolean("auto_press_nassau_front9").notNull().default(true),
  autoPressNassauBack9: boolean("auto_press_nassau_back9").notNull().default(true),
  autoPressNassauOverall: boolean("auto_press_nassau_overall").notNull().default(true),
  useNetScoring: boolean("use_net_scoring").notNull().default(false),
  hasBeenReplicated: boolean("has_been_replicated").notNull().default(false),
  startOnBack9: boolean("start_on_back_9").notNull().default(false), // when true, play starts on hole 10 (back 9 first)
  isRoundRobinGenerated: boolean("is_round_robin_generated").notNull().default(false),
  sourceSmsBetId: integer("source_sms_bet_id"), // FK to pending_sms_bets.id for round robin SMS bets
  deathMatchBaseBet: integer("death_match_base_bet"), // in cents - the base bet for death match
  deathMatchBestBallBet: integer("death_match_best_ball_bet"), // in cents - best ball stroke play bet (defaults to base)
  deathMatchSecondBallBet: integer("death_match_second_ball_bet"), // in cents - match play on second ball (defaults to base/2)
  deathMatchFirstPressBet: integer("death_match_first_press_bet"), // in cents - first press amount (defaults to base/2, rounded to $5)
  deathMatchSubsequentPressBet: integer("death_match_subsequent_press_bet"), // in cents - subsequent press amount (defaults to base/4, rounded to $5)
  deathMatchSecondBallPressBet: integer("death_match_second_ball_press_bet"), // in cents - second ball press amount (defaults to base/4, rounded to $5)
  // 2 Ball / 3 Ball specific bet amounts (in cents) - each is a Nassau unit amount
  twoThreeBallTwoBallBet: integer("two_three_ball_two_ball_bet"),
  twoThreeBallThreeBallBet: integer("two_three_ball_three_ball_bet"),
  // 2 Ball / 3 Ball auto-press toggles - one per Nassau leg per bet (default true)
  autoPressTwoBallFront9: boolean("auto_press_two_ball_front9").notNull().default(true),
  autoPressTwoBallBack9: boolean("auto_press_two_ball_back9").notNull().default(true),
  autoPressTwoBallOverall: boolean("auto_press_two_ball_overall").notNull().default(true),
  autoPressThreeBallFront9: boolean("auto_press_three_ball_front9").notNull().default(true),
  autoPressThreeBallBack9: boolean("auto_press_three_ball_back9").notNull().default(true),
  autoPressThreeBallOverall: boolean("auto_press_three_ball_overall").notNull().default(true),
  // 1 Ball / 2nd3rd Ball specific bet amounts (in cents) - each is a Nassau unit amount
  oneTwoThreeBallOneBallBet: integer("one_two_three_ball_one_ball_bet"),
  oneTwoThreeBallTwoThirdBallBet: integer("one_two_three_ball_two_third_ball_bet"),
  // 1 Ball / 2nd3rd Ball auto-press toggles - one per Nassau leg per bet (default true)
  autoPressOneBallFront9: boolean("auto_press_one_ball_front9").notNull().default(true),
  autoPressOneBallBack9: boolean("auto_press_one_ball_back9").notNull().default(true),
  autoPressOneBallOverall: boolean("auto_press_one_ball_overall").notNull().default(true),
  autoPressTwoThirdBallFront9: boolean("auto_press_two_third_ball_front9").notNull().default(true),
  autoPressTwoThirdBallBack9: boolean("auto_press_two_third_ball_back9").notNull().default(true),
  autoPressTwoThirdBallOverall: boolean("auto_press_two_third_ball_overall").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Stored results for event matches - calculated from scores and cached for consistency
// Auto-updates when scores or handicaps change
export const eventMatchResults = pgTable("event_match_results", {
  id: serial("id").primaryKey(),
  eventMatchId: integer("event_match_id").notNull(),
  playerId: integer("player_id").notNull(),
  playerName: text("player_name").notNull(),
  amount: integer("amount").notNull(), // Amount in cents (positive = won, negative = lost)
  betType: text("bet_type"), // e.g., "Front 9", "Back 9", "Overall", "Skins", "Match Play"
  isComplete: boolean("is_complete").notNull().default(false),
  isAutoPress: boolean("is_auto_press").notNull().default(false),
  teamName: text("team_name"),
  teamIndex: integer("team_index"), // 0 or 1 for Team A or Team B
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Player handicaps - stores handicap index and default settings for preset players
export const playerHandicaps = pgTable("player_handicaps", {
  id: serial("id").primaryKey(),
  presetPlayerName: text("preset_player_name").notNull().unique(),
  handicapIndex: integer("handicap_index"), // Stored as tenths (e.g., 124 = 12.4)
  defaultTeeId: integer("default_tee_id"), // Default tee for this player
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Match-specific player handicap overrides - overrides the calculated course handicap for a specific match
export const matchPlayerHandicaps = pgTable("match_player_handicaps", {
  id: serial("id").primaryKey(),
  eventMatchId: integer("event_match_id").notNull(),
  playerId: integer("player_id").notNull(),
  courseHandicap: integer("course_handicap").notNull(), // Override course handicap for this specific match
});

// Per-course default tees for preset players
export const playerCourseDefaults = pgTable("player_course_defaults", {
  id: serial("id").primaryKey(),
  presetPlayerName: text("preset_player_name").notNull(),
  courseId: integer("course_id").notNull(),
  teeId: integer("tee_id").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  eventMatchId: integer("event_match_id").notNull(),
  name: text("name").notNull(),
});

export const teamMembers = pgTable("team_members", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  playerId: integer("player_id").notNull(),
});

// Match roles - organizers can edit scores/bets without being players, viewers have read-only access
export const matchRoles = pgTable("match_roles", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(), // 'organizer' or 'viewer'
  createdAt: timestamp("created_at").defaultNow(),
});

// Dynamic preset players - supplements the hardcoded PRESET_PLAYERS list
export const presetPlayers = pgTable("preset_players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  showInRoster: boolean("show_in_roster").notNull().default(true),
  isAutoCreated: boolean("is_auto_created").notNull().default(false),
  lastActivityAt: timestamp("last_activity_at"),
  createdAt: timestamp("created_at").defaultNow(),
  userId: text("user_id").unique().references(() => users.id, { onDelete: "set null" }), // nullable — one user per player
  phone: text("phone").unique(), // optional — admin-supplied phone for players without accounts yet
});

// Dynamic player aliases - supplements the hardcoded PLAYER_ALIASES
export const playerAliases = pgTable("player_aliases", {
  id: serial("id").primaryKey(),
  alias: text("alias").notNull(),
  canonicalName: text("canonical_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Phone verification codes for SMS verification
export const verificationCodes = pgTable("verification_codes", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// User notification preferences for SMS
export const notificationPreferences = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  matchInvitations: boolean("match_invitations").default(true),
  scoreUpdates: boolean("score_updates").default(false),
  betResults: boolean("bet_results").default(true),
  matchReminders: boolean("match_reminders").default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// SMS web opt-in consent records
export const smsOptIns = pgTable("sms_opt_ins", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull(),
  consentGiven: boolean("consent_given").notNull().default(false),
  optedInAt: timestamp("opted_in_at").defaultNow(),
  userId: text("user_id"), // nullable — linked to user account if logged in
});

// Scan correction logs — records Gemini output vs what the user actually saved
export const scanCorrectionLogs = pgTable("scan_correction_logs", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id"), // nullable — bet slip scans logged before a sub-match exists
  pendingScanId: integer("pending_scan_id"), // nullable — only set for MMS scans
  source: text("source").$type<"camera" | "mms" | "bet_slip">().notNull().default("mms"),
  courseName: text("course_name").notNull(),
  imageUrl: text("image_url"), // Permanent Object Storage URL of the scanned image
  geminiOutput: jsonb("gemini_output").$type<Array<{ playerName: string; holes: Array<{ holeNumber: number; strokes: number | null }> }>>().notNull(),
  appliedOutput: jsonb("applied_output").$type<Array<{ playerName: string; playerId: number; holes: Array<{ holeNumber: number; strokes: number }> }>>().notNull(),
  playerNames: text("player_names").array().notNull(),
  geminiRawText: text("gemini_raw_text"), // nullable — free-form notes Gemini wrote about the card
  createdAt: timestamp("created_at").defaultNow(),
});

// Scan patterns — recurring errors detected from correction logs, used to improve the Gemini prompt
export const scanPatterns = pgTable("scan_patterns", {
  id: serial("id").primaryKey(),
  patternType: text("pattern_type").notNull(), // 'hole_shift' | 'digit_swap'
  patternKey: text("pattern_key").notNull().unique(), // stable dedup key
  description: text("description").notNull(),
  promptRule: text("prompt_rule").notNull(), // injected into the Gemini prompt when not addressed
  occurrences: integer("occurrences").notNull().default(0),
  exampleLogIds: integer("example_log_ids").array().notNull().default([]),
  addressed: boolean("addressed").notNull().default(false),
  addressedAt: timestamp("addressed_at"),
  machineGenerated: boolean("machine_generated").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// App-level settings — simple key-value store for admin-controlled config
export const appSettings = pgTable("app_settings", {
  key:   text("key").primaryKey(),
  value: text("value").notNull(),
});

// Playing groups for events - organizer-defined tee groups for any event type
export const eventPlayingGroups = pgTable("event_playing_groups", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(), // References ryderCupEvents.id
  groupNumber: integer("group_number").notNull(), // 1-based index within the event
  generatedAt: timestamp("generated_at").defaultNow(),
});

export const eventPlayingGroupMembers = pgTable("event_playing_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull(), // References eventPlayingGroups.id
  playerName: text("player_name").notNull(),
  teamMemberId: integer("team_member_id"), // Optional FK to ryderCupTeamMembers.id for integrity
  memberIndex: integer("member_index").notNull().default(0), // order within group
  isLocked: boolean("is_locked").notNull().default(false), // true = part of a locked pair/group
});

// API keys for external access
export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, createdAt: true, lastUsedAt: true });
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;

// In-app messages between users
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id"), // Optional - messages can be match-specific
  senderId: text("sender_id").notNull(),
  recipientId: text("recipient_id"), // Null for group messages to all match participants
  content: text("content").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const coursesRelations = relations(courses, ({ many }) => ({
  holes: many(courseHoles),
  tees: many(courseTees),
  matches: many(matches),
}));

export const courseHolesRelations = relations(courseHoles, ({ one }) => ({
  course: one(courses, {
    fields: [courseHoles.courseId],
    references: [courses.id],
  }),
}));

export const courseTeesRelations = relations(courseTees, ({ one }) => ({
  course: one(courses, {
    fields: [courseTees.courseId],
    references: [courses.id],
  }),
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  matches: many(matches),
  memberships: many(groupMemberships),
  joinRequests: many(groupJoinRequests),
  groupPlayers: many(groupPlayers),
}));

export const groupMembershipsRelations = relations(groupMemberships, ({ one }) => ({
  group: one(groups, {
    fields: [groupMemberships.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupMemberships.userId],
    references: [users.id],
  }),
}));

export const groupJoinRequestsRelations = relations(groupJoinRequests, ({ one }) => ({
  group: one(groups, {
    fields: [groupJoinRequests.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupJoinRequests.userId],
    references: [users.id],
  }),
}));

export const groupPlayersRelations = relations(groupPlayers, ({ one }) => ({
  group: one(groups, {
    fields: [groupPlayers.groupId],
    references: [groups.id],
  }),
  presetPlayer: one(presetPlayers, {
    fields: [groupPlayers.presetPlayerId],
    references: [presetPlayers.id],
  }),
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
  creator: one(users, {
    fields: [matches.creatorId],
    references: [users.id],
  }),
  course: one(courses, {
    fields: [matches.courseId],
    references: [courses.id],
  }),
  group: one(groups, {
    fields: [matches.groupId],
    references: [groups.id],
  }),
  players: many(players),
  scores: many(scores),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  match: one(matches, {
    fields: [players.matchId],
    references: [matches.id],
  }),
  user: one(users, {
    fields: [players.userId],
    references: [users.id],
  }),
  scores: many(scores),
}));

export const scoresRelations = relations(scores, ({ one }) => ({
  match: one(matches, {
    fields: [scores.matchId],
    references: [matches.id],
  }),
  player: one(players, {
    fields: [scores.playerId],
    references: [players.id],
  }),
}));

export const eventMatchesRelations = relations(eventMatches, ({ one, many }) => ({
  event: one(matches, {
    fields: [eventMatches.eventId],
    references: [matches.id],
  }),
  teams: many(teams),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  eventMatch: one(eventMatches, {
    fields: [teams.eventMatchId],
    references: [eventMatches.id],
  }),
  members: many(teamMembers),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  player: one(players, {
    fields: [teamMembers.playerId],
    references: [players.id],
  }),
}));

export const matchRolesRelations = relations(matchRoles, ({ one }) => ({
  match: one(matches, {
    fields: [matchRoles.matchId],
    references: [matches.id],
  }),
  user: one(users, {
    fields: [matchRoles.userId],
    references: [users.id],
  }),
}));

// === BASE SCHEMAS ===

export const insertGroupSchema = createInsertSchema(groups).omit({
  id: true,
  createdAt: true,
  createdBy: true,
  inviteCode: true,
});

export const insertGroupMembershipSchema = createInsertSchema(groupMemberships).omit({
  id: true,
  createdAt: true,
});

export const insertGroupJoinRequestSchema = createInsertSchema(groupJoinRequests).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  status: true,
});

export const insertGroupPlayerSchema = createInsertSchema(groupPlayers).omit({
  id: true,
  createdAt: true,
});

export const insertCourseSchema = createInsertSchema(courses).omit({
  id: true,
});

export const insertCourseHoleSchema = createInsertSchema(courseHoles).omit({
  id: true,
});

export const insertCourseTeeSchema = createInsertSchema(courseTees).omit({
  id: true,
});

export const insertMatchSchema = createInsertSchema(matches).omit({ 
  id: true, 
  createdAt: true, 
  creatorId: true, 
  completed: true 
});

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
});

export const insertScoreSchema = createInsertSchema(scores).omit({
  id: true,
});

export const insertEventMatchSchema = createInsertSchema(eventMatches).omit({
  id: true,
  createdAt: true,
});

export const insertEventMatchResultSchema = createInsertSchema(eventMatchResults).omit({
  id: true,
  updatedAt: true,
});

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
});

export const insertPlayerHandicapSchema = createInsertSchema(playerHandicaps).omit({
  id: true,
  updatedAt: true,
});

export const insertMatchPlayerHandicapSchema = createInsertSchema(matchPlayerHandicaps).omit({
  id: true,
});

export const insertPlayerCourseDefaultSchema = createInsertSchema(playerCourseDefaults).omit({
  id: true,
  updatedAt: true,
});

export const insertPresetPlayerSchema = createInsertSchema(presetPlayers).omit({
  id: true,
  createdAt: true,
});

export const insertPlayerAliasSchema = createInsertSchema(playerAliases).omit({
  id: true,
  createdAt: true,
});

export const insertMatchRoleSchema = createInsertSchema(matchRoles).omit({
  id: true,
  createdAt: true,
});

export const insertVerificationCodeSchema = createInsertSchema(verificationCodes).omit({
  id: true,
  createdAt: true,
  verified: true,
});

export const insertNotificationPreferencesSchema = createInsertSchema(notificationPreferences).omit({
  id: true,
  updatedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
  readAt: true,
});

export const insertPendingScorecardScanSchema = createInsertSchema(pendingScorecardScans).omit({
  id: true,
  createdAt: true,
});

export const insertPendingSmsBetSchema = createInsertSchema(pendingSmsBets).omit({
  id: true,
  createdAt: true,
});

export const insertSmsOptInSchema = createInsertSchema(smsOptIns).omit({
  id: true,
  optedInAt: true,
});

export const insertScanCorrectionLogSchema = createInsertSchema(scanCorrectionLogs).omit({
  id: true,
  createdAt: true,
});

export const insertEventPlayingGroupSchema = createInsertSchema(eventPlayingGroups).omit({
  id: true,
  generatedAt: true,
});

export const insertEventPlayingGroupMemberSchema = createInsertSchema(eventPlayingGroupMembers).omit({
  id: true,
});

// === EXPLICIT API CONTRACT TYPES ===

export type Group = typeof groups.$inferSelect;
export type InsertGroup = z.infer<typeof insertGroupSchema>;

export type GroupMembership = typeof groupMemberships.$inferSelect;
export type InsertGroupMembership = z.infer<typeof insertGroupMembershipSchema>;

export type GroupJoinRequest = typeof groupJoinRequests.$inferSelect;
export type InsertGroupJoinRequest = z.infer<typeof insertGroupJoinRequestSchema>;

export type GroupPlayer = typeof groupPlayers.$inferSelect;
export type InsertGroupPlayer = z.infer<typeof insertGroupPlayerSchema>;

export type Course = typeof courses.$inferSelect;
export type InsertCourse = z.infer<typeof insertCourseSchema>;

export type CourseHole = typeof courseHoles.$inferSelect;
export type InsertCourseHole = z.infer<typeof insertCourseHoleSchema>;

export type CourseTee = typeof courseTees.$inferSelect;
export type InsertCourseTee = z.infer<typeof insertCourseTeeSchema>;

export type Match = typeof matches.$inferSelect;
export type InsertMatch = z.infer<typeof insertMatchSchema>;

export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;

export type Score = typeof scores.$inferSelect;
export type InsertScore = z.infer<typeof insertScoreSchema>;

export type EventMatch = typeof eventMatches.$inferSelect;
export type InsertEventMatch = z.infer<typeof insertEventMatchSchema>;

export type EventMatchResult = typeof eventMatchResults.$inferSelect;
export type InsertEventMatchResult = z.infer<typeof insertEventMatchResultSchema>;

export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;

export type PlayerHandicap = typeof playerHandicaps.$inferSelect;
export type InsertPlayerHandicap = z.infer<typeof insertPlayerHandicapSchema>;

export type MatchPlayerHandicap = typeof matchPlayerHandicaps.$inferSelect;
export type InsertMatchPlayerHandicap = z.infer<typeof insertMatchPlayerHandicapSchema>;

export type PlayerCourseDefault = typeof playerCourseDefaults.$inferSelect;
export type InsertPlayerCourseDefault = z.infer<typeof insertPlayerCourseDefaultSchema>;

export type PresetPlayer = typeof presetPlayers.$inferSelect;
export type InsertPresetPlayer = z.infer<typeof insertPresetPlayerSchema>;

export type PlayerAlias = typeof playerAliases.$inferSelect;
export type InsertPlayerAlias = z.infer<typeof insertPlayerAliasSchema>;

export type MatchRole = typeof matchRoles.$inferSelect;
export type InsertMatchRole = z.infer<typeof insertMatchRoleSchema>;

export type VerificationCode = typeof verificationCodes.$inferSelect;
export type InsertVerificationCode = z.infer<typeof insertVerificationCodeSchema>;

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type PendingScorecardScan = typeof pendingScorecardScans.$inferSelect;
export type InsertPendingScorecardScan = z.infer<typeof insertPendingScorecardScanSchema>;

export type ParsedSmsBet = {
  betType: string;
  amountCents: number;
  players: string[];
  description: string;
  isRoundRobin?: boolean;
  roundRobinSubtype?: "nassau" | "match_play_1_ball";
  teamAPlayers?: string[];
  teamBPlayers?: string[];
  keyedPlayers?: string[];
};
export type PendingSmsBet = typeof pendingSmsBets.$inferSelect;
export type InsertPendingSmsBet = z.infer<typeof insertPendingSmsBetSchema>;

export type SmsOptIn = typeof smsOptIns.$inferSelect;
export type InsertSmsOptIn = z.infer<typeof insertSmsOptInSchema>;

export type ScanCorrectionLog = typeof scanCorrectionLogs.$inferSelect;
export type InsertScanCorrectionLog = z.infer<typeof insertScanCorrectionLogSchema>;

export const insertScanPatternSchema = createInsertSchema(scanPatterns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type ScanPattern = typeof scanPatterns.$inferSelect;
export type InsertScanPattern = z.infer<typeof insertScanPatternSchema>;

export type EventPlayingGroup = typeof eventPlayingGroups.$inferSelect;
export type InsertEventPlayingGroup = z.infer<typeof insertEventPlayingGroupSchema>;

export type EventPlayingGroupMember = typeof eventPlayingGroupMembers.$inferSelect;
export type InsertEventPlayingGroupMember = z.infer<typeof insertEventPlayingGroupMemberSchema>;

export type EventPlayingGroupWithMembers = EventPlayingGroup & {
  members: EventPlayingGroupMember[];
};

export type CreateMatchRequest = InsertMatch;
export type UpdateMatchRequest = Partial<InsertMatch> & { completed?: boolean };

export type AddPlayerRequest = {
  name: string;
  userId?: string;
};

export type SubmitScoreRequest = {
  playerId: number;
  holeNumber: number;
  strokes: number;
};

export type CreateEventMatchRequest = {
  name: string;
  matchType: string;
  unitAmount?: number;
  autoPressOriginal?: boolean;
  autoPressAllPresses?: boolean;
  autoPressNassauFront9?: boolean;
  autoPressNassauBack9?: boolean;
  autoPressNassauOverall?: boolean;
  useNetScoring?: boolean;
  startOnBack9?: boolean;
  isRoundRobinGenerated?: boolean;
  teamA: { name: string; playerIds: number[] };
  teamB: { name: string; playerIds: number[] };
  // Optional: For 5-5-5-3 matches that support multiple teams
  teams?: { name: string; playerIds: number[] }[];
  // Death Match specific bet amounts (in cents)
  deathMatchBaseBet?: number;
  deathMatchBestBallBet?: number;
  deathMatchSecondBallBet?: number;
  deathMatchFirstPressBet?: number;
  deathMatchSubsequentPressBet?: number;
  deathMatchSecondBallPressBet?: number;
  // 2 Ball / 3 Ball specific bet amounts (in cents)
  twoThreeBallTwoBallBet?: number;
  twoThreeBallThreeBallBet?: number;
  // 2 Ball / 3 Ball auto-press toggles
  autoPressTwoBallFront9?: boolean;
  autoPressTwoBallBack9?: boolean;
  autoPressTwoBallOverall?: boolean;
  autoPressThreeBallFront9?: boolean;
  autoPressThreeBallBack9?: boolean;
  autoPressThreeBallOverall?: boolean;
  // 1 Ball / 2nd3rd Ball specific bet amounts (in cents)
  oneTwoThreeBallOneBallBet?: number;
  oneTwoThreeBallTwoThirdBallBet?: number;
  // 1 Ball / 2nd3rd Ball auto-press toggles
  autoPressOneBallFront9?: boolean;
  autoPressOneBallBack9?: boolean;
  autoPressOneBallOverall?: boolean;
  autoPressTwoThirdBallFront9?: boolean;
  autoPressTwoThirdBallBack9?: boolean;
  autoPressTwoThirdBallOverall?: boolean;
  sourceSmsBetId?: number;
};

export type GroupWithDetails = Group & {
  memberCount: number;
  playerCount: number;
  role: string;
};

export type MatchResponse = Match & {
  creator?: typeof users.$inferSelect;
  players?: Player[];
  scores?: Score[];
  eventMatches?: EventMatchResponse[];
  group?: Group;
};

export type TeamResponse = Team & {
  members: (TeamMember & { player?: Player })[];
};

export type EventMatchResponse = EventMatch & {
  teams: TeamResponse[];
};

// Ledger types for tracking bets
export type LedgerEntry = {
  matchId: number;
  matchName: string;
  playerId: number;
  playerName: string;
  amount: number; // positive = win, negative = loss, 0 = tie/push
  isComplete: boolean;
};

export type PlayerBalance = {
  playerId: number;
  playerName: string;
  totalWon: number;
  totalLost: number;
  netBalance: number;
  matchesPlayed: number;
};

// Match type constants
export const MATCH_TYPES = {
  MATCH_PLAY_1_BALL: "match_play_1_ball",
  MATCH_PLAY_2_BALL: "match_play_2_ball",
  STROKE_PLAY: "stroke_play",
  NASSAU: "nassau",
  SKINS: "skins",
  FIVE_FIVE_FIVE_THREE: "five_five_five_three",
  DEATH_MATCH: "death_match",
  TWO_THREE_BALL: "two_three_ball",
  ONE_TWO_THREE_BALL: "one_two_three_ball",
} as const;

export type MatchType = typeof MATCH_TYPES[keyof typeof MATCH_TYPES];

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  [MATCH_TYPES.MATCH_PLAY_1_BALL]: "Match Play - 1 Ball",
  [MATCH_TYPES.MATCH_PLAY_2_BALL]: "Match Play - 2 Ball",
  [MATCH_TYPES.STROKE_PLAY]: "Stroke Play",
  [MATCH_TYPES.NASSAU]: "Nassau",
  [MATCH_TYPES.SKINS]: "Skins",
  [MATCH_TYPES.FIVE_FIVE_FIVE_THREE]: "5-5-5-3",
  [MATCH_TYPES.DEATH_MATCH]: "Death Match",
  [MATCH_TYPES.TWO_THREE_BALL]: "2 Ball / 3rd Ball",
  [MATCH_TYPES.ONE_TWO_THREE_BALL]: "1 Ball / 2nd3rd Ball",
};

export const MATCH_TYPE_OPTIONS = Object.entries(MATCH_TYPE_LABELS).map(([value, label]) => ({
  value: value as MatchType,
  label,
}));

// === RYDER CUP EVENT TABLES ===

export const EVENT_TYPES = {
  RYDER_CUP: "ryder_cup",
  BUDDY_TRIP: "buddy_trip",
  TOURNAMENT: "tournament",
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  [EVENT_TYPES.RYDER_CUP]: "Ryder Cup",
  [EVENT_TYPES.BUDDY_TRIP]: "Buddy Trip",
  [EVENT_TYPES.TOURNAMENT]: "Tournament",
};

export const ryderCupEvents = pgTable("ryder_cup_events", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  eventType: text("event_type").notNull().default("ryder_cup"),
  groupId: integer("group_id"),
  courseId: integer("course_id"),
  courseName: text("course_name").notNull(),
  creatorId: text("creator_id").notNull(),
  buyInAmount: integer("buy_in_amount").notNull().default(30000), // in cents ($300)
  teamWinBonus: integer("team_win_bonus").notNull().default(12500), // in cents ($125)
  matchWinBonus: integer("match_win_bonus").notNull().default(2500), // in cents ($25)
  matchTieBonus: integer("match_tie_bonus").notNull().default(1250), // in cents ($12.50)
  dailySkinsPot: integer("daily_skins_pot").notNull().default(21250), // in cents ($212.50)
  closestToHolePayout: integer("closest_to_hole_payout").notNull().default(0), // in cents, per winner
  includeBuyInInLedger: boolean("include_buy_in_in_ledger").notNull().default(true), // true = include in totals, false = show separately
  targetPoints: integer("target_points").notNull().default(65), // 6.5 * 10 for precision
  useHandicaps: boolean("use_handicaps").notNull().default(false),
  status: text("status").notNull().default("setup"), // setup, active, completed
  winningTeamId: integer("winning_team_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ryderCupTeams = pgTable("ryder_cup_teams", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  name: text("name").notNull(),
  color: text("color"), // hex color for UI
  totalPoints: integer("total_points").notNull().default(0), // stored as tenths (65 = 6.5)
});

export const ryderCupTeamMembers = pgTable("ryder_cup_team_members", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  playerName: text("player_name").notNull(),
  presetPlayerId: integer("preset_player_id"), // References presetPlayers.id for dynamic name lookups
  handicapIndex: integer("handicap_index"), // stored as tenths
  courseHandicap: integer("course_handicap"), // calculated from index + course
});

export const ryderCupDays = pgTable("ryder_cup_days", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  dayNumber: integer("day_number").notNull(), // 1-4
  date: timestamp("date"),
  teeTimes: text("tee_times").array(), // available tee times for the day, e.g. ["8:00 AM", "8:12 AM", "8:24 AM"]
  courseId: integer("course_id"), // optional - can play different course each day
  courseName: text("course_name"), // display name for the course
  skinsCarryover: integer("skins_carryover").notNull().default(0), // carried from previous day
  skinsDistributed: boolean("skins_distributed").notNull().default(false),
  status: text("status").notNull().default("pending"), // pending, active, completed
  startOnBack9: boolean("start_on_back_9").notNull().default(false), // when true, play starts on hole 10 (back 9 first)
});

export const ryderCupPairings = pgTable("ryder_cup_pairings", {
  id: serial("id").primaryKey(),
  dayId: integer("day_id").notNull(),
  matchNumber: integer("match_number").notNull(), // 1-3 for core matches
  teeTime: text("tee_time"), // assigned tee time, e.g. "8:00 AM"
  isPrimary: boolean("is_primary").notNull().default(true), // true = counts toward cup, false = side match
  matchFormat: text("match_format").notNull().default("match_play_1_ball"),
  useNetScoring: boolean("use_net_scoring").notNull().default(false),
  pointValue: integer("point_value").notNull().default(10), // 10 = 1.0 point, stored as tenths
  purseAmount: integer("purse_amount"), // optional separate purse for side matches
  status: text("status").notNull().default("pending"), // pending, active, completed
});

export const ryderCupPairingSides = pgTable("ryder_cup_pairing_sides", {
  id: serial("id").primaryKey(),
  pairingId: integer("pairing_id").notNull(),
  teamId: integer("team_id").notNull(), // which ryder cup team this side belongs to
  player1Name: text("player1_name").notNull(),
  player2Name: text("player2_name"),
  // Player IDs for name lookups (references ryderCupTeamMembers)
  player1Id: integer("player1_id"), // References ryderCupTeamMembers.id for dynamic name updates
  player2Id: integer("player2_id"), // References ryderCupTeamMembers.id for dynamic name updates
  // Player 1 handicap/tee
  player1HandicapIndex: integer("player1_handicap_index"), // Stored as tenths (e.g., 124 = 12.4)
  player1TeeId: integer("player1_tee_id"), // References courseTees
  // Player 2 handicap/tee (for 2-player formats like fourball/foursomes)
  player2HandicapIndex: integer("player2_handicap_index"),
  player2TeeId: integer("player2_tee_id"),
});

// Hole-by-hole scores for Ryder Cup pairings
export const ryderCupPairingScores = pgTable("ryder_cup_pairing_scores", {
  id: serial("id").primaryKey(),
  sideId: integer("side_id").notNull(), // References ryderCupPairingSides
  holeNumber: integer("hole_number").notNull(),
  player1Strokes: integer("player1_strokes"),
  player2Strokes: integer("player2_strokes"),
});

export const ryderCupPairingResults = pgTable("ryder_cup_pairing_results", {
  id: serial("id").primaryKey(),
  pairingId: integer("pairing_id").notNull(),
  winningSideId: integer("winning_side_id"), // null = tie/halved
  winningMargin: text("winning_margin"), // e.g., "2&1", "3&2", or null for tie
  pointsAwarded: integer("points_awarded").notNull().default(0), // tenths: 10 = 1 point, 5 = 0.5 for tie
  recordedAt: timestamp("recorded_at").defaultNow(),
});

export const ryderCupSkins = pgTable("ryder_cup_skins", {
  id: serial("id").primaryKey(),
  dayId: integer("day_id").notNull(),
  holeNumber: integer("hole_number").notNull(),
  winnerName: text("winner_name"), // null if no winner (skin carries)
  winnerPresetPlayerId: integer("winner_preset_player_id"), // References presetPlayers.id for dynamic name updates
  skinValue: integer("skin_value").notNull().default(1), // base value, multiplied by carryover
  useNetScoring: boolean("use_net_scoring").notNull().default(false),
});

// Ryder Cup event transactions (ledger entries for expenses)
export const ryderCupTransactions = pgTable("ryder_cup_transactions", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(), // References ryderCupEvents
  payerName: text("payer_name").notNull(), // Player who paid
  payerPresetPlayerId: integer("payer_preset_player_id"), // References presetPlayers.id for dynamic name updates
  description: text("description").notNull(),
  amount: integer("amount").notNull(), // Amount in cents
  createdAt: timestamp("created_at").defaultNow(),
});

// Transaction splits - who owes what portion of the transaction
export const ryderCupTransactionSplits = pgTable("ryder_cup_transaction_splits", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull(), // References ryderCupTransactions
  playerName: text("player_name").notNull(), // Player who owes
  presetPlayerId: integer("preset_player_id"), // References presetPlayers.id for dynamic name updates
  amount: integer("amount").notNull(), // Amount owed in cents
});

// Closest to Hole winners for each par 3 on each day
export const ryderCupClosestToHole = pgTable("ryder_cup_closest_to_hole", {
  id: serial("id").primaryKey(),
  dayId: integer("day_id").notNull(), // References ryderCupDays
  holeNumber: integer("hole_number").notNull(), // Par 3 hole number
  winnerName: text("winner_name"), // Player name who won CTH (null if no winner set)
  winnerPresetPlayerId: integer("winner_preset_player_id"), // References presetPlayers.id for dynamic name updates
});

// === MANUAL BETS ===
// For recording bet results that weren't tracked automatically

export const manualBets = pgTable("manual_bets", {
  id: serial("id").primaryKey(),
  description: text("description").notNull(), // e.g. "Nassau side bet", "Putting contest"
  createdAt: timestamp("created_at").defaultNow(),
  creatorId: integer("creator_id"), // References users.id (optional)
  ryderCupEventId: integer("ryder_cup_event_id"), // References ryderCupEvents.id (optional - for event-specific bets)
});

export const manualBetEntries = pgTable("manual_bet_entries", {
  id: serial("id").primaryKey(),
  betId: integer("bet_id").notNull(), // References manualBets.id
  playerName: text("player_name").notNull(),
  presetPlayerId: integer("preset_player_id"), // References presetPlayers.id for dynamic name updates
  amount: integer("amount").notNull(), // Amount in cents (positive = won, negative = lost)
});

// Manual bet relations
export const manualBetsRelations = relations(manualBets, ({ one, many }) => ({
  creator: one(users, {
    fields: [manualBets.creatorId],
    references: [users.id],
  }),
  entries: many(manualBetEntries),
}));

export const manualBetEntriesRelations = relations(manualBetEntries, ({ one }) => ({
  bet: one(manualBets, {
    fields: [manualBetEntries.betId],
    references: [manualBets.id],
  }),
}));

// === SETTLEMENTS ===
// For tracking payment plans to settle up ledger balances

export const settlements = pgTable("settlements", {
  id: serial("id").primaryKey(),
  name: text("name"), // Optional name for the settlement period
  status: text("status").notNull().default("active"), // active, archived, completed
  eventId: integer("event_id"), // References ryderCupEvents.id for event-specific settlements
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"), // When all payments are complete
  creatorId: text("creator_id"), // User who initiated
});

export const settlementPayments = pgTable("settlement_payments", {
  id: serial("id").primaryKey(),
  settlementId: integer("settlement_id").notNull(), // References settlements.id
  fromPlayerName: text("from_player_name").notNull(), // Player who owes money
  fromPresetPlayerId: integer("from_preset_player_id"), // References presetPlayers.id
  toPlayerName: text("to_player_name").notNull(), // Player who is owed money
  toPresetPlayerId: integer("to_preset_player_id"), // References presetPlayers.id
  amount: integer("amount").notNull(), // Amount in cents
  completed: boolean("completed").notNull().default(false), // Has this payment been made?
  completedAt: timestamp("completed_at"), // When payment was marked complete
});

// Settlement relations
export const settlementsRelations = relations(settlements, ({ many }) => ({
  payments: many(settlementPayments),
}));

export const settlementPaymentsRelations = relations(settlementPayments, ({ one }) => ({
  settlement: one(settlements, {
    fields: [settlementPayments.settlementId],
    references: [settlements.id],
  }),
}));

// === RYDER CUP RELATIONS ===

export const ryderCupEventsRelations = relations(ryderCupEvents, ({ one, many }) => ({
  course: one(courses, {
    fields: [ryderCupEvents.courseId],
    references: [courses.id],
  }),
  creator: one(users, {
    fields: [ryderCupEvents.creatorId],
    references: [users.id],
  }),
  teams: many(ryderCupTeams),
  days: many(ryderCupDays),
}));

export const ryderCupTeamsRelations = relations(ryderCupTeams, ({ one, many }) => ({
  event: one(ryderCupEvents, {
    fields: [ryderCupTeams.eventId],
    references: [ryderCupEvents.id],
  }),
  members: many(ryderCupTeamMembers),
  pairingSides: many(ryderCupPairingSides),
}));

export const ryderCupTeamMembersRelations = relations(ryderCupTeamMembers, ({ one }) => ({
  team: one(ryderCupTeams, {
    fields: [ryderCupTeamMembers.teamId],
    references: [ryderCupTeams.id],
  }),
}));

export const ryderCupDaysRelations = relations(ryderCupDays, ({ one, many }) => ({
  event: one(ryderCupEvents, {
    fields: [ryderCupDays.eventId],
    references: [ryderCupEvents.id],
  }),
  pairings: many(ryderCupPairings),
  skins: many(ryderCupSkins),
}));

export const ryderCupPairingsRelations = relations(ryderCupPairings, ({ one, many }) => ({
  day: one(ryderCupDays, {
    fields: [ryderCupPairings.dayId],
    references: [ryderCupDays.id],
  }),
  sides: many(ryderCupPairingSides),
  result: one(ryderCupPairingResults, {
    fields: [ryderCupPairings.id],
    references: [ryderCupPairingResults.pairingId],
  }),
}));

export const ryderCupPairingSidesRelations = relations(ryderCupPairingSides, ({ one, many }) => ({
  pairing: one(ryderCupPairings, {
    fields: [ryderCupPairingSides.pairingId],
    references: [ryderCupPairings.id],
  }),
  team: one(ryderCupTeams, {
    fields: [ryderCupPairingSides.teamId],
    references: [ryderCupTeams.id],
  }),
  player1: one(ryderCupTeamMembers, {
    fields: [ryderCupPairingSides.player1Id],
    references: [ryderCupTeamMembers.id],
    relationName: "player1",
  }),
  player2: one(ryderCupTeamMembers, {
    fields: [ryderCupPairingSides.player2Id],
    references: [ryderCupTeamMembers.id],
    relationName: "player2",
  }),
  scores: many(ryderCupPairingScores),
}));

export const ryderCupPairingScoresRelations = relations(ryderCupPairingScores, ({ one }) => ({
  side: one(ryderCupPairingSides, {
    fields: [ryderCupPairingScores.sideId],
    references: [ryderCupPairingSides.id],
  }),
}));

export const ryderCupPairingResultsRelations = relations(ryderCupPairingResults, ({ one }) => ({
  pairing: one(ryderCupPairings, {
    fields: [ryderCupPairingResults.pairingId],
    references: [ryderCupPairings.id],
  }),
  winningSide: one(ryderCupPairingSides, {
    fields: [ryderCupPairingResults.winningSideId],
    references: [ryderCupPairingSides.id],
  }),
}));

export const ryderCupSkinsRelations = relations(ryderCupSkins, ({ one }) => ({
  day: one(ryderCupDays, {
    fields: [ryderCupSkins.dayId],
    references: [ryderCupDays.id],
  }),
}));

export const ryderCupTransactionsRelations = relations(ryderCupTransactions, ({ one, many }) => ({
  event: one(ryderCupEvents, {
    fields: [ryderCupTransactions.eventId],
    references: [ryderCupEvents.id],
  }),
  splits: many(ryderCupTransactionSplits),
}));

export const ryderCupTransactionSplitsRelations = relations(ryderCupTransactionSplits, ({ one }) => ({
  transaction: one(ryderCupTransactions, {
    fields: [ryderCupTransactionSplits.transactionId],
    references: [ryderCupTransactions.id],
  }),
}));

export const ryderCupClosestToHoleRelations = relations(ryderCupClosestToHole, ({ one }) => ({
  day: one(ryderCupDays, {
    fields: [ryderCupClosestToHole.dayId],
    references: [ryderCupDays.id],
  }),
}));

// === RYDER CUP SCHEMAS ===

export const insertRyderCupEventSchema = createInsertSchema(ryderCupEvents).omit({
  id: true,
  createdAt: true,
  creatorId: true,
  winningTeamId: true,
  status: true,
});

export const insertRyderCupTeamSchema = createInsertSchema(ryderCupTeams).omit({
  id: true,
  totalPoints: true,
});

export const insertRyderCupTeamMemberSchema = createInsertSchema(ryderCupTeamMembers).omit({
  id: true,
});

export const insertRyderCupDaySchema = createInsertSchema(ryderCupDays).omit({
  id: true,
  skinsCarryover: true,
  skinsDistributed: true,
  status: true,
});

export const insertRyderCupPairingSchema = createInsertSchema(ryderCupPairings).omit({
  id: true,
  status: true,
});

export const insertRyderCupPairingSideSchema = createInsertSchema(ryderCupPairingSides).omit({
  id: true,
});

export const insertRyderCupPairingScoreSchema = createInsertSchema(ryderCupPairingScores).omit({
  id: true,
});

export const insertRyderCupPairingResultSchema = createInsertSchema(ryderCupPairingResults).omit({
  id: true,
  recordedAt: true,
});

export const insertRyderCupSkinSchema = createInsertSchema(ryderCupSkins).omit({
  id: true,
});

export const insertRyderCupTransactionSchema = createInsertSchema(ryderCupTransactions).omit({
  id: true,
  createdAt: true,
});

export const insertRyderCupTransactionSplitSchema = createInsertSchema(ryderCupTransactionSplits).omit({
  id: true,
});

export const insertRyderCupClosestToHoleSchema = createInsertSchema(ryderCupClosestToHole).omit({
  id: true,
});

// === RYDER CUP TYPES ===

export type RyderCupEvent = typeof ryderCupEvents.$inferSelect;
export type InsertRyderCupEvent = z.infer<typeof insertRyderCupEventSchema>;

export type RyderCupTeam = typeof ryderCupTeams.$inferSelect;
export type InsertRyderCupTeam = z.infer<typeof insertRyderCupTeamSchema>;

export type RyderCupTeamMember = typeof ryderCupTeamMembers.$inferSelect;
export type InsertRyderCupTeamMember = z.infer<typeof insertRyderCupTeamMemberSchema>;

export type RyderCupDay = typeof ryderCupDays.$inferSelect;
export type InsertRyderCupDay = z.infer<typeof insertRyderCupDaySchema>;

export type RyderCupPairing = typeof ryderCupPairings.$inferSelect;
export type InsertRyderCupPairing = z.infer<typeof insertRyderCupPairingSchema>;

export type RyderCupPairingSide = typeof ryderCupPairingSides.$inferSelect;
export type InsertRyderCupPairingSide = z.infer<typeof insertRyderCupPairingSideSchema>;

export type RyderCupPairingScore = typeof ryderCupPairingScores.$inferSelect;
export type InsertRyderCupPairingScore = z.infer<typeof insertRyderCupPairingScoreSchema>;

export type RyderCupPairingResult = typeof ryderCupPairingResults.$inferSelect;
export type InsertRyderCupPairingResult = z.infer<typeof insertRyderCupPairingResultSchema>;

export type RyderCupSkin = typeof ryderCupSkins.$inferSelect;
export type InsertRyderCupSkin = z.infer<typeof insertRyderCupSkinSchema>;

export type RyderCupTransaction = typeof ryderCupTransactions.$inferSelect;
export type InsertRyderCupTransaction = z.infer<typeof insertRyderCupTransactionSchema>;

export type RyderCupTransactionSplit = typeof ryderCupTransactionSplits.$inferSelect;
export type InsertRyderCupTransactionSplit = z.infer<typeof insertRyderCupTransactionSplitSchema>;

export type RyderCupClosestToHole = typeof ryderCupClosestToHole.$inferSelect;
export type InsertRyderCupClosestToHole = z.infer<typeof insertRyderCupClosestToHoleSchema>;

// Manual bet insert schemas
export const insertManualBetSchema = createInsertSchema(manualBets).omit({
  id: true,
  createdAt: true,
});

export const insertManualBetEntrySchema = createInsertSchema(manualBetEntries).omit({
  id: true,
});

export type ManualBet = typeof manualBets.$inferSelect;
export type InsertManualBet = z.infer<typeof insertManualBetSchema>;

export type ManualBetEntry = typeof manualBetEntries.$inferSelect;
export type InsertManualBetEntry = z.infer<typeof insertManualBetEntrySchema>;

// Manual bet with entries type
export type ManualBetWithEntries = ManualBet & {
  entries: ManualBetEntry[];
};

// Settlement insert schemas
export const insertSettlementSchema = createInsertSchema(settlements).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertSettlementPaymentSchema = createInsertSchema(settlementPayments).omit({
  id: true,
  completed: true,
  completedAt: true,
});

export type Settlement = typeof settlements.$inferSelect;
export type InsertSettlement = z.infer<typeof insertSettlementSchema>;

export type SettlementPayment = typeof settlementPayments.$inferSelect;
export type InsertSettlementPayment = z.infer<typeof insertSettlementPaymentSchema>;

// Settlement with payments type
export type SettlementWithPayments = Settlement & {
  payments: SettlementPayment[];
};

// === RYDER CUP API TYPES ===

export type CreateRyderCupEventRequest = {
  name: string;
  eventType?: EventType;
  groupId?: number;
  courseName: string;
  courseId?: number;
  buyInAmount?: number;
  teamWinBonus?: number;
  matchWinBonus?: number;
  matchTieBonus?: number;
  dailySkinsPot?: number;
  closestToHolePayout?: number;
  targetPoints?: number;
  useHandicaps?: boolean;
  numberOfDays?: number;
  dayConfigs?: {
    dayNumber: number;
    date?: string;
    teeTimes?: string[];
    courseId?: number;
    courseName?: string;
  }[];
  players?: { playerName: string; handicapIndex?: number }[];
  teamA?: {
    name: string;
    color?: string;
    members: { playerName: string; handicapIndex?: number }[];
  };
  teamB?: {
    name: string;
    color?: string;
    members: { playerName: string; handicapIndex?: number }[];
  };
};

export type RyderCupPairingSideWithScores = RyderCupPairingSide & {
  scores: RyderCupPairingScore[];
};

export type RyderCupEventResponse = RyderCupEvent & {
  teams: (RyderCupTeam & { members: RyderCupTeamMember[] })[];
  days: (RyderCupDay & { 
    pairings: (RyderCupPairing & { 
      sides: RyderCupPairingSideWithScores[];
      result?: RyderCupPairingResult;
    })[];
  })[];
};

export type RyderCupStandings = {
  teamA: {
    id: number;
    name: string;
    points: number;
    matchesWon: number;
    matchesTied: number;
    matchesLost: number;
  };
  teamB: {
    id: number;
    name: string;
    points: number;
    matchesWon: number;
    matchesTied: number;
    matchesLost: number;
  };
  targetPoints: number;
  isComplete: boolean;
  winnerId: number | null;
};

export type AddSideMatchRequest = {
  dayId: number;
  matchFormat: string;
  useNetScoring?: boolean;
  purseAmount?: number;
  sideA: { playerNames: string[] };
  sideB: { playerNames: string[] };
};

export type RecordPairingResultRequest = {
  winningSideId?: number; // null for tie
  winningMargin?: string;
};

// UI-only wizard types (not stored in DB)
export const WIZARD_TYPES = {
  ROUND_ROBIN_2_MAN: "round_robin_2_man",
  ROUND_ROBIN_NASSAU: "round_robin_nassau",
} as const;

export type WizardType = typeof WIZARD_TYPES[keyof typeof WIZARD_TYPES];

export const WIZARD_TYPE_LABELS: Record<WizardType, string> = {
  [WIZARD_TYPES.ROUND_ROBIN_2_MAN]: "Round Robin - Match Play 1 Ball (2 man teams)",
  [WIZARD_TYPES.ROUND_ROBIN_NASSAU]: "Round Robin - Nassau (2 man teams)",
};

export const ALL_MATCH_OPTIONS = [
  { value: MATCH_TYPES.NASSAU as MatchType, label: MATCH_TYPE_LABELS[MATCH_TYPES.NASSAU] },
  { value: MATCH_TYPES.MATCH_PLAY_1_BALL as MatchType, label: MATCH_TYPE_LABELS[MATCH_TYPES.MATCH_PLAY_1_BALL] },
  { value: MATCH_TYPES.SKINS as MatchType, label: MATCH_TYPE_LABELS[MATCH_TYPES.SKINS] },
  { value: MATCH_TYPES.MATCH_PLAY_2_BALL as MatchType, label: MATCH_TYPE_LABELS[MATCH_TYPES.MATCH_PLAY_2_BALL] },
  { value: MATCH_TYPES.STROKE_PLAY as MatchType, label: MATCH_TYPE_LABELS[MATCH_TYPES.STROKE_PLAY] },
  { value: MATCH_TYPES.FIVE_FIVE_FIVE_THREE as MatchType, label: MATCH_TYPE_LABELS[MATCH_TYPES.FIVE_FIVE_FIVE_THREE] },
  { value: MATCH_TYPES.DEATH_MATCH as MatchType, label: MATCH_TYPE_LABELS[MATCH_TYPES.DEATH_MATCH] },
  { value: MATCH_TYPES.TWO_THREE_BALL as MatchType, label: MATCH_TYPE_LABELS[MATCH_TYPES.TWO_THREE_BALL] },
  { value: MATCH_TYPES.ONE_TWO_THREE_BALL as MatchType, label: MATCH_TYPE_LABELS[MATCH_TYPES.ONE_TWO_THREE_BALL] },
];

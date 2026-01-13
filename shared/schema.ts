import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
export * from "./models/auth";
import { users } from "./models/auth";

// === TABLE DEFINITIONS ===

export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
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
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  userId: text("user_id"), 
  name: text("name").notNull(),
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
  createdAt: timestamp("created_at").defaultNow(),
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

// Dynamic preset players - supplements the hardcoded PRESET_PLAYERS list
export const presetPlayers = pgTable("preset_players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  showInRoster: boolean("show_in_roster").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Dynamic player aliases - supplements the hardcoded PLAYER_ALIASES
export const playerAliases = pgTable("player_aliases", {
  id: serial("id").primaryKey(),
  alias: text("alias").notNull(),
  canonicalName: text("canonical_name").notNull(),
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

// === BASE SCHEMAS ===

export const insertGroupSchema = createInsertSchema(groups).omit({
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

// === EXPLICIT API CONTRACT TYPES ===

export type Group = typeof groups.$inferSelect;
export type InsertGroup = z.infer<typeof insertGroupSchema>;

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
  teamA: { name: string; playerIds: number[] };
  teamB: { name: string; playerIds: number[] };
  // Optional: For 5-5-5-3 matches that support multiple teams
  teams?: { name: string; playerIds: number[] }[];
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
} as const;

export type MatchType = typeof MATCH_TYPES[keyof typeof MATCH_TYPES];

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  [MATCH_TYPES.MATCH_PLAY_1_BALL]: "Match Play - 1 Ball",
  [MATCH_TYPES.MATCH_PLAY_2_BALL]: "Match Play - 2 Ball",
  [MATCH_TYPES.STROKE_PLAY]: "Stroke Play",
  [MATCH_TYPES.NASSAU]: "Nassau",
  [MATCH_TYPES.SKINS]: "Skins",
  [MATCH_TYPES.FIVE_FIVE_FIVE_THREE]: "5-5-5-3",
};

export const MATCH_TYPE_OPTIONS = Object.entries(MATCH_TYPE_LABELS).map(([value, label]) => ({
  value: value as MatchType,
  label,
}));

// === RYDER CUP EVENT TABLES ===

export const ryderCupEvents = pgTable("ryder_cup_events", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  courseId: integer("course_id"),
  courseName: text("course_name").notNull(),
  creatorId: text("creator_id").notNull(),
  buyInAmount: integer("buy_in_amount").notNull().default(30000), // in cents ($300)
  teamWinBonus: integer("team_win_bonus").notNull().default(12500), // in cents ($125)
  matchWinBonus: integer("match_win_bonus").notNull().default(2500), // in cents ($25)
  matchTieBonus: integer("match_tie_bonus").notNull().default(1250), // in cents ($12.50)
  dailySkinsPot: integer("daily_skins_pot").notNull().default(21250), // in cents ($212.50)
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
  handicapIndex: integer("handicap_index"), // stored as tenths
  courseHandicap: integer("course_handicap"), // calculated from index + course
});

export const ryderCupDays = pgTable("ryder_cup_days", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  dayNumber: integer("day_number").notNull(), // 1-4
  date: timestamp("date"),
  courseId: integer("course_id"), // optional - can play different course each day
  courseName: text("course_name"), // display name for the course
  skinsCarryover: integer("skins_carryover").notNull().default(0), // carried from previous day
  skinsDistributed: boolean("skins_distributed").notNull().default(false),
  status: text("status").notNull().default("pending"), // pending, active, completed
});

export const ryderCupPairings = pgTable("ryder_cup_pairings", {
  id: serial("id").primaryKey(),
  dayId: integer("day_id").notNull(),
  matchNumber: integer("match_number").notNull(), // 1-3 for core matches
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
  skinValue: integer("skin_value").notNull().default(1), // base value, multiplied by carryover
  useNetScoring: boolean("use_net_scoring").notNull().default(false),
});

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

export const ryderCupPairingSidesRelations = relations(ryderCupPairingSides, ({ one }) => ({
  pairing: one(ryderCupPairings, {
    fields: [ryderCupPairingSides.pairingId],
    references: [ryderCupPairings.id],
  }),
  team: one(ryderCupTeams, {
    fields: [ryderCupPairingSides.teamId],
    references: [ryderCupTeams.id],
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

export const insertRyderCupPairingResultSchema = createInsertSchema(ryderCupPairingResults).omit({
  id: true,
  recordedAt: true,
});

export const insertRyderCupSkinSchema = createInsertSchema(ryderCupSkins).omit({
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

export type RyderCupPairingResult = typeof ryderCupPairingResults.$inferSelect;
export type InsertRyderCupPairingResult = z.infer<typeof insertRyderCupPairingResultSchema>;

export type RyderCupSkin = typeof ryderCupSkins.$inferSelect;
export type InsertRyderCupSkin = z.infer<typeof insertRyderCupSkinSchema>;

// === RYDER CUP API TYPES ===

export type CreateRyderCupEventRequest = {
  name: string;
  courseName: string; // default course name
  courseId?: number; // default course id
  buyInAmount?: number;
  teamWinBonus?: number;
  matchWinBonus?: number;
  matchTieBonus?: number;
  dailySkinsPot?: number;
  targetPoints?: number;
  useHandicaps?: boolean;
  numberOfDays?: number; // defaults to 4
  dayConfigs?: { // optional per-day course selection
    dayNumber: number;
    courseId?: number;
    courseName?: string;
  }[];
  teamA: {
    name: string;
    color?: string;
    members: { playerName: string; handicapIndex?: number }[];
  };
  teamB: {
    name: string;
    color?: string;
    members: { playerName: string; handicapIndex?: number }[];
  };
};

export type RyderCupEventResponse = RyderCupEvent & {
  teams: (RyderCupTeam & { members: RyderCupTeamMember[] })[];
  days: (RyderCupDay & { 
    pairings: (RyderCupPairing & { 
      sides: RyderCupPairingSide[];
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
  ...MATCH_TYPE_OPTIONS,
  { value: WIZARD_TYPES.ROUND_ROBIN_2_MAN, label: WIZARD_TYPE_LABELS[WIZARD_TYPES.ROUND_ROBIN_2_MAN], isWizard: true },
  { value: WIZARD_TYPES.ROUND_ROBIN_NASSAU, label: WIZARD_TYPE_LABELS[WIZARD_TYPES.ROUND_ROBIN_NASSAU], isWizard: true },
];

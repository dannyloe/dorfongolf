import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
export * from "./models/auth";
import { users } from "./models/auth";

// === TABLE DEFINITIONS ===

export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  courseName: text("course_name").notNull(),
  creatorId: text("creator_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  completed: boolean("completed").default(false),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  userId: text("user_id"), 
  name: text("name").notNull(), 
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
  createdAt: timestamp("created_at").defaultNow(),
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

// === RELATIONS ===

export const matchesRelations = relations(matches, ({ one, many }) => ({
  creator: one(users, {
    fields: [matches.creatorId],
    references: [users.id],
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

// === EXPLICIT API CONTRACT TYPES ===

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
  teamA: { name: string; playerIds: number[] };
  teamB: { name: string; playerIds: number[] };
};

export type MatchResponse = Match & {
  creator?: typeof users.$inferSelect;
  players?: Player[];
  scores?: Score[];
  eventMatches?: EventMatchResponse[];
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
} as const;

export type MatchType = typeof MATCH_TYPES[keyof typeof MATCH_TYPES];

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  [MATCH_TYPES.MATCH_PLAY_1_BALL]: "Match Play - 1 Ball",
  [MATCH_TYPES.MATCH_PLAY_2_BALL]: "Match Play - 2 Ball",
  [MATCH_TYPES.STROKE_PLAY]: "Stroke Play",
  [MATCH_TYPES.NASSAU]: "Nassau",
};

export const MATCH_TYPE_OPTIONS = Object.entries(MATCH_TYPE_LABELS).map(([value, label]) => ({
  value: value as MatchType,
  label,
}));

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

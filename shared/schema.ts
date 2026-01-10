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

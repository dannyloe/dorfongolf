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
  creatorId: text("creator_id").notNull(), // maps to users.id
  createdAt: timestamp("created_at").defaultNow(),
  completed: boolean("completed").default(false),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  userId: text("user_id"), // null for guest players
  name: text("name").notNull(), // display name for player
});

export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  playerId: integer("player_id").notNull(), // maps to players.id
  holeNumber: integer("hole_number").notNull(), // 1-18
  strokes: integer("strokes").notNull(),
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

// === EXPLICIT API CONTRACT TYPES ===

export type Match = typeof matches.$inferSelect;
export type InsertMatch = z.infer<typeof insertMatchSchema>;

export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;

export type Score = typeof scores.$inferSelect;
export type InsertScore = z.infer<typeof insertScoreSchema>;

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

export type MatchResponse = Match & {
  creator?: typeof users.$inferSelect;
  players?: Player[];
  scores?: Score[];
};

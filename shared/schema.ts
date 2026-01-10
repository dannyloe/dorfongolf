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

export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  userId: text("user_id").notNull(), // maps to users.id
});

export const scores = pgTable("scores", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull(),
  userId: text("user_id").notNull(), // maps to users.id
  holeNumber: integer("hole_number").notNull(), // 1-18
  strokes: integer("strokes").notNull(),
});

// === RELATIONS ===

export const matchesRelations = relations(matches, ({ one, many }) => ({
  creator: one(users, {
    fields: [matches.creatorId],
    references: [users.id],
  }),
  participants: many(participants),
  scores: many(scores),
}));

export const participantsRelations = relations(participants, ({ one }) => ({
  match: one(matches, {
    fields: [participants.matchId],
    references: [matches.id],
  }),
  user: one(users, {
    fields: [participants.userId],
    references: [users.id],
  }),
}));

export const scoresRelations = relations(scores, ({ one }) => ({
  match: one(matches, {
    fields: [scores.matchId],
    references: [matches.id],
  }),
  user: one(users, {
    fields: [scores.userId],
    references: [users.id],
  }),
}));

// === BASE SCHEMAS ===

export const insertMatchSchema = createInsertSchema(matches).omit({ 
  id: true, 
  createdAt: true, 
  creatorId: true, // set by server from session
  completed: true 
});

export const insertScoreSchema = createInsertSchema(scores).omit({
  id: true,
  userId: true, // set by server or verified
});

// === EXPLICIT API CONTRACT TYPES ===

export type Match = typeof matches.$inferSelect;
export type InsertMatch = z.infer<typeof insertMatchSchema>;

export type Participant = typeof participants.$inferSelect;

export type Score = typeof scores.$inferSelect;
export type InsertScore = z.infer<typeof insertScoreSchema>;

export type CreateMatchRequest = InsertMatch;
export type UpdateMatchRequest = Partial<InsertMatch> & { completed?: boolean };

// For submitting a score, we might want to allow submitting for specific hole
export type SubmitScoreRequest = {
  holeNumber: number;
  strokes: number;
  userId?: string; // Optional: allows admin/creator to enter for others, otherwise defaults to self
};

export type MatchResponse = Match & {
  creator?: typeof users.$inferSelect;
  participants?: (Participant & { user: typeof users.$inferSelect })[];
  scores?: Score[];
};

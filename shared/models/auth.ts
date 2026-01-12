import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  presetPlayerName: varchar("preset_player_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Preset player roster - centralized list
export const PRESET_PLAYERS = [
  "DLoe", "Zimm", "Hutch", "Cody", "Cole", "Spikey", "CP", "Dooly", "Fontaine",
  "Ian", "JR", "JP", "Jordan", "Wait", "MeerKat", "Chaney", "Neal",
  "Nellie", "Hot Left Hansson", "Ocker", "Sub4 Seeger", "Tharnish",
  "Yaffe", "Shu", "Smitty", "Coach", "Trey Billy", "Ty Adams", "Ty Matlock",
  "Mark Patrick", "Fabio"
] as const;

export type PresetPlayerName = typeof PRESET_PLAYERS[number];

// Player aliases - maps alternative names to canonical preset player names
// Keys are lowercase for case-insensitive matching
export const PLAYER_ALIASES: Record<string, PresetPlayerName> = {
  "danny": "DLoe",
  "craig": "Spikey",
  "gigerich": "Spikey",
  "brandon": "Zimm",
  "hutchy": "Hutch",
  "hutchy bear": "Hutch",
  "brent": "Hutch",
  "pugh": "Cody",
  "wasinger": "Cole",
  "gm": "Cole",
  "creighton": "CP",
  "parker": "CP",
  "iou": "CP",
  "chris": "Dooly",
  "junior": "JR",
  "john paul": "JP",
  "sammy": "Sub4 Seeger",
  "jay": "Jordan",
  "jj": "Jordan",
  "matt": "Wait",
  "jason": "MeerKat",
  "myers": "MeerKat",
  "kat": "MeerKat",
  "michael": "Chaney",
  "bird": "Neal",
  "partridge": "Neal",
  "mark": "Mark Patrick",
  "pat": "Hot Left Hansson",
  "pat h": "Hot Left Hansson",
  "hansson": "Hot Left Hansson",
};

// Helper function to resolve a name to its canonical preset player name
export function resolvePlayerAlias(name: string): string {
  const normalized = name.toLowerCase().trim();
  return PLAYER_ALIASES[normalized] || name;
}

import { sql } from "drizzle-orm";
import { boolean, integer, index, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

// Session storage table.
// (IMPORTANT) This table is mandatory for session management, don't drop it.
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
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  phone: varchar("phone"),
  phoneVerified: boolean("phone_verified").default(false),
  profileImageUrl: varchar("profile_image_url"),
  presetPlayerName: varchar("preset_player_name"),
  isAdmin: boolean("is_admin").default(false),
  // Local auth fields
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  authProvider: text("auth_provider").default("local"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  handicapIndex: integer("handicap_index"),
  teePreference: varchar("tee_preference"),
  discoverable: boolean("discoverable").notNull().default(true),
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
  "sam": "Sub4 Seeger",
  "seeger": "Sub4 Seeger",
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
  "ock": "Ocker",
  "ronnie": "Ocker",
  "scott": "Tharnish",
  "sean": "Yaffe",
  "jew": "Yaffe",
  "yaway": "Yaffe",
  "shumate": "Shu",
  "shue": "Shu",
  "bryon": "Shu",
  "trey": "Trey Billy",
  "tbill": "Trey Billy",
  "ty a": "Ty Adams",
  "tyson": "Ty Adams",
  "matlock": "Ty Matlock",
};

// Helper function to resolve a name to its canonical preset player name
export function resolvePlayerAlias(name: string): string {
  const normalized = name.toLowerCase().trim();
  return PLAYER_ALIASES[normalized] || name;
}

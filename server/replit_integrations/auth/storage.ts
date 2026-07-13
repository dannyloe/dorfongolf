import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "../../db";
import { eq } from "drizzle-orm";

export interface IAuthStorage {
    getUser(id: string): Promise<User | undefined>;
    upsertUser(user: UpsertUser): Promise<User>;
    getUserByUsername(username: string): Promise<User | undefined>;
    getUserByEmail(email: string): Promise<User | undefined>;
    getAllUsers(): Promise<User[]>;
    setUserPassword(userId: string, passwordHash: string): Promise<void>;
    setUserUsername(userId: string, username: string): Promise<void>;
}

class AuthStorage implements IAuthStorage {
    async getUser(id: string): Promise<User | undefined> {
          const [user] = await db.select().from(users).where(eq(users.id, id));
          return user;
    }

  async upsertUser(userData: UpsertUser): Promise<User> {
        const [user] = await db
          .insert(users)
          .values(userData)
          .onConflictDoUpdate({
                    target: users.id,
                    set: {
                                ...userData,
                                updatedAt: new Date(),
                    },
          })
          .returning();
        return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, username.toLowerCase().trim()));
        return user;
  }

  // Added 2026-07-13: the iOS login screen is labeled "Email or username" and
  // the client already sends both fields, but this lookup didn't exist yet —
  // POST /api/auth/login only ever checked username, so typing an account's
  // email (when it differs from username) silently failed to log in.
  async getUserByEmail(email: string): Promise<User | undefined> {
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase().trim()));
        return user;
  }

  async getAllUsers(): Promise<User[]> {
        return db.select().from(users).orderBy(users.createdAt);
  }

  async setUserPassword(userId: string, passwordHash: string): Promise<void> {
        await db
          .update(users)
          .set({ passwordHash, updatedAt: new Date() })
          .where(eq(users.id, userId));
  }

  async setUserUsername(userId: string, username: string): Promise<void> {
        await db
          .update(users)
          .set({ username: username.toLowerCase().trim(), updatedAt: new Date() })
          .where(eq(users.id, userId));
  }
}

export const authStorage = new AuthStorage();

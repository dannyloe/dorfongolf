import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";
import bcrypt from "bcryptjs";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

export async function initializeAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  // POST /api/auth/login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }
      const user = await authStorage.getUserByUsername(username);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid username or password" });
      }
      req.session.userId = user.id;
      res.json({ ok: true });
    } catch (err) {
      console.error("[login error]", err);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // POST /api/auth/register
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, email, firstName, lastName } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const trimmedUsername = username.toLowerCase().trim();
      const existing = await authStorage.getUserByUsername(trimmedUsername);
      if (existing) {
        return res.status(409).json({ message: "Username already taken" });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const id = String(Date.now());
      const user = await authStorage.upsertUser({
        id,
        username: trimmedUsername,
        passwordHash,
        email: email || null,
        firstName: firstName || null,
        lastName: lastName || null,
      });
      req.session.userId = user.id;
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error("[register error]", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  // GET /api/logout — legacy redirect support
  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.redirect("/");
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  // Populate req.user with the same shape used throughout all existing routes
  (req as any).user = { claims: { sub: userId } };
  return next();
};

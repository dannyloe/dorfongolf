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

let sessionStore: InstanceType<ReturnType<typeof connectPg>>;

export function getSession() {
    const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
    sessionStore = new pgStore({
          conString: process.env.DATABASE_URL,
          createTableIfMissing: true,
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
                  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
                  maxAge: sessionTtl,
          },
    });
}

// Middleware for Capacitor iOS: when no cookie session exists, try X-Session-Id header
export function capacitorSessionMiddleware(): RequestHandler {
    return (req, res, next) => {
          if (req.session.userId) return next();
          const sid = req.headers["x-session-id"] as string | undefined;
          if (!sid || !sessionStore) return next();
          sessionStore.get(sid, (err: any, sessionData: any) => {
                  if (err || !sessionData || !sessionData.userId) return next();
                  req.session.userId = sessionData.userId;
                  next();
          });
    };
}

export async function initializeAuth(app: Express) {
    app.set("trust proxy", 1);
    app.use(getSession());
    app.use(capacitorSessionMiddleware());

  // POST /api/auth/login
  app.post("/api/auth/login", async (req, res) => {
        try {
                const { username, password, email } = req.body;
                if (!username || !password) {
                          return res.status(400).json({ message: "Username and password required" });
                }
                let user = await authStorage.getUserByUsername(username);
                if (!user) {
                          user = await authStorage.getUserByEmail(email || username);
                }
                if (!user || !user.passwordHash) {
                          return res.status(401).json({ message: "Invalid username or password" });
                }
                const valid = await bcrypt.compare(password, user.passwordHash);
                if (!valid) {
                          return res.status(401).json({ message: "Invalid username or password" });
                }
                req.session.userId = user.id;
                req.session.save((err) => {
                          if (err) {
                                      console.error("[login session save error]", err);
                                      return res.status(500).json({ message: "Login failed" });
                          }
                          res.json({ ok: true, sessionId: req.sessionID });
                });
        } catch (err) {
                console.error("[login error]", err);
                res.status(500).json({ message: "Login failed" });
        }
  });

  // POST /api/auth/register
  app.post("/api/auth/register", async (req, res) => {
        try {
                const { username, password, email, firstName, lastName, displayName } = req.body;
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
                // Generate a numeric-string ID matching the format of existing Replit Auth user IDs
          const id = String(Date.now()) + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
                const user = await authStorage.upsertUser({
                          id,
                          username: trimmedUsername,
                          passwordHash,
                          email: email || null,
                          firstName: firstName || null,
                          lastName: lastName || null,
                          displayName: displayName || null,
                });
                req.session.userId = user.id;
                req.session.save((err) => {
                          if (err) {
                                      console.error("[register session save error]", err);
                                      const c = (err as any)?.constraint ?? (err as any)?.message ?? '';
                                      if (c.includes('email')) return res.status(409).json({ message: "An account with that email already exists." });
                                      if (c.includes('username')) return res.status(409).json({ message: "That username is already taken." });
                                      if ((err as any)?.constraint) return res.status(409).json({ message: "An account with those details already exists." });
                                      return res.status(500).json({ message: "Registration failed" });
                          }
                          res.status(201).json({ ok: true, sessionId: req.sessionID });
                });
        } catch (err) {
                console.error("[register error]", err);
                const _c = (err as any)?.constraint ?? (err as any)?.message ?? '';
                if (_c.includes('email')) return res.status(409).json({ message: "An account with that email already exists." });
                if (_c.includes('username')) return res.status(409).json({ message: "That username is already taken." });
                if ((err as any)?.constraint) return res.status(409).json({ message: "An account with those details already exists." });
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

export const isAuthenticated: RequestHandler = (req, res, next) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
    }
    (req as any).user = { claims: { sub: userId } };
    next();
};

import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import type { User } from "@shared/models/auth";

// Strip sensitive fields before sending user data to the client
function sanitizeUser(user: User): Omit<User, "passwordHash"> {
  const { passwordHash: _pw, ...safe } = user;
  return safe;
}

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Legacy: redirect old Replit Auth login URL to the new login page
  app.get("/api/login", (_req, res) => res.redirect("/"));
  app.get("/api/callback", (_req, res) => res.redirect("/"));

  // Get current authenticated user (password hash stripped)
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await authStorage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}

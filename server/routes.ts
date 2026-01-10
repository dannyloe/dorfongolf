import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Replit Auth
  await setupAuth(app);
  registerAuthRoutes(app);

  // Seed Data
  try {
    const existingMatches = await storage.getMatches();
    if (existingMatches.length === 0) {
      console.log("Seeding database...");
      // Create a demo user for seeding
      const demoUser = await storage.upsertUser({
        id: "demo-user",
        email: "demo@example.com",
        firstName: "Demo",
        lastName: "Golfer",
        profileImageUrl: null,
      });

      await storage.createMatch({
        name: "Sunday Morning Scramble",
        courseName: "Augusta National",
        creatorId: demoUser.id,
      });

      await storage.createMatch({
        name: "Charity Tournament",
        courseName: "St Andrews",
        creatorId: demoUser.id,
        completed: true,
      });
      console.log("Database seeded!");
    }
  } catch (error) {
    console.error("Error seeding database:", error);
  }

  // Matches routes
  app.get(api.matches.list.path, isAuthenticated, async (req, res) => {
    const matches = await storage.getMatches();
    res.json(matches);
  });

  app.post(api.matches.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.matches.create.input.parse(req.body);
      const user = req.user as any;
      const match = await storage.createMatch({
        ...input,
        creatorId: user.claims.sub,
      });
      // Auto-join creator
      await storage.joinMatch(match.id, user.claims.sub);
      res.status(201).json(match);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.matches.get.path, isAuthenticated, async (req, res) => {
    const matchId = parseInt(req.params.id);
    const match = await storage.getMatch(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    const participants = await storage.getMatchParticipants(matchId);
    const scores = await storage.getMatchScores(matchId);
    
    // Fetch user details for participants
    const participantsWithUser = await Promise.all(participants.map(async p => {
      const user = await storage.getUser(p.userId);
      return { ...p, user };
    }));
    
    // Fetch creator
    const creator = await storage.getUser(match.creatorId);

    res.json({
      ...match,
      creator,
      participants: participantsWithUser,
      scores
    });
  });

  app.post(api.matches.join.path, isAuthenticated, async (req, res) => {
    const matchId = parseInt(req.params.id);
    const user = req.user as any;
    const participant = await storage.joinMatch(matchId, user.claims.sub);
    res.json(participant);
  });

  app.post(api.matches.submitScore.path, isAuthenticated, async (req, res) => {
    const matchId = parseInt(req.params.id);
    const user = req.user as any;
    try {
      const input = api.matches.submitScore.input.parse(req.body);
      // If userId not provided, use current user. If provided, check if authorized (e.g. creator) - for now just current user or simple
      const targetUserId = input.userId || user.claims.sub;
      
      // Ensure target user is participant?
      
      const score = await storage.submitScore({
        matchId,
        userId: targetUserId,
        holeNumber: input.holeNumber,
        strokes: input.strokes
      });
      res.json(score);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}

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
  await setupAuth(app);
  registerAuthRoutes(app);

  app.get(api.matches.list.path, isAuthenticated, async (req, res) => {
    const matches = await storage.getMatches();
    res.json(matches);
  });

  app.post(api.matches.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.matches.create.input.parse(req.body);
      const user = req.user as any;
      const match = await storage.createMatch({
        name: input.name,
        courseName: input.courseName,
        creatorId: user.claims.sub,
      });
      
      const currentUser = await storage.getUser(user.claims.sub);
      const name = currentUser 
        ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || user.claims.email || "Creator"
        : "Creator";

      await storage.addPlayer({
        matchId: match.id,
        userId: user.claims.sub,
        name: name,
      });

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

    const players = await storage.getMatchPlayers(matchId);
    const scores = await storage.getMatchScores(matchId);
    const creator = await storage.getUser(match.creatorId);

    res.json({
      ...match,
      creator,
      players,
      scores
    });
  });

  app.post(api.matches.addPlayer.path, isAuthenticated, async (req, res) => {
    const matchId = parseInt(req.params.id);
    try {
      const input = api.matches.addPlayer.input.parse(req.body);
      
      // If userId is provided, check if they are already in the match
      if (input.userId) {
        const existingPlayers = await storage.getMatchPlayers(matchId);
        const alreadyJoined = existingPlayers.find(p => p.userId === input.userId);
        if (alreadyJoined) {
          return res.status(200).json(alreadyJoined);
        }
      }

      const player = await storage.addPlayer({
        matchId,
        name: input.name,
        userId: input.userId,
      });
      res.status(201).json(player);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.matches.submitScore.path, isAuthenticated, async (req, res) => {
    const matchId = parseInt(req.params.id);
    try {
      const input = api.matches.submitScore.input.parse(req.body);
      const score = await storage.submitScore({
        matchId,
        playerId: input.playerId,
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

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
      // Use presetPlayerName if claimed, otherwise fall back to firstName/lastName or email
      const name = currentUser?.presetPlayerName 
        || (currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : '') 
        || user.claims.email 
        || "Creator";

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
    
    // Get event matches with teams
    const eventMatchesList = await storage.getEventMatches(matchId);
    const eventMatchesWithTeams = await Promise.all(
      eventMatchesList.map(async (em) => storage.getEventMatchWithTeams(em.id))
    );

    res.json({
      ...match,
      creator,
      players,
      scores,
      eventMatches: eventMatchesWithTeams.filter(Boolean)
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

  app.delete(api.matches.delete.path, isAuthenticated, async (req, res) => {
    const matchId = parseInt(req.params.id);
    const user = req.user as any;
    
    const match = await storage.getMatch(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });
    
    // Only the creator can delete
    if (match.creatorId !== user.claims.sub) {
      return res.status(403).json({ message: "Only the match creator can delete this match" });
    }
    
    await storage.deleteMatch(matchId);
    res.status(204).send();
  });

  // Event Matches (Team vs Team within an Event)
  app.get(api.eventMatches.list.path, isAuthenticated, async (req, res) => {
    const eventId = parseInt(req.params.id);
    const eventMatchesList = await storage.getEventMatches(eventId);
    
    // Get teams for each event match
    const eventMatchesWithTeams = await Promise.all(
      eventMatchesList.map(async (em) => {
        const withTeams = await storage.getEventMatchWithTeams(em.id);
        return withTeams;
      })
    );
    
    res.json(eventMatchesWithTeams.filter(Boolean));
  });

  app.post(api.eventMatches.create.path, isAuthenticated, async (req, res) => {
    const eventId = parseInt(req.params.id);
    try {
      const input = api.eventMatches.create.input.parse(req.body);
      const eventMatch = await storage.createEventMatch(eventId, input);
      const withTeams = await storage.getEventMatchWithTeams(eventMatch.id);
      res.status(201).json(withTeams);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.eventMatches.get.path, isAuthenticated, async (req, res) => {
    const eventMatchId = parseInt(req.params.id);
    const eventMatch = await storage.getEventMatchWithTeams(eventMatchId);
    if (!eventMatch) return res.status(404).json({ message: "Event match not found" });
    res.json(eventMatch);
  });

  app.delete(api.eventMatches.delete.path, isAuthenticated, async (req, res) => {
    const eventMatchId = parseInt(req.params.id);
    await storage.deleteEventMatch(eventMatchId);
    res.status(204).send();
  });

  app.post(api.eventMatches.createPress.path, isAuthenticated, async (req, res) => {
    const parentMatchId = parseInt(req.params.id);
    try {
      const input = api.eventMatches.createPress.input.parse(req.body);
      const pressMatch = await storage.createPressMatch(parentMatchId, input.startHole);
      const withTeams = await storage.getEventMatchWithTeams(pressMatch.id);
      res.status(201).json(withTeams);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof Error && err.message === "Parent match not found") {
        return res.status(404).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.eventMatches.updateAutoPress.path, isAuthenticated, async (req, res) => {
    const eventMatchId = parseInt(req.params.id);
    try {
      const input = api.eventMatches.updateAutoPress.input.parse(req.body);
      const updated = await storage.updateEventMatchAutoPress(eventMatchId, input);
      const withTeams = await storage.getEventMatchWithTeams(updated.id);
      res.json(withTeams);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Preset Players Routes
  app.get(api.presetPlayers.list.path, isAuthenticated, async (req, res) => {
    const { PRESET_PLAYERS } = await import("@shared/models/auth");
    const claimedList = await storage.getPresetPlayersClaimed();
    const claimedMap = new Map(claimedList.map(c => [c.presetPlayerName, c]));
    
    const result = PRESET_PLAYERS.map(name => ({
      name,
      claimedByUserId: claimedMap.get(name)?.userId || null,
      claimedByName: claimedMap.get(name)?.userName || null,
    }));
    
    res.json(result);
  });

  app.post(api.presetPlayers.claim.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.presetPlayers.claim.input.parse(req.body);
      const user = req.user as any;
      const userId = user.claims.sub;
      
      // Validate preset name is in the allowed list (or null to release)
      if (input.presetPlayerName !== null) {
        const { PRESET_PLAYERS } = await import("@shared/models/auth");
        if (!PRESET_PLAYERS.includes(input.presetPlayerName as any)) {
          return res.status(400).json({ message: `"${input.presetPlayerName}" is not a valid preset player name` });
        }
      }
      
      const updatedUser = await storage.claimPresetPlayer(userId, input.presetPlayerName);
      res.json(updatedUser);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof Error && err.message.includes("already claimed")) {
        return res.status(409).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}

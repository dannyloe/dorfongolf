import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { ai } from "./replit_integrations/image/client";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.get(api.matches.list.path, isAuthenticated, async (req, res) => {
    const matches = await storage.getMatchesWithPlayers();
    res.json(matches);
  });

  app.post(api.matches.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.matches.create.input.parse(req.body);
      const user = req.user as any;
      const match = await storage.createMatch({
        name: input.name || null,
        courseName: input.courseName,
        creatorId: user.claims.sub,
        groupId: input.groupId ?? null,
        ryderCupEventId: input.ryderCupEventId ?? null,
        ryderCupDayNumber: input.ryderCupDayNumber ?? null,
        courseId: input.courseId ?? null,
        isHandicapped: input.isHandicapped ?? false,
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
      }, match.courseId ?? undefined);

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
      const match = await storage.getMatch(matchId);
      const existingPlayers = await storage.getMatchPlayers(matchId);
      
      // Check if user is already in the match (by userId or by name for guests)
      if (input.userId) {
        const alreadyJoined = existingPlayers.find(p => p.userId === input.userId);
        if (alreadyJoined) {
          return res.status(200).json(alreadyJoined);
        }
      }
      
      // Also check by name (case-insensitive) to prevent duplicate guest players
      const sameNamePlayer = existingPlayers.find(p => 
        p.name.toLowerCase() === input.name.toLowerCase()
      );
      if (sameNamePlayer) {
        return res.status(200).json(sameNamePlayer);
      }

      const player = await storage.addPlayer({
        matchId,
        name: input.name,
        userId: input.userId,
      }, match?.courseId ?? undefined);
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
    const user = req.user as any;
    const userId = user.claims.sub;
    
    try {
      // Get match to check creator
      const match = await storage.getMatch(matchId);
      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }
      
      // Check if user is admin, creator, or participant
      const isAdmin = await storage.isUserAdmin(userId);
      const isCreator = match.creatorId === userId;
      
      if (!isAdmin && !isCreator) {
        // Check if user is a participant in the match
        const matchPlayers = await storage.getMatchPlayers(matchId);
        
        // Check by userId linkage
        let isParticipant = matchPlayers.some(p => p.userId === userId);
        
        // Also check by preset player name or aliases (many players added without userId)
        if (!isParticipant) {
          const currentUser = await storage.getUser(userId);
          if (currentUser?.presetPlayerName) {
            const presetName = currentUser.presetPlayerName.toLowerCase().trim();
            
            // Get aliases for this user's preset player
            const aliases = await storage.getPlayerAliases(currentUser.presetPlayerName);
            const aliasNames = aliases.map(a => a.alias.toLowerCase().trim());
            
            // Check if any match player's name matches preset name or any alias
            isParticipant = matchPlayers.some(p => {
              const playerName = p.name.toLowerCase().trim();
              return playerName === presetName || aliasNames.includes(playerName);
            });
          }
        }
        
        if (!isParticipant) {
          return res.status(403).json({ message: "Only match participants can submit scores" });
        }
      }
      
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

  const ADMIN_USER_ID = "52861828";

  app.delete(api.matches.delete.path, isAuthenticated, async (req, res) => {
    const matchId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    
    const match = await storage.getMatch(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });
    
    const isAdmin = userId === ADMIN_USER_ID;
    const isCreator = match.creatorId === userId;
    
    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: "Only the match creator can delete this match" });
    }
    
    await storage.deleteMatch(matchId);
    res.status(204).send();
  });

  app.patch(api.matches.updateStatus.path, isAuthenticated, async (req, res) => {
    const matchId = parseInt(req.params.id);
    try {
      const input = api.matches.updateStatus.input.parse(req.body);
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      
      const updated = await storage.updateMatchStatus(matchId, input.completed);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
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
    const user = req.user as any;
    const userId = user.claims.sub;
    
    const eventMatch = await storage.getEventMatch(eventMatchId);
    if (!eventMatch) return res.status(404).json({ message: "Event match not found" });
    
    const match = await storage.getMatch(eventMatch.eventId);
    if (!match) return res.status(404).json({ message: "Match not found" });
    
    const isAdmin = userId === ADMIN_USER_ID;
    const isCreator = match.creatorId === userId;
    
    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: "Only the match creator can delete this event" });
    }
    
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

  app.patch(api.eventMatches.updateNetScoring.path, isAuthenticated, async (req, res) => {
    const eventMatchId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    
    const eventMatch = await storage.getEventMatchWithTeams(eventMatchId);
    if (!eventMatch) {
      return res.status(404).json({ message: "Event match not found" });
    }
    
    const match = await storage.getMatch(eventMatch.eventId);
    if (!match) {
      return res.status(404).json({ message: "Match not found" });
    }
    
    const isAdmin = userId === ADMIN_USER_ID;
    const isCreator = match.creatorId === userId;
    
    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: "Only the match creator can change net scoring" });
    }
    
    try {
      const input = api.eventMatches.updateNetScoring.input.parse(req.body);
      const updated = await storage.updateEventMatchNetScoring(eventMatchId, input.useNetScoring);
      const withTeams = await storage.getEventMatchWithTeams(updated.id);
      res.json(withTeams);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Ledger Route
  app.get(api.ledger.get.path, isAuthenticated, async (req, res) => {
    try {
      const startDate = req.query.start ? new Date(req.query.start as string) : undefined;
      const endDate = req.query.end ? new Date(req.query.end as string) : undefined;
      
      const ledgerData = await storage.getLedgerData(startDate, endDate);
      res.json(ledgerData);
    } catch (err) {
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

  app.get(api.presetPlayers.full.path, isAuthenticated, async (req, res) => {
    try {
      const fullData = await storage.getFullPlayerData();
      res.json(fullData);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.presetPlayers.update.path, isAuthenticated, async (req, res) => {
    try {
      // Admin-only endpoint
      const user = req.user as any;
      const userId = user.claims.sub;
      const isAdmin = await storage.isUserAdmin(userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only administrators can update player settings" });
      }
      
      const playerName = decodeURIComponent(req.params.name);
      const { PRESET_PLAYERS } = await import("@shared/models/auth");
      if (!PRESET_PLAYERS.includes(playerName as any)) {
        return res.status(404).json({ message: `Player "${playerName}" not found` });
      }
      
      const input = api.presetPlayers.update.input.parse(req.body);
      
      // Validate defaultTeeId exists if provided
      if (input.defaultTeeId !== null && input.defaultTeeId !== undefined) {
        const tee = await storage.getTeeById(input.defaultTeeId);
        if (!tee) {
          return res.status(400).json({ message: `Tee with ID ${input.defaultTeeId} not found` });
        }
      }
      
      const updated = await storage.upsertPlayerHandicap({
        presetPlayerName: playerName,
        handicapIndex: input.handicapIndex ?? undefined,
        defaultTeeId: input.defaultTeeId ?? undefined,
      });
      
      res.json({
        presetPlayerName: updated.presetPlayerName,
        handicapIndex: updated.handicapIndex,
        defaultTeeId: updated.defaultTeeId,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.presetPlayers.claim.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.presetPlayers.claim.input.parse(req.body);
      const user = req.user as any;
      const userId = user.claims.sub;
      
      // Validate preset name exists (or null to release)
      if (input.presetPlayerName !== null) {
        const exists = await storage.presetPlayerExists(input.presetPlayerName);
        if (!exists) {
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

  app.put(api.presetPlayers.setAdmin.path, isAuthenticated, async (req, res) => {
    try {
      // Only admins can set admin status
      const user = req.user as any;
      const currentUserId = user.claims.sub;
      const isAdmin = await storage.isUserAdmin(currentUserId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only administrators can modify admin status" });
      }
      
      const targetUserId = req.params.userId;
      const input = api.presetPlayers.setAdmin.input.parse(req.body);
      
      const result = await storage.setUserAdmin(targetUserId, input.isAdmin);
      if (!result) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.presetPlayers.create.path, isAuthenticated, async (req, res) => {
    try {
      // Admin-only endpoint
      const user = req.user as any;
      const userId = user.claims.sub;
      const isAdmin = await storage.isUserAdmin(userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only administrators can add players to the roster" });
      }
      
      const input = api.presetPlayers.create.input.parse(req.body);
      const name = input.name.trim();
      
      // Check if player already exists
      const exists = await storage.presetPlayerExists(name);
      if (exists) {
        return res.status(409).json({ message: `Player "${name}" already exists in the roster` });
      }
      
      const newPlayer = await storage.createPresetPlayer(name);
      res.status(201).json({ id: newPlayer.id, name: newPlayer.name });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create a new preset player (hidden from roster) and claim it for the current user
  app.post(api.presetPlayers.createAndClaim.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.presetPlayers.createAndClaim.input.parse(req.body);
      const user = req.user as any;
      const userId = user.claims.sub;
      const name = input.name.trim();
      
      // Check if player already exists
      const exists = await storage.presetPlayerExists(name);
      if (exists) {
        return res.status(409).json({ message: `"${name}" already exists. Please choose a different name or select it from the list.` });
      }
      
      // Create the preset player with showInRoster: false
      await storage.createPresetPlayer(name, false);
      
      // Claim it for the current user
      const updatedUser = await storage.claimPresetPlayer(userId, name);
      res.status(201).json(updatedUser);
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

  app.put(api.presetPlayers.updateAliases.path, isAuthenticated, async (req, res) => {
    try {
      // Admin-only endpoint
      const user = req.user as any;
      const userId = user.claims.sub;
      const isAdmin = await storage.isUserAdmin(userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only administrators can update player aliases" });
      }
      
      const playerName = decodeURIComponent(req.params.name);
      const input = api.presetPlayers.updateAliases.input.parse(req.body);
      
      // Verify player exists
      const exists = await storage.presetPlayerExists(playerName);
      if (!exists) {
        return res.status(404).json({ message: `Player "${playerName}" not found` });
      }
      
      await storage.setPlayerAliases(playerName, input.aliases);
      
      // Return updated aliases
      const updatedAliases = await storage.getPlayerAliases(playerName);
      res.json({ 
        playerName, 
        aliases: updatedAliases.map(a => a.alias) 
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.presetPlayers.updateShowInRoster.path, isAuthenticated, async (req, res) => {
    try {
      // Admin-only endpoint
      const user = req.user as any;
      const userId = user.claims.sub;
      const isAdmin = await storage.isUserAdmin(userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only administrators can update roster visibility" });
      }
      
      const playerName = decodeURIComponent(req.params.name);
      const input = api.presetPlayers.updateShowInRoster.input.parse(req.body);
      
      // Verify player exists
      const exists = await storage.presetPlayerExists(playerName);
      if (!exists) {
        return res.status(404).json({ message: `Player "${playerName}" not found` });
      }
      
      await storage.updatePresetPlayerShowInRoster(playerName, input.showInRoster);
      
      res.json({ playerName, showInRoster: input.showInRoster });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.presetPlayers.rename.path, isAuthenticated, async (req, res) => {
    try {
      // Admin-only endpoint
      const user = req.user as any;
      const userId = user.claims.sub;
      const isAdmin = await storage.isUserAdmin(userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only administrators can rename players" });
      }
      
      const oldName = decodeURIComponent(req.params.name);
      const input = api.presetPlayers.rename.input.parse(req.body);
      
      // Verify old player exists
      const exists = await storage.presetPlayerExists(oldName);
      if (!exists) {
        return res.status(404).json({ message: `Player "${oldName}" not found` });
      }
      
      const result = await storage.renamePresetPlayer(oldName, input.newName);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof Error && err.message.includes("already exists")) {
        return res.status(409).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Courses Routes
  app.get(api.courses.list.path, isAuthenticated, async (req, res) => {
    try {
      const coursesList = await storage.getCourses();
      const result = await Promise.all(coursesList.map(async (course) => {
        const holes = await storage.getCourseHoles(course.id);
        const totalPar = holes.reduce((sum, h) => sum + h.par, 0);
        return { ...course, holes, totalPar };
      }));
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.courses.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.courses.create.input.parse(req.body);
      const course = await storage.createFullCourse(input.name, input.holes);
      res.status(201).json(course);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof Error && err.message.includes("unique")) {
        return res.status(400).json({ message: "A course with this name already exists" });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.courses.update.path, isAuthenticated, async (req, res) => {
    try {
      const courseId = parseInt(req.params.id);
      const input = api.courses.update.input.parse(req.body);
      const course = await storage.updateCourse(courseId, input);
      if (!course) return res.status(404).json({ message: "Course not found" });
      res.json(course);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.courses.updateHole.path, isAuthenticated, async (req, res) => {
    try {
      const courseId = parseInt(req.params.id);
      const holeNumber = parseInt(req.params.holeNumber);
      const input = api.courses.updateHole.input.parse(req.body);
      const hole = await storage.updateCourseHole(courseId, holeNumber, input);
      if (!hole) return res.status(404).json({ message: "Hole not found" });
      res.json(hole);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.courses.delete.path, isAuthenticated, async (req, res) => {
    try {
      const courseId = parseInt(req.params.id);
      const course = await storage.getCourse(courseId);
      if (!course) return res.status(404).json({ message: "Course not found" });
      await storage.deleteCourse(courseId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.courses.updateRatings.path, isAuthenticated, async (req, res) => {
    try {
      const courseId = parseInt(req.params.id);
      const input = api.courses.updateRatings.input.parse(req.body);
      const course = await storage.getCourse(courseId);
      if (!course) return res.status(404).json({ message: "Course not found" });
      const updated = await storage.updateCourseRatings(courseId, input.slopeRating, input.courseRating);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Player Handicaps
  app.get(api.playerHandicaps.list.path, isAuthenticated, async (req, res) => {
    const handicaps = await storage.getPlayerHandicaps();
    res.json(handicaps);
  });

  app.put(api.playerHandicaps.upsert.path, isAuthenticated, async (req, res) => {
    try {
      const presetPlayerName = decodeURIComponent(req.params.presetPlayerName);
      const input = api.playerHandicaps.upsert.input.parse(req.body);
      const handicap = await storage.upsertPlayerHandicap({
        presetPlayerName,
        handicapIndex: input.handicapIndex,
      });
      res.json(handicap);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.playerHandicaps.delete.path, isAuthenticated, async (req, res) => {
    try {
      const presetPlayerName = decodeURIComponent(req.params.presetPlayerName);
      await storage.deletePlayerHandicap(presetPlayerName);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Match-specific player handicap overrides
  app.get(api.matchPlayerHandicaps.list.path, isAuthenticated, async (req, res) => {
    try {
      const eventMatchId = parseInt(req.params.eventMatchId);
      const handicaps = await storage.getMatchPlayerHandicaps(eventMatchId);
      res.json(handicaps);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.matchPlayerHandicaps.upsert.path, isAuthenticated, async (req, res) => {
    try {
      const eventMatchId = parseInt(req.params.eventMatchId);
      const playerId = parseInt(req.params.playerId);
      const user = req.user as any;
      const userId = user.claims.sub;
      
      // Get the event match to find its parent match
      const eventMatch = await storage.getEventMatch(eventMatchId);
      if (!eventMatch) {
        return res.status(404).json({ message: "Event match not found" });
      }
      
      // Get the parent match to check permissions
      const match = await storage.getMatch(eventMatch.eventId);
      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }
      
      const isAdmin = await storage.isUserAdmin(userId);
      const isCreator = match.creatorId === userId;
      
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ message: "Only the event creator can update match handicaps" });
      }
      
      const input = api.matchPlayerHandicaps.upsert.input.parse(req.body);
      const handicap = await storage.upsertMatchPlayerHandicap({
        eventMatchId,
        playerId,
        courseHandicap: input.courseHandicap,
      });
      res.json(handicap);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.matchPlayerHandicaps.delete.path, isAuthenticated, async (req, res) => {
    try {
      const eventMatchId = parseInt(req.params.eventMatchId);
      const playerId = parseInt(req.params.playerId);
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const eventMatch = await storage.getEventMatch(eventMatchId);
      if (!eventMatch) {
        return res.status(404).json({ message: "Event match not found" });
      }
      
      const match = await storage.getMatch(eventMatch.eventId);
      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }
      
      const isAdmin = await storage.isUserAdmin(userId);
      const isCreator = match.creatorId === userId;
      
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ message: "Only the event creator can update match handicaps" });
      }
      
      await storage.deleteMatchPlayerHandicap(eventMatchId, playerId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Per-course default tees for players
  app.get(api.playerCourseDefaults.listAll.path, isAuthenticated, async (req, res) => {
    try {
      const defaults = await storage.getAllPlayerCourseDefaults();
      res.json(defaults);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.playerCourseDefaults.listForPlayer.path, isAuthenticated, async (req, res) => {
    try {
      const presetPlayerName = decodeURIComponent(req.params.presetPlayerName);
      const defaults = await storage.getPlayerCourseDefaults(presetPlayerName);
      res.json(defaults);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.playerCourseDefaults.upsert.path, isAuthenticated, async (req, res) => {
    try {
      const presetPlayerName = decodeURIComponent(req.params.presetPlayerName);
      const courseId = parseInt(req.params.courseId);
      const input = api.playerCourseDefaults.upsert.input.parse(req.body);
      const result = await storage.upsertPlayerCourseDefault({
        presetPlayerName,
        courseId,
        teeId: input.teeId,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.playerCourseDefaults.delete.path, isAuthenticated, async (req, res) => {
    try {
      const presetPlayerName = decodeURIComponent(req.params.presetPlayerName);
      const courseId = parseInt(req.params.courseId);
      await storage.deletePlayerCourseDefault(presetPlayerName, courseId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Match Handicapped Status
  app.patch(api.matches.updateHandicapped.path, isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const input = api.matches.updateHandicapped.input.parse(req.body);
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      const updated = await storage.updateMatchHandicapped(matchId, input.isHandicapped);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update match details (name, course, date)
  app.patch(api.matches.updateDetails.path, isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      
      const isAdmin = userId === ADMIN_USER_ID;
      const isCreator = match.creatorId === userId;
      
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ message: "Only the event creator can update event details" });
      }
      
      const input = api.matches.updateDetails.input.parse(req.body);
      const updateData: { name?: string | null; courseId?: number; courseName?: string; createdAt?: Date; groupId?: number | null } = {};
      if (input.name !== undefined) updateData.name = input.name || null;
      if (input.courseId !== undefined) updateData.courseId = input.courseId;
      if (input.courseName) updateData.courseName = input.courseName;
      if (input.createdAt) updateData.createdAt = new Date(input.createdAt);
      if (input.groupId !== undefined) updateData.groupId = input.groupId;
      
      const updated = await storage.updateMatchDetails(matchId, updateData);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.matches.updatePlayerHandicap.path, isAuthenticated, async (req, res) => {
    const matchId = parseInt(req.params.matchId);
    const playerId = parseInt(req.params.playerId);
    const user = req.user as any;
    const userId = user.claims.sub;
    
    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      
      const isAdmin = userId === ADMIN_USER_ID;
      const isCreator = match.creatorId === userId;
      
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ message: "Only the event creator can update handicaps" });
      }
      
      const input = api.matches.updatePlayerHandicap.input.parse(req.body);
      const updated = await storage.updatePlayerHandicapIndex(playerId, input.handicapIndex);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update player tee for a match (creator only)
  app.patch(api.matches.updatePlayerTee.path, isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.matchId);
      const playerId = parseInt(req.params.playerId);
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const match = await storage.getMatch(matchId);
      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }
      
      // Only match creator or admin can update player tees
      const isAdmin = userId === ADMIN_USER_ID;
      if (match.creatorId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only the match creator can update player tees" });
      }
      
      const input = api.matches.updatePlayerTee.input.parse(req.body);
      const updated = await storage.updatePlayerTee(playerId, input.teeId);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.matches.clone.path, isAuthenticated, async (req, res) => {
    try {
      const sourceEventId = parseInt(req.params.id);
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const newMatch = await storage.cloneEvent(sourceEventId, userId);
      res.status(201).json(newMatch);
    } catch (err: any) {
      if (err?.message === "Source event not found") {
        return res.status(404).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.matches.copyBets.path, isAuthenticated, async (req, res) => {
    try {
      const targetEventId = parseInt(req.params.id);
      const input = api.matches.copyBets.input.parse(req.body);
      
      await storage.copyBetsFromEvent(targetEventId, input.sourceEventId);
      res.json({ message: "Bets copied successfully" });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err?.message?.includes("not found")) {
        return res.status(404).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get course tees
  app.get(api.courses.getTees.path, async (req, res) => {
    try {
      const courseId = parseInt(req.params.id);
      const tees = await storage.getCourseTees(courseId);
      res.json(tees);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Create course tee
  app.post(api.courses.createTee.path, isAuthenticated, async (req, res) => {
    try {
      const courseId = parseInt(req.params.id);
      const input = api.courses.createTee.input.parse(req.body);
      const tee = await storage.createCourseTee({
        courseId,
        name: input.name,
        slopeRating: input.slopeRating,
        courseRating: input.courseRating,
        color: input.color || null,
      });
      res.status(201).json(tee);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update course tee
  app.put(api.courses.updateTee.path, isAuthenticated, async (req, res) => {
    try {
      const courseId = parseInt(req.params.courseId);
      const teeId = parseInt(req.params.teeId);
      const input = api.courses.updateTee.input.parse(req.body);
      const updated = await storage.updateCourseTee(courseId, teeId, input);
      if (!updated) {
        return res.status(404).json({ message: "Tee not found for this course" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete course tee
  app.delete(api.courses.deleteTee.path, isAuthenticated, async (req, res) => {
    try {
      const courseId = parseInt(req.params.courseId);
      const teeId = parseInt(req.params.teeId);
      const deleted = await storage.deleteCourseTee(courseId, teeId);
      if (!deleted) {
        return res.status(404).json({ message: "Tee not found for this course" });
      }
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Scorecard OCR Scanning
  app.post(api.scorecard.scan.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.scorecard.scan.input.parse(req.body);
      
      const prompt = `You are analyzing a golf scorecard image. Extract the scores for each player.

Known players in this match are: ${input.playerNames.join(', ')}
${input.courseName ? `The course is: ${input.courseName}` : ''}

Please analyze this scorecard image and extract scores for each hole (1-18).

IMPORTANT: Return ONLY a valid JSON object in this exact format, with no additional text before or after:
{
  "scores": [
    {
      "playerName": "Player Name",
      "holes": [
        {"holeNumber": 1, "strokes": 4, "confidence": "high"},
        {"holeNumber": 2, "strokes": 5, "confidence": "medium"},
        ...
      ]
    }
  ],
  "rawText": "any notes about the scorecard"
}

Rules:
- ONLY include players whose scores are actually visible/written on the scorecard
- Do NOT include players who have no scores on this scorecard
- Try to match visible names to known players: ${input.playerNames.join(', ')}
- If a name on the scorecard doesn't match any known player, use the name exactly as written
- Use null for strokes if a specific hole score is unreadable
- confidence should be "high", "medium", or "low" based on legibility
- Include all 18 holes for each player found on the card
- Do NOT include Front 9, Back 9, or Total scores - only individual hole scores (1-18)
- rawText can include any observations about the scorecard quality`;

      // Extract MIME type from data URL (supports jpeg, png, heic, webp, etc.)
      const mimeMatch = input.imageBase64.match(/^data:(image\/[^;]+);base64,/);
      const mimeType = mimeMatch?.[1] || "image/jpeg";
      const base64Data = input.imageBase64.replace(/^data:image\/[^;]+;base64,/, '');
      
      if (!base64Data) {
        return res.status(400).json({ message: "Invalid image data" });
      }

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            { 
              inlineData: {
                mimeType,
                data: base64Data
              }
            }
          ]
        }]
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(400).json({ 
          message: "Could not parse scorecard. Please try with a clearer image." 
        });
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      res.json({
        success: true,
        scores: parsed.scores || [],
        rawText: parsed.rawText || ''
      });
    } catch (err) {
      console.error("Scorecard scan error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to process scorecard image" });
    }
  });

  // Golf Course API integration routes
  app.get(api.golfCourseApi.search.path, isAuthenticated, async (req, res) => {
    try {
      const searchQuery = req.query.q as string;
      if (!searchQuery || searchQuery.length < 2) {
        return res.status(400).json({ message: "Search query must be at least 2 characters" });
      }

      const apiKey = process.env.GOLF_COURSE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ message: "Golf course API not configured" });
      }

      const response = await fetch(
        `https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(searchQuery)}`,
        {
          headers: {
            'Authorization': `Key ${apiKey}`,
          },
        }
      );

      if (!response.ok) {
        console.error("Golf API search error:", response.status, await response.text());
        return res.status(500).json({ message: "Failed to search golf courses" });
      }

      const data = await response.json();
      res.json(data);
    } catch (err) {
      console.error("Golf course search error:", err);
      res.status(500).json({ message: "Failed to search golf courses" });
    }
  });

  app.get('/api/golf-course-api/courses/:id', isAuthenticated, async (req, res) => {
    try {
      const courseId = parseInt(req.params.id);
      if (isNaN(courseId)) {
        return res.status(400).json({ message: "Invalid course ID" });
      }

      const apiKey = process.env.GOLF_COURSE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ message: "Golf course API not configured" });
      }

      const response = await fetch(
        `https://api.golfcourseapi.com/v1/courses/${courseId}`,
        {
          headers: {
            'Authorization': `Key ${apiKey}`,
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).json({ message: "Course not found" });
        }
        console.error("Golf API get course error:", response.status, await response.text());
        return res.status(500).json({ message: "Failed to get course details" });
      }

      const data = await response.json();
      res.json(data);
    } catch (err) {
      console.error("Golf course get error:", err);
      res.status(500).json({ message: "Failed to get course details" });
    }
  });

  app.post(api.golfCourseApi.importCourse.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.golfCourseApi.importCourse.input.parse(req.body);
      
      const apiKey = process.env.GOLF_COURSE_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ message: "Golf course API not configured" });
      }

      // Fetch full course data from API
      const response = await fetch(
        `https://api.golfcourseapi.com/v1/courses/${input.externalId}`,
        {
          headers: {
            'Authorization': `Key ${apiKey}`,
          },
        }
      );

      if (!response.ok) {
        return res.status(500).json({ message: "Failed to fetch course data for import" });
      }

      const responseData = await response.json();
      const courseData = responseData.course || responseData;
      
      // Find the selected tee data (prefer male tees, fall back to female)
      const allTees = [...(courseData.tees?.male || []), ...(courseData.tees?.female || [])];
      console.log("Looking for tee:", input.selectedTee);
      console.log("Available tees:", allTees.map((t: any) => t.tee_name));
      const selectedTeeData = allTees.find((t: any) => t.tee_name === input.selectedTee);
      console.log("Selected tee data:", selectedTeeData ? `found with ${selectedTeeData.holes?.length} holes` : "not found");
      
      if (!selectedTeeData || !selectedTeeData.holes || selectedTeeData.holes.length < 9) {
        return res.status(400).json({ message: "Selected tee does not have valid hole data" });
      }

      // Create or update the course
      const pars = selectedTeeData.holes.slice(0, 18).map((h: any) => h.par);
      const handicaps = selectedTeeData.holes.slice(0, 18).map((h: any) => h.handicap);
      
      const course = await storage.seedCourseIfNotExists(input.courseName, pars);
      
      // Update hole pars and handicaps
      for (let i = 0; i < Math.min(handicaps.length, 18); i++) {
        await storage.updateCourseHole(course.id, i + 1, { par: pars[i], handicap: handicaps[i] });
      }
      
      // Import all tees from the API data
      let teesImported = 0;
      for (const tee of allTees) {
        if (tee.slope_rating && tee.course_rating) {
          await storage.createCourseTee({
            courseId: course.id,
            name: tee.tee_name,
            slopeRating: Math.round(tee.slope_rating),
            courseRating: Math.round(tee.course_rating * 10), // Store as tenths
            color: null,
          });
          teesImported++;
        }
      }

      res.json({
        courseId: course.id,
        holesImported: Math.min(pars.length, 18),
        teesImported,
      });
    } catch (err) {
      console.error("Course import error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to import course" });
    }
  });

  // Groups endpoints
  app.get(api.groups.list.path, isAuthenticated, async (req, res) => {
    const groups = await storage.getGroups();
    res.json(groups);
  });

  app.post(api.groups.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.groups.create.input.parse(req.body);
      const group = await storage.createGroup(input.name);
      res.status(201).json(group);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === RYDER CUP ROUTES ===

  app.get(api.ryderCup.list.path, isAuthenticated, async (req, res) => {
    const events = await storage.getRyderCupEvents();
    res.json(events);
  });

  app.get(api.ryderCup.get.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    const event = await storage.getRyderCupEventFull(id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.json(event);
  });

  app.post(api.ryderCup.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.ryderCup.create.input.parse(req.body);
      const user = req.user as any;
      const event = await storage.createRyderCupEvent(input, user.claims.sub);
      res.status(201).json(event);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.ryderCup.generateSchedule.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      await storage.generateRyderCupSchedule(id);
      res.json({ success: true });
    } catch (err) {
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.ryderCup.delete.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    
    const event = await storage.getRyderCupEvent(id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    
    const isAdmin = userId === ADMIN_USER_ID || await storage.isUserAdmin(userId);
    const isCreator = event.creatorId === userId;
    
    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: "Only the event creator can delete this event" });
    }
    
    await storage.deleteRyderCupEvent(id);
    res.status(204).send();
  });

  app.patch(api.ryderCup.updateHandicaps.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const input = api.ryderCup.updateHandicaps.input.parse(req.body);
      const event = await storage.getRyderCupEvent(id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      
      const updated = await storage.updateRyderCupEventHandicaps(id, input.useHandicaps);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.ryderCup.addSideMatch.path, isAuthenticated, async (req, res) => {
    const eventId = parseInt(req.params.id);
    try {
      const input = api.ryderCup.addSideMatch.input.parse(req.body);
      const event = await storage.getRyderCupEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      
      const pairing = await storage.addRyderCupSideMatch(input, eventId);
      res.status(201).json(pairing);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.ryderCup.recordResult.path, isAuthenticated, async (req, res) => {
    const pairingId = parseInt(req.params.pairingId);
    try {
      const input = api.ryderCup.recordResult.input.parse(req.body);
      const result = await storage.recordPairingResult(pairingId, input);
      res.json(result);
    } catch (err) {
      if (err instanceof Error && err.message === "Pairing not found") {
        return res.status(404).json({ message: err.message });
      }
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.ryderCup.recordSkin.path, isAuthenticated, async (req, res) => {
    const dayId = parseInt(req.params.dayId);
    try {
      const input = api.ryderCup.recordSkin.input.parse(req.body);
      const skin = await storage.recordRyderCupSkin(dayId, input.holeNumber, input.winnerName);
      res.json(skin);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.ryderCup.getDaySkins.path, isAuthenticated, async (req, res) => {
    const dayId = parseInt(req.params.dayId);
    const skins = await storage.getRyderCupDaySkins(dayId);
    res.json(skins);
  });

  app.get(api.ryderCup.getSideMatches.path, isAuthenticated, async (req, res) => {
    const eventId = parseInt(req.params.id);
    const matches = await storage.getMatchesByRyderCupEvent(eventId);
    res.json(matches);
  });

  return httpServer;
}

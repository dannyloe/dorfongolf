import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { db } from "./db";
import { presetPlayers, playerAliases } from "@shared/schema";
import { ai } from "./replit_integrations/image/client";
import { sendSMS, sendMatchInvitation, sendScoreUpdate, sendBetResult } from "./twilio";

// Helper to send match invitation notification to a player (non-blocking)
async function notifyPlayerOfMatchInvitation(
  matchId: number, 
  playerUserId: string | null | undefined,
  matchName: string | null,
  inviterUserId: string
) {
  if (!playerUserId) return;
  
  try {
    const user = await storage.getUser(playerUserId);
    if (!user?.phone) return;
    
    // Check notification preferences
    const prefs = await storage.getNotificationPreferences(playerUserId);
    if (prefs && prefs.matchInvitations === false) return;
    
    // Get inviter's display name
    const inviter = await storage.getUser(inviterUserId);
    const inviterName = inviter?.presetPlayerName || inviter?.firstName || "Someone";
    
    const matchDisplayName = matchName || "a match";
    await sendMatchInvitation(user.phone, matchDisplayName, inviterName);
  } catch (error) {
    console.error('Failed to send match invitation notification:', error);
  }
}

// Helper to send score update notifications (non-blocking)
async function notifyMatchParticipantsOfScoreUpdate(
  matchId: number,
  playerName: string,
  holeNumber: number
) {
  try {
    const participants = await storage.getMatchParticipantsWithPhone(matchId);
    const match = await storage.getMatch(matchId);
    const matchName = match?.name || "Match";
    
    for (const participant of participants) {
      // Check notification preferences
      const prefs = await storage.getNotificationPreferences(participant.userId);
      if (prefs && prefs.scoreUpdates === false) continue;
      
      await sendScoreUpdate(
        participant.phone,
        matchName,
        playerName,
        holeNumber
      );
    }
  } catch (error) {
    console.error('Failed to send score update notifications:', error);
  }
}

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
    let scores = await storage.getMatchScores(matchId);
    const creator = await storage.getUser(match.creatorId);
    
    // Get event matches with teams
    const eventMatchesList = await storage.getEventMatches(matchId);
    const eventMatchesWithTeams = await Promise.all(
      eventMatchesList.map(async (em) => storage.getEventMatchWithTeams(em.id))
    );

    // For side matches (linked to Ryder Cup events), fetch scores from Ryder Cup pairings
    if (match.ryderCupEventId && match.ryderCupDayNumber && scores.length === 0) {
      const ryderCupScores = await storage.getRyderCupScoresForSideMatch(
        match.ryderCupEventId,
        match.ryderCupDayNumber,
        players
      );
      scores = ryderCupScores;
    }

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
    const user = req.user as any;
    const userId = user.claims.sub;
    
    try {
      const input = api.matches.addPlayer.input.parse(req.body);
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      
      // Permission check: User can add themselves, or creator/admin can add anyone
      const isAdmin = userId === ADMIN_USER_ID;
      const isCreator = match.creatorId === userId;
      const isAddingSelf = input.userId === userId;
      
      if (!isAdmin && !isCreator && !isAddingSelf) {
        return res.status(403).json({ message: "Only the creator can add other players" });
      }
      
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
        teeId: input.teeId ?? null,
        handicapIndex: input.handicapIndex ?? null,
      }, match?.courseId ?? undefined);
      
      // Send notification to newly added player (non-blocking)
      notifyPlayerOfMatchInvitation(matchId, input.userId, match.name, userId).catch(() => {});
      
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
      
      // Check if user is admin, creator, organizer, or participant
      const isAdmin = await storage.isUserAdmin(userId);
      const isCreator = match.creatorId === userId;
      
      // Check for organizer role
      const matchRole = await storage.getMatchRole(matchId, userId);
      const isOrganizer = matchRole?.role === 'organizer';
      
      if (!isAdmin && !isCreator && !isOrganizer) {
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
    const user = req.user as any;
    const userId = user.claims.sub;
    
    try {
      // Check permissions - creator or organizer can create bets
      const match = await storage.getMatch(eventId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      
      const isAdmin = userId === ADMIN_USER_ID;
      const isCreator = match.creatorId === userId;
      const matchRole = await storage.getMatchRole(eventId, userId);
      const isOrganizer = matchRole?.role === 'organizer';
      
      if (!isAdmin && !isCreator && !isOrganizer) {
        return res.status(403).json({ message: "Only the creator or organizer can create bets" });
      }
      
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
      return res.status(403).json({ message: "Only the creator can delete bets" });
    }
    
    await storage.deleteEventMatch(eventMatchId);
    res.status(204).send();
  });

  app.post(api.eventMatches.createPress.path, isAuthenticated, async (req, res) => {
    const parentMatchId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    
    try {
      // Get the parent event match to find the main match
      const parentEventMatch = await storage.getEventMatch(parentMatchId);
      if (!parentEventMatch) {
        return res.status(404).json({ message: "Parent match not found" });
      }
      
      const match = await storage.getMatch(parentEventMatch.eventId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      
      const isAdmin = userId === ADMIN_USER_ID;
      const isCreator = match.creatorId === userId;
      const matchRole = await storage.getMatchRole(parentEventMatch.eventId, userId);
      const isOrganizer = matchRole?.role === 'organizer';
      
      if (!isAdmin && !isCreator && !isOrganizer) {
        return res.status(403).json({ message: "Only the creator or organizer can create presses" });
      }
      
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
    const user = req.user as any;
    const userId = user.claims.sub;
    
    try {
      const eventMatch = await storage.getEventMatch(eventMatchId);
      if (!eventMatch) return res.status(404).json({ message: "Event match not found" });
      
      const match = await storage.getMatch(eventMatch.eventId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      
      const isAdmin = userId === ADMIN_USER_ID;
      const isCreator = match.creatorId === userId;
      const matchRole = await storage.getMatchRole(eventMatch.eventId, userId);
      const isOrganizer = matchRole?.role === 'organizer';
      
      if (!isAdmin && !isCreator && !isOrganizer) {
        return res.status(403).json({ message: "Only the creator or organizer can change auto press settings" });
      }
      
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
    const matchRole = await storage.getMatchRole(eventMatch.eventId, userId);
    const isOrganizer = matchRole?.role === 'organizer';
    
    if (!isAdmin && !isCreator && !isOrganizer) {
      return res.status(403).json({ message: "Only the creator or organizer can change net scoring" });
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

  app.patch(api.eventMatches.updateUnitAmount.path, isAuthenticated, async (req, res) => {
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
    const matchRole = await storage.getMatchRole(eventMatch.eventId, userId);
    const isOrganizer = matchRole?.role === 'organizer';
    
    if (!isAdmin && !isCreator && !isOrganizer) {
      return res.status(403).json({ message: "Only the creator or organizer can change the wager amount" });
    }
    
    try {
      const input = api.eventMatches.updateUnitAmount.input.parse(req.body);
      const updated = await storage.updateEventMatchUnitAmount(eventMatchId, input.unitAmount);
      const withTeams = await storage.getEventMatchWithTeams(updated.id);
      res.json(withTeams);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Replicate event match to sibling Ryder Cup day containers
  app.post(api.eventMatches.replicateToSiblingDays.path, isAuthenticated, async (req, res) => {
    const eventMatchId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    
    try {
      // Get the event match with teams
      const sourceEventMatch = await storage.getEventMatchWithTeams(eventMatchId);
      if (!sourceEventMatch) {
        return res.status(404).json({ message: "Event match not found" });
      }
      
      // Get the parent match (container)
      const sourceMatch = await storage.getMatch(sourceEventMatch.eventId);
      if (!sourceMatch) {
        return res.status(404).json({ message: "Match not found" });
      }
      
      // Check if this is a Ryder Cup side match
      if (!sourceMatch.ryderCupEventId || !sourceMatch.ryderCupDayNumber) {
        return res.status(400).json({ message: "This match is not part of a Ryder Cup event" });
      }
      
      // Permission check
      const isAdmin = userId === ADMIN_USER_ID;
      const isCreator = sourceMatch.creatorId === userId;
      const matchRole = await storage.getMatchRole(sourceMatch.id, userId);
      const isOrganizer = matchRole?.role === 'organizer';
      
      if (!isAdmin && !isCreator && !isOrganizer) {
        return res.status(403).json({ message: "Only the creator or organizer can replicate betting games" });
      }
      
      // Get all sibling side match containers for this Ryder Cup event
      const siblingMatches = await storage.getMatchesByRyderCupEvent(sourceMatch.ryderCupEventId);
      
      // Get the Ryder Cup event to check day dates
      const ryderCupEvent = await storage.getRyderCupEventFull(sourceMatch.ryderCupEventId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Filter to sibling containers that are for today or future days only
      const siblingContainers = siblingMatches.filter(m => {
        if (m.id === sourceMatch.id) return false;
        if (!m.name?.includes("Side Matches")) return false;
        
        // Check if the day is today or in the future
        if (ryderCupEvent && m.ryderCupDayNumber) {
          const dayData = ryderCupEvent.days?.find((d: any) => d.dayNumber === m.ryderCupDayNumber);
          if (dayData?.date) {
            const dayDate = new Date(dayData.date);
            dayDate.setHours(0, 0, 0, 0);
            return dayDate >= today;
          }
        }
        // Include if no date info available
        return true;
      });
      
      if (siblingContainers.length === 0) {
        return res.status(400).json({ message: "No future day containers found to replicate to" });
      }
      
      let replicatedCount = 0;
      
      for (const siblingContainer of siblingContainers) {
        // Get players from sibling container
        const siblingPlayers = await storage.getMatchPlayers(siblingContainer.id);
        
        // Map player names from source to sibling player IDs
        const teamAPlayerIds: number[] = [];
        const teamBPlayerIds: number[] = [];
        
        if (sourceEventMatch.teams && sourceEventMatch.teams.length >= 2) {
          // Get source player names from teams
          const sourceTeamA = sourceEventMatch.teams[0];
          const sourceTeamB = sourceEventMatch.teams[1];
          
          // Map to sibling player IDs by name
          for (const member of sourceTeamA.members || []) {
            const siblingPlayer = siblingPlayers.find((p: { name: string }) => p.name === member.player?.name);
            if (siblingPlayer) {
              teamAPlayerIds.push(siblingPlayer.id);
            }
          }
          
          for (const member of sourceTeamB.members || []) {
            const siblingPlayer = siblingPlayers.find((p: { name: string }) => p.name === member.player?.name);
            if (siblingPlayer) {
              teamBPlayerIds.push(siblingPlayer.id);
            }
          }
        }
        
        // Only create if we have valid teams
        if (teamAPlayerIds.length > 0 && teamBPlayerIds.length > 0) {
          await storage.createEventMatch(siblingContainer.id, {
            name: sourceEventMatch.name,
            matchType: sourceEventMatch.matchType,
            unitAmount: sourceEventMatch.unitAmount,
            autoPressOriginal: sourceEventMatch.autoPressOriginal,
            autoPressAllPresses: sourceEventMatch.autoPressAllPresses,
            autoPressNassauFront9: sourceEventMatch.autoPressNassauFront9,
            autoPressNassauBack9: sourceEventMatch.autoPressNassauBack9,
            autoPressNassauOverall: sourceEventMatch.autoPressNassauOverall,
            useNetScoring: sourceEventMatch.useNetScoring,
            startOnBack9: sourceEventMatch.startOnBack9,
            teamA: {
              name: sourceEventMatch.teams?.[0]?.name || "Team A",
              playerIds: teamAPlayerIds,
            },
            teamB: {
              name: sourceEventMatch.teams?.[1]?.name || "Team B",
              playerIds: teamBPlayerIds,
            },
          });
          replicatedCount++;
        }
      }
      
      // Mark the source event match as replicated
      if (replicatedCount > 0) {
        await storage.markEventMatchReplicated(eventMatchId);
      }
      
      res.json({
        replicatedCount,
        message: replicatedCount > 0 
          ? `Replicated betting game to ${replicatedCount} future day${replicatedCount !== 1 ? 's' : ''}`
          : "No future days to replicate to",
      });
    } catch (err) {
      console.error("Error replicating event match:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Ledger Route
  app.get(api.ledger.get.path, isAuthenticated, async (req, res) => {
    try {
      const startDate = req.query.start ? new Date(req.query.start as string) : undefined;
      const endDate = req.query.end ? new Date(req.query.end as string) : undefined;
      
      const ledgerData = await storage.getLedgerData(startDate, endDate);
      
      // Get stored event match results for all event matches
      const eventMatchIds = (ledgerData.eventMatches || []).map((em: any) => em.id);
      const storedResults = await storage.getEventMatchResultsByEventMatchIds(eventMatchIds);
      
      res.json({
        ...ledgerData,
        storedResults,
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Event Match Results Routes - for storing calculated bet results
  app.get(api.eventMatchResults.get.path, isAuthenticated, async (req, res) => {
    try {
      const eventMatchId = parseInt(req.params.id);
      const results = await storage.getEventMatchResults(eventMatchId);
      res.json(results);
    } catch (err) {
      console.error("Error fetching event match results:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.eventMatchResults.save.path, isAuthenticated, async (req, res) => {
    try {
      const eventMatchId = parseInt(req.params.id);
      const user = req.user as any;
      const userId = user.claims.sub;
      
      // Get the event match to check permissions
      const eventMatch = await storage.getEventMatch(eventMatchId);
      if (!eventMatch) {
        return res.status(404).json({ message: "Event match not found" });
      }
      
      // Get the parent match (eventId references the matches table)
      const match = await storage.getMatch(eventMatch.eventId);
      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }
      
      // Check if user is admin, creator, or organizer
      const isAdmin = await storage.isUserAdmin(userId);
      const isCreator = match.creatorId === userId;
      const matchRole = await storage.getMatchRole(match.id, userId);
      const isOrganizer = matchRole?.role === 'organizer';
      
      // Check if user is a participant (allow any participant to save results after scoring)
      const matchPlayers = await storage.getMatchPlayers(match.id);
      const isParticipant = matchPlayers.some(p => p.userId === userId);
      
      if (!isAdmin && !isCreator && !isOrganizer && !isParticipant) {
        return res.status(403).json({ message: "Only match participants, organizers, or creators can save results" });
      }
      
      const input = api.eventMatchResults.save.input.parse(req.body);
      
      // Get the event match with teams to validate player IDs
      const eventMatchWithTeams = await storage.getEventMatchWithTeams(eventMatchId);
      if (!eventMatchWithTeams) {
        return res.status(404).json({ message: "Event match not found" });
      }
      
      // Build set of valid player IDs from the event match teams
      const validPlayerIds = new Set<number>();
      for (const team of eventMatchWithTeams.teams || []) {
        for (const member of team.members || []) {
          validPlayerIds.add(member.playerId);
        }
      }
      
      // Validate that all submitted results have valid player IDs from this event match
      for (const result of input) {
        if (!validPlayerIds.has(result.playerId)) {
          return res.status(400).json({ 
            message: `Invalid player ID ${result.playerId} - player is not part of this event match` 
          });
        }
      }
      
      // Ensure all results have the correct eventMatchId and amounts are in cents
      const resultsWithId = input.map(r => ({
        ...r,
        eventMatchId,
      }));
      
      const saved = await storage.saveEventMatchResults(eventMatchId, resultsWithId);
      res.json(saved);
    } catch (err) {
      console.error("Error saving event match results:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.eventMatchResults.delete.path, isAuthenticated, async (req, res) => {
    try {
      const eventMatchId = parseInt(req.params.id);
      const user = req.user as any;
      const userId = user.claims.sub;
      
      // Get the event match to check permissions
      const eventMatch = await storage.getEventMatch(eventMatchId);
      if (!eventMatch) {
        return res.status(404).json({ message: "Event match not found" });
      }
      
      // Get the parent match (eventId references the matches table)
      const match = await storage.getMatch(eventMatch.eventId);
      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }
      
      // Only admin, creator, or organizer can delete results
      const isAdmin = await storage.isUserAdmin(userId);
      const isCreator = match.creatorId === userId;
      const matchRole = await storage.getMatchRole(match.id, userId);
      const isOrganizer = matchRole?.role === 'organizer';
      
      if (!isAdmin && !isCreator && !isOrganizer) {
        return res.status(403).json({ message: "Only organizers or creators can delete results" });
      }
      
      await storage.deleteEventMatchResults(eventMatchId);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting event match results:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Preset Players Routes
  app.get(api.presetPlayers.list.path, isAuthenticated, async (req, res) => {
    const allPresets = await db.select().from(presetPlayers).orderBy(presetPlayers.name);
    const claimedList = await storage.getPresetPlayersClaimed();
    const claimedMap = new Map(claimedList.map(c => [c.presetPlayerName, c]));

    const { PLAYER_ALIASES } = await import("@shared/models/auth");
    const aliasesMap: Record<string, string[]> = {};
    for (const [alias, canonical] of Object.entries(PLAYER_ALIASES)) {
      if (!aliasesMap[canonical]) aliasesMap[canonical] = [];
      aliasesMap[canonical].push(alias);
    }
    const dbAliases = await db.select().from(playerAliases);
    for (const dbAlias of dbAliases) {
      if (!aliasesMap[dbAlias.canonicalName]) aliasesMap[dbAlias.canonicalName] = [];
      if (!aliasesMap[dbAlias.canonicalName].includes(dbAlias.alias.toLowerCase())) {
        aliasesMap[dbAlias.canonicalName].push(dbAlias.alias.toLowerCase());
      }
    }

    const result = allPresets.map(p => ({
      id: p.id,
      name: p.name,
      claimedByUserId: claimedMap.get(p.name)?.userId || null,
      claimedByName: claimedMap.get(p.name)?.userName || null,
      aliases: aliasesMap[p.name] || [],
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
      
      // Check if player exists in database (includes dynamically added players)
      const exists = await storage.presetPlayerExists(playerName);
      if (!exists) {
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

  app.put(api.presetPlayers.rename.path, isAuthenticated, async (req, res) => {
    try {
      const oldName = decodeURIComponent(req.params.name);
      const input = api.presetPlayers.rename.input.parse(req.body);
      
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
      
      const firstName = input.firstName.trim();
      const lastName = input.lastName.trim();
      const displayName = input.displayName.trim(); // This becomes preset_player_name
      
      // Check if player already exists
      const exists = await storage.presetPlayerExists(displayName);
      if (exists) {
        return res.status(409).json({ message: `"${displayName}" already exists. Please choose a different name or select it from the list.` });
      }
      
      // Create the preset player with showInRoster: false
      await storage.createPresetPlayer(displayName, false);
      
      // Save aliases if provided
      if (input.aliases && input.aliases.length > 0) {
        await storage.setPlayerAliases(displayName, input.aliases);
      }
      
      // Claim it for the current user and update their name fields
      const updatedUser = await storage.claimPresetPlayerWithName(userId, displayName, firstName, lastName);
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

  // Match Handicapped Status (creator only)
  app.patch(api.matches.updateHandicapped.path, isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      
      const isAdmin = userId === ADMIN_USER_ID;
      const isCreator = match.creatorId === userId;
      
      if (!isAdmin && !isCreator) {
        return res.status(403).json({ message: "Only the creator can change handicapped mode" });
      }
      
      const input = api.matches.updateHandicapped.input.parse(req.body);
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
      const matchRole = await storage.getMatchRole(matchId, userId);
      const isOrganizer = matchRole?.role === 'organizer';
      
      if (!isAdmin && !isCreator && !isOrganizer) {
        return res.status(403).json({ message: "Only the creator or organizer can update handicaps" });
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

  // Update player tee for a match (creator or organizer)
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
      
      // Creator, admin, or organizer can update player tees
      const isAdmin = userId === ADMIN_USER_ID;
      const isCreator = match.creatorId === userId;
      const matchRole = await storage.getMatchRole(matchId, userId);
      const isOrganizer = matchRole?.role === 'organizer';
      
      if (!isAdmin && !isCreator && !isOrganizer) {
        return res.status(403).json({ message: "Only the creator or organizer can update player tees" });
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

  // Match Roles - list roles for a match
  app.get(api.matches.listRoles.path, isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });

      const roles = await storage.listMatchRoles(matchId);
      const rolesWithUsers = await Promise.all(
        roles.map(async (role) => {
          const user = await storage.getUser(role.userId);
          return {
            ...role,
            user: user ? {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              presetPlayerName: user.presetPlayerName,
            } : null,
          };
        })
      );
      res.json(rolesWithUsers);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Match Roles - upsert role (only creator can manage roles)
  app.post(api.matches.upsertRole.path, isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      
      // Only creator can manage roles
      if (match.creatorId !== userId) {
        return res.status(403).json({ message: "Only the creator can manage roles" });
      }
      
      const input = api.matches.upsertRole.input.parse(req.body);
      const role = await storage.upsertMatchRole(matchId, input.userId, input.role);
      res.json(role);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Match Roles - delete role (only creator can manage roles)
  app.delete(api.matches.deleteRole.path, isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const targetUserId = req.params.userId;
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      
      // Only creator can manage roles
      if (match.creatorId !== userId) {
        return res.status(403).json({ message: "Only the creator can manage roles" });
      }
      
      await storage.deleteMatchRole(matchId, targetUserId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Match Roles - get current user's role for a match
  app.get(api.matches.getMyRole.path, isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });
      
      // Check if creator
      if (match.creatorId === userId) {
        return res.json({ role: 'creator' });
      }
      
      // Check for explicit role
      const matchRole = await storage.getMatchRole(matchId, userId);
      if (matchRole) {
        return res.json({ role: matchRole.role as 'organizer' | 'viewer' });
      }
      
      // Check if player in the match
      const players = await storage.getMatchPlayers(matchId);
      const isPlayer = players.some(p => p.userId === userId);
      if (isPlayer) {
        return res.json({ role: 'player' });
      }
      
      res.json({ role: 'none' });
    } catch (err) {
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
        yardage: input.yardage || null,
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
            yardage: tee.total_yards ? Math.round(tee.total_yards) : null,
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

  // === GROUP ROUTES ===
  
  app.get(api.groups.list.path, isAuthenticated, async (req, res) => {
    const allGroups = await storage.getGroups();
    res.json(allGroups);
  });

  app.get(api.groups.myGroups.path, isAuthenticated, async (req, res) => {
    const user = req.user as any;
    const userId = user.claims.sub;
    const myGroups = await storage.getGroupsForUser(userId);
    res.json(myGroups);
  });

  app.post(api.groups.joinByCode.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.groups.joinByCode.input.parse(req.body);
      const user = req.user as any;
      const userId = user.claims.sub;
      const group = await storage.getGroupByInviteCode(input.inviteCode.toUpperCase());
      if (!group) {
        return res.status(404).json({ message: "Invalid invite code" });
      }
      const existing = await storage.getGroupMembership(group.id, userId);
      if (existing) {
        return res.status(400).json({ message: "You are already a member of this group" });
      }
      await storage.addGroupMember(group.id, userId, 'member');
      res.json(group);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.groups.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.groups.create.input.parse(req.body);
      const user = req.user as any;
      const userId = user.claims.sub;
      const group = await storage.createGroupWithMembership(input.name, input.description || null, userId);
      res.status(201).json(group);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.groups.get.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const group = await storage.getGroupById(groupId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    
    const user = req.user as any;
    const userId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, userId);
    const members = await storage.getGroupMembers(groupId);
    const groupPlayers = await storage.getGroupPlayers(groupId);
    const pendingRequests = membership?.role === 'admin' 
      ? await storage.getPendingJoinRequests(groupId) 
      : [];
    
    res.json({
      ...group,
      role: membership?.role || null,
      members,
      players: groupPlayers,
      pendingRequests,
    });
  });

  app.patch(api.groups.update.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, userId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can update group settings" });
    }
    try {
      const input = api.groups.update.input.parse(req.body);
      const updated = await storage.updateGroup(groupId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.groups.delete.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, userId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can delete groups" });
    }
    await storage.deleteGroup(groupId);
    res.status(204).send();
  });

  app.get(api.groups.members.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const members = await storage.getGroupMembers(groupId);
    res.json(members);
  });

  app.post(api.groups.addMember.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, userId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can add members" });
    }
    try {
      const input = api.groups.addMember.input.parse(req.body);
      const existing = await storage.getGroupMembership(groupId, input.userId);
      if (existing) {
        return res.status(400).json({ message: "User is already a member of this group" });
      }
      const member = await storage.addGroupMember(groupId, input.userId, input.role);
      res.status(201).json(member);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.groups.removeMember.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    const targetUserId = req.params.userId;
    const group = await storage.getGroupById(groupId);
    if (group && group.createdBy === targetUserId && userId === targetUserId) {
      return res.status(403).json({ message: "The group creator cannot leave the group" });
    }
    if (group && group.createdBy === targetUserId && userId !== targetUserId) {
      return res.status(403).json({ message: "The group creator cannot be removed" });
    }
    const membership = await storage.getGroupMembership(groupId, userId);
    if ((!membership || membership.role !== 'admin') && userId !== targetUserId) {
      return res.status(403).json({ message: "Only group admins can remove members" });
    }
    await storage.removeGroupMember(groupId, targetUserId);
    res.status(204).send();
  });

  app.patch(api.groups.updateMemberRole.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    const targetUserId = req.params.userId;
    const group = await storage.getGroupById(groupId);
    if (group && group.createdBy === targetUserId) {
      return res.status(403).json({ message: "The group creator's role cannot be changed" });
    }
    const membership = await storage.getGroupMembership(groupId, userId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can change roles" });
    }
    try {
      const input = api.groups.updateMemberRole.input.parse(req.body);
      const updated = await storage.updateGroupMemberRole(groupId, targetUserId, input.role);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.groups.requestJoin.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    const existing = await storage.getGroupMembership(groupId, userId);
    if (existing) {
      return res.status(400).json({ message: "You are already a member of this group" });
    }
    const request = await storage.createJoinRequest(groupId, userId);
    res.status(201).json(request);
  });

  app.get(api.groups.pendingRequests.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, userId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can view pending requests" });
    }
    const requests = await storage.getPendingJoinRequests(groupId);
    res.json(requests);
  });

  app.patch(api.groups.resolveRequest.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const requestId = parseInt(req.params.requestId);
    const user = req.user as any;
    const userId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, userId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can resolve join requests" });
    }
    try {
      const input = api.groups.resolveRequest.input.parse(req.body);
      const updated = await storage.resolveJoinRequest(requestId, input.status);
      if (input.status === 'approved') {
        await storage.addGroupMember(groupId, updated.userId, 'member');
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.groups.regenerateInviteCode.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, userId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can regenerate invite codes" });
    }
    const updated = await storage.regenerateInviteCode(groupId);
    res.json(updated);
  });

  app.get(api.groups.players.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const groupPlayersList = await storage.getGroupPlayers(groupId);
    res.json(groupPlayersList);
  });

  app.post(api.groups.addPlayer.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, userId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can add players" });
    }
    try {
      const input = api.groups.addPlayer.input.parse(req.body);
      const gp = await storage.addGroupPlayer(groupId, input.presetPlayerId, userId);
      res.status(201).json(gp);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.groups.addPlayersBulk.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, userId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can add players" });
    }
    try {
      const input = api.groups.addPlayersBulk.input.parse(req.body);
      const results = [];
      for (const presetPlayerId of input.presetPlayerIds) {
        try {
          const gp = await storage.addGroupPlayer(groupId, presetPlayerId, userId);
          results.push(gp);
        } catch (err) {
        }
      }
      res.status(201).json(results);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.groups.invitePlayer.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, userId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can invite players" });
    }
    try {
      const input = api.groups.invitePlayer.input.parse(req.body);

      let presetPlayer = await storage.getPresetPlayerByName(input.name);
      if (!presetPlayer) {
        presetPlayer = await storage.createPresetPlayer(input.name);
      }

      try {
        await storage.addGroupPlayer(groupId, presetPlayer.id, userId);
      } catch (err: any) {
        if (!err.message?.includes('already') && !err.message?.includes('duplicate')) {
          throw err;
        }
      }

      res.status(201).json({
        presetPlayer,
        message: 'Player added to group'
      });
    } catch (err: any) {
      console.error('[Group Invite] Error:', err.message);
      res.status(400).json({ message: err.message });
    }
  });

  app.delete(api.groups.removePlayer.path, isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const presetPlayerId = parseInt(req.params.presetPlayerId);
    const user = req.user as any;
    const userId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, userId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can remove players" });
    }
    await storage.removeGroupPlayer(groupId, presetPlayerId);
    res.status(204).send();
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

  app.patch(api.ryderCup.updateStatus.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const input = api.ryderCup.updateStatus.input.parse(req.body);
      const event = await storage.getRyderCupEvent(id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      
      const updated = await storage.updateRyderCupEventStatus(id, input.status);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
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

  app.patch(api.ryderCup.updateClosestToHolePayout.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const input = api.ryderCup.updateClosestToHolePayout.input.parse(req.body);
      const event = await storage.getRyderCupEvent(id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      
      const updated = await storage.updateRyderCupEventClosestToHolePayout(id, input.closestToHolePayout);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.ryderCup.updatePayouts.path, isAuthenticated, async (req, res) => {
    const id = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    try {
      const input = api.ryderCup.updatePayouts.input.parse(req.body);
      const event = await storage.getRyderCupEvent(id);
      if (!event) return res.status(404).json({ message: "Event not found" });
      
      const currentUser = await storage.getUser(userId);
      if (event.creatorId !== userId && !currentUser?.isAdmin) {
        return res.status(403).json({ message: "Only the event creator can update payouts" });
      }
      
      const updated = await storage.updateRyderCupEventPayouts(id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.ryderCup.updateTeam.path, isAuthenticated, async (req, res) => {
    const teamId = parseInt(req.params.teamId);
    const user = req.user as any;
    const userId = user.claims.sub;
    try {
      const input = api.ryderCup.updateTeam.input.parse(req.body);
      const team = await storage.getRyderCupTeam(teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });
      
      // Get the event to check authorization
      const event = await storage.getRyderCupEvent(team.eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      
      // Get current user to check admin status
      const currentUser = await storage.getUser(userId);
      
      // Only creator or admin can update team names
      if (event.creatorId !== userId && !currentUser?.isAdmin) {
        return res.status(403).json({ message: "Only the creator or admin can update team names" });
      }
      
      const updated = await storage.updateRyderCupTeam(teamId, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.ryderCup.updateTeamMemberHandicap.path, isAuthenticated, async (req, res) => {
    const memberId = parseInt(req.params.memberId);
    try {
      const input = api.ryderCup.updateTeamMemberHandicap.input.parse(req.body);
      const updated = await storage.updateRyderCupTeamMemberHandicap(memberId, input.handicapIndex);
      if (!updated) return res.status(404).json({ message: "Team member not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.ryderCup.updateTeamMemberName.path, isAuthenticated, async (req, res) => {
    const memberId = parseInt(req.params.memberId);
    try {
      const input = api.ryderCup.updateTeamMemberName.input.parse(req.body);
      const updated = await storage.updateRyderCupTeamMemberName(memberId, input.playerName);
      if (!updated) return res.status(404).json({ message: "Team member not found" });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.ryderCup.replacePlayer.path, isAuthenticated, async (req, res) => {
    const eventId = parseInt(req.params.id);
    console.log("Replace player request body:", JSON.stringify(req.body));
    try {
      const input = api.ryderCup.replacePlayer.input.parse(req.body);
      const event = await storage.getRyderCupEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });

      const result = await storage.replacePlayerInRyderCupEvent(eventId, input.oldPresetPlayerId, input.newPresetPlayerId);
      res.json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        console.log("Zod validation error:", JSON.stringify(err.errors));
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
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

  app.post(api.ryderCup.recalculateResults.path, isAuthenticated, async (req, res) => {
    const eventId = parseInt(req.params.eventId);
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const event = await storage.getRyderCupEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      const isAdmin = await storage.isUserAdmin(userId);
      if (event.creatorId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only event creator or admin can recalculate results" });
      }
      
      // Get full event data
      const fullEvent = await storage.getRyderCupEventFull(eventId);
      if (!fullEvent) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      let updatedCount = 0;
      
      // Get all team members for handicap fallback
      const allTeamMembers = fullEvent.teams.flatMap(t => t.members || []);
      
      // Process each day and pairing
      for (const day of fullEvent.days) {
        const courseHoles = day.courseId ? await storage.getCourseHoles(day.courseId) : [];
        const courseTees = day.courseId ? await storage.getCourseTees(day.courseId) : [];
        
        // Calculate course par from holes
        const coursePar = courseHoles.length > 0
          ? courseHoles.reduce((sum, h) => sum + (h.par ?? 0), 0)
          : null;
        
        for (const pairing of day.pairings) {
          if (pairing.sides.length !== 2) continue;
          
          const sideA = pairing.sides[0];
          const sideB = pairing.sides[1];
          
          // Calculate course handicaps using full USGA formula:
          // Course Handicap = Handicap Index × (Slope Rating ÷ 113) + (Course Rating - Par)
          const getPlayerCourseHcp = (s: typeof sideA, playerNum: 1 | 2): number | null => {
            // First check pairing-specific handicap
            let hcpTenths = playerNum === 1 ? s.player1HandicapIndex : s.player2HandicapIndex;
            const teeId = playerNum === 1 ? s.player1TeeId : s.player2TeeId;
            
            // Fall back to team member handicap if not set on pairing
            if (hcpTenths === null || hcpTenths === undefined) {
              const playerName = playerNum === 1 ? s.player1Name : s.player2Name;
              if (playerName) {
                const member = allTeamMembers.find(m => m.playerName === playerName);
                hcpTenths = member?.handicapIndex ?? null;
              }
            }
            
            if (hcpTenths === null || hcpTenths === undefined) return null;
            const handicapIndex = hcpTenths / 10;
            // Fall back to first tee if player's tee not found in this course
            const tee = (teeId ? courseTees.find(t => t.id === teeId) : null) ?? courseTees[0];
            const slopeRating = tee?.slopeRating || 113;
            const slopeAdjustment = handicapIndex * (slopeRating / 113);
            
            // Add course rating adjustment if available
            let courseRatingAdjustment = 0;
            const courseRating = tee?.courseRating;
            if (courseRating !== null && courseRating !== undefined && coursePar !== null) {
              const ratingValue = courseRating / 10; // Course rating stored as tenths
              courseRatingAdjustment = ratingValue - coursePar;
            }
            
            return Math.round(slopeAdjustment + courseRatingAdjustment);
          };
          
          const courseHcps = [
            getPlayerCourseHcp(sideA, 1),
            getPlayerCourseHcp(sideA, 2),
            getPlayerCourseHcp(sideB, 1),
            getPlayerCourseHcp(sideB, 2),
          ].filter((h): h is number => h !== null);
          
          const lowHandicap = courseHcps.length > 0 ? Math.min(...courseHcps) : 0;
          
          const getStrokesOnHole = (courseHcp: number | null, holeHcp: number): number => {
            if (courseHcp === null || !pairing.useNetScoring) return 0;
            const relativeHcp = courseHcp - lowHandicap;
            if (relativeHcp <= 0) return 0;
            let strokes = 0;
            if (holeHcp <= relativeHcp) strokes++;
            if (relativeHcp > 18 && holeHcp <= (relativeHcp - 18)) strokes++;
            return strokes;
          };
          
          type HoleResult = { winner: 'A' | 'B' | null; complete: boolean };
          const holeResults: HoleResult[] = [];
          
          for (let hole = 1; hole <= 18; hole++) {
            const holeData = courseHoles.find(h => h.holeNumber === hole);
            const holeHcp = holeData?.handicap || hole;
            
            const scoreA = sideA.scores.find(s => s.holeNumber === hole);
            const scoreB = sideB.scores.find(s => s.holeNumber === hole);
            
            const getBestNet = (s: typeof sideA, score: typeof scoreA): number | null => {
              if (!score) return null;
              let best: number | null = null;
              
              if (score.player1Strokes !== null && s.player1Name) {
                const courseHcp = getPlayerCourseHcp(s, 1);
                const strokes = getStrokesOnHole(courseHcp, holeHcp);
                const net = score.player1Strokes - strokes;
                if (best === null || net < best) best = net;
              }
              if (score.player2Strokes !== null && s.player2Name) {
                const courseHcp = getPlayerCourseHcp(s, 2);
                const strokes = getStrokesOnHole(courseHcp, holeHcp);
                const net = score.player2Strokes - strokes;
                if (best === null || net < best) best = net;
              }
              return best;
            };
            
            const bestA = getBestNet(sideA, scoreA);
            const bestB = getBestNet(sideB, scoreB);
            
            let winner: 'A' | 'B' | null = null;
            let complete = false;
            
            if (bestA !== null && bestB !== null) {
              complete = true;
              if (bestA < bestB) winner = 'A';
              else if (bestB < bestA) winner = 'B';
            }
            
            holeResults.push({ winner, complete });
          }
          
          // Calculate running score
          let score = 0;
          let decidedOnHole: number | null = null;
          let allHolesComplete = true;
          
          for (let hole = 1; hole <= 18; hole++) {
            const result = holeResults[hole - 1];
            
            if (!result.complete) {
              allHolesComplete = false;
              break;
            }
            
            if (result.winner === 'A') score++;
            else if (result.winner === 'B') score--;
            
            const holesRemaining = 18 - hole;
            const lead = Math.abs(score);
            // Only consider match "clinched" if decided before hole 18
            if (hole < 18 && lead > holesRemaining) {
              decidedOnHole = hole;
              break;
            }
          }
          
          const isDecided = decidedOnHole !== null || (allHolesComplete && holeResults.every(r => r.complete));
          
          if (isDecided) {
            let winningSideId: number | undefined = undefined;
            let winningMargin: string | undefined = undefined;
            
            if (score > 0) {
              winningSideId = sideA.id;
            } else if (score < 0) {
              winningSideId = sideB.id;
            }
            
            const lead = Math.abs(score);
            if (decidedOnHole !== null && decidedOnHole < 18) {
              // Match clinched early (before hole 18)
              const holesLeft = 18 - decidedOnHole;
              winningMargin = String(lead) + "&" + String(holesLeft);
            } else if (lead > 0) {
              // Match went full 18 holes
              winningMargin = String(lead) + " up";
            }
            
            await storage.recordPairingResult(pairing.id, { winningSideId, winningMargin });
            updatedCount++;
          }
        }
      }
      
      res.json({ updatedCount });
    } catch (err) {
      console.error("Recalculate results error:", err);
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

  app.post(api.ryderCup.recordClosestToHole.path, isAuthenticated, async (req, res) => {
    const dayId = parseInt(req.params.dayId);
    try {
      const input = api.ryderCup.recordClosestToHole.input.parse(req.body);
      const cth = await storage.recordClosestToHoleWinner(dayId, input.holeNumber, input.winnerName);
      res.json(cth);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.ryderCup.getClosestToHoleWinners.path, isAuthenticated, async (req, res) => {
    const dayId = parseInt(req.params.dayId);
    const winners = await storage.getClosestToHoleWinners(dayId);
    res.json(winners);
  });

  app.get(api.ryderCup.getAllClosestToHoleWinners.path, isAuthenticated, async (req, res) => {
    const eventId = parseInt(req.params.id);
    const winners = await storage.getAllClosestToHoleWinners(eventId);
    res.json(winners);
  });

  app.get(api.ryderCup.getSideMatches.path, isAuthenticated, async (req, res) => {
    const eventId = parseInt(req.params.id);
    const matches = await storage.getMatchesByRyderCupEvent(eventId);
    res.json(matches);
  });

  app.get(api.ryderCup.getSideMatchLedger.path, isAuthenticated, async (req, res) => {
    const eventId = parseInt(req.params.id);
    try {
      const ledgerData = await storage.getSideMatchLedgerData(eventId);
      
      // Get stored event match results for all event matches in this Ryder Cup
      const eventMatchIds = (ledgerData.eventMatches || []).map((em: any) => em.id);
      const storedResults = await storage.getEventMatchResultsByEventMatchIds(eventMatchIds);
      
      res.json({
        ...ledgerData,
        storedResults,
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.ryderCup.updateDayCourse.path, isAuthenticated, async (req, res) => {
    const dayId = parseInt(req.params.dayId);
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const input = api.ryderCup.updateDayCourse.input.parse(req.body);
      
      // Get the day and check permissions
      const day = await storage.getRyderCupDay(dayId);
      if (!day) {
        return res.status(404).json({ message: "Day not found" });
      }
      
      // Get the event to check if user is creator or admin
      const event = await storage.getRyderCupEvent(day.eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      const isAdmin = await storage.isUserAdmin(userId);
      if (event.creatorId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only event creator or admin can update course" });
      }
      
      const updatedDay = await storage.updateRyderCupDayCourse(dayId, input.courseId, input.courseName);
      res.json(updatedDay);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update day schedule (date and tee times)
  app.patch(api.ryderCup.updateDaySchedule.path, isAuthenticated, async (req, res) => {
    const dayId = parseInt(req.params.dayId);
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const input = api.ryderCup.updateDaySchedule.input.parse(req.body);
      
      const day = await storage.getRyderCupDay(dayId);
      if (!day) {
        return res.status(404).json({ message: "Day not found" });
      }
      
      const event = await storage.getRyderCupEvent(day.eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      const isAdmin = await storage.isUserAdmin(userId);
      if (event.creatorId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only event creator or admin can update schedule" });
      }
      
      const updatedDay = await storage.updateRyderCupDaySchedule(dayId, input.date, input.teeTimes);
      res.json(updatedDay);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update day start on back 9 setting
  app.patch(api.ryderCup.updateDayStartOnBack9.path, isAuthenticated, async (req, res) => {
    const dayId = parseInt(req.params.dayId);
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const input = api.ryderCup.updateDayStartOnBack9.input.parse(req.body);
      
      const day = await storage.getRyderCupDay(dayId);
      if (!day) {
        return res.status(404).json({ message: "Day not found" });
      }
      
      const event = await storage.getRyderCupEvent(day.eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      const isAdmin = await storage.isUserAdmin(userId);
      if (event.creatorId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only event creator or admin can update day settings" });
      }
      
      const updatedDay = await storage.updateRyderCupDayStartOnBack9(dayId, input.startOnBack9);
      res.json(updatedDay);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update pairing tee time
  app.patch(api.ryderCup.updatePairingTeeTime.path, isAuthenticated, async (req, res) => {
    const pairingId = parseInt(req.params.pairingId);
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const input = api.ryderCup.updatePairingTeeTime.input.parse(req.body);
      
      const pairing = await storage.getRyderCupPairing(pairingId);
      if (!pairing) {
        return res.status(404).json({ message: "Pairing not found" });
      }
      
      const day = await storage.getRyderCupDay(pairing.dayId);
      if (!day) {
        return res.status(404).json({ message: "Day not found" });
      }
      
      const event = await storage.getRyderCupEvent(day.eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      const isAdmin = await storage.isUserAdmin(userId);
      if (event.creatorId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only event creator or admin can update tee times" });
      }
      
      const updatedPairing = await storage.updateRyderCupPairingTeeTime(pairingId, input.teeTime);
      res.json(updatedPairing);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Reorder pairings for a day
  app.patch(api.ryderCup.reorderPairings.path, isAuthenticated, async (req, res) => {
    const dayId = parseInt(req.params.dayId);
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const input = api.ryderCup.reorderPairings.input.parse(req.body);
      
      const day = await storage.getRyderCupDay(dayId);
      if (!day) {
        return res.status(404).json({ message: "Day not found" });
      }
      
      const event = await storage.getRyderCupEvent(day.eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      const isAdmin = await storage.isUserAdmin(userId);
      if (event.creatorId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only event creator or admin can reorder pairings" });
      }
      
      await storage.reorderRyderCupPairings(dayId, input.pairingOrder);
      res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Update side player tee/handicap
  app.patch(api.ryderCup.updateSidePlayer.path, isAuthenticated, async (req, res) => {
    const sideId = parseInt(req.params.sideId);
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const input = api.ryderCup.updateSidePlayer.input.parse(req.body);
      
      const side = await storage.getRyderCupPairingSide(sideId);
      if (!side) {
        return res.status(404).json({ message: "Side not found" });
      }
      
      const pairing = await storage.getRyderCupPairing(side.pairingId);
      if (!pairing) {
        return res.status(404).json({ message: "Pairing not found" });
      }
      
      const day = await storage.getRyderCupDay(pairing.dayId);
      if (!day) {
        return res.status(404).json({ message: "Day not found" });
      }
      
      const event = await storage.getRyderCupEvent(day.eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      const isAdmin = await storage.isUserAdmin(userId);
      if (event.creatorId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only event creator or admin can update player settings" });
      }
      
      const updatedSide = await storage.updateRyderCupSidePlayer(
        sideId,
        input.playerNumber as 1 | 2,
        input.handicapIndex,
        input.teeId
      );
      res.json(updatedSide);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Save pairing scores
  app.post(api.ryderCup.savePairingScores.path, isAuthenticated, async (req, res) => {
    const sideId = parseInt(req.params.sideId);
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const input = api.ryderCup.savePairingScores.input.parse(req.body);
      
      const side = await storage.getRyderCupPairingSide(sideId);
      if (!side) {
        return res.status(404).json({ message: "Side not found" });
      }
      
      const pairing = await storage.getRyderCupPairing(side.pairingId);
      if (!pairing) {
        return res.status(404).json({ message: "Pairing not found" });
      }
      
      const day = await storage.getRyderCupDay(pairing.dayId);
      if (!day) {
        return res.status(404).json({ message: "Day not found" });
      }
      
      const event = await storage.getRyderCupEvent(day.eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      const isAdmin = await storage.isUserAdmin(userId);
      if (event.creatorId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only event creator or admin can save scores" });
      }
      
      await storage.saveRyderCupPairingScores(sideId, input.scores);
      
      // Use the match result sent from frontend (which calculates it correctly)
      if (input.matchResult?.isComplete) {
        try {
          await storage.recordPairingResult(side.pairingId, {
            winningSideId: input.matchResult.winningSideId ?? undefined,
            winningMargin: input.matchResult.winningMargin ?? undefined,
          });
        } catch (resultErr) {
          console.error("Failed to record match result:", resultErr);
        }
      }
      
      res.json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get pairing scorecard
  app.get(api.ryderCup.getPairingScorecard.path, async (req, res) => {
    const pairingId = parseInt(req.params.pairingId);
    try {
      const scorecard = await storage.getRyderCupPairingScorecard(pairingId);
      if (!scorecard) {
        return res.status(404).json({ message: "Pairing not found" });
      }
      res.json(scorecard);
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Ryder Cup Transaction endpoints
  app.get(api.ryderCup.listTransactions.path, isAuthenticated, async (req, res) => {
    const eventId = parseInt(req.params.id);
    try {
      const event = await storage.getRyderCupEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      const transactions = await storage.getRyderCupTransactions(eventId);
      res.json(transactions.map(t => ({
        ...t,
        createdAt: t.createdAt?.toISOString() || null,
      })));
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.ryderCup.createTransaction.path, isAuthenticated, async (req, res) => {
    const eventId = parseInt(req.params.id);
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const event = await storage.getRyderCupEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      // Only event creator or admin can add transactions
      const isAdmin = await storage.isUserAdmin(userId);
      if (event.creatorId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only event creator or admin can add transactions" });
      }
      
      const input = api.ryderCup.createTransaction.input.parse(req.body);
      const transaction = await storage.createRyderCupTransaction(
        eventId,
        input.payerName,
        input.description,
        input.amount,
        input.splitPlayerNames
      );
      
      res.status(201).json(transaction);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.ryderCup.deleteTransaction.path, isAuthenticated, async (req, res) => {
    const eventId = parseInt(req.params.id);
    const transactionId = parseInt(req.params.transactionId);
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const event = await storage.getRyderCupEvent(eventId);
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }
      
      // Only event creator or admin can delete transactions
      const isAdmin = await storage.isUserAdmin(userId);
      if (event.creatorId !== userId && !isAdmin) {
        return res.status(403).json({ message: "Only event creator or admin can delete transactions" });
      }
      
      const transaction = await storage.getRyderCupTransaction(transactionId);
      if (!transaction || transaction.eventId !== eventId) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      await storage.deleteRyderCupTransaction(transactionId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Profile endpoints
  app.get(api.profile.get.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // Get aliases if user has a preset player name
      let aliases: string[] = [];
      if (currentUser.presetPlayerName) {
        const aliasRecords = await storage.getPlayerAliases(currentUser.presetPlayerName);
        aliases = aliasRecords.map(a => a.alias);
      }
      
      // Get handicap if user has a preset player name
      let handicapIndex: number | null = null;
      if (currentUser.presetPlayerName) {
        const handicapRecord = await storage.getPlayerHandicap(currentUser.presetPlayerName);
        handicapIndex = handicapRecord?.handicapIndex ?? null;
      }
      
      res.json({
        id: currentUser.id,
        email: currentUser.email,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        phone: currentUser.phone,
        phoneVerified: currentUser.phoneVerified ?? false,
        presetPlayerName: currentUser.presetPlayerName,
        aliases,
        handicapIndex,
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.profile.update.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const input = api.profile.update.input.parse(req.body);
      
      // Update user profile
      const updateData: { firstName?: string; lastName?: string; email?: string; phone?: string } = {};
      if (input.firstName !== undefined) updateData.firstName = input.firstName;
      if (input.lastName !== undefined) updateData.lastName = input.lastName;
      if (input.email !== undefined) updateData.email = input.email;
      if (input.phone !== undefined) updateData.phone = input.phone;
      
      const updatedUser = await storage.updateUserProfile(userId, updateData);
      
      // Update aliases if provided and user has preset name
      if (input.aliases !== undefined && updatedUser.presetPlayerName) {
        await storage.setPlayerAliases(updatedUser.presetPlayerName, input.aliases);
      }
      
      // Update handicap if provided and user has preset name
      if (input.handicapIndex !== undefined && updatedUser.presetPlayerName) {
        await storage.upsertPlayerHandicap({ presetPlayerName: updatedUser.presetPlayerName, handicapIndex: input.handicapIndex });
      }
      
      // Return updated profile
      let aliases: string[] = [];
      if (updatedUser.presetPlayerName) {
        const aliasRecords = await storage.getPlayerAliases(updatedUser.presetPlayerName);
        aliases = aliasRecords.map(a => a.alias);
      }
      
      let handicapIndexVal: number | null = null;
      if (updatedUser.presetPlayerName) {
        const handicapRecord = await storage.getPlayerHandicap(updatedUser.presetPlayerName);
        handicapIndexVal = handicapRecord?.handicapIndex ?? null;
      }
      
      res.json({
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phone: updatedUser.phone,
        presetPlayerName: updatedUser.presetPlayerName,
        aliases,
        handicapIndex: handicapIndexVal,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === SMS ROUTES ===
  
  // Rate limiting map for SMS verification (phone -> { lastSent, attempts })
  const smsRateLimits = new Map<string, { lastSent: number; attempts: number }>();
  const SMS_RATE_LIMIT_WINDOW = 60 * 1000; // 60 seconds between sends
  const SMS_MAX_ATTEMPTS = 5; // Max 5 attempts per verification session
  
  app.post(api.sms.sendVerification.path, isAuthenticated, async (req, res) => {
    console.log('[SMS Route] Received send-verification request');
    try {
      const input = api.sms.sendVerification.input.parse(req.body);
      const phone = input.phone;
      console.log(`[SMS Route] Phone: ${phone}`);
      
      // Rate limit check
      const rateLimit = smsRateLimits.get(phone);
      const now = Date.now();
      
      if (rateLimit) {
        const timeSinceLastSend = now - rateLimit.lastSent;
        if (timeSinceLastSend < SMS_RATE_LIMIT_WINDOW) {
          const waitTime = Math.ceil((SMS_RATE_LIMIT_WINDOW - timeSinceLastSend) / 1000);
          console.log(`[SMS Route] Rate limited, wait ${waitTime}s`);
          return res.status(429).json({ 
            message: `Please wait ${waitTime} seconds before requesting another code` 
          });
        }
      }
      
      // Generate and store verification code
      console.log('[SMS Route] Importing twilio module...');
      const { generateVerificationCode, sendVerificationCode } = await import('./twilio');
      console.log('[SMS Route] Twilio module imported');
      const code = generateVerificationCode();
      console.log(`[SMS Route] Generated code: ${code}`);
      await storage.createVerificationCode(phone, code);
      
      console.error(`[SMS Route] Sending verification code to ${phone}`);
      
      // Send the code
      const startTime = Date.now();
      const result = await sendVerificationCode(phone, code);
      const duration = Date.now() - startTime;
      
      console.error(`[SMS Route] Send result (took ${duration}ms):`, JSON.stringify(result));
      
      if (result.success) {
        // Update rate limit tracking
        smsRateLimits.set(phone, { lastSent: now, attempts: 0 });
        res.json({ success: true, message: "Verification code sent", sid: result.sid });
      } else {
        console.error(`[SMS Route] Failed to send: ${result.error}`);
        res.status(500).json({ message: result.error || "Failed to send verification code", details: result.error });
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        console.error('[SMS Route] Zod validation error:', err.errors);
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error('[SMS Route] Error:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.sms.verifyCode.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const input = api.sms.verifyCode.input.parse(req.body);
      const phone = input.phone;
      
      // Check attempt rate limit - initialize if not exists
      let rateLimit = smsRateLimits.get(phone);
      if (!rateLimit) {
        // Initialize attempt tracking even without prior send
        rateLimit = { lastSent: 0, attempts: 0 };
        smsRateLimits.set(phone, rateLimit);
      }
      
      if (rateLimit.attempts >= SMS_MAX_ATTEMPTS) {
        return res.status(429).json({ 
          message: "Too many verification attempts. Please request a new code." 
        });
      }
      
      // Track attempt
      rateLimit.attempts++;
      
      const verified = await storage.verifyCode(input.phone, input.code);
      
      if (verified) {
        // Clear rate limit on success
        smsRateLimits.delete(phone);
        
        // Update user's phone and phoneVerified status
        await storage.updateUserProfile(userId, { 
          phone: phone,
          phoneVerified: true 
        });
      }
      
      res.json({ success: true, verified });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.sms.sendMessage.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.sms.sendMessage.input.parse(req.body);
      const { sendSMS } = await import('./twilio');
      
      const result = await sendSMS(input.to, input.message);
      res.json({ success: result.success, sid: result.sid });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error('SMS send error:', err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === NOTIFICATION PREFERENCES ROUTES ===

  app.get(api.notifications.getPreferences.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const prefs = await storage.getNotificationPreferences(userId);
      
      res.json({
        matchInvitations: prefs?.matchInvitations ?? true,
        scoreUpdates: prefs?.scoreUpdates ?? false,
        betResults: prefs?.betResults ?? true,
        matchReminders: prefs?.matchReminders ?? true,
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put(api.notifications.updatePreferences.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const input = api.notifications.updatePreferences.input.parse(req.body);
      const prefs = await storage.upsertNotificationPreferences(userId, input);
      
      res.json({
        matchInvitations: prefs.matchInvitations ?? true,
        scoreUpdates: prefs.scoreUpdates ?? false,
        betResults: prefs.betResults ?? true,
        matchReminders: prefs.matchReminders ?? true,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === MESSAGE ROUTES ===

  app.get(api.messages.list.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const userMessages = await storage.getMessages(userId);
      
      res.json(userMessages.map(m => ({
        id: m.id,
        matchId: m.matchId,
        senderId: m.senderId,
        senderName: m.senderName,
        recipientId: m.recipientId,
        content: m.content,
        readAt: m.readAt?.toISOString() || null,
        createdAt: m.createdAt?.toISOString() || new Date().toISOString(),
      })));
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.messages.listByMatch.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const matchId = parseInt(req.params.id);
      
      const match = await storage.getMatch(matchId);
      if (!match) {
        return res.status(404).json({ message: "Match not found" });
      }
      
      // Check if user is a participant in the match
      const matchPlayers = await storage.getMatchPlayers(matchId);
      const isAdmin = await storage.isUserAdmin(userId);
      const isCreator = match.creatorId === userId;
      const isPlayer = matchPlayers.some(p => p.userId === userId);
      
      // Also check by preset player name or aliases
      let isParticipantByName = false;
      if (!isPlayer) {
        const currentUser = await storage.getUser(userId);
        if (currentUser?.presetPlayerName) {
          const presetName = currentUser.presetPlayerName.toLowerCase().trim();
          const aliases = await storage.getPlayerAliases(currentUser.presetPlayerName);
          const aliasNames = aliases.map(a => a.alias.toLowerCase().trim());
          isParticipantByName = matchPlayers.some(p => {
            const playerName = p.name.toLowerCase().trim();
            return playerName === presetName || aliasNames.includes(playerName);
          });
        }
      }
      
      // Check for organizer/viewer role
      const matchRole = await storage.getMatchRole(matchId, userId);
      const hasRole = matchRole !== null;
      
      if (!isAdmin && !isCreator && !isPlayer && !isParticipantByName && !hasRole) {
        return res.status(403).json({ message: "Not authorized to view match messages" });
      }
      
      const matchMessages = await storage.getMatchMessages(matchId);
      
      res.json(matchMessages.map(m => ({
        id: m.id,
        matchId: m.matchId,
        senderId: m.senderId,
        senderName: m.senderName,
        recipientId: m.recipientId,
        content: m.content,
        readAt: m.readAt?.toISOString() || null,
        createdAt: m.createdAt?.toISOString() || new Date().toISOString(),
      })));
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.messages.send.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const input = api.messages.send.input.parse(req.body);
      
      // If sending to a match, verify user is a participant
      if (input.matchId) {
        const match = await storage.getMatch(input.matchId);
        if (!match) {
          return res.status(404).json({ message: "Match not found" });
        }
        
        const matchPlayers = await storage.getMatchPlayers(input.matchId);
        const isAdmin = await storage.isUserAdmin(userId);
        const isCreator = match.creatorId === userId;
        const isPlayer = matchPlayers.some(p => p.userId === userId);
        
        // Also check by preset player name or aliases
        let isParticipantByName = false;
        if (!isPlayer) {
          const currentUser = await storage.getUser(userId);
          if (currentUser?.presetPlayerName) {
            const presetName = currentUser.presetPlayerName.toLowerCase().trim();
            const aliases = await storage.getPlayerAliases(currentUser.presetPlayerName);
            const aliasNames = aliases.map(a => a.alias.toLowerCase().trim());
            isParticipantByName = matchPlayers.some(p => {
              const playerName = p.name.toLowerCase().trim();
              return playerName === presetName || aliasNames.includes(playerName);
            });
          }
        }
        
        // Check for organizer/viewer role
        const matchRole = await storage.getMatchRole(input.matchId, userId);
        const hasRole = matchRole !== null;
        
        if (!isAdmin && !isCreator && !isPlayer && !isParticipantByName && !hasRole) {
          return res.status(403).json({ message: "Not authorized to send messages to this match" });
        }
      }
      
      const message = await storage.createMessage(
        userId,
        input.content,
        input.matchId,
        input.recipientId
      );
      
      res.status(201).json({
        id: message.id,
        matchId: message.matchId,
        senderId: message.senderId,
        recipientId: message.recipientId,
        content: message.content,
        createdAt: message.createdAt?.toISOString() || new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.messages.markRead.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const messageId = parseInt(req.params.id);
      
      const success = await storage.markMessageRead(messageId, userId);
      
      if (!success) {
        return res.status(404).json({ message: "Message not found" });
      }
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== MANUAL BETS =====
  
  app.get(api.manualBets.list.path, async (req, res) => {
    try {
      const ryderCupEventId = req.query.ryderCupEventId ? parseInt(req.query.ryderCupEventId as string) : undefined;
      const bets = await storage.getManualBets(ryderCupEventId);
      res.json(bets.map(bet => ({
        ...bet,
        createdAt: bet.createdAt?.toISOString() || null,
      })));
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.post(api.manualBets.create.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = parseInt(user.claims.sub);
      
      const result = api.manualBets.create.input.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: result.error.errors[0].message });
      }
      
      const { description, entries, ryderCupEventId } = result.data;
      
      // Server-side validation: minimum 2 entries
      if (entries.length < 2) {
        return res.status(400).json({ message: "At least 2 players required" });
      }
      
      // Server-side validation: amounts must sum to zero
      const total = entries.reduce((sum, e) => sum + e.amount, 0);
      if (Math.abs(total) > 1) { // Allow for 1 cent rounding difference
        return res.status(400).json({ message: "Bet amounts must sum to zero" });
      }
      
      // Server-side validation: no duplicate players in the same bet
      // Prefer presetPlayerId if available, fallback to playerName
      const playerKeys = entries.map(e => e.presetPlayerId ? `id:${e.presetPlayerId}` : `name:${e.playerName.toLowerCase().trim()}`);
      if (new Set(playerKeys).size !== playerKeys.length) {
        return res.status(400).json({ message: "Duplicate players not allowed in the same bet" });
      }
      
      const bet = await storage.createManualBet(description, entries, isNaN(userId) ? undefined : userId, ryderCupEventId);
      
      res.status(201).json({
        ...bet,
        createdAt: bet.createdAt?.toISOString() || null,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.delete(api.manualBets.delete.path, isAuthenticated, async (req, res) => {
    try {
      const betId = parseInt(req.params.id);
      const success = await storage.deleteManualBet(betId);
      
      if (!success) {
        return res.status(404).json({ message: "Manual bet not found" });
      }
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ===== SETTLEMENTS =====
  
  app.get(api.settlements.list.path, isAuthenticated, async (req, res) => {
    try {
      const settlements = await storage.getSettlements();
      res.json(settlements.map(s => ({
        ...s,
        createdAt: s.createdAt?.toISOString() || null,
        completedAt: s.completedAt?.toISOString() || null,
        payments: s.payments.map(p => ({
          ...p,
          completedAt: p.completedAt?.toISOString() || null,
        })),
      })));
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.get(api.settlements.active.path, isAuthenticated, async (req, res) => {
    try {
      const eventId = req.query.eventId ? parseInt(req.query.eventId as string) : undefined;
      const settlement = await storage.getActiveSettlement(eventId);
      if (!settlement) {
        return res.json(null);
      }
      res.json({
        ...settlement,
        createdAt: settlement.createdAt?.toISOString() || null,
        completedAt: settlement.completedAt?.toISOString() || null,
        payments: settlement.payments.map(p => ({
          ...p,
          completedAt: p.completedAt?.toISOString() || null,
        })),
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.get(api.settlements.archived.path, isAuthenticated, async (req, res) => {
    try {
      const eventId = req.query.eventId ? parseInt(req.query.eventId as string) : undefined;
      const archivedSettlements = await storage.getArchivedSettlements(eventId);
      res.json(archivedSettlements.map(s => ({
        ...s,
        createdAt: s.createdAt?.toISOString() || null,
        completedAt: s.completedAt?.toISOString() || null,
        payments: s.payments.map(p => ({
          ...p,
          completedAt: p.completedAt?.toISOString() || null,
        })),
      })));
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.post(api.settlements.create.path, isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      
      const result = api.settlements.create.input.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: result.error.errors[0].message });
      }
      
      const { name, balances, eventId } = result.data;
      
      const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);
      if (Math.abs(totalBalance) > 100) {
        return res.status(400).json({ message: "Balances must sum to zero" });
      }
      
      // If there's already an active settlement for this event, archive it first (recalculating)
      const existingSettlement = await storage.getActiveSettlement(eventId);
      if (existingSettlement) {
        await storage.archiveSettlement(existingSettlement.id);
      }
      
      // Calculate optimal payments to settle all balances
      // Use a greedy algorithm to minimize number of transactions
      const payments = calculateSettlementPayments(balances);
      
      if (payments.length === 0) {
        return res.status(400).json({ message: "No payments needed - all balances are zero" });
      }
      
      const settlement = await storage.createSettlement(name || null, payments, userId, eventId);
      
      res.status(201).json({
        ...settlement,
        createdAt: settlement.createdAt?.toISOString() || null,
        completedAt: settlement.completedAt?.toISOString() || null,
        payments: settlement.payments.map(p => ({
          ...p,
          completedAt: p.completedAt?.toISOString() || null,
        })),
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.patch(api.settlements.togglePayment.path, isAuthenticated, async (req, res) => {
    try {
      const paymentId = parseInt(req.params.paymentId);
      const payment = await storage.togglePaymentComplete(paymentId);
      
      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }
      
      res.json({
        ...payment,
        completedAt: payment.completedAt?.toISOString() || null,
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.delete(api.settlements.delete.path, isAuthenticated, async (req, res) => {
    try {
      const settlementId = parseInt(req.params.id);
      const success = await storage.deleteSettlement(settlementId);
      
      if (!success) {
        return res.status(404).json({ message: "Settlement not found" });
      }
      
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  return httpServer;
}

// Helper function to calculate optimal payments to settle all balances
function calculateSettlementPayments(
  balances: { playerName: string; presetPlayerId?: number | null; balance: number }[]
): { fromPlayerName: string; fromPresetPlayerId: number | null; toPlayerName: string; toPresetPlayerId: number | null; amount: number }[] {
  // Filter out zero balances and separate into debtors (owe money) and creditors (owed money)
  const debtors: { playerName: string; presetPlayerId: number | null; amount: number }[] = [];
  const creditors: { playerName: string; presetPlayerId: number | null; amount: number }[] = [];
  
  for (const b of balances) {
    const roundedBalance = Math.round(b.balance); // Round to nearest cent
    if (roundedBalance < 0) {
      // Negative balance = this player owes money
      debtors.push({
        playerName: b.playerName,
        presetPlayerId: b.presetPlayerId ?? null,
        amount: -roundedBalance, // Make positive
      });
    } else if (roundedBalance > 0) {
      // Positive balance = this player is owed money
      creditors.push({
        playerName: b.playerName,
        presetPlayerId: b.presetPlayerId ?? null,
        amount: roundedBalance,
      });
    }
  }
  
  // Sort by amount (largest first) for better matching
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);
  
  const payments: { fromPlayerName: string; fromPresetPlayerId: number | null; toPlayerName: string; toPresetPlayerId: number | null; amount: number }[] = [];
  
  // Greedy algorithm: match largest debtor with largest creditor
  let debtorIdx = 0;
  let creditorIdx = 0;
  
  while (debtorIdx < debtors.length && creditorIdx < creditors.length) {
    const debtor = debtors[debtorIdx];
    const creditor = creditors[creditorIdx];
    
    const paymentAmount = Math.min(debtor.amount, creditor.amount);
    
    if (paymentAmount > 0) {
      payments.push({
        fromPlayerName: debtor.playerName,
        fromPresetPlayerId: debtor.presetPlayerId,
        toPlayerName: creditor.playerName,
        toPresetPlayerId: creditor.presetPlayerId,
        amount: paymentAmount,
      });
    }
    
    debtor.amount -= paymentAmount;
    creditor.amount -= paymentAmount;
    
    if (debtor.amount === 0) {
      debtorIdx++;
    }
    if (creditor.amount === 0) {
      creditorIdx++;
    }
  }
  
  return payments;
}

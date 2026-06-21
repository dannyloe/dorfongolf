import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { initializeAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { api } from "@shared/routes";
import { z } from "zod";
import { db } from "./db";
import { presetPlayers, playerAliases, matches as matchesTable, eventMatches as eventMatchesTable, users as usersTable, smsOptIns } from "@shared/schema";
import { eq, sql, count, and as drizzleAnd } from "drizzle-orm";
import { ai } from "./replit_integrations/image/client";
import { Type as GenAIType } from "@google/genai";
import { sendSMS, sendMatchInvitation, sendScoreUpdate, sendBetResult, getPlivoFromPhoneNumber } from "./plivo";
import { isWhatsappConfigured, getTwilioWhatsappNumber, sendMatchInvitationWhatsApp, sendScoreUpdateWhatsApp, sendBetResultWhatsApp, validateTwilioSignature, stripWhatsappPrefix } from "./twilio";
import { sendPushNotification } from "./pushNotifications";
import { scanScorecardImage, scanScorecardImageWithGemini, scanScorecardImageWithGrok, parseSmsBetText, detectScoreText, computeBetSignature, checkBetDuplicate, scanBetSlip } from "./scanHelper";
import { analyzeCorrectionLogs, analyzeByCourseName } from "./scanAnalysis";
import { uploadScorecardImage } from "./imageStorage";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import express from "express";
import plivoLib from "plivo";

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
    
    // Check notification preferences
    const prefs = await storage.getNotificationPreferences(playerUserId);
    if (prefs && prefs.matchInvitations === false) return;
    
    // Get inviter's display name
    const inviter = await storage.getUser(inviterUserId);
    const inviterName = inviter?.presetPlayerName || inviter?.firstName || "Someone";
    
    const matchDisplayName = matchName || "a match";

    // Send WhatsApp if configured, otherwise fall back to Plivo SMS
    if (user?.phone) {
      if (isWhatsappConfigured()) {
        await sendMatchInvitationWhatsApp(user.phone, matchDisplayName, inviterName);
      } else {
        await sendMatchInvitation(user.phone, matchDisplayName, inviterName);
      }
    }

    // Send push notification (fire-and-forget)
    sendPushNotification(
      playerUserId,
      "Match Invitation",
      `${inviterName} invited you to ${matchDisplayName}`,
      { route: `/match/${matchId}` }
    ).catch(() => {});
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
      
      if (isWhatsappConfigured()) {
        await sendScoreUpdateWhatsApp(participant.phone, matchName, playerName, holeNumber);
      } else {
        await sendScoreUpdate(participant.phone, matchName, playerName, holeNumber);
      }

      // Send push notification alongside SMS (fire-and-forget)
      sendPushNotification(
        participant.userId,
        matchName,
        `${playerName} scored on hole ${holeNumber}`,
        { route: `/match/${matchId}` }
      ).catch(() => {});
    }
  } catch (error) {
    console.error('Failed to send score update notifications:', error);
  }
}

// Helper to notify players of a bet result — uses WhatsApp when configured, Plivo SMS fallback
async function notifyPlayersOfBetResult(
  playerUserIds: string[],
  matchName: string,
  result: string,
  amount: string
) {
  for (const userId of playerUserIds) {
    try {
      const user = await storage.getUser(userId);
      if (!user?.phone) continue;
      if (isWhatsappConfigured()) {
        await sendBetResultWhatsApp(user.phone, matchName, result, amount);
      } else {
        await sendBetResult(user.phone, matchName, result, amount);
      }
    } catch (err) {
      console.error(`Failed to send bet result notification to user ${userId}:`, err);
    }
  }
}

// Helper to send push notifications to all group members of an event (non-blocking)
async function notifyEventGroupMembers(
  eventId: number,
  title: string,
  body: string,
  excludeUserId?: string
) {
  try {
    const event = await storage.getRyderCupEvent(eventId);
    if (!event?.groupId) return;

    const members = await storage.getGroupMembers(event.groupId);
    for (const member of members) {
      if (!member.userId || member.userId === excludeUserId) continue;
      sendPushNotification(
        member.userId,
        title,
        body,
        { route: `/ryder-cup/${eventId}` }
      ).catch(() => {});
    }
  } catch (error) {
    console.error('Failed to send event group notifications:', error);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await initializeAuth(app);
  registerAuthRoutes(app);
  registerObjectStorageRoutes(app);

  const ADMIN_USER_ID = "52861828";

  // Device push token endpoints for native iOS app
  app.post("/api/notifications/device-token", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const schema = z.object({
        token: z.string().min(1),
        platform: z.string().default("ios"),
      });
      const { token, platform } = schema.parse(req.body);
      const result = await storage.registerDevicePushToken(userId, token, platform);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/notifications/device-token/:token", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const token = req.params.token;
      await storage.unregisterDevicePushToken(token, userId);
      res.status(204).send();
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // In-app notification feed endpoints
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const items = await storage.getNotificationsForUser(userId, 50);
      res.json(items);
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      await storage.markNotificationRead(id, userId);
      res.status(204).send();
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/notifications/read-all", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      await storage.markAllNotificationsRead(userId);
      res.status(204).send();
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.matches.list.path, isAuthenticated, async (req, res) => {
    const matches = await storage.getMatchesWithPlayers();
    res.json(matches);
  });

  app.get("/api/users/match-type-frequency", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const result = await db
        .select({
          matchType: eventMatchesTable.matchType,
          isRoundRobinGenerated: eventMatchesTable.isRoundRobinGenerated,
          count: count(),
        })
        .from(eventMatchesTable)
        .innerJoin(matchesTable, eq(eventMatchesTable.eventId, matchesTable.id))
        .where(eq(matchesTable.creatorId, user.claims.sub))
        .groupBy(eventMatchesTable.matchType, eventMatchesTable.isRoundRobinGenerated);
      
      const frequency: Record<string, number> = {};
      for (const row of result) {
        let key = row.matchType;
        if (row.isRoundRobinGenerated) {
          if (key === "nassau") key = "round_robin_nassau";
          else if (key === "match_play_1_ball") key = "round_robin_2_man";
        }
        frequency[key] = (frequency[key] || 0) + Number(row.count);
      }
      res.json(frequency);
    } catch (error) {
      console.error("Error fetching match type frequency:", error);
      res.status(500).json({ message: "Failed to fetch match type frequency" });
    }
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
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.matches.get.path, isAuthenticated, async (req, res) => {
    const matchId = parseInt(req.params.id);
    const match = await storage.getMatch(matchId);
    if (!match) return res.status(404).json({ message: "Match not found" });

    // Run independent fetches in parallel.
    const [players, initialScores, creator, eventMatchesWithTeams] = await Promise.all([
      storage.getMatchPlayers(matchId),
      storage.getMatchScores(matchId),
      storage.getUser(match.creatorId),
      storage.getEventMatchesWithTeamsBulk(matchId),
    ]);

    let scores = initialScores;

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
      eventMatches: eventMatchesWithTeams,
    });
  });

  // Bulk: all per-event-match handicap overrides for a match in one query.
  app.get('/api/matches/:id/all-player-handicaps', isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const handicaps = await storage.getAllMatchPlayerHandicapsForMatch(matchId);
      res.json(handicaps);
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
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
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.matches.removePlayer.path, isAuthenticated, async (req, res) => {
    const matchId = parseInt(req.params.id);
    const playerId = parseInt(req.params.playerId);
    const user = req.user as any;
    const userId = user.claims.sub;

    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });

      const isAdmin = await storage.isUserAdmin(userId);
      const isCreator = match.creatorId === userId;
      const matchRole = await storage.getMatchRole(matchId, userId);
      const isOrganizer = matchRole?.role === 'organizer';

      if (!isAdmin && !isCreator && !isOrganizer) {
        return res.status(403).json({ message: "Only the creator or organizer can remove players" });
      }

      const matchPlayers = await storage.getMatchPlayers(matchId);
      const playerToRemove = matchPlayers.find(p => p.id === playerId);
      if (!playerToRemove) {
        return res.status(404).json({ message: "Player not found in this match" });
      }

      await storage.removePlayerFromMatch(matchId, playerId);
      res.status(204).send();
    } catch (err: any) {
      if (err.message?.includes("Cannot remove player")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Shared permission check for score writes. Short-circuits the common case
  // (hardcoded admin or match creator) before issuing any extra DB queries.
  async function canWriteScores(matchId: number, userId: string, match: { creatorId: string }) {
    if (userId === ADMIN_USER_ID) return true;
    if (match.creatorId === userId) return true;

    const [isAdmin, matchRole] = await Promise.all([
      storage.isUserAdmin(userId),
      storage.getMatchRole(matchId, userId),
    ]);
    if (isAdmin) return true;
    if (matchRole?.role === 'organizer') return true;

    // Participant check
    const matchPlayers = await storage.getMatchPlayers(matchId);
    if (matchPlayers.some(p => p.userId === userId)) return true;

    const currentUser = await storage.getUser(userId);
    if (currentUser?.presetPlayerName) {
      const presetName = currentUser.presetPlayerName.toLowerCase().trim();
      const aliases = await storage.getPlayerAliases(currentUser.presetPlayerName);
      const aliasNames = aliases.map(a => a.alias.toLowerCase().trim());
      if (matchPlayers.some(p => {
        const playerName = p.name.toLowerCase().trim();
        return playerName === presetName || aliasNames.includes(playerName);
      })) return true;
    }

    return false;
  }

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
      
      const allowed = await canWriteScores(matchId, userId, match);
      if (!allowed) {
        return res.status(403).json({ message: "Only match participants can submit scores" });
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
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Bulk version for scorecard scans / multi-hole writes.
  app.post('/api/matches/:id/scores/bulk', isAuthenticated, async (req, res) => {
    const matchId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;

    try {
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });

      const allowed = await canWriteScores(matchId, userId, match);
      if (!allowed) {
        return res.status(403).json({ message: "Only match participants can submit scores" });
      }

      const schema = z.object({
        scores: z.array(z.object({
          playerId: z.number().int(),
          holeNumber: z.number().int().min(1).max(18),
          strokes: z.number().int().min(1),
        })).min(1).max(500),
      });
      const { scores: entries } = schema.parse(req.body);

      const saved = await storage.submitScoresBulk(matchId, entries);
      res.json({ count: saved.length });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

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
      console.error("[route error]", err);
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

      if (input.matchType === "two_three_ball") {
        if (input.teamA.playerIds.length < 3 || input.teamB.playerIds.length < 3) {
          return res.status(400).json({ message: "2 Ball / 3rd Ball matches require at least 3 players per team" });
        }
      }

      if (input.matchType === "one_two_three_ball") {
        if (input.teamA.playerIds.length < 3 || input.teamB.playerIds.length < 3) {
          return res.status(400).json({ message: "1 Ball / 2nd3rd Ball matches require at least 3 players per team" });
        }
      }

      const eventMatch = await storage.createEventMatch(eventId, input);
      const withTeams = await storage.getEventMatchWithTeams(eventMatch.id);
      res.status(201).json(withTeams);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
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
      const pressMatch = await storage.createPressMatch(parentMatchId, input.startHole, input.customName ?? null);
      const withTeams = await storage.getEventMatchWithTeams(pressMatch.id);
      res.status(201).json(withTeams);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof Error && err.message === "Parent match not found") {
        return res.status(404).json({ message: err.message });
      }
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Delete a manual press: only the creator or an organizer of the parent match
  // may delete. Cascades child rows (results, handicap overrides, teams, child
  // presses) inside storage.deletePressMatch.
  app.delete(api.eventMatches.deletePress.path, isAuthenticated, async (req, res) => {
    const parentMatchId = parseInt(req.params.id);
    const pressId = parseInt(req.params.pressId);
    const user = req.user as any;
    const userId = user.claims.sub;

    try {
      const press = await storage.getEventMatch(pressId);
      if (!press) return res.status(404).json({ message: "Press not found" });
      if (press.parentMatchId !== parentMatchId) {
        return res.status(404).json({ message: "Press does not belong to this match" });
      }

      const match = await storage.getMatch(press.eventId);
      if (!match) return res.status(404).json({ message: "Match not found" });

      const isAdmin = userId === ADMIN_USER_ID;
      const isCreator = match.creatorId === userId;
      const matchRole = await storage.getMatchRole(press.eventId, userId);
      const isOrganizer = matchRole?.role === 'organizer';

      if (!isAdmin && !isCreator && !isOrganizer) {
        return res.status(403).json({ message: "Only the creator or organizer can delete presses" });
      }

      await storage.deletePressMatch(pressId);
      res.status(204).send();
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Rename a manual press by setting (or clearing) its custom label.
  app.patch(api.eventMatches.renamePress.path, isAuthenticated, async (req, res) => {
    const parentMatchId = parseInt(req.params.id);
    const pressId = parseInt(req.params.pressId);
    const user = req.user as any;
    const userId = user.claims.sub;

    try {
      const press = await storage.getEventMatch(pressId);
      if (!press) return res.status(404).json({ message: "Press not found" });
      if (press.parentMatchId !== parentMatchId) {
        return res.status(404).json({ message: "Press does not belong to this match" });
      }

      const match = await storage.getMatch(press.eventId);
      if (!match) return res.status(404).json({ message: "Match not found" });

      const isAdmin = userId === ADMIN_USER_ID;
      const isCreator = match.creatorId === userId;
      const matchRole = await storage.getMatchRole(press.eventId, userId);
      const isOrganizer = matchRole?.role === 'organizer';

      if (!isAdmin && !isCreator && !isOrganizer) {
        return res.status(403).json({ message: "Only the creator or organizer can rename presses" });
      }

      const input = api.eventMatches.renamePress.input.parse(req.body);
      const updated = await storage.renamePressMatch(pressId, input.customName);
      const withTeams = await storage.getEventMatchWithTeams(updated.id);
      res.json(withTeams);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
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

      // For press matches, validate that the requested auto-press toggle applies
      // to the press's bet type. Per-press auto-press is only supported for
      // Match Play (1/2 ball) and Nassau presses today.
      if (eventMatch.parentMatchId) {
        const isMatchPlay = eventMatch.matchType === 'match_play_1_ball' || eventMatch.matchType === 'match_play_2_ball';
        const isNassau = eventMatch.matchType === 'nassau';
        const isTwoThreeBall = eventMatch.matchType === 'two_three_ball';
        const isOneTwoThreeBall = eventMatch.matchType === 'one_two_three_ball';
        if (input.autoPressAllPresses !== undefined) {
          return res.status(400).json({ message: "autoPressAllPresses cannot be set on a press" });
        }
        if (input.autoPressOriginal !== undefined && !isMatchPlay) {
          return res.status(400).json({ message: "This bet type does not support per-press auto-press" });
        }
        if (
          (input.autoPressNassauFront9 !== undefined ||
            input.autoPressNassauBack9 !== undefined ||
            input.autoPressNassauOverall !== undefined) &&
          !isNassau
        ) {
          return res.status(400).json({ message: "This bet type does not support per-press auto-press" });
        }
        if (
          (input.autoPressTwoBallFront9 !== undefined ||
            input.autoPressTwoBallBack9 !== undefined ||
            input.autoPressTwoBallOverall !== undefined ||
            input.autoPressThreeBallFront9 !== undefined ||
            input.autoPressThreeBallBack9 !== undefined ||
            input.autoPressThreeBallOverall !== undefined) &&
          !isTwoThreeBall
        ) {
          return res.status(400).json({ message: "This bet type does not support per-press auto-press" });
        }
        if (
          (input.autoPressOneBallFront9 !== undefined ||
            input.autoPressOneBallBack9 !== undefined ||
            input.autoPressOneBallOverall !== undefined ||
            input.autoPressTwoThirdBallFront9 !== undefined ||
            input.autoPressTwoThirdBallBack9 !== undefined ||
            input.autoPressTwoThirdBallOverall !== undefined) &&
          !isOneTwoThreeBall
        ) {
          return res.status(400).json({ message: "This bet type does not support per-press auto-press" });
        }
        const startsOnBack9 = (eventMatch.startHole ?? 1) > 9;
        if (isNassau && startsOnBack9 && input.autoPressNassauFront9 !== undefined) {
          return res.status(400).json({ message: "This press doesn't include the Front 9 leg" });
        }
        if (isTwoThreeBall && startsOnBack9 && (input.autoPressTwoBallFront9 !== undefined || input.autoPressThreeBallFront9 !== undefined)) {
          return res.status(400).json({ message: "This press doesn't include the Front 9 leg" });
        }
        if (isOneTwoThreeBall && startsOnBack9 && (input.autoPressOneBallFront9 !== undefined || input.autoPressTwoThirdBallFront9 !== undefined)) {
          return res.status(400).json({ message: "This press doesn't include the Front 9 leg" });
        }
      }

      const updated = await storage.updateEventMatchAutoPress(eventMatchId, input);
      const withTeams = await storage.getEventMatchWithTeams(updated.id);
      res.json(withTeams);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
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
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.eventMatches.updateUnitAmount.path, isAuthenticated, async (req, res) => {
    const eventMatchId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;

    // Lighter than getEventMatchWithTeams — we only need the eventId for the perm check.
    const eventMatch = await storage.getEventMatch(eventMatchId);
    if (!eventMatch) {
      return res.status(404).json({ message: "Event match not found" });
    }

    const match = await storage.getMatch(eventMatch.eventId);
    if (!match) {
      return res.status(404).json({ message: "Match not found" });
    }

    const isCreator = match.creatorId === userId;
    const isAdminFast = userId === ADMIN_USER_ID;
    if (!isCreator && !isAdminFast) {
      // Only hit the role table when the cheap checks didn't pass.
      const matchRole = await storage.getMatchRole(eventMatch.eventId, userId);
      if (matchRole?.role !== 'organizer') {
        return res.status(403).json({ message: "Only the creator or organizer can change the wager amount" });
      }
    }

    try {
      const input = api.eventMatches.updateUnitAmount.input.parse(req.body);
      const updated = await storage.updateEventMatchUnitAmount(eventMatchId, input.unitAmount);
      // Client only invalidates the match cache from the response — no need to refetch teams.
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch(api.eventMatches.updateMatchType.path, isAuthenticated, async (req, res) => {
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
      return res.status(403).json({ message: "Only the creator or organizer can change the match type" });
    }
    
    try {
      const input = api.eventMatches.updateMatchType.input.parse(req.body);
      const updated = await storage.updateEventMatchType(eventMatchId, input.matchType);
      const withTeams = await storage.getEventMatchWithTeams(updated.id);
      res.json(withTeams);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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

      // Fire-and-forget: notify match participants that bet results were recorded
      const recipientIds = matchPlayers
        .map(p => p.userId)
        .filter((id): id is string => !!id && id !== userId);
      if (recipientIds.length > 0) {
        const matchDisplayName = match.name || match.courseName || "your match";
        notifyPlayersOfBetResult(
          recipientIds,
          matchDisplayName,
          "Bet results have been recorded",
          "Open the app to see your settlement"
        ).catch(() => {});
      }
    } catch (err) {
      console.error("Error saving event match results:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Hidden / auto-created player management (admin-only)
  app.get('/api/preset-players/hidden', isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const isAdmin = await storage.isUserAdmin(userId);
      if (!isAdmin) return res.status(403).json({ message: "Admins only" });
      const players = await storage.getHiddenPlayers();
      res.json(players);
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch('/api/preset-players/:id/show', isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const isAdmin = await storage.isUserAdmin(userId);
      if (!isAdmin) return res.status(403).json({ message: "Admins only" });
      const id = parseInt(req.params.id);
      const updated = await storage.promoteHiddenPlayer(id);
      res.json(updated);
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete('/api/preset-players/:id', isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const isAdmin = await storage.isUserAdmin(userId);
      if (!isAdmin) return res.status(403).json({ message: "Admins only" });
      const id = parseInt(req.params.id);
      // Only allow deleting auto-created hidden players via this endpoint
      const player = await storage.getPresetPlayerById(id);
      if (!player) return res.status(404).json({ message: "Player not found" });
      if (!player.isAutoCreated || player.showInRoster) {
        return res.status(400).json({ message: "Only hidden auto-created guest players can be deleted via this endpoint" });
      }
      const force = req.query.force === 'true';
      const result = await storage.deletePresetPlayerById(id, force);
      if (!result.deleted) {
        return res.status(409).json({ message: "Player has match history. Set force=true to delete anyway.", hasHistory: true });
      }
      res.status(204).send();
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post('/api/preset-players/bulk-delete-inactive', isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const isAdmin = await storage.isUserAdmin(userId);
      if (!isAdmin) return res.status(403).json({ message: "Admins only" });
      const schema = z.object({
        inactiveDays: z.number().int().min(1).max(3650),
        dryRun: z.boolean().default(true),
      });
      const input = schema.parse(req.body);
      const affected = await storage.bulkDeleteInactivePlayers(input.inactiveDays, input.dryRun);
      res.json({ dryRun: input.dryRun, count: affected.length, players: affected });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get('/api/groups/:id/guest-players', isAuthenticated, async (req, res) => {
    try {
      const groupId = parseInt(req.params.id);
      const user = req.user as any;
      const userId = user.claims.sub;
      const membership = await storage.getGroupMembership(groupId, userId);
      if (!membership) return res.status(403).json({ message: "Not a group member" });
      const players = await storage.getGroupAutoCreatedPlayers(groupId);
      res.json(players);
    } catch (err) {
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.playerHandicaps.delete.path, isAuthenticated, async (req, res) => {
    try {
      const presetPlayerName = decodeURIComponent(req.params.presetPlayerName);
      await storage.deletePlayerHandicap(presetPlayerName);
      res.status(204).send();
    } catch (err) {
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Per-course default tees for players
  app.get(api.playerCourseDefaults.listAll.path, isAuthenticated, async (req, res) => {
    try {
      const defaults = await storage.getAllPlayerCourseDefaults();
      res.json(defaults);
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get(api.playerCourseDefaults.listForPlayer.path, isAuthenticated, async (req, res) => {
    try {
      const presetPlayerName = decodeURIComponent(req.params.presetPlayerName);
      const defaults = await storage.getPlayerCourseDefaults(presetPlayerName);
      res.json(defaults);
    } catch (err) {
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Scorecard OCR Scanning
  app.post(api.scorecard.scan.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.scorecard.scan.input.parse(req.body);

      // Upload image to Object Storage BEFORE calling Gemini so every attempted
      // scan (including those dismissed without applying) has a durable image record.
      const imageUrl = await uploadScorecardImage(input.imageBase64).catch(() => null);

      const extraRules = await storage.getActiveScanPatternRules();
      const scanProvider = (await storage.getAppSetting("scanProvider")) as "gemini" | "grok" | null ?? "gemini";

      // Fetch course-specific data for richer prompts when a matchId is provided
      let holePars: { holeNumber: number; par: number }[] | undefined;
      let scorecardNotes: string | null | undefined;
      if (input.matchId) {
        try {
          const scanMatch = await storage.getMatch(input.matchId);
          if (scanMatch?.courseId) {
            const [holes, course] = await Promise.all([
              storage.getCourseHoles(scanMatch.courseId),
              storage.getCourse(scanMatch.courseId),
            ]);
            if (holes.length > 0) holePars = holes.map(h => ({ holeNumber: h.holeNumber, par: h.par }));
            if (course?.scorecardNotes) scorecardNotes = course.scorecardNotes;
          }
        } catch (courseErr) {
          console.error("[scan] Failed to fetch course data for prompt (non-fatal):", courseErr);
        }
      }

      const result = await scanScorecardImage({
        imageBase64: input.imageBase64,
        playerNames: input.playerNames,
        courseName: input.courseName,
        extraRules,
        provider: scanProvider,
        holePars,
        scorecardNotes,
      });

      // Create correction log at scan time when matchId is provided, so the record
      // exists even for scans the user dismisses without applying. Log ALL attempts
      // including failed or empty extractions — these are the most useful for model
      // quality analysis.
      let correctionLogId: number | null = null;
      if (input.matchId) {
        try {
          const match = await storage.getMatch(input.matchId);
          if (match) {
            const geminiOutput = (result.scores ?? []).map(p => ({
              playerName: p.playerName,
              holes: (p.holes ?? [])
                .filter(h => h.holeNumber >= 1 && h.holeNumber <= 18)
                .map(h => ({
                  holeNumber: h.holeNumber,
                  strokes: h.strokes != null ? Math.round(h.strokes) : null,
                })),
            }));
            const log = await storage.createScanCorrectionLog({
              matchId: input.matchId,
              pendingScanId: null,
              source: "camera",
              scanProvider,
              courseName: match.courseName,
              imageUrl,
              geminiOutput,
              appliedOutput: [], // filled in at apply time
              playerNames: [],   // filled in at apply time
              geminiRawText: result.rawText || null,
            });
            correctionLogId = log.id;
          }
        } catch (logErr) {
          console.error("[scan] Failed to create correction log at scan time (non-fatal):", logErr);
        }
      }

      res.json({ ...result, imageUrl: imageUrl ?? null, correctionLogId });
    } catch (err) {
      console.error("Scorecard scan error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      const msg = err instanceof Error ? err.message : "Failed to process scorecard image";
      const status = msg.includes("unavailable") ? 503 : msg.includes("Invalid image") ? 400 : 500;
      res.status(status).json({ message: msg });
    }
  });

  // Public config endpoint — returns non-sensitive frontend config
  app.get("/api/config", async (req, res) => {
    try {
      const { getPlivoFromPhoneNumber } = await import("./plivo");
      let phoneNumber: string | null = null;
      try {
        phoneNumber = getPlivoFromPhoneNumber();
      } catch {
        phoneNumber = null;
      }
      let twilioWhatsappNumber: string | null = null;
      try {
        if (isWhatsappConfigured()) twilioWhatsappNumber = getTwilioWhatsappNumber();
      } catch {
        twilioWhatsappNumber = null;
      }
      res.json({ phoneNumber, twilioWhatsappNumber });
    } catch (err) {
      res.json({ phoneNumber: null, twilioWhatsappNumber: null });
    }
  });

  // SMS opt-in endpoint — publicly accessible, no auth required
  app.post("/api/sms/opt-in", async (req, res) => {
    try {
      const schema = z.object({
        phoneNumber: z.string().min(7, "Phone number is required"),
        consentGiven: z.literal(true, { errorMap: () => ({ message: "You must agree to receive messages" }) }),
      });
      const { phoneNumber, consentGiven } = schema.parse(req.body);

      // Attach user account if logged in (session-based; req.user is not populated on public routes)
      const userId = (req.session as any)?.userId ?? null;

      const record = await storage.createSmsOptIn({ phoneNumber, consentGiven, userId });
      res.status(201).json({ success: true, id: record.id });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[SMS opt-in]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Helper: validate Plivo webhook signature using X-Plivo-Signature-V3 and HMAC-SHA256.
  function validatePlivoSignature(req: any, authToken: string | undefined): boolean {
    if (!authToken) return false;
    const signature = req.headers['x-plivo-signature-v3'];
    const nonce = req.headers['x-plivo-signature-v3-nonce'];
    if (!signature || !nonce) return false;

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const url = `${protocol}://${host}/api/sms/inbound`;
    const method = req.method;

    try {
      return plivoLib.validateV3Signature(method, url, nonce, authToken, signature, req.body as Record<string, string>);
    } catch {
      return false;
    }
  }

  // Inbound MMS webhook — Plivo posts here when a text with a photo arrives
  // NOTE: This endpoint is intentionally public (no isAuthenticated) so Plivo can reach it.
  // Plivo signature validation using X-Plivo-Signature-V3 is performed to reject forgeries.
  app.post("/api/sms/inbound", express.urlencoded({ extended: false }), async (req, res) => {
    const plivoEmpty = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

    try {
      // Validate Plivo signature to reject forged requests.
      // If PLIVO_AUTH_TOKEN is not set we fail closed — reject rather than process untrusted data.
      const authToken = process.env.PLIVO_AUTH_TOKEN;
      if (!authToken) {
        console.error("[SMS Inbound] No Plivo auth token available — rejecting request. Set PLIVO_AUTH_TOKEN secret.");
        res.status(403).type("text/xml").send(plivoEmpty);
        return;
      }
      const valid = validatePlivoSignature(req, authToken);
      if (!valid) {
        console.warn("[SMS Inbound] Invalid or missing Plivo signature — rejected");
        res.status(403).type("text/xml").send(plivoEmpty);
        return;
      }

      const from: string = req.body.From || "";
      const rawBody: string = req.body.Text || req.body.Body || "";
      const numMedia = parseInt(req.body.MediaCount || req.body.NumMedia || "0", 10);

      if (!from) {
        res.type("text/xml").send(plivoEmpty);
        return;
      }

      // Extract the first valid 4-char match code from anywhere in the message body
      const codeMatch = rawBody.toUpperCase().match(/\b([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4})\b/);
      const matchCode = codeMatch?.[1];

      let match: Awaited<ReturnType<typeof storage.getMatchByCode>> | undefined;

      if (!matchCode) {
        // No match code in message — try to resolve by sender's phone number
        const activeMatches = await storage.getActiveMatchesByPhone(from);
        if (activeMatches.length === 1) {
          match = activeMatches[0];
          console.log(`[SMS Inbound] Resolved match ${match.id} by phone lookup for ${from.replace(/\d(?=\d{4})/g, "*")}`);
        } else if (activeMatches.length > 1) {
          const twimlReply = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>You're in multiple active matches. Please include your 4-character match code in the message so we know which match to apply it to.</Message></Response>`;
          res.type("text/xml").send(twimlReply);
          return;
        } else {
          const twimlReply = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Please include your 4-character match code in the message body along with a photo of the scorecard.</Message></Response>`;
          res.type("text/xml").send(twimlReply);
          return;
        }
      } else {
        // Look up match by extracted 4-char code
        match = await storage.getMatchByCode(matchCode);
        if (!match) {
          const twimlReply = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Sorry, we couldn't find a match with code "${matchCode}". Check the code and try again.</Message></Response>`;
          res.type("text/xml").send(twimlReply);
          return;
        }
      }

      // Track whether match was found by phone lookup (no code provided)
      const resolvedByPhone = !matchCode;

      // If no media, try to parse the text body as a bet description or scores
      if (numMedia === 0) {
        const textBody = rawBody.replace(/\b[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}\b/i, "").trim();

        // Try score detection first (≥9 golf-range integers)
        const scoreNums = detectScoreText(textBody);
        if (scoreNums && scoreNums.length >= 9) {
          // Build a minimal scan result pre-populated with scores
          const matchPlayers = await storage.getMatchPlayers(match.id);
          const senderUser = await storage.getUserByPhone(from);
          const senderName = senderUser?.presetPlayerName || senderUser?.firstName || from.slice(-4);
          // Find the player in this match matching the sender
          const senderPlayer = matchPlayers.find(p =>
            senderUser?.presetPlayerName && p.name.toLowerCase() === senderUser.presetPlayerName.toLowerCase()
          );
          const playerName = senderPlayer?.name || senderName || "Unknown";
          const holes = scoreNums.slice(0, 18).map((strokes, i) => ({
            holeNumber: i + 1,
            strokes: String(strokes),
            confidence: "high" as const,
          }));
          const scanResult = JSON.stringify({ success: true, scores: [{ playerName, holes }] });
          const maskedPhoneScore = `***-***-${from.slice(-4)}`;
          const newScan = await storage.createPendingScan({ matchId: match.id, fromPhone: maskedPhoneScore, mediaUrl: "", resolvedByPhone });
          // Update the exact newly inserted record by ID (avoids race with concurrent inbound traffic)
          await storage.updatePendingScan(newScan.id, { status: "ready", scanResult });
          const twimlReply = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Got your scores for "${match.name || match.courseName}"! The organizer will review and apply them shortly.</Message></Response>`;
          res.type("text/xml").send(twimlReply);
          return;
        }

        // Try bet parsing — skip very short messages
        if (textBody.length >= 5) {
          const matchPlayers = await storage.getMatchPlayers(match.id);
          const playerNames = matchPlayers.map((p: { name: string }) => p.name);
          const senderUser = await storage.getUserByPhone(from);
          const senderName = senderUser?.presetPlayerName || senderUser?.firstName || `…${from.slice(-4)}`;
          const matchName = match.name || match.courseName;

          // Parse synchronously (with 12s timeout) so TwiML reply can include bet summaries
          let parsedBets: import("@shared/schema").ParsedSmsBet[] | null = null;
          try {
            const parsePromise = parseSmsBetText({ rawText: textBody, playerNames, matchName, senderName });
            const timeoutPromise = new Promise<null>(r => setTimeout(() => r(null), 12000));
            parsedBets = await Promise.race([parsePromise, timeoutPromise]);
          } catch (parseErr) {
            console.error("[SMS Inbound] Bet parse error:", parseErr);
          }

          // Deterministic post-LLM sender injection:
          // Always ensure sender is listed as a player in every parsed bet.
          // Skip press actions — they have no players.
          if (parsedBets && parsedBets.length > 0 && senderName) {
            const { resolvePlayerAlias } = await import("@shared/models/auth");
            const canonicalSender = resolvePlayerAlias(senderName);
            parsedBets = parsedBets.map(pb => {
              if (pb.betType === 'press') return pb;
              const existing = pb.players.map(p => resolvePlayerAlias(p).toLowerCase());
              if (!existing.includes(canonicalSender.toLowerCase())) {
                return { ...pb, players: [...pb.players, canonicalSender] };
              }
              return pb;
            });
          }

          // Dedup check: compare signatures against ALL non-dismissed pending SMS bets
          // (including applied ones) AND existing eventMatches by name
          // — checking every parsed bet, not just the first
          let status = "pending";
          let duplicateOf: string | null = null;
          if (parsedBets && parsedBets.length > 0) {
            const [existingSmsBets, existingEmsWithTeams] = await Promise.all([
              storage.listPendingSmsBets(match.id),
              storage.getEventMatchesWithTeamsBulk(match.id),
            ]);
            const dupResult = checkBetDuplicate(parsedBets, existingSmsBets, existingEmsWithTeams);
            if (dupResult.isDuplicate) {
              status = "duplicate";
              duplicateOf = dupResult.duplicateOf;
            }
          }

          // Build reply message including parsed bet summaries
          let replyMsg: string;
          if (parsedBets && parsedBets.length > 0) {
            const betSummaries = parsedBets.map(pb => pb.description).join("; ");
            if (status === "duplicate") {
              replyMsg = `Got it (flagged as possible duplicate of: "${duplicateOf}"). Bets: ${betSummaries}. The organizer will review.`;
            } else {
              replyMsg = `Got your bet for "${matchName}": ${betSummaries}. The organizer will review shortly.`;
            }
          } else {
            replyMsg = `Got your message for "${matchName}"! Couldn't parse specific bets — the organizer will review your text.`;
          }

          // Mask the phone before storing for privacy
          const maskedPhone = `***-***-${from.slice(-4)}`;
          await storage.createPendingSmsBet({
            matchId: match.id,
            fromPhone: maskedPhone,
            senderName,
            rawText: textBody,
            parsedBets,
            status,
            duplicateOf,
            resolvedByPhone,
          });

          res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyMsg}</Message></Response>`);
          return;
        }

        const twimlReply = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>No photo received. Please attach a photo of your scorecard and include code ${match.matchCode} in the message.</Message></Response>`;
        res.type("text/xml").send(twimlReply);
        return;
      }

      // Collect all image media URLs (one pending scan per image attachment)
      // Plivo sends Media0, Media1, ... with MediaType0, MediaType1, ...
      const mediaUrls: string[] = [];
      for (let i = 0; i < numMedia; i++) {
        const url = req.body[`Media${i}`] || req.body[`MediaUrl${i}`];
        const ct: string = (req.body[`MediaType${i}`] || req.body[`MediaContentType${i}`] || "").toLowerCase();
        if (url && (ct.startsWith("image/") || ct === "")) {
          mediaUrls.push(url);
        }
      }

      if (mediaUrls.length === 0) {
        const twimlReply = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>No image found. Please attach a JPG or PNG of your scorecard.</Message></Response>`;
        res.type("text/xml").send(twimlReply);
        return;
      }

      // Create one pending scan per image, then respond immediately
      const scans = await Promise.all(
        mediaUrls.map((url) => storage.createPendingScan({ matchId: match.id, fromPhone: from, mediaUrl: url, resolvedByPhone }))
      );

      const count = mediaUrls.length;
      const twimlReply = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Got it! ${count === 1 ? "Your scorecard" : `${count} scorecards`} for "${match.name || match.courseName}" ${count === 1 ? "is" : "are"} being processed. The organizer will review and apply the scores shortly.</Message></Response>`;
      res.type("text/xml").send(twimlReply);

      // Background: for each scan, fetch image from Plivo (media URLs are public) and run AI scan
      const processScan = async (scan: { id: number }, mediaUrl: string) => {
        try {
          // Plivo media URLs are public — no auth header needed
          const imgRes = await fetch(mediaUrl);
          if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
          const imageBuffer = Buffer.from(await imgRes.arrayBuffer());

          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const imageBase64 = `data:${contentType};base64,${imageBuffer.toString("base64")}`;

          // Upload to Object Storage BEFORE Gemini so every attempted scan is durably stored
          const imageUrl = await uploadScorecardImage(imageBuffer, contentType).catch(() => null);

          const matchPlayers = await storage.getMatchPlayers(match.id);
          const playerNames = matchPlayers.map((p: { name: string }) => p.name);

          const extraRules = await storage.getActiveScanPatternRules();
          const scanProvider = (await storage.getAppSetting("scanProvider")) as "gemini" | "grok" | null ?? "gemini";

          // Fetch course-specific data for richer prompts when the match has a linked course
          let mmsHolePars: { holeNumber: number; par: number }[] | undefined;
          let mmsScorecardNotes: string | null | undefined;
          if (match.courseId) {
            try {
              const [mmsHoles, mmsCourse] = await Promise.all([
                storage.getCourseHoles(match.courseId),
                storage.getCourse(match.courseId),
              ]);
              if (mmsHoles.length > 0) mmsHolePars = mmsHoles.map((h: { holeNumber: number; par: number }) => ({ holeNumber: h.holeNumber, par: h.par }));
              if (mmsCourse?.scorecardNotes) mmsScorecardNotes = mmsCourse.scorecardNotes;
            } catch (courseErr) {
              console.error("[sms-scan] Failed to fetch course data for prompt (non-fatal):", courseErr);
            }
          }

          const result = await scanScorecardImage({ imageBase64, playerNames, courseName: match.courseName, extraRules, provider: scanProvider, holePars: mmsHolePars, scorecardNotes: mmsScorecardNotes });

          // Create correction log at scan time — captures dismissed and failed scans too.
          // Log ALL attempts regardless of success so every scan attempt is permanently
          // recorded: image → Gemini output → user-applied scores.
          let correctionLogId: number | null = null;
          try {
            const geminiOutput = (result.scores ?? []).map((p: any) => ({
              playerName: p.playerName,
              holes: (p.holes ?? [])
                .filter((h: any) => h.holeNumber >= 1 && h.holeNumber <= 18)
                .map((h: any) => ({
                  holeNumber: h.holeNumber,
                  strokes: h.strokes != null ? Math.round(h.strokes) : null,
                })),
            }));
            const log = await storage.createScanCorrectionLog({
              matchId: match.id,
              pendingScanId: scan.id,
              source: "mms",
              scanProvider,
              courseName: match.courseName,
              imageUrl,
              geminiOutput,
              appliedOutput: [], // filled in at apply time
              playerNames: [],   // filled in at apply time
              geminiRawText: result.rawText || null,
            });
            correctionLogId = log.id;
          } catch (logErr) {
            console.error(`[processScan] Failed to create correction log (non-fatal):`, logErr);
          }

          await storage.updatePendingScan(scan.id, {
            status: "ready",
            scanResult: JSON.stringify(result),
            imageUrl: imageUrl ?? null,
            correctionLogId,
          });
        } catch (err) {
          console.error(`Background MMS scan error (scan ${scan.id}):`, err);
          await storage.updatePendingScan(scan.id, {
            status: "error",
            errorMessage: err instanceof Error ? err.message : "Unknown error",
          });
        }
      };

      // Fire all scans in parallel (non-blocking)
      Promise.all(scans.map((scan, i) => processScan(scan, mediaUrls[i]))).catch((err) => {
        console.error("Background scan processing error:", err);
      });

    } catch (err) {
      console.error("Inbound SMS webhook error:", err);
      res.type("text/xml").send(twimlEmpty);
    }
  });

  // Inbound WhatsApp webhook — Twilio posts here when a WhatsApp message arrives.
  // NOTE: Intentionally public (no isAuthenticated) so Twilio can reach it.
  // Twilio signature validation is performed to reject forgeries.
  app.post("/api/whatsapp/inbound", express.urlencoded({ extended: false }), async (req, res) => {
    const twimlEmpty = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

    try {
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      if (!authToken) {
        console.error("[WhatsApp Inbound] No Twilio auth token — rejecting. Set TWILIO_AUTH_TOKEN secret.");
        res.status(403).type("text/xml").send(twimlEmpty);
        return;
      }

      const signature = req.headers["x-twilio-signature"] as string || "";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "";
      const webhookUrl = `${protocol}://${host}/api/whatsapp/inbound`;

      if (!validateTwilioSignature(authToken, signature, webhookUrl, req.body as Record<string, string>)) {
        console.warn("[WhatsApp Inbound] Invalid or missing Twilio signature — rejected");
        res.status(403).type("text/xml").send(twimlEmpty);
        return;
      }

      // Twilio sends From as "whatsapp:+12025551234" — strip prefix for storage/lookups
      const rawFrom: string = req.body.From || "";
      const from: string = stripWhatsappPrefix(rawFrom);
      const rawBody: string = req.body.Body || "";
      const numMedia = parseInt(req.body.NumMedia || "0", 10);

      if (!from) {
        res.type("text/xml").send(twimlEmpty);
        return;
      }

      const reply = (msg: string) => {
        res.type("text/xml").send(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${msg}</Message></Response>`
        );
      };

      // Extract 4-char match code from message body
      const codeMatch = rawBody.toUpperCase().match(/\b([ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4})\b/);
      const matchCode = codeMatch?.[1];

      let match: Awaited<ReturnType<typeof storage.getMatchByCode>> | undefined;

      if (!matchCode) {
        const activeMatches = await storage.getActiveMatchesByPhone(from);
        if (activeMatches.length === 1) {
          match = activeMatches[0];
          console.log(`[WhatsApp Inbound] Resolved match ${match.id} by phone for ${from.replace(/\d(?=\d{4})/g, "*")}`);
        } else if (activeMatches.length > 1) {
          reply("You're in multiple active matches. Please include your 4-character match code in the message.");
          return;
        } else {
          reply("Please include your 4-character match code in the message along with a photo of your scorecard.");
          return;
        }
      } else {
        match = await storage.getMatchByCode(matchCode);
        if (!match) {
          reply(`Sorry, we couldn't find a match with code "${matchCode}". Check the code and try again.`);
          return;
        }
      }

      // Track whether match was found by phone lookup (no code provided)
      const resolvedByPhone = !matchCode;

      // No media — try score text or bet parsing
      if (numMedia === 0) {
        const textBody = rawBody.replace(/\b[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}\b/i, "").trim();

        const scoreNums = detectScoreText(textBody);
        if (scoreNums && scoreNums.length >= 9) {
          const matchPlayers = await storage.getMatchPlayers(match.id);
          const senderUser = await storage.getUserByPhone(from);
          const senderName = senderUser?.presetPlayerName || senderUser?.firstName || from.slice(-4);
          const senderPlayer = matchPlayers.find(p =>
            senderUser?.presetPlayerName && p.name.toLowerCase() === senderUser.presetPlayerName.toLowerCase()
          );
          const playerName = senderPlayer?.name || senderName || "Unknown";
          const holes = scoreNums.slice(0, 18).map((strokes, i) => ({
            holeNumber: i + 1,
            strokes: String(strokes),
            confidence: "high" as const,
          }));
          const scanResult = JSON.stringify({ success: true, scores: [{ playerName, holes }] });
          const maskedPhone = `***-***-${from.slice(-4)}`;
          const newScan = await storage.createPendingScan({ matchId: match.id, fromPhone: maskedPhone, mediaUrl: "", resolvedByPhone });
          await storage.updatePendingScan(newScan.id, { status: "ready", scanResult });
          reply(`Got your scores for "${match.name || match.courseName}"! The organizer will review and apply them shortly.`);
          return;
        }

        if (textBody.length >= 5) {
          const matchPlayers = await storage.getMatchPlayers(match.id);
          const playerNames = matchPlayers.map((p: { name: string }) => p.name);
          const senderUser = await storage.getUserByPhone(from);
          const senderName = senderUser?.presetPlayerName || senderUser?.firstName || `…${from.slice(-4)}`;
          const matchName = match.name || match.courseName;

          let parsedBets: import("@shared/schema").ParsedSmsBet[] | null = null;
          try {
            const parsePromise = parseSmsBetText({ rawText: textBody, playerNames, matchName, senderName });
            const timeoutPromise = new Promise<null>(r => setTimeout(() => r(null), 12000));
            parsedBets = await Promise.race([parsePromise, timeoutPromise]);
          } catch (parseErr) {
            console.error("[WhatsApp Inbound] Bet parse error:", parseErr);
          }

          if (parsedBets && parsedBets.length > 0 && senderName) {
            const { resolvePlayerAlias } = await import("@shared/models/auth");
            const canonicalSender = resolvePlayerAlias(senderName);
            parsedBets = parsedBets.map(pb => {
              if (pb.betType === 'press') return pb;
              const existing = pb.players.map(p => resolvePlayerAlias(p).toLowerCase());
              if (!existing.includes(canonicalSender.toLowerCase())) {
                return { ...pb, players: [...pb.players, canonicalSender] };
              }
              return pb;
            });
          }

          let status = "pending";
          let duplicateOf: string | null = null;
          if (parsedBets && parsedBets.length > 0) {
            const [existingSmsBets, existingEmsWithTeams] = await Promise.all([
              storage.listPendingSmsBets(match.id),
              storage.getEventMatchesWithTeamsBulk(match.id),
            ]);
            const dupResult = checkBetDuplicate(parsedBets, existingSmsBets, existingEmsWithTeams);
            if (dupResult.isDuplicate) {
              status = "duplicate";
              duplicateOf = dupResult.duplicateOf;
            }
          }

          const maskedPhone = `***-***-${from.slice(-4)}`;
          await storage.createPendingSmsBet({
            matchId: match.id,
            fromPhone: maskedPhone,
            senderName,
            rawText: textBody,
            parsedBets,
            status,
            duplicateOf,
            resolvedByPhone,
          });

          let replyMsg: string;
          if (parsedBets && parsedBets.length > 0) {
            const betSummaries = parsedBets.map(pb => pb.description).join("; ");
            replyMsg = status === "duplicate"
              ? `Got it (flagged as possible duplicate of: "${duplicateOf}"). Bets: ${betSummaries}. The organizer will review.`
              : `Got your bet for "${matchName}": ${betSummaries}. The organizer will review shortly.`;
          } else {
            replyMsg = `Got your message for "${matchName}"! Couldn't parse specific bets — the organizer will review your text.`;
          }
          reply(replyMsg);
          return;
        }

        reply(`No photo received. Please attach a photo of your scorecard and include code ${match.matchCode} in the message.`);
        return;
      }

      // Collect image media URLs
      const mediaUrls: string[] = [];
      for (let i = 0; i < numMedia; i++) {
        const url = req.body[`MediaUrl${i}`];
        const ct: string = (req.body[`MediaContentType${i}`] || "").toLowerCase();
        if (url && (ct.startsWith("image/") || ct === "")) {
          mediaUrls.push(url);
        }
      }

      if (mediaUrls.length === 0) {
        reply("No image found. Please attach a JPG or PNG of your scorecard.");
        return;
      }

      // Mask phone before storing for privacy
      const maskedPhone = `***-***-${from.slice(-4)}`;
      const scans = await Promise.all(
        mediaUrls.map((url) => storage.createPendingScan({ matchId: match.id, fromPhone: maskedPhone, mediaUrl: url, resolvedByPhone }))
      );

      const count = mediaUrls.length;
      reply(`Got it! ${count === 1 ? "Your scorecard" : `${count} scorecards`} for "${match.name || match.courseName}" ${count === 1 ? "is" : "are"} being processed. The organizer will review and apply the scores shortly.`);

      // Background: download each image (requires Twilio Basic Auth) and run Gemini scan
      const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
      const authBasic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

      const processWaScan = async (scan: { id: number }, mediaUrl: string) => {
        try {
          const imgRes = await fetch(mediaUrl, {
            headers: { Authorization: `Basic ${authBasic}` },
          });
          if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);
          const imageBuffer = Buffer.from(await imgRes.arrayBuffer());
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const imageBase64 = `data:${contentType};base64,${imageBuffer.toString("base64")}`;

          const imageUrl = await uploadScorecardImage(imageBuffer, contentType).catch(() => null);

          const matchPlayers = await storage.getMatchPlayers(match.id);
          const playerNames = matchPlayers.map((p: { name: string }) => p.name);
          const extraRules = await storage.getActiveScanPatternRules();
          const scanProvider = (await storage.getAppSetting("scanProvider")) as "gemini" | "grok" | null ?? "gemini";

          let holePars: { holeNumber: number; par: number }[] | undefined;
          let scorecardNotes: string | null | undefined;
          if (match.courseId) {
            try {
              const [holes, course] = await Promise.all([
                storage.getCourseHoles(match.courseId),
                storage.getCourse(match.courseId),
              ]);
              if (holes.length > 0) holePars = holes.map((h: { holeNumber: number; par: number }) => ({ holeNumber: h.holeNumber, par: h.par }));
              if (course?.scorecardNotes) scorecardNotes = course.scorecardNotes;
            } catch { /* non-fatal */ }
          }

          const result = await scanScorecardImage({ imageBase64, playerNames, courseName: match.courseName, extraRules, provider: scanProvider, holePars, scorecardNotes });

          let correctionLogId: number | null = null;
          try {
            const geminiOutput = (result.scores ?? []).map((p: any) => ({
              playerName: p.playerName,
              holes: (p.holes ?? [])
                .filter((h: any) => h.holeNumber >= 1 && h.holeNumber <= 18)
                .map((h: any) => ({ holeNumber: h.holeNumber, strokes: h.strokes != null ? Math.round(h.strokes) : null })),
            }));
            const log = await storage.createScanCorrectionLog({
              matchId: match.id,
              pendingScanId: scan.id,
              source: "mms",
              scanProvider,
              courseName: match.courseName,
              imageUrl,
              geminiOutput,
              appliedOutput: [],
              playerNames: [],
              geminiRawText: result.rawText || null,
            });
            correctionLogId = log.id;
          } catch { /* non-fatal */ }

          await storage.updatePendingScan(scan.id, {
            status: "ready",
            scanResult: JSON.stringify(result),
            imageUrl: imageUrl ?? null,
            correctionLogId,
          });
        } catch (err) {
          console.error(`[WhatsApp] Background scan error (scan ${scan.id}):`, err);
          await storage.updatePendingScan(scan.id, {
            status: "error",
            errorMessage: err instanceof Error ? err.message : "Unknown error",
          });
        }
      };

      Promise.all(scans.map((scan, i) => processWaScan(scan, mediaUrls[i]))).catch((err) => {
        console.error("[WhatsApp] Background scan processing error:", err);
      });

    } catch (err) {
      console.error("[WhatsApp Inbound] Webhook error:", err);
      res.status(500).type("text/xml").send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  });

  // List pending scans for a match
  app.get("/api/matches/:id/pending-scans", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id, 10);
      if (isNaN(matchId)) return res.status(400).json({ message: "Invalid match ID" });

      const user = req.user as any;
      const userId: string = user.claims.sub;
      const [match, roleRecord] = await Promise.all([
        storage.getMatch(matchId),
        storage.getMatchRole(matchId, userId),
      ]);
      if (!match) return res.status(404).json({ message: "Match not found" });
      const isOrganizerOrCreator = match.creatorId === userId || roleRecord?.role === "organizer";
      if (!isOrganizerOrCreator) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const scans = await storage.listPendingScans(matchId);
      // Mask the sender phone number — show only last 4 digits for privacy
      const maskedScans = scans.map((s) => ({
        ...s,
        fromPhone: s.fromPhone ? `***-***-${s.fromPhone.slice(-4)}` : "Unknown",
      }));
      res.json(maskedScans);
    } catch (err) {
      console.error("List pending scans error:", err);
      res.status(500).json({ message: "Failed to list pending scans" });
    }
  });

  // Dismiss / delete a pending scan
  app.delete("/api/matches/:id/pending-scans/:scanId", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id, 10);
      const scanId = parseInt(req.params.scanId, 10);
      if (isNaN(matchId) || isNaN(scanId)) return res.status(400).json({ message: "Invalid ID" });

      const user = req.user as any;
      const userId: string = user.claims.sub;
      const [match, roleRecord] = await Promise.all([
        storage.getMatch(matchId),
        storage.getMatchRole(matchId, userId),
      ]);
      if (!match) return res.status(404).json({ message: "Match not found" });
      const isOrganizerOrCreator = match.creatorId === userId || roleRecord?.role === "organizer";
      if (!isOrganizerOrCreator) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Verify the scan belongs to this match before deleting (prevents IDOR)
      const scan = await storage.getPendingScan(scanId);
      if (!scan || scan.matchId !== matchId) return res.status(404).json({ message: "Scan not found" });

      const deleted = await storage.deletePendingScan(scanId);
      if (!deleted) return res.status(404).json({ message: "Scan not found" });
      res.status(204).send();
    } catch (err) {
      console.error("Delete pending scan error:", err);
      res.status(500).json({ message: "Failed to delete pending scan" });
    }
  });

  // Apply a pending scan: bulk-write scores and record a correction log
  app.post("/api/matches/:id/pending-scans/:scanId/apply", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id, 10);
      const scanId = parseInt(req.params.scanId, 10);
      if (isNaN(matchId) || isNaN(scanId)) return res.status(400).json({ message: "Invalid ID" });

      const user = req.user as any;
      const userId: string = user.claims.sub;
      const [match, roleRecord] = await Promise.all([
        storage.getMatch(matchId),
        storage.getMatchRole(matchId, userId),
      ]);
      if (!match) return res.status(404).json({ message: "Match not found" });
      const isOrganizerOrCreator = match.creatorId === userId || roleRecord?.role === "organizer" || userId === ADMIN_USER_ID;
      if (!isOrganizerOrCreator) return res.status(403).json({ message: "Not authorized" });

      const schema = z.object({
        scores: z.array(z.object({
          playerId: z.number().int(),
          playerName: z.string(),
          holeNumber: z.number().int().min(1).max(18),
          strokes: z.number().int().min(1),
        })).min(1).max(500),
      });
      const body = schema.parse(req.body);

      // Verify the scan belongs to this match and fetch it to get the authoritative Gemini output
      const scan = await storage.getPendingScan(scanId);
      if (!scan || scan.matchId !== matchId) return res.status(404).json({ message: "Scan not found" });

      // Parse the authoritative Gemini output from the persisted scan result (server-side only)
      type GeminiHoleEntry = { holeNumber: number; strokes: number | null };
      type GeminiPlayerEntry = { playerName: string; holes: GeminiHoleEntry[] };
      let geminiOutput: GeminiPlayerEntry[] = [];
      let geminiRawText: string | null = null;
      if (scan.scanResult) {
        try {
          const parsed = JSON.parse(scan.scanResult);
          if (Array.isArray(parsed?.scores)) {
            geminiOutput = parsed.scores.map((p: any) => ({
              playerName: String(p.playerName ?? ""),
              holes: (p.holes ?? []).map((h: any) => ({
                holeNumber: Number(h.holeNumber),
                strokes: h.strokes !== null && h.strokes !== undefined && h.strokes !== "" ? Number(h.strokes) : null,
              })).filter((h: GeminiHoleEntry) => h.holeNumber >= 1 && h.holeNumber <= 18),
            }));
          }
          if (parsed?.rawText) geminiRawText = String(parsed.rawText);
        } catch {
          // scanResult couldn't be parsed — log with empty geminiOutput
        }
      }

      // Build applied output grouped by player for the correction log
      const byPlayer = new Map<number, { playerName: string; playerId: number; holes: Array<{ holeNumber: number; strokes: number }> }>();
      for (const s of body.scores) {
        if (!byPlayer.has(s.playerId)) {
          byPlayer.set(s.playerId, { playerName: s.playerName, playerId: s.playerId, holes: [] });
        }
        byPlayer.get(s.playerId)!.holes.push({ holeNumber: s.holeNumber, strokes: s.strokes });
      }
      const appliedOutput = Array.from(byPlayer.values());

      // Bulk write scores first — log only what was actually saved
      const entries = body.scores.map(s => ({ playerId: s.playerId, holeNumber: s.holeNumber, strokes: s.strokes }));
      await storage.submitScoresBulk(matchId, entries);

      // Delete the pending scan
      await storage.deletePendingScan(scanId);

      // Update or create the correction log after scores are persisted
      const matchPlayers = await storage.getMatchPlayers(matchId);
      if (scan.correctionLogId) {
        // Log row was created at scan time — update it with the applied scores.
        // matchId is passed to the storage layer so only the log that belongs
        // to this match can be updated (prevents cross-match IDOR).
        await storage.updateScanCorrectionLog(scan.correctionLogId, matchId, {
          appliedOutput,
          playerNames: matchPlayers.map(p => p.name),
          geminiRawText,
        });
      } else {
        // Fallback: create a new row (covers scans processed before this deployment)
        await storage.createScanCorrectionLog({
          matchId,
          pendingScanId: scanId,
          source: "mms",
          courseName: match.courseName,
          imageUrl: scan.imageUrl ?? null,
          geminiOutput,
          appliedOutput,
          playerNames: matchPlayers.map(p => p.name),
          geminiRawText,
        });
      }

      res.json({ count: entries.length });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error("Apply pending scan error:", err);
      res.status(500).json({ message: "Failed to apply scan" });
    }
  });

  // Log corrections from in-app camera scans (QuickScoreEntry) — no pendingScanId required
  app.post("/api/matches/:id/scan-correction-log", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id, 10);
      if (isNaN(matchId)) return res.status(400).json({ message: "Invalid match ID" });

      const user = req.user as any;
      const userId: string = user.claims.sub;
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });

      // Allow anyone who can write scores to also log the correction (participants included)
      const allowed = await canWriteScores(matchId, userId, match);
      if (!allowed) return res.status(403).json({ message: "Not authorized" });

      const holeSchema = z.object({
        holeNumber: z.number().int().min(1).max(18),
        strokes: z.number().int().nullable(),
      });
      const schema = z.object({
        geminiOutput: z.array(z.object({
          playerName: z.string(),
          holes: z.array(holeSchema).max(18),
        })).max(20),
        appliedOutput: z.array(z.object({
          playerName: z.string(),
          playerId: z.number().int(),
          holes: z.array(z.object({
            holeNumber: z.number().int().min(1).max(18),
            strokes: z.number().int().min(1),
          })).max(18),
        })).max(20),
        imageUrl: z.string().nullable().optional(),
        correctionLogId: z.number().int().optional(), // if set, update existing row instead of creating new
        geminiRawText: z.string().nullable().optional(),
      });
      const body = schema.parse(req.body);

      const matchPlayers = await storage.getMatchPlayers(matchId);
      if (body.correctionLogId) {
        // Log row was created at scan time — update it with the applied scores.
        // matchId is passed so the DB WHERE clause enforces ownership:
        // a log that belongs to a different match will simply not be updated.
        await storage.updateScanCorrectionLog(body.correctionLogId, matchId, {
          appliedOutput: body.appliedOutput,
          playerNames: matchPlayers.map(p => p.name),
          imageUrl: body.imageUrl ?? undefined,
          geminiRawText: body.geminiRawText ?? undefined,
        });
      } else {
        // Fallback: create a new row (covers scans before this deployment, or failed log creation)
        await storage.createScanCorrectionLog({
          matchId,
          pendingScanId: null,
          source: "camera",
          courseName: match.courseName,
          imageUrl: body.imageUrl ?? null,
          geminiOutput: body.geminiOutput,
          appliedOutput: body.appliedOutput,
          playerNames: matchPlayers.map(p => p.name),
          geminiRawText: body.geminiRawText ?? null,
        });
      }

      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        console.error("[scan-correction-log] Zod validation failed:", JSON.stringify(err.errors, null, 2));
        return res.status(400).json({ message: err.errors[0].message, details: err.errors });
      }
      console.error("[scan-correction-log] Unexpected error:", err);
      res.status(500).json({ message: "Failed to log scan correction" });
    }
  });

  // Proxy provider-hosted image through the server
  app.get("/api/matches/:id/pending-scans/:scanId/image", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id, 10);
      const scanId = parseInt(req.params.scanId, 10);
      if (isNaN(matchId) || isNaN(scanId)) return res.status(400).json({ message: "Invalid ID" });

      const user = req.user as any;
      const userId: string = user.claims.sub;
      const [match, roleRecord] = await Promise.all([
        storage.getMatch(matchId),
        storage.getMatchRole(matchId, userId),
      ]);
      if (!match) return res.status(404).json({ message: "Match not found" });

      // Enforce organizer/creator authorization (same as list/delete)
      const isOrganizerOrCreator = match.creatorId === userId || roleRecord?.role === "organizer";
      if (!isOrganizerOrCreator) {
        return res.status(403).json({ message: "Not authorized" });
      }

      const scan = await storage.getPendingScan(scanId);
      if (!scan || scan.matchId !== matchId) return res.status(404).json({ message: "Scan not found" });

      // Plivo media URLs are public — no auth header needed
      const imgRes = await fetch(scan.mediaUrl);
      if (!imgRes.ok) return res.status(502).json({ message: "Failed to fetch image" });

      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const data = await imgRes.arrayBuffer();
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(data));
    } catch (err) {
      console.error("Image proxy error:", err);
      res.status(500).json({ message: "Failed to proxy image" });
    }
  });

  // AI voice match creation endpoint
  app.post("/api/ai/parse-match-voice", isAuthenticated, async (req, res) => {
    try {
      const bodySchema = z.object({
        transcript: z.string().min(1),
        players: z.array(z.object({ id: z.number(), name: z.string() })),
      });
      const { transcript, players } = bodySchema.parse(req.body);

      if (!ai) {
        return res.status(503).json({ message: "AI features are currently unavailable" });
      }

      const playerList = players.map(p => `  - ID ${p.id}: "${p.name}"`).join("\n");

      const prompt = `You are a golf betting assistant that parses a spoken match description into a structured JSON object.

Available players (use exact IDs when matching names — do fuzzy matching on common nicknames, first names, partial names):
${playerList}

Match types and their aliases:
- "nassau" → matchType: "nassau" (also: "nass", "nassau match")
- "match play" or "match play 1 ball" → matchType: "match_play_1_ball"
- "match play 2 ball" or "2 ball" → matchType: "match_play_2_ball"
- "stroke play" → matchType: "stroke_play"
- "skins" → matchType: "skins"
- "5-5-5-3" or "five five five three" → matchType: "five_five_five_three"
- "death match" → matchType: "death_match"
- "2 ball 3 ball", "2 ball 3rd ball", "two ball third ball", "two ball three ball", "2/3 ball", "two-three ball" → matchType: "two_three_ball"
- "round robin nassau" → matchType: "nassau", isRoundRobin: true, roundRobinSubtype: "nassau"
- "round robin" or "round robin match play" → matchType: "match_play_1_ball", isRoundRobin: true, roundRobinSubtype: "match_play_1_ball"

For ROUND ROBIN matches:
- The user will name two groups of players that play against each other
- If a player is called "the wheel", "the key", "the hub", or "against everyone" or "plays everyone", they are a keyed player — put their ID in keyedPlayerIds
- teamAPlayerIds = group 1 (often just the "wheel" player if keyed)
- teamBPlayerIds = group 2 (the opponents)

For STANDARD matches (nassau, match play, stroke play, death match, 2 ball / 3rd ball):
- teamAPlayerIds = first team mentioned
- teamBPlayerIds = second team (after "vs", "against", "versus")
- If a player is "keyed" vs all others, put them in keyedPlayerIds

For SKINS:
- All named players go in skinsPlayerIds
- teamAPlayerIds and teamBPlayerIds can be empty

For amounts:
- "twenty", "twenty bucks", "$20" → unitAmount: 20
- "fifty", "fifty dollar base" → deathMatchBaseBet: 50 (for death match), or unitAmount: 50 otherwise
- For 2 ball / 3rd ball: "2 ball at 20, 3rd ball at 30" → twoBallBet: 20, threeBallBet: 30. If only one amount given, apply it to both. If only unitAmount given, treat it as both.

Net/Gross:
- "net", "handicap" → useNet: true
- "gross", no mention → useNet: false

Auto-press preferences (ONLY for matchType "two_three_ball"):
- By default, ALL six auto-press flags are true: autoPressTwoBallFront9, autoPressTwoBallBack9, autoPressTwoBallOverall, autoPressThreeBallFront9, autoPressThreeBallBack9, autoPressThreeBallOverall.
- If the user mentions disabling presses, set the corresponding flag(s) to false. If they don't mention presses, leave all flags true (or omit the field entirely — null means "use default true").
- Phrase guide:
  - "no auto-press" / "no presses" / "presses off" / "disable auto-press" (with no qualifier) → set ALL six flags to false
  - "no auto-press on the front 9" / "no front 9 presses" → autoPressTwoBallFront9: false AND autoPressThreeBallFront9: false
  - "no auto-press on the back 9" / "no back 9 presses" → autoPressTwoBallBack9: false AND autoPressThreeBallBack9: false
  - "no overall press" / "no auto-press overall" → autoPressTwoBallOverall: false AND autoPressThreeBallOverall: false
  - "no 2 ball presses" / "no two ball auto-press" → autoPressTwoBallFront9: false, autoPressTwoBallBack9: false, autoPressTwoBallOverall: false
  - "no 3 ball presses" / "no three ball auto-press" → autoPressThreeBallFront9: false, autoPressThreeBallBack9: false, autoPressThreeBallOverall: false
  - Combined like "no 2 ball presses on the front 9" → autoPressTwoBallFront9: false only
- Only include flags you are explicitly setting to false; flags you don't include will default to true on the client.

Stroke/shot allocations (course handicap overrides):
- Phrases like "Jordan gets 3 shots", "Jordan gets 3 strokes", "give Jordan 3", "Jordan receives 3" mean that player's course handicap is 3
- Any player NOT explicitly mentioned gets 0 strokes (course handicap 0)
- Put allocations in strokeAllocations as an array of { playerId, strokes } objects
- Only include players who are explicitly given strokes (others default to 0)
- Examples: "Jordan gets 3 shots and Coach gets 5" → strokeAllocations: [{ playerId: <Jordan's ID>, strokes: 3 }, { playerId: <Coach's ID>, strokes: 5 }]

Respond ONLY with a valid JSON object (no markdown, no code blocks, no explanation):
{
  "matchType": "nassau" | "match_play_1_ball" | "match_play_2_ball" | "stroke_play" | "skins" | "five_five_five_three" | "death_match" | "two_three_ball",
  "isRoundRobin": false,
  "roundRobinSubtype": "nassau" | "match_play_1_ball",
  "teamAPlayerIds": [],
  "teamBPlayerIds": [],
  "keyedPlayerIds": [],
  "skinsPlayerIds": [],
  "unitAmount": null,
  "deathMatchBaseBet": null,
  "twoBallBet": null,
  "threeBallBet": null,
  "autoPressTwoBallFront9": null,
  "autoPressTwoBallBack9": null,
  "autoPressTwoBallOverall": null,
  "autoPressThreeBallFront9": null,
  "autoPressThreeBallBack9": null,
  "autoPressThreeBallOverall": null,
  "useNet": false,
  "strokeAllocations": [],
  "parsedSummary": "Brief human-readable description of what was understood",
  "unmatchedNames": []
}

Transcript to parse: "${transcript}"`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return res.status(400).json({ message: "Could not parse match description. Please try again." });
      }

      const parsed = JSON.parse(jsonMatch[0]);
      res.json({ success: true, ...parsed });
    } catch (err) {
      console.error("Voice match parse error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to parse match description" });
    }
  });

  // Bet slip photo scan endpoint (match-specific — kept for backward compat)
  app.post("/api/matches/:id/scan-bet-slip", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id);
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });

      const user = req.user as any;
      const userId = user.claims.sub;
      const isAdmin = userId === ADMIN_USER_ID;
      const isCreator = match.creatorId === userId;
      const matchRole = await storage.getMatchRole(matchId, userId);
      const isOrganizer = matchRole?.role === "organizer";
      if (!isAdmin && !isCreator && !isOrganizer) {
        return res.status(403).json({ message: "Only the creator or organizer can scan bet slips" });
      }

      const bodySchema = z.object({
        imageBase64: z.string().min(1),
        players: z.array(z.object({ id: z.number(), name: z.string() })),
      });
      const { imageBase64, players } = bodySchema.parse(req.body);

      const allAliases = await db.select().from(playerAliases);
      const aliasMap = new Map<string, string[]>();
      for (const a of allAliases) {
        if (!aliasMap.has(a.canonicalName)) aliasMap.set(a.canonicalName, []);
        aliasMap.get(a.canonicalName)!.push(a.alias);
      }
      const { PLAYER_ALIASES: HARDCODED_ALIASES } = await import("@shared/models/auth");
      for (const [alias, canonical] of Object.entries(HARDCODED_ALIASES)) {
        if (!aliasMap.has(canonical)) aliasMap.set(canonical, []);
        if (!aliasMap.get(canonical)!.includes(alias)) aliasMap.get(canonical)!.push(alias);
      }
      const playersWithAliases = players.map(p => ({ ...p, aliases: aliasMap.get(p.name) ?? [] }));

      const activeRules = await storage.getActiveScanPatternRules();
      const extraRulesText = activeRules.length > 0 ? activeRules.join("\n") : undefined;
      const bets = await scanBetSlip({ imageBase64, players: playersWithAliases, extraRulesText });
      res.json({ success: true, bets });
    } catch (err) {
      console.error("Bet slip scan error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to scan bet slip" });
    }
  });

  // Bet slip photo scan endpoint (match-independent — no existing match required)
  app.post("/api/scan-bet-slip", isAuthenticated, async (req, res) => {
    try {
      const bodySchema = z.object({
        imageBase64: z.string().min(1),
        players: z.array(z.object({ id: z.number(), name: z.string() })),
      });
      const { imageBase64, players } = bodySchema.parse(req.body);

      const allAliases = await db.select().from(playerAliases);
      const aliasMap = new Map<string, string[]>();
      for (const a of allAliases) {
        if (!aliasMap.has(a.canonicalName)) aliasMap.set(a.canonicalName, []);
        aliasMap.get(a.canonicalName)!.push(a.alias);
      }
      const { PLAYER_ALIASES: HARDCODED_ALIASES_2 } = await import("@shared/models/auth");
      for (const [alias, canonical] of Object.entries(HARDCODED_ALIASES_2)) {
        if (!aliasMap.has(canonical)) aliasMap.set(canonical, []);
        if (!aliasMap.get(canonical)!.includes(alias)) aliasMap.get(canonical)!.push(alias);
      }
      const playersWithAliases = players.map(p => ({ ...p, aliases: aliasMap.get(p.name) ?? [] }));

      const activeRules = await storage.getActiveScanPatternRules();
      const extraRulesText = activeRules.length > 0 ? activeRules.join("\n") : undefined;
      const bets = await scanBetSlip({ imageBase64, players: playersWithAliases, extraRulesText });
      res.json({ success: true, bets });
    } catch (err) {
      console.error("Bet slip scan error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to scan bet slip" });
    }
  });

  // Log a bet slip scan correction (diff between what Gemini returned vs what user applied)
  app.post("/api/bet-slip-scan-correction-log", isAuthenticated, async (req, res) => {
    try {
      const schema = z.object({
        matchId: z.number().int().nullable().optional(),
        geminiOutput: z.record(z.any()),
        appliedOutput: z.record(z.any()),
        playerNames: z.array(z.string()),
        courseName: z.string().optional(),
      });
      const body = schema.parse(req.body);

      const log = await storage.createScanCorrectionLog({
        matchId: body.matchId ?? null,
        source: "bet_slip",
        courseName: body.courseName || "bet_slip",
        geminiOutput: [body.geminiOutput],
        appliedOutput: [body.appliedOutput],
        playerNames: body.playerNames,
      });
      res.json({ id: log.id });
    } catch (err) {
      console.error("Bet slip correction log error:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to log correction" });
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
      await storage.tryAutoLinkUserToGroupPlayer(group.id, userId).catch(() => {});
      res.json(group);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      await storage.tryAutoLinkUserToGroupPlayer(groupId, input.userId).catch(() => {});
      res.status(201).json(member);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
        await storage.tryAutoLinkUserToGroupPlayer(groupId, updated.userId).catch(() => {});
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
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
      await storage.tryAutoLinkGroupPlayerToMembers(groupId, input.presetPlayerId).catch(() => {});
      res.status(201).json(gp);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
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
          await storage.tryAutoLinkGroupPlayerToMembers(groupId, presetPlayerId).catch(() => {});
        } catch (err) {
        }
      }
      res.status(201).json(results);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
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
        await storage.tryAutoLinkGroupPlayerToMembers(groupId, presetPlayer.id).catch(() => {});
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

  // === PAIRING ENDPOINTS ===

  // GET group pairings summary (admin-only)
  app.get('/api/groups/:id/pairings', isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const user = req.user as any;
    const userId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, userId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can view pairings" });
    }
    try {
      const pairings = await storage.getGroupPairings(groupId);
      res.json(pairings);
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST pair a user to a preset player (admin-only, scoped to group members/players)
  app.post('/api/groups/:id/players/:presetPlayerId/pair', isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const presetPlayerId = parseInt(req.params.presetPlayerId);
    const user = req.user as any;
    const adminUserId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, adminUserId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can pair players" });
    }
    try {
      const schema = z.object({ userId: z.string().min(1) });
      const input = schema.parse(req.body);

      // Verify presetPlayerId belongs to this group
      const groupPlayers = await storage.getGroupPlayers(groupId);
      const playerInGroup = groupPlayers.some(gp => gp.presetPlayerId === presetPlayerId);
      if (!playerInGroup) {
        return res.status(400).json({ message: "Player does not belong to this group" });
      }

      // Verify target userId is a member of this group
      const targetMembership = await storage.getGroupMembership(groupId, input.userId);
      if (!targetMembership) {
        return res.status(400).json({ message: "User is not a member of this group" });
      }

      const updated = await storage.pairUserToPresetPlayer(presetPlayerId, input.userId);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // DELETE unpair a preset player from its user (admin-only, scoped to group players)
  app.delete('/api/groups/:id/players/:presetPlayerId/pair', isAuthenticated, async (req, res) => {
    const groupId = parseInt(req.params.id);
    const presetPlayerId = parseInt(req.params.presetPlayerId);
    const user = req.user as any;
    const adminUserId = user.claims.sub;
    const membership = await storage.getGroupMembership(groupId, adminUserId);
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ message: "Only group admins can unpair players" });
    }
    try {
      // Verify presetPlayerId belongs to this group before unpairing
      const groupPlayers = await storage.getGroupPlayers(groupId);
      const playerInGroup = groupPlayers.some(gp => gp.presetPlayerId === presetPlayerId);
      if (!playerInGroup) {
        return res.status(400).json({ message: "Player does not belong to this group" });
      }

      const updated = await storage.unpairUserFromPresetPlayer(presetPlayerId);
      res.json(updated);
    } catch (err) {
      if (err instanceof Error) {
        return res.status(400).json({ message: err.message });
      }
      console.error("[route error]", err);
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
      const eventType = input.eventType ?? 'ryder_cup';
      if (eventType === 'ryder_cup' && (!input.teamA || !input.teamB)) {
        return res.status(400).json({ message: "Ryder Cup events require two teams" });
      }
      const user = req.user as any;
      const event = await storage.createRyderCupEvent(input, user.claims.sub);
      res.status(201).json(event);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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

      // Notify event group members when event becomes active
      if (input.status === 'active' && event.groupId) {
        const user = req.user as any;
        const requestingUserId = user?.claims?.sub;
        notifyEventGroupMembers(
          id,
          event.name,
          'The event has started!',
          requestingUserId
        );
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
        username: currentUser.username,
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.log('[SMS Route] Importing plivo module...');
      const { generateVerificationCode, sendVerificationCode } = await import('./plivo');
      console.log('[SMS Route] Plivo module imported');
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.sms.sendMessage.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.sms.sendMessage.input.parse(req.body);
      const { sendSMS } = await import('./plivo');
      
      const result = await sendSMS(input.to, input.message);
      res.json({ success: result.success, sid: result.sid });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error('SMS send error:', err);
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === PHONE SETUP TOKEN ROUTES ===

  // Generate a short-lived signed token for a user's phone setup link
  // Accessible by: the user themselves, OR an admin of any group the target user belongs to
  app.post("/api/users/:userId/phone-setup-token", isAuthenticated, async (req, res) => {
    try {
      const caller = req.user as any;
      const callerId: string = caller.claims.sub;
      const targetUserId = req.params.userId;

      if (callerId !== targetUserId) {
        const { db } = await import("./db");
        const { groupMemberships, matches: matchesSchema, matchRoles: matchRolesSchema, players: playersSchema } = await import("../shared/schema");
        const { and, eq, inArray } = await import("drizzle-orm");

        let authorized = false;

        // Check that caller is admin of at least one group where target is also a member
        const callerAdminGroups = await db
          .select({ groupId: groupMemberships.groupId })
          .from(groupMemberships)
          .where(and(eq(groupMemberships.userId, callerId), eq(groupMemberships.role, "admin")));

        const adminGroupIds = callerAdminGroups.map(r => r.groupId);
        if (adminGroupIds.length > 0) {
          const targetMembership = await db
            .select({ id: groupMemberships.id })
            .from(groupMemberships)
            .where(and(
              eq(groupMemberships.userId, targetUserId),
              inArray(groupMemberships.groupId, adminGroupIds)
            ))
            .limit(1);

          if (targetMembership.length > 0) {
            authorized = true;
          }
        }

        // Also check if caller is a match creator or organizer and target is a player in one of those matches
        if (!authorized) {
          const creatorMatches = await db
            .select({ id: matchesSchema.id })
            .from(matchesSchema)
            .where(eq(matchesSchema.creatorId, callerId));

          const organizerMatchRoles = await db
            .select({ matchId: matchRolesSchema.matchId })
            .from(matchRolesSchema)
            .where(and(eq(matchRolesSchema.userId, callerId), eq(matchRolesSchema.role, "organizer")));

          const callerMatchIds = [
            ...creatorMatches.map(m => m.id),
            ...organizerMatchRoles.map(r => r.matchId),
          ];

          if (callerMatchIds.length > 0) {
            const targetPlayerInMatch = await db
              .select({ id: playersSchema.id })
              .from(playersSchema)
              .where(and(
                eq(playersSchema.userId, targetUserId),
                inArray(playersSchema.matchId, callerMatchIds)
              ))
              .limit(1);

            if (targetPlayerInMatch.length > 0) {
              authorized = true;
            }
          }
        }

        if (!authorized) {
          return res.status(403).json({ message: "Not authorized" });
        }
      }

      const { generatePhoneSetupToken } = await import("./phoneSetupToken");
      const token = generatePhoneSetupToken(targetUserId);
      res.json({ token });
    } catch (err) {
      console.error("[phone-setup-token]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Get phone verification status for all players in a match
  // Accessible by: match creator, organizers, viewers, and players in the match
  app.get("/api/matches/:matchId/players/phone-status", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.matchId);
      const caller = req.user as any;
      const callerId: string = caller.claims.sub;

      const { players: playersSchema, users: usersSchema, matchRoles: matchRolesSchema } = await import("../shared/schema");
      const { eq, inArray, and } = await import("drizzle-orm");

      // Verify the match exists and caller has access
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });

      const isCreator = match.creatorId === callerId;
      if (!isCreator) {
        // Check for explicit role (organizer/viewer) or player in match
        const [matchRole] = await db
          .select({ role: matchRolesSchema.role })
          .from(matchRolesSchema)
          .where(and(eq(matchRolesSchema.matchId, matchId), eq(matchRolesSchema.userId, callerId)))
          .limit(1);

        const matchPlayers = await db
          .select({ userId: playersSchema.userId })
          .from(playersSchema)
          .where(eq(playersSchema.matchId, matchId));

        const isParticipant = matchPlayers.some(p => p.userId === callerId);
        if (!matchRole && !isParticipant) {
          return res.status(403).json({ message: "Not authorized" });
        }

        const userIds = matchPlayers.map(p => p.userId).filter((id): id is string => id !== null);
        if (userIds.length === 0) return res.json([]);

        const userRecords = await db
          .select({ id: usersSchema.id, phoneVerified: usersSchema.phoneVerified })
          .from(usersSchema)
          .where(inArray(usersSchema.id, userIds));

        return res.json(userRecords.map(u => ({ userId: u.id, phoneVerified: u.phoneVerified ?? false })));
      }

      // Creator path — fetch all players directly
      const matchPlayers = await db.select({ userId: playersSchema.userId }).from(playersSchema).where(eq(playersSchema.matchId, matchId));
      const userIds = matchPlayers.map(p => p.userId).filter((id): id is string => id !== null);

      if (userIds.length === 0) return res.json([]);

      const userRecords = await db
        .select({ id: usersSchema.id, phoneVerified: usersSchema.phoneVerified })
        .from(usersSchema)
        .where(inArray(usersSchema.id, userIds));

      res.json(userRecords.map(u => ({ userId: u.id, phoneVerified: u.phoneVerified ?? false })));
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Send verification code for phone setup — public endpoint, accepts token or session auth
  app.post("/api/sms/send-setup-code", async (req, res) => {
    try {
      const schema = z.object({
        phone: z.string().min(10),
        token: z.string().optional(),
      });
      const { phone, token } = schema.parse(req.body);

      // Validate: must have a valid token OR an authenticated session
      if (token) {
        const { verifyPhoneSetupToken } = await import("./phoneSetupToken");
        const userId = verifyPhoneSetupToken(token);
        if (!userId) {
          return res.status(401).json({ message: "Invalid or expired setup link. Please request a new one." });
        }
      } else {
        const sessionUserId = (req.session as any)?.userId;
        if (!sessionUserId) {
          return res.status(401).json({ message: "Authentication required" });
        }
      }

      // Rate limit check (reuse the smsRateLimits map already declared above)
      const rateLimit = smsRateLimits.get(phone);
      const now = Date.now();
      if (rateLimit) {
        const timeSinceLastSend = now - rateLimit.lastSent;
        if (timeSinceLastSend < SMS_RATE_LIMIT_WINDOW) {
          const waitTime = Math.ceil((SMS_RATE_LIMIT_WINDOW - timeSinceLastSend) / 1000);
          return res.status(429).json({ message: `Please wait ${waitTime} seconds before requesting another code` });
        }
      }

      const { generateVerificationCode, sendVerificationCode } = await import("./plivo");
      const code = generateVerificationCode();
      await storage.createVerificationCode(phone, code);

      const result = await sendVerificationCode(phone, code);
      if (result.success) {
        smsRateLimits.set(phone, { lastSent: now, attempts: 0 });
        res.json({ success: true, message: "Verification code sent" });
      } else {
        res.status(500).json({ message: result.error || "Failed to send verification code" });
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[send-setup-code]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Verify code for phone setup — public, validates token/session, sets phone + creates opt-in
  app.post("/api/sms/phone-setup-verify", async (req, res) => {
    try {
      const schema = z.object({
        phone: z.string().min(10),
        code: z.string().length(6),
        consentGiven: z.boolean().optional().default(false),
        token: z.string().optional(),
      });
      const { phone, code, consentGiven, token } = schema.parse(req.body);

      // Resolve userId from token or session — one of the two is required
      let userId: string | null = null;
      if (token) {
        const { verifyPhoneSetupToken } = await import("./phoneSetupToken");
        userId = verifyPhoneSetupToken(token);
        if (!userId) {
          return res.status(401).json({ message: "Invalid or expired setup link. Please request a new one." });
        }
      } else {
        userId = (req.session as any)?.userId ?? null;
      }

      if (!userId) {
        return res.status(401).json({ message: "Authentication required. Please use a setup link or log in." });
      }

      // Consent is required to complete phone setup
      if (!consentGiven) {
        return res.status(400).json({ message: "You must agree to receive SMS alerts to complete phone setup." });
      }

      // Rate limit check
      let rateLimit = smsRateLimits.get(phone);
      if (!rateLimit) {
        rateLimit = { lastSent: 0, attempts: 0 };
        smsRateLimits.set(phone, rateLimit);
      }
      if (rateLimit.attempts >= SMS_MAX_ATTEMPTS) {
        return res.status(429).json({ message: "Too many verification attempts. Please request a new code." });
      }
      rateLimit.attempts++;

      const verified = await storage.verifyCode(phone, code);
      if (!verified) {
        return res.json({ success: true, verified: false });
      }

      smsRateLimits.delete(phone);

      // Atomically update profile + upsert opt-in record (delete-then-insert to avoid duplicate rows)
      await db.transaction(async (tx) => {
        await tx.update(usersTable)
          .set({ phone, phoneVerified: true })
          .where(eq(usersTable.id, userId));

        // Remove any prior opt-in rows for this user to avoid duplicates
        await tx.delete(smsOptIns).where(eq(smsOptIns.userId, userId));

        await tx.insert(smsOptIns).values({
          phoneNumber: phone,
          consentGiven: consentGiven,
          userId,
        });
      });

      res.json({ success: true, verified: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[phone-setup-verify]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
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
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // === EVENT PLAYING GROUPS ===
  // Helper to check if user can manage playing groups for an event
  async function canManagePlayingGroups(eventId: number, userId: string): Promise<boolean> {
    if (userId === ADMIN_USER_ID) return true;
    const isAdmin = await storage.isUserAdmin(userId);
    if (isAdmin) return true;
    const event = await storage.getRyderCupEvent(eventId);
    if (!event) return false;
    return event.creatorId === userId;
  }

  // GET /api/events/:eventId/playing-groups — fetch saved groups
  app.get("/api/events/:eventId/playing-groups", isAuthenticated, async (req, res) => {
    try {
      const eventId = parseInt(req.params.eventId);
      const groups = await storage.getEventPlayingGroups(eventId);
      res.json(groups);
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // POST /api/events/:eventId/playing-groups/generate — run algorithm, return preview
  app.post("/api/events/:eventId/playing-groups/generate", isAuthenticated, async (req, res) => {
    try {
      const eventId = parseInt(req.params.eventId);
      const user = req.user as any;
      if (!(await canManagePlayingGroups(eventId, user.claims.sub))) {
        return res.status(403).json({ message: "Only the event creator can generate playing groups" });
      }

      const schema = z.object({
        players: z.array(z.string().min(1)).min(1),
        lockedSets: z.array(z.array(z.string().min(1)).min(2).max(4)).default([]),
      }).refine((data) => {
        const playerSet = new Set(data.players);
        const seenInLock = new Set<string>();
        for (const set of data.lockedSets) {
          for (const p of set) {
            if (!playerSet.has(p)) return false;
            if (seenInLock.has(p)) return false;
            seenInLock.add(p);
          }
        }
        return true;
      }, { message: "Locked set players must be in the roster and not appear in multiple locked sets" });
      const { players, lockedSets } = schema.parse(req.body);

      const { generatePlayingGroups } = await import("../shared/playingGroups");
      const generated = generatePlayingGroups(players, lockedSets);
      const preview = generated.map((g) => ({
        players: g.players,
        lockedPlayerNames: Array.from(g.lockedPlayerNames),
      }));
      res.json(preview);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof Error && err.name === "PlayingGroupsConstraintError") {
        return res.status(400).json({ message: err.message });
      }
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // PUT /api/events/:eventId/playing-groups — save arrangement
  app.put("/api/events/:eventId/playing-groups", isAuthenticated, async (req, res) => {
    try {
      const eventId = parseInt(req.params.eventId);
      const user = req.user as any;
      if (!(await canManagePlayingGroups(eventId, user.claims.sub))) {
        return res.status(403).json({ message: "Only the event creator can save playing groups" });
      }

      const schema = z.object({
        groups: z.array(z.object({
          members: z.array(z.object({
            playerName: z.string().min(1),
            teamMemberId: z.number().int().positive().optional().nullable(),
          })).min(1),
          lockedPlayerNames: z.array(z.string()).default([]),
        })).min(1),
      });
      const { groups } = schema.parse(req.body);

      const saved = await storage.saveEventPlayingGroups(eventId, groups);
      res.json(saved);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // DELETE /api/events/:eventId/playing-groups — clear groups
  app.delete("/api/events/:eventId/playing-groups", isAuthenticated, async (req, res) => {
    try {
      const eventId = parseInt(req.params.eventId);
      const user = req.user as any;
      if (!(await canManagePlayingGroups(eventId, user.claims.sub))) {
        return res.status(403).json({ message: "Only the event creator can delete playing groups" });
      }
      await storage.deleteEventPlayingGroups(eventId);
      res.status(204).send();
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin: list scan correction logs
  app.get("/api/admin/scan-correction-logs", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      const logs = await storage.listScanCorrectionLogs();
      res.json(logs);
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin: list scan patterns
  app.get("/api/admin/scan-patterns", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      const patterns = await storage.listScanPatterns();
      res.json(patterns);
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin: analyze correction logs to detect and upsert patterns
  app.post("/api/admin/scan-patterns/analyze", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      const minOccurrences = Number(req.body?.minOccurrences ?? 2);
      const logs = await storage.listScanCorrectionLogs();
      const detected = analyzeCorrectionLogs(logs, minOccurrences);
      const patterns = await storage.upsertScanPatterns(detected);
      res.json({ analyzed: logs.length, detected: detected.length, patterns });
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin: auto-learn per-course patterns from correction logs (machine-generated rules)
  app.post("/api/admin/scan-patterns/auto-learn", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      const minOccurrences = Number(req.body?.minOccurrences ?? 2);
      const logs = await storage.listScanCorrectionLogs();
      // Only analyze accepted/applied scans: non-bet-slip logs where appliedOutput
      // contains at least one player entry (empty array = scan was never applied).
      const scorecardLogs = logs.filter(l =>
        l.source !== "bet_slip" &&
        Array.isArray(l.appliedOutput) &&
        (l.appliedOutput as any[]).length > 0
      );
      const detected = analyzeByCourseName(scorecardLogs, minOccurrences);
      const patterns = await storage.upsertScanPatterns(detected);
      const courses = Array.from(new Set(scorecardLogs.map(l => (l as any).courseName).filter(Boolean)));
      res.json({
        analyzed: scorecardLogs.length,
        courses: courses.length,
        detected: detected.length,
        patterns,
      });
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin: send a test SMS to verify Plivo is wired up
  app.post("/api/admin/scan-compare", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      const { imageBase64, playerNames, imageThumbnail } = z.object({
        imageBase64: z.string(),
        playerNames: z.array(z.string()).default([]),
        imageThumbnail: z.string().optional(),
      }).parse(req.body);

      const params = { imageBase64, playerNames };

      const [geminiResult, grokResult] = await Promise.allSettled([
        (async () => {
          const start = Date.now();
          const result = await scanScorecardImageWithGemini(params);
          return { ...result, durationMs: Date.now() - start, error: null };
        })(),
        (async () => {
          const start = Date.now();
          const result = await scanScorecardImageWithGrok(params);
          return { ...result, durationMs: Date.now() - start, error: null };
        })(),
      ]);

      const gemini = geminiResult.status === "fulfilled"
        ? geminiResult.value
        : { scores: [], rawText: "", durationMs: 0, error: (geminiResult.reason as Error)?.message ?? "Unknown error" };

      const grok = grokResult.status === "fulfilled"
        ? grokResult.value
        : { scores: [], rawText: "", durationMs: 0, error: (grokResult.reason as Error)?.message ?? "Unknown error" };

      // Calculate agreement stats across all players
      let totalHoles = 0;
      let matchedHoles = 0;
      const allPlayerNames = Array.from(new Set([
        ...(gemini.scores ?? []).map((p: any) => p.playerName),
        ...(grok.scores ?? []).map((p: any) => p.playerName),
      ]));
      for (const playerName of allPlayerNames) {
        const gPlayer = (gemini.scores ?? []).find((p: any) => p.playerName === playerName);
        const rPlayer = (grok.scores ?? []).find((p: any) => p.playerName === playerName);
        for (let h = 1; h <= 18; h++) {
          const gVal = gPlayer?.holes?.find((x: any) => x.holeNumber === h)?.strokes;
          const rVal = rPlayer?.holes?.find((x: any) => x.holeNumber === h)?.strokes;
          if (gVal != null && rVal != null) {
            totalHoles++;
            if (gVal === rVal) matchedHoles++;
          }
        }
      }

      // Persist the comparison result
      const saved = await storage.createScanComparison({
        playerNames,
        imageThumbnail: imageThumbnail ?? null,
        geminiResult: gemini,
        grokResult: grok,
        totalHoles,
        matchedHoles,
      });

      res.json({ gemini, grok, comparisonId: saved.id, totalHoles, matchedHoles });
    } catch (err: any) {
      console.error("[admin scan-compare error]", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: err instanceof Error ? err.message : "Failed to compare scans" });
    }
  });

  // Admin: list past scan comparison runs
  app.get("/api/admin/scan-comparisons", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      const rows = await storage.listScanComparisons();
      res.json(rows);
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin: get a specific scan comparison run
  app.get("/api/admin/scan-comparisons/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      const id = Number(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
      const row = await storage.getScanComparison(id);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/test-scan", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      const { imageBase64, playerNames } = z.object({
        imageBase64: z.string(),
        playerNames: z.array(z.string()).default([]),
      }).parse(req.body);
      const result = await scanScorecardImage({
        imageBase64,
        playerNames,
        provider: "grok",
      });
      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error("[admin test-scan error]", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ ok: false, message: err.errors[0].message });
      }
      const msg = err instanceof Error ? err.message : "Failed to scan image";
      const status = msg.includes("XAI_API_KEY") ? 400 : 500;
      res.status(status).json({ ok: false, message: msg });
    }
  });

  app.post("/api/admin/test-sms", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      let to: string = req.body?.to ?? "";
      if (!to) {
        const profile = await storage.getUser(userId);
        to = profile?.phone ?? "";
      }
      if (!to) {
        return res.status(400).json({ message: "No phone number provided and no phone number found on your profile. Add one in your profile settings first." });
      }
      const { sendSMS } = await import("./plivo");
      const result = await sendSMS(to, "Golf Betting test message — Plivo is wired up correctly! ⛳");
      if (result.success) {
        res.json({ ok: true, sid: result.sid, to });
      } else {
        res.status(502).json({ ok: false, error: result.error ?? "Unknown error" });
      }
    } catch (err: any) {
      console.error("[route error]", err);
      res.status(500).json({ message: err.message ?? "Internal server error" });
    }
  });

  // Admin: get/set app settings
  app.get("/api/admin/settings", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      const scanProvider = (await storage.getAppSetting("scanProvider")) ?? "gemini";
      res.json({ scanProvider });
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/settings", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      const { scanProvider } = req.body;
      if (scanProvider !== "gemini" && scanProvider !== "grok") {
        return res.status(400).json({ message: "scanProvider must be 'gemini' or 'grok'" });
      }
      await storage.setAppSetting("scanProvider", scanProvider);
      res.json({ scanProvider });
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin: mark a scan pattern as addressed (or reactivate it)
  app.patch("/api/admin/scan-patterns/:id/addressed", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid pattern id" });
      const { addressed } = req.body;
      if (typeof addressed !== "boolean") {
        return res.status(400).json({ message: "addressed must be a boolean" });
      }
      const pattern = await storage.markPatternAddressed(id, addressed);
      if (!pattern) return res.status(404).json({ message: "Pattern not found" });
      res.json(pattern);
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin: list all users
  app.get("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      const { authStorage } = await import("./replit_integrations/auth/storage");
      const allUsers = await authStorage.getAllUsers();
      // Strip password hashes before returning to client
      res.json(allUsers.map(({ passwordHash: _pw, ...safe }) => safe));
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Admin: reset a user's password
  app.patch("/api/admin/users/:id/password", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      if (userId !== ADMIN_USER_ID && !(await storage.isUserAdmin(userId))) {
        return res.status(403).json({ message: "Admin only" });
      }
      const { password, username } = req.body;
      if (!password || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const bcrypt = await import("bcryptjs");
      const passwordHash = await bcrypt.hash(password, 12);
      const { authStorage } = await import("./replit_integrations/auth/storage");
      await authStorage.setUserPassword(req.params.id, passwordHash);
      if (username) {
        await authStorage.setUserUsername(req.params.id, username);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Self: change own password
  app.patch("/api/auth/change-password", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password required" });
      }
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: "New password must be at least 6 characters" });
      }
      const { authStorage } = await import("./replit_integrations/auth/storage");
      const existingUser = await authStorage.getUser(userId);
      if (!existingUser) return res.status(404).json({ message: "User not found" });
      if (!existingUser.passwordHash) {
        return res.status(400).json({ message: "No password set — ask an admin to set one" });
      }
      const bcrypt = await import("bcryptjs");
      const valid = await bcrypt.compare(currentPassword, existingUser.passwordHash);
      if (!valid) return res.status(401).json({ message: "Current password incorrect" });
      const passwordHash = await bcrypt.hash(newPassword, 12);
      await authStorage.setUserPassword(userId, passwordHash);
      res.json({ ok: true });
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Self: change own username
  app.patch("/api/auth/username", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const userId = user.claims.sub;
      const { username } = req.body;
      if (!username || typeof username !== "string") {
        return res.status(400).json({ message: "Username is required" });
      }
      const trimmed = username.trim().toLowerCase();
      if (trimmed.length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }
      if (trimmed.length > 30) {
        return res.status(400).json({ message: "Username must be 30 characters or fewer" });
      }
      if (!/^[a-z0-9_]+$/.test(trimmed)) {
        return res.status(400).json({ message: "Username may only contain letters, numbers, and underscores" });
      }
      const { authStorage } = await import("./replit_integrations/auth/storage");
      const existing = await authStorage.getUserByUsername(trimmed);
      if (existing && existing.id !== userId) {
        return res.status(409).json({ message: "That username is already taken" });
      }
      await authStorage.setUserUsername(userId, trimmed);
      res.json({ ok: true, username: trimmed });
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Count eligible SMS recipients for a match (verified-phone group members) ─
  app.get("/api/matches/:id/notify-eligible-count", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id, 10);
      if (isNaN(matchId)) return res.status(400).json({ message: "Invalid match ID" });
      const user = req.user as any;
      const userId: string = user.claims.sub;
      const [match, roleRecord] = await Promise.all([
        storage.getMatch(matchId),
        storage.getMatchRole(matchId, userId),
      ]);
      if (!match) return res.status(404).json({ message: "Match not found" });
      const isOrganizerOrCreator = match.creatorId === userId || roleRecord?.role === "organizer";
      if (!isOrganizerOrCreator) return res.status(403).json({ message: "Not authorized" });
      if (!match.groupId) return res.json({ count: 0 });
      const members = await storage.getGroupMembersWithPhone(match.groupId);
      return res.json({ count: members.length });
    } catch (err) {
      console.error("[notify-eligible-count error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ─── Notify match players via SMS ───────────────────────────────────────────
  app.post("/api/matches/:id/notify-players", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id, 10);
      if (isNaN(matchId)) return res.status(400).json({ message: "Invalid match ID" });

      const user = req.user as any;
      const userId: string = user.claims.sub;
      const match = await storage.getMatch(matchId);
      if (!match) return res.status(404).json({ message: "Match not found" });

      const roleRecord = await storage.getMatchRole(matchId, userId);
      const isOrganizerOrCreator = match.creatorId === userId || roleRecord?.role === "organizer";
      if (!isOrganizerOrCreator) return res.status(403).json({ message: "Not authorized" });

      if (!match.groupId) return res.status(400).json({ message: "Match has no group — cannot notify players" });
      if (!match.matchCode) return res.status(400).json({ message: "Match has no code yet" });

      const members = await storage.getGroupMembersWithPhone(match.groupId);
      if (members.length === 0) return res.status(200).json({ sent: 0, message: "No group members with phone numbers" });

      const matchName = match.name || match.courseName;
      const players = await storage.getMatchPlayers(matchId);
      const playerNames = players.map((p: { name: string }) => p.name).join(", ");
      const msgBody = `⛳ You're invited to "${matchName}"!\nPlayers: ${playerNames || "TBD"}\nMatch code: ${match.matchCode}\n\nText a photo of your scorecard or your bet (e.g. "Nassau $20 — DLoe vs Zimm") with code ${match.matchCode} to join in.`;

      const results = await Promise.allSettled(
        members.map(m => sendSMS(m.phone, msgBody))
      );

      const recipients = members.map((m, i) => {
        const r = results[i];
        const name = m.presetPlayerName || m.firstName || `…${m.phone.slice(-4)}`;
        const success = r.status === "fulfilled" && (r as PromiseFulfilledResult<{ success: boolean }>).value.success;
        return { name, success };
      });

      const sent = recipients.filter(r => r.success).length;
      const failed = recipients.length - sent;

      res.json({ sent, failed, total: recipients.length, recipients: recipients.map(r => ({ name: r.name })) });
    } catch (err) {
      console.error("[notify-players error]", err);
      res.status(500).json({ message: "Failed to send notifications" });
    }
  });

  // ─── Pending SMS bets CRUD ──────────────────────────────────────────────────
  app.get("/api/matches/:id/pending-sms-bets", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id, 10);
      if (isNaN(matchId)) return res.status(400).json({ message: "Invalid match ID" });

      const user = req.user as any;
      const userId: string = user.claims.sub;
      const [match, roleRecord] = await Promise.all([
        storage.getMatch(matchId),
        storage.getMatchRole(matchId, userId),
      ]);
      if (!match) return res.status(404).json({ message: "Match not found" });
      const isOrganizerOrCreator = match.creatorId === userId || roleRecord?.role === "organizer";
      if (!isOrganizerOrCreator) return res.status(403).json({ message: "Not authorized" });

      const bets = await storage.listPendingSmsBets(matchId);
      res.json(bets);
    } catch (err) {
      console.error("[pending-sms-bets list error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/matches/:id/pending-sms-bets/:betId", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id, 10);
      const betId = parseInt(req.params.betId, 10);
      if (isNaN(matchId) || isNaN(betId)) return res.status(400).json({ message: "Invalid ID" });

      const user = req.user as any;
      const userId: string = user.claims.sub;
      const [match, roleRecord, bet] = await Promise.all([
        storage.getMatch(matchId),
        storage.getMatchRole(matchId, userId),
        storage.getPendingSmsBet(betId),
      ]);
      if (!match) return res.status(404).json({ message: "Match not found" });
      const isOrganizerOrCreator = match.creatorId === userId || roleRecord?.role === "organizer";
      if (!isOrganizerOrCreator) return res.status(403).json({ message: "Not authorized" });
      if (!bet || bet.matchId !== matchId) return res.status(404).json({ message: "Bet not found" });

      const { status, parsedBets } = req.body;
      const updateData: Partial<{ status: string; parsedBets: import("@shared/schema").ParsedSmsBet[] | null }> = {};
      if (status !== undefined) {
        if (!["pending", "duplicate", "dismissed"].includes(status)) {
          return res.status(400).json({ message: "Invalid status — use the apply endpoint to apply a bet" });
        }
        updateData.status = status;
      }
      if (parsedBets !== undefined) {
        if (!Array.isArray(parsedBets)) return res.status(400).json({ message: "parsedBets must be an array" });
        updateData.parsedBets = parsedBets;
      }
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const updated = await storage.updatePendingSmsBet(betId, updateData);
      res.json(updated);
    } catch (err) {
      console.error("[pending-sms-bets patch error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Apply a pending SMS bet — marks it applied and creates an eventMatch for organizer review
  app.post("/api/matches/:id/pending-sms-bets/:betId/apply", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id, 10);
      const betId = parseInt(req.params.betId, 10);
      if (isNaN(matchId) || isNaN(betId)) return res.status(400).json({ message: "Invalid ID" });

      const user = req.user as any;
      const userId: string = user.claims.sub;
      const [match, roleRecord, bet] = await Promise.all([
        storage.getMatch(matchId),
        storage.getMatchRole(matchId, userId),
        storage.getPendingSmsBet(betId),
      ]);
      if (!match) return res.status(404).json({ message: "Match not found" });
      const isOrganizerOrCreator = match.creatorId === userId || roleRecord?.role === "organizer";
      if (!isOrganizerOrCreator) return res.status(403).json({ message: "Not authorized" });
      if (!bet || bet.matchId !== matchId) return res.status(404).json({ message: "Bet not found" });
      if (bet.status === "applied") return res.status(409).json({ message: "Bet is already applied" });
      if (bet.status === "dismissed") return res.status(409).json({ message: "Bet has been dismissed" });

      const parsedBets = (bet.parsedBets ?? []) as import("@shared/schema").ParsedSmsBet[];
      if (parsedBets.length === 0) {
        return res.status(422).json({ message: "No parsed bets to apply — edit the bet first to add bet details before applying" });
      }
      const matchPlayers = await storage.getMatchPlayers(matchId);

      // Map AI bet type labels to internal MATCH_TYPES keys
      const betTypeMap: Record<string, string> = {
        nassau: "nassau",
        match_play: "match_play_1_ball",
        skins: "skins",
        stroke_play: "stroke_play",
        side: "nassau",
        other: "nassau",
      };

      // Fuzzy-match a player name string to a match player ID
      const resolvePlayerId = (name: string): number | null => {
        const lc = name.toLowerCase().trim();
        const found = matchPlayers.find(p =>
          p.name.toLowerCase() === lc || p.name.toLowerCase().includes(lc) || lc.includes(p.name.toLowerCase())
        );
        return found ? found.id : null;
      };

      // Build a human-readable team name from player IDs (e.g. "Sam / JP")
      const makeTeamName = (playerIds: number[]): string => {
        const names = playerIds
          .map(id => matchPlayers.find(p => p.id === id)?.name)
          .filter(Boolean) as string[];
        return names.length > 0 ? names.join(" / ") : "Team";
      };

      // Generate all 2-player team combos from a list of player IDs, optionally filtered by keyed IDs
      const generateTwoPlayerTeams = (playerIds: number[], keyedIds: number[] = []): [number, number][] => {
        const teams: [number, number][] = [];
        for (let i = 0; i < playerIds.length; i++) {
          for (let j = i + 1; j < playerIds.length; j++) {
            teams.push([playerIds[i], playerIds[j]]);
          }
        }
        if (keyedIds.length > 0) {
          return teams.filter(t => keyedIds.includes(t[0]) || keyedIds.includes(t[1]));
        }
        return teams;
      };

      const createdEventMatches = [];
      const failedBets: string[] = [];
      for (const pb of parsedBets) {
        // Press action: find the appropriate parent event match and create a press
        if (pb.betType === "press" && pb.pressStartHole) {
          const allEms = await storage.getEventMatchesWithTeamsBulk(matchId);
          const rootBets = allEms.filter((em: any) => !em.parentMatchId);
          let targetEm: any = rootBets.length > 0 ? rootBets[rootBets.length - 1] : null;
          if (pb.targetBetName && rootBets.length > 1) {
            const tgt = pb.targetBetName.toLowerCase();
            const fuzzy = rootBets.find((em: any) => {
              const n = (em.name || '').toLowerCase();
              return n.includes(tgt) || tgt.includes(n);
            });
            if (fuzzy) targetEm = fuzzy;
          }
          if (!targetEm) {
            console.warn("[apply-sms-bet] No root event match found to press against");
            failedBets.push(pb.description);
            continue;
          }
          try {
            const pressMatch = await storage.createPressMatch(targetEm.id, pb.pressStartHole);
            createdEventMatches.push(pressMatch);
          } catch (pressErr) {
            console.warn("[apply-sms-bet] Could not create press:", pressErr);
            failedBets.push(pb.description);
          }
          continue;
        }

        const matchType = betTypeMap[pb.betType] ?? "nassau";
        const unitAmount = pb.amountCents > 0 ? pb.amountCents : 0;

        // Build a map of playerId → strokes for any stroke overrides in this bet
        const playerStrokesMap = new Map<number, number>();
        for (const ps of pb.playerStrokes ?? []) {
          const pid = resolvePlayerId(ps.player);
          if (pid !== null) playerStrokesMap.set(pid, ps.strokes);
        }
        const hasStrokes = playerStrokesMap.size > 0;

        if (pb.isRoundRobin && pb.teamAPlayers && pb.teamBPlayers) {
          // Round Robin: generate all cross-product 2v2 pairings between the two groups
          const groupAIds = pb.teamAPlayers.map(resolvePlayerId).filter((id): id is number => id !== null);
          const groupBIds = pb.teamBPlayers.map(resolvePlayerId).filter((id): id is number => id !== null);
          const keyedIds = (pb.keyedPlayers ?? []).map(resolvePlayerId).filter((id): id is number => id !== null);

          // Defensive: if a keyed (wheel) player is absent from both groups (old parser format
          // where the wheel was not included in teamAPlayers/teamBPlayers), infer their side
          // from the description and prepend them to the correct group.
          const _descVsSplit = (pb.description ?? '').split(' vs ');
          const _descSideA = (_descVsSplit[0] ?? '').toLowerCase();
          const _descSideB = (_descVsSplit[1] ?? '').toLowerCase();
          for (const kId of keyedIds) {
            if (!groupAIds.includes(kId) && !groupBIds.includes(kId)) {
              const kName = (matchPlayers.find(p => p.id === kId)?.name ?? '').toLowerCase();
              if (kName && _descSideA.includes(kName)) {
                groupAIds.unshift(kId);
              } else if (kName && _descSideB.includes(kName)) {
                groupBIds.unshift(kId);
              } else {
                groupAIds.unshift(kId);
              }
            }
          }

          // Split keyed players by which group they belong to
          const keyedAIds = keyedIds.filter(id => groupAIds.includes(id));
          const keyedBIds = keyedIds.filter(id => groupBIds.includes(id));

          const groupATeams = generateTwoPlayerTeams(groupAIds, keyedAIds);
          const groupBTeams = generateTwoPlayerTeams(groupBIds, keyedBIds);

          if (groupATeams.length === 0 || groupBTeams.length === 0) {
            console.warn("[apply-sms-bet] Round Robin could not generate pairings — insufficient resolved players", { groupAIds, groupBIds });
            failedBets.push(pb.description);
            continue;
          }

          let pairingIndex = 1;
          for (const teamA of groupATeams) {
            for (const teamB of groupBTeams) {
              const pairingName = `${pb.description} (${pairingIndex++}/${groupATeams.length * groupBTeams.length})`;
              try {
                const em = await storage.createEventMatch(matchId, {
                  name: pairingName,
                  matchType,
                  unitAmount,
                  teamA: { name: makeTeamName([...teamA]), playerIds: [...teamA] },
                  teamB: { name: makeTeamName([...teamB]), playerIds: [...teamB] },
                  autoPressOriginal: true,
                  autoPressAllPresses: false,
                  autoPressNassauFront9: true,
                  autoPressNassauBack9: true,
                  autoPressNassauOverall: true,
                  useNetScoring: hasStrokes,
                  startOnBack9: false,
                  isRoundRobinGenerated: true,
                  sourceSmsBetId: betId,
                });
                // Apply per-player stroke overrides — players not in the map get 0 (scratch)
                if (hasStrokes) {
                  for (const pid of [...teamA, ...teamB]) {
                    try {
                      await storage.upsertMatchPlayerHandicap({ eventMatchId: em.id, playerId: pid, courseHandicap: playerStrokesMap.get(pid) ?? 0 });
                    } catch (hErr) {
                      console.warn("[apply-sms-bet] Could not set stroke override:", hErr);
                    }
                  }
                }
                createdEventMatches.push(em);
              } catch (emErr) {
                console.warn("[apply-sms-bet] Could not create Round Robin eventMatch:", emErr);
                failedBets.push(pairingName);
              }
            }
          }
        } else {
          // Standard bet: split players evenly across two teams
          const teamAIds: number[] = [];
          const teamBIds: number[] = [];
          for (let i = 0; i < pb.players.length; i++) {
            const id = resolvePlayerId(pb.players[i]);
            if (id !== null) {
              (i % 2 === 0 ? teamAIds : teamBIds).push(id);
            }
          }

          try {
            const em = await storage.createEventMatch(matchId, {
              name: pb.description,
              matchType,
              unitAmount,
              teamA: { name: makeTeamName(teamAIds), playerIds: teamAIds },
              teamB: { name: makeTeamName(teamBIds), playerIds: teamBIds },
              autoPressOriginal: true,
              autoPressAllPresses: false,
              autoPressNassauFront9: true,
              autoPressNassauBack9: true,
              autoPressNassauOverall: true,
              useNetScoring: hasStrokes,
              startOnBack9: false,
            });
            // Apply per-player stroke overrides — players not in the map get 0 (scratch)
            if (hasStrokes) {
              for (const pid of [...teamAIds, ...teamBIds]) {
                try {
                  await storage.upsertMatchPlayerHandicap({ eventMatchId: em.id, playerId: pid, courseHandicap: playerStrokesMap.get(pid) ?? 0 });
                } catch (hErr) {
                  console.warn("[apply-sms-bet] Could not set stroke override:", hErr);
                }
              }
            }
            createdEventMatches.push(em);
          } catch (emErr) {
            console.warn("[apply-sms-bet] Could not create eventMatch for parsed bet:", emErr);
            failedBets.push(pb.description);
          }
        }
      }

      // Only mark applied if at least one event match was successfully created
      // (or if there were no parsedBets at all, treat as applied acknowledgement)
      if (parsedBets.length > 0 && createdEventMatches.length === 0) {
        return res.status(422).json({
          message: "Failed to create any bet records — review parsed data and try again",
          failedBets,
        });
      }

      const updated = await storage.updatePendingSmsBet(betId, { status: "applied" });
      res.json({ ok: true, bet: updated, createdEventMatches, failedBets });
    } catch (err) {
      console.error("[apply-sms-bet error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/matches/:id/pending-sms-bets/:betId", isAuthenticated, async (req, res) => {
    try {
      const matchId = parseInt(req.params.id, 10);
      const betId = parseInt(req.params.betId, 10);
      if (isNaN(matchId) || isNaN(betId)) return res.status(400).json({ message: "Invalid ID" });

      const user = req.user as any;
      const userId: string = user.claims.sub;
      const [match, roleRecord, bet] = await Promise.all([
        storage.getMatch(matchId),
        storage.getMatchRole(matchId, userId),
        storage.getPendingSmsBet(betId),
      ]);
      if (!match) return res.status(404).json({ message: "Match not found" });
      const isOrganizerOrCreator = match.creatorId === userId || roleRecord?.role === "organizer";
      if (!isOrganizerOrCreator) return res.status(403).json({ message: "Not authorized" });
      if (!bet || bet.matchId !== matchId) return res.status(404).json({ message: "Bet not found" });

      await storage.deletePendingSmsBet(betId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[pending-sms-bets delete error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── API Key Management (session-auth only) ──────────────────────────────────
  app.get("/api/api-keys", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const keys = await storage.getApiKeys(user.claims.sub);
      res.json(keys.map(k => ({ id: k.id, name: k.name, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt })));
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/api-keys", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body);

      const crypto = await import("crypto");
      const rawKey = "dgk_" + crypto.randomBytes(32).toString("hex");
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

      const key = await storage.createApiKey(user.claims.sub, name, keyHash);
      res.status(201).json({ id: key.id, name: key.name, createdAt: key.createdAt, rawKey });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/api-keys/:id", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteApiKey(id, user.claims.sub);
      if (!deleted) return res.status(404).json({ message: "Key not found" });
      res.status(204).send();
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── isApiKeyAuth middleware ──────────────────────────────────────────────────
  async function isApiKeyAuth(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization as string | undefined;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing or invalid Authorization header" });
    }
    const rawKey = authHeader.slice(7);
    const crypto = await import("crypto");
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const keyRow = await storage.getApiKeyByHash(keyHash);
    if (!keyRow) return res.status(401).json({ message: "Invalid API key" });
    storage.updateApiKeyLastUsed(keyRow.id).catch(() => {});
    req.apiKeyUserId = keyRow.userId;
    next();
  }

  function sessionOrApiKey(req: any, res: any, next: any) {
    if (req.headers.authorization?.startsWith("Bearer ")) {
      return isApiKeyAuth(req, res, next);
    }
    return isAuthenticated(req, res, next);
  }

  function getExportUserId(req: any): string {
    return req.apiKeyUserId ?? (req.user as any).claims.sub;
  }

  // ── Export endpoints ─────────────────────────────────────────────────────────
  function parseDateParam(val: unknown): Date | undefined {
    if (typeof val !== "string" || !val) return undefined;
    const d = new Date(val);
    return isNaN(d.getTime()) ? undefined : d;
  }

  async function buildScoresWorkbook(userId: string, start?: Date, end?: Date) {
    const XLSX = await import("xlsx");
    const [scoreRows, betRows] = await Promise.all([
      storage.getExportScores(userId, start, end),
      storage.getExportBetResults(userId),
    ]);

    // ── Scores sheet: one row per player per match ──────────────────────────
    const grouped = new Map<string, { date: Date; courseName: string; matchName: string | null; playerName: string; holes: Record<number, number> }>();
    for (const row of scoreRows) {
      const key = `${row.date.toISOString()}|${row.courseName}|${row.matchName ?? ""}|${row.playerName}`;
      if (!grouped.has(key)) {
        grouped.set(key, { date: row.date, courseName: row.courseName, matchName: row.matchName, playerName: row.playerName, holes: {} });
      }
      grouped.get(key)!.holes[row.holeNumber] = row.strokes;
    }

    const scoreSheetRows: any[] = [["Date", "Course", "Match Name", "Player", ...Array.from({ length: 18 }, (_, i) => `H${i + 1}`), "Out", "In", "Total"]];
    for (const entry of grouped.values()) {
      const holes = entry.holes;
      const out = Array.from({ length: 9 }, (_, i) => holes[i + 1] ?? 0).reduce((a, b) => a + b, 0);
      const inn = Array.from({ length: 9 }, (_, i) => holes[i + 10] ?? 0).reduce((a, b) => a + b, 0);
      const total = out + inn;
      const dateStr = entry.date.toISOString().split("T")[0];
      scoreSheetRows.push([dateStr, entry.courseName, entry.matchName ?? "", entry.playerName, ...Array.from({ length: 18 }, (_, i) => holes[i + 1] ?? ""), out || "", inn || "", total || ""]);
    }

    // ── Bet Results sheet: one row per event match bet ──────────────────────
    const betSheetRows: any[] = [["Date", "Course", "Match Name", "Bet Type", "Unit Amount", "Team A", "Team B", "Winner", "Net (Team A)", "Net (Team B)"]];
    for (const r of betRows) {
      const dateStr = r.date.toISOString().split("T")[0];
      const unitDollars = (r.unitAmountCents / 100).toFixed(2);
      const teamADollars = (r.teamANetCents / 100).toFixed(2);
      const teamBDollars = (r.teamBNetCents / 100).toFixed(2);
      const winner = !r.isComplete ? "In Progress" : r.teamANetCents > 0 ? r.teamAName : r.teamBNetCents > 0 ? r.teamBName : "Tie";
      const betLabel = r.betType ? `${r.eventMatchName} - ${r.betType}` : r.eventMatchName;
      betSheetRows.push([dateStr, r.courseName, r.matchName ?? "", betLabel, unitDollars, r.teamAName, r.teamBName, winner, teamADollars, teamBDollars]);
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scoreSheetRows), "Scores");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(betSheetRows), "Bet Results");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  }

  app.get("/api/export/scores.xlsx", sessionOrApiKey, async (req, res) => {
    try {
      const userId = getExportUserId(req);
      const start = parseDateParam(req.query.start);
      const end = parseDateParam(req.query.end);
      const buf = await buildScoresWorkbook(userId, start, end);
      const dateStr = new Date().toISOString().split("T")[0];
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="dorfon-golf-export-${dateStr}.xlsx"`);
      res.send(buf);
    } catch (err) {
      console.error("[route error]", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/export/scores.csv", sessionOrApiKey, async (req, res) => {
    try {
      const userId = getExportUserId(req);
      const start = parseDateParam(req.query.start);
      const end = parseDateParam(req.query.end);
      const rows = await storage.getExportScores(userId, start, end);
      const header = "date,course,match_name,player_name,hole,strokes\n";
      const body = rows.map(r => {
        const dateStr = r.date.toISOString().split("T")[0];
        const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
        return [dateStr, escape(r.courseName), escape(r.matchName ?? ""), escape(r.playerName), r.holeNumber, r.strokes].join(",");
      }).join("\n");
      const dateStr = new Date().toISOString().split("T")[0];
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="dorfon-golf-scores-${dateStr}.csv"`);
      res.send(header + body);
    } catch (err) {
      console.error("[route error]", err);
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

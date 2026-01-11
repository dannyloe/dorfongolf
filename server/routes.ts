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

  // Scorecard OCR Scanning
  app.post(api.scorecard.scan.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.scorecard.scan.input.parse(req.body);
      
      const prompt = `You are analyzing a golf scorecard image. Extract the scores for each player.

The players in this match are: ${input.playerNames.join(', ')}
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
- Match player names exactly as provided: ${input.playerNames.join(', ')}
- Use null for strokes if a hole score is unreadable or missing
- confidence should be "high", "medium", or "low" based on legibility
- Include all 18 holes for each player, using null for missing data
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

  // Seed courses on startup
  seedCourses();

  return httpServer;
}

// Seed the three courses with default par values
async function seedCourses() {
  // Default par 72 layout: 4,4,3,5,4,4,4,3,5 (out: 36) | 4,4,3,5,4,4,4,3,5 (in: 36)
  const defaultPars = [4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5];
  
  try {
    await storage.seedCourseIfNotExists("Hardscrabble", defaultPars);
    await storage.seedCourseIfNotExists("Blessings", defaultPars);
    await storage.seedCourseIfNotExists("Fayetteville CC", defaultPars);
    console.log("Courses seeded successfully");
  } catch (err) {
    console.error("Error seeding courses:", err);
  }
}

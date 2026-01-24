import { z } from 'zod';
import { 
  insertMatchSchema, 
  matches, 
  insertScoreSchema, 
  scores, 
  players,
  eventMatches,
  courses,
  courseHoles,
  playerHandicaps,
  matchPlayerHandicaps,
  playerCourseDefaults,
  groups,
  ryderCupEvents,
  ryderCupTeams,
  ryderCupTeamMembers,
  ryderCupPairings,
  ryderCupPairingSides,
  ryderCupSkins,
  ryderCupDays,
  ryderCupTransactions,
  ryderCupTransactionSplits,
  ryderCupClosestToHole,
} from './schema';
import { PRESET_PLAYERS, users } from './models/auth';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  forbidden: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  matches: {
    list: {
      method: 'GET' as const,
      path: '/api/matches',
      responses: {
        200: z.array(z.custom<typeof matches.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/matches',
      input: insertMatchSchema,
      responses: {
        201: z.custom<typeof matches.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/matches/:id',
      responses: {
        200: z.custom<typeof matches.$inferSelect & {
          creator: any;
          players: any[];
          scores: any[];
          eventMatches: any[];
        }>(),
        404: errorSchemas.notFound,
      },
    },
    addPlayer: {
      method: 'POST' as const,
      path: '/api/matches/:id/players',
      input: z.object({
        name: z.string().min(1),
        userId: z.string().optional(),
        teeId: z.number().nullable().optional(),
        handicapIndex: z.number().nullable().optional(),
      }),
      responses: {
        201: z.custom<typeof players.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    submitScore: {
      method: 'POST' as const,
      path: '/api/matches/:id/scores',
      input: z.object({
        playerId: z.number(),
        holeNumber: z.number().min(1).max(18),
        strokes: z.number().min(1),
      }),
      responses: {
        200: z.custom<typeof scores.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/matches/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        403: z.object({ message: z.string() }),
      },
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/matches/:id/status',
      input: z.object({
        completed: z.boolean(),
      }),
      responses: {
        200: z.custom<typeof matches.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    updateHandicapped: {
      method: 'PATCH' as const,
      path: '/api/matches/:id/handicapped',
      input: z.object({
        isHandicapped: z.boolean(),
      }),
      responses: {
        200: z.custom<typeof matches.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    updateDetails: {
      method: 'PATCH' as const,
      path: '/api/matches/:id/details',
      input: z.object({
        name: z.string().nullable().optional(),
        courseId: z.number().optional(),
        courseName: z.string().optional(),
        createdAt: z.string().optional(),
        groupId: z.number().nullable().optional(),
      }),
      responses: {
        200: z.custom<typeof matches.$inferSelect>(),
        404: errorSchemas.notFound,
        403: z.object({ message: z.string() }),
      },
    },
    updatePlayerHandicap: {
      method: 'PATCH' as const,
      path: '/api/matches/:matchId/players/:playerId/handicap',
      input: z.object({
        handicapIndex: z.number().min(-100).max(540).nullable(),
      }),
      responses: {
        200: z.custom<typeof players.$inferSelect>(),
        404: errorSchemas.notFound,
        403: z.object({ message: z.string() }),
      },
    },
    updatePlayerTee: {
      method: 'PATCH' as const,
      path: '/api/matches/:matchId/players/:playerId/tee',
      input: z.object({
        teeId: z.number().nullable(),
      }),
      responses: {
        200: z.custom<typeof players.$inferSelect>(),
        404: errorSchemas.notFound,
        403: z.object({ message: z.string() }),
      },
    },
    clone: {
      method: 'POST' as const,
      path: '/api/matches/:id/clone',
      responses: {
        201: z.custom<typeof matches.$inferSelect>(),
        404: errorSchemas.notFound,
        500: errorSchemas.internal,
      },
    },
    copyBets: {
      method: 'POST' as const,
      path: '/api/matches/:id/copy-bets',
      input: z.object({
        sourceEventId: z.number(),
      }),
      responses: {
        200: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
        500: errorSchemas.internal,
      },
    },
    listRoles: {
      method: 'GET' as const,
      path: '/api/matches/:id/roles',
      responses: {
        200: z.array(z.object({
          id: z.number(),
          matchId: z.number(),
          userId: z.string(),
          role: z.string(),
          createdAt: z.date().nullable(),
          user: z.object({
            id: z.string(),
            firstName: z.string().nullable(),
            lastName: z.string().nullable(),
            email: z.string().nullable(),
            presetPlayerName: z.string().nullable(),
          }).nullable(),
        })),
        404: errorSchemas.notFound,
      },
    },
    upsertRole: {
      method: 'POST' as const,
      path: '/api/matches/:id/roles',
      input: z.object({
        userId: z.string(),
        role: z.enum(['organizer', 'viewer']),
      }),
      responses: {
        200: z.object({
          id: z.number(),
          matchId: z.number(),
          userId: z.string(),
          role: z.string(),
          createdAt: z.date().nullable(),
        }),
        403: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    deleteRole: {
      method: 'DELETE' as const,
      path: '/api/matches/:id/roles/:userId',
      responses: {
        204: z.void(),
        403: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    getMyRole: {
      method: 'GET' as const,
      path: '/api/matches/:id/my-role',
      responses: {
        200: z.object({
          role: z.enum(['creator', 'organizer', 'viewer', 'player', 'none']),
        }),
        404: errorSchemas.notFound,
      },
    },
  },
  eventMatches: {
    list: {
      method: 'GET' as const,
      path: '/api/matches/:id/event-matches',
      responses: {
        200: z.array(z.custom<typeof eventMatches.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/matches/:id/event-matches',
      input: z.object({
        name: z.string().min(1),
        matchType: z.string().default("match_play"),
        unitAmount: z.number().min(0).default(0),
        autoPressOriginal: z.boolean().default(true),
        autoPressAllPresses: z.boolean().default(false),
        autoPressNassauFront9: z.boolean().default(true),
        autoPressNassauBack9: z.boolean().default(true),
        autoPressNassauOverall: z.boolean().default(true),
        useNetScoring: z.boolean().default(false),
        teamA: z.object({
          name: z.string().min(1),
          playerIds: z.array(z.number()).min(1),
        }),
        teamB: z.object({
          name: z.string().min(1),
          playerIds: z.array(z.number()).min(1),
        }),
        // Optional: For 5-5-5-3 matches that support multiple teams
        teams: z.array(z.object({
          name: z.string().min(1),
          playerIds: z.array(z.number()).min(1),
        })).optional(),
      }),
      responses: {
        201: z.custom<typeof eventMatches.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/event-matches/:id',
      responses: {
        200: z.any(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/event-matches/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    createPress: {
      method: 'POST' as const,
      path: '/api/event-matches/:id/press',
      input: z.object({
        startHole: z.number().min(2).max(17),
      }),
      responses: {
        201: z.custom<typeof eventMatches.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    updateAutoPress: {
      method: 'PATCH' as const,
      path: '/api/event-matches/:id/auto-press',
      input: z.object({
        autoPressOriginal: z.boolean().optional(),
        autoPressAllPresses: z.boolean().optional(),
        autoPressNassauFront9: z.boolean().optional(),
        autoPressNassauBack9: z.boolean().optional(),
        autoPressNassauOverall: z.boolean().optional(),
      }),
      responses: {
        200: z.custom<typeof eventMatches.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    updateNetScoring: {
      method: 'PATCH' as const,
      path: '/api/event-matches/:id/net-scoring',
      input: z.object({
        useNetScoring: z.boolean(),
      }),
      responses: {
        200: z.custom<typeof eventMatches.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },
  presetPlayers: {
    list: {
      method: 'GET' as const,
      path: '/api/preset-players',
      responses: {
        200: z.array(z.object({
          name: z.string(),
          claimedByUserId: z.string().nullable(),
          claimedByName: z.string().nullable(),
        })),
      },
    },
    full: {
      method: 'GET' as const,
      path: '/api/preset-players/full',
      responses: {
        200: z.object({
          players: z.array(z.object({
            name: z.string(),
            handicapIndex: z.number().nullable(),
            defaultTeeId: z.number().nullable(),
            defaultTeeName: z.string().nullable(),
            aliases: z.array(z.string()),
            claimedByUserId: z.string().nullable(),
            claimedByName: z.string().nullable(),
            isAdmin: z.boolean().nullable(),
          })),
          availableTees: z.array(z.object({
            id: z.number(),
            courseId: z.number(),
            name: z.string(),
            color: z.string().nullable(),
            slopeRating: z.number().nullable(),
            courseRating: z.number().nullable(),
            courseName: z.string(),
          })),
        }),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/preset-players/:name',
      input: z.object({
        handicapIndex: z.number().nullable().optional(),
        defaultTeeId: z.number().nullable().optional(),
      }),
      responses: {
        200: z.object({
          presetPlayerName: z.string(),
          handicapIndex: z.number().nullable(),
          defaultTeeId: z.number().nullable(),
        }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    claim: {
      method: 'POST' as const,
      path: '/api/preset-players/claim',
      input: z.object({
        presetPlayerName: z.string().nullable(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
        409: z.object({ message: z.string() }),
      },
    },
    setAdmin: {
      method: 'PUT' as const,
      path: '/api/users/:userId/admin',
      input: z.object({
        isAdmin: z.boolean(),
      }),
      responses: {
        200: z.object({
          userId: z.string(),
          isAdmin: z.boolean(),
        }),
        400: errorSchemas.validation,
        403: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/preset-players',
      input: z.object({
        name: z.string().min(1).max(100),
      }),
      responses: {
        201: z.object({
          id: z.number(),
          name: z.string(),
        }),
        400: errorSchemas.validation,
        409: z.object({ message: z.string() }),
      },
    },
    updateAliases: {
      method: 'PUT' as const,
      path: '/api/preset-players/:name/aliases',
      input: z.object({
        aliases: z.array(z.string()),
      }),
      responses: {
        200: z.object({
          playerName: z.string(),
          aliases: z.array(z.string()),
        }),
        400: errorSchemas.validation,
        403: z.object({ message: z.string() }),
      },
    },
    updateShowInRoster: {
      method: 'PUT' as const,
      path: '/api/preset-players/:name/show-in-roster',
      input: z.object({
        showInRoster: z.boolean(),
      }),
      responses: {
        200: z.object({
          playerName: z.string(),
          showInRoster: z.boolean(),
        }),
        400: errorSchemas.validation,
        403: z.object({ message: z.string() }),
      },
    },
    rename: {
      method: 'PUT' as const,
      path: '/api/preset-players/:name/rename',
      input: z.object({
        newName: z.string().min(1).max(100),
      }),
      responses: {
        200: z.object({
          oldName: z.string(),
          newName: z.string(),
        }),
        400: errorSchemas.validation,
        403: z.object({ message: z.string() }),
        409: z.object({ message: z.string() }),
      },
    },
    createAndClaim: {
      method: 'POST' as const,
      path: '/api/preset-players/create-and-claim',
      input: z.object({
        firstName: z.string().min(1, "First name is required").max(50),
        lastName: z.string().min(1, "Last name is required").max(50),
        displayName: z.string().min(1, "Display name is required").max(100), // This becomes preset_player_name
        aliases: z.array(z.string().max(50)).max(10).optional(), // Optional nicknames
      }),
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
        409: z.object({ message: z.string() }),
      },
    },
  },
  ledger: {
    get: {
      method: 'GET' as const,
      path: '/api/ledger',
      responses: {
        200: z.object({
          matches: z.array(z.any()),
          eventMatches: z.array(z.any()),
          scores: z.array(z.any()),
        }),
      },
    },
  },
  courses: {
    list: {
      method: 'GET' as const,
      path: '/api/courses',
      responses: {
        200: z.array(z.object({
          id: z.number(),
          name: z.string(),
          holes: z.array(z.object({
            id: z.number(),
            courseId: z.number(),
            holeNumber: z.number(),
            par: z.number(),
            handicap: z.number().nullable(),
          })),
          totalPar: z.number(),
        })),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/courses',
      input: z.object({
        name: z.string().min(1),
        holes: z.array(z.object({
          holeNumber: z.number().min(1).max(18),
          par: z.number().min(3).max(6),
          handicap: z.number().min(1).max(18).nullable().optional(),
        })).length(18),
      }),
      responses: {
        201: z.object({ id: z.number(), name: z.string() }),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/courses/:id',
      input: z.object({
        name: z.string().min(1).optional(),
      }),
      responses: {
        200: z.object({ id: z.number(), name: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    updateHole: {
      method: 'PUT' as const,
      path: '/api/courses/:id/holes/:holeNumber',
      input: z.object({
        par: z.number().min(3).max(6).optional(),
        handicap: z.number().min(1).max(18).nullable().optional(),
      }),
      responses: {
        200: z.object({ 
          id: z.number(), 
          courseId: z.number(), 
          holeNumber: z.number(), 
          par: z.number(),
          handicap: z.number().nullable(),
        }),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/courses/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    updateRatings: {
      method: 'PATCH' as const,
      path: '/api/courses/:id/ratings',
      input: z.object({
        slopeRating: z.number().min(55).max(155).nullable(),
        courseRating: z.number().min(550).max(800).nullable(), // Stored as tenths (e.g., 721 = 72.1)
      }),
      responses: {
        200: z.object({ id: z.number(), name: z.string(), slopeRating: z.number().nullable(), courseRating: z.number().nullable() }),
        404: errorSchemas.notFound,
      },
    },
    getTees: {
      method: 'GET' as const,
      path: '/api/courses/:id/tees',
      responses: {
        200: z.array(z.object({
          id: z.number(),
          courseId: z.number(),
          name: z.string(),
          slopeRating: z.number(),
          courseRating: z.number(),
          color: z.string().nullable(),
        })),
        404: errorSchemas.notFound,
      },
    },
    createTee: {
      method: 'POST' as const,
      path: '/api/courses/:id/tees',
      input: z.object({
        name: z.string().min(1),
        slopeRating: z.number().min(55).max(155),
        courseRating: z.number().min(550).max(800), // Stored as tenths (e.g., 721 = 72.1)
        color: z.string().nullable().optional(),
      }),
      responses: {
        201: z.object({
          id: z.number(),
          courseId: z.number(),
          name: z.string(),
          slopeRating: z.number(),
          courseRating: z.number(),
          color: z.string().nullable(),
        }),
        400: errorSchemas.validation,
      },
    },
    updateTee: {
      method: 'PUT' as const,
      path: '/api/courses/:courseId/tees/:teeId',
      input: z.object({
        name: z.string().min(1).optional(),
        slopeRating: z.number().min(55).max(155).optional(),
        courseRating: z.number().min(550).max(800).optional(),
        color: z.string().nullable().optional(),
      }),
      responses: {
        200: z.object({
          id: z.number(),
          courseId: z.number(),
          name: z.string(),
          slopeRating: z.number(),
          courseRating: z.number(),
          color: z.string().nullable(),
        }),
        404: errorSchemas.notFound,
      },
    },
    deleteTee: {
      method: 'DELETE' as const,
      path: '/api/courses/:courseId/tees/:teeId',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  playerHandicaps: {
    list: {
      method: 'GET' as const,
      path: '/api/player-handicaps',
      responses: {
        200: z.array(z.custom<typeof playerHandicaps.$inferSelect>()),
      },
    },
    upsert: {
      method: 'PUT' as const,
      path: '/api/player-handicaps/:presetPlayerName',
      input: z.object({
        handicapIndex: z.number().min(-100).max(540).nullable(), // Stored as tenths (e.g., 124 = 12.4)
      }),
      responses: {
        200: z.custom<typeof playerHandicaps.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/player-handicaps/:presetPlayerName',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  matchPlayerHandicaps: {
    list: {
      method: 'GET' as const,
      path: '/api/event-matches/:eventMatchId/player-handicaps',
      responses: {
        200: z.array(z.custom<typeof matchPlayerHandicaps.$inferSelect>()),
      },
    },
    upsert: {
      method: 'PUT' as const,
      path: '/api/event-matches/:eventMatchId/player-handicaps/:playerId',
      input: z.object({
        courseHandicap: z.number().min(-50).max(54),
      }),
      responses: {
        200: z.custom<typeof matchPlayerHandicaps.$inferSelect>(),
        400: errorSchemas.validation,
        403: errorSchemas.internal,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/event-matches/:eventMatchId/player-handicaps/:playerId',
      responses: {
        204: z.void(),
        403: errorSchemas.internal,
        404: errorSchemas.notFound,
      },
    },
  },
  playerCourseDefaults: {
    listAll: {
      method: 'GET' as const,
      path: '/api/player-course-defaults',
      responses: {
        200: z.array(z.custom<typeof playerCourseDefaults.$inferSelect>()),
      },
    },
    listForPlayer: {
      method: 'GET' as const,
      path: '/api/player-course-defaults/:presetPlayerName',
      responses: {
        200: z.array(z.custom<typeof playerCourseDefaults.$inferSelect>()),
      },
    },
    upsert: {
      method: 'PUT' as const,
      path: '/api/player-course-defaults/:presetPlayerName/:courseId',
      input: z.object({
        teeId: z.number(),
      }),
      responses: {
        200: z.custom<typeof playerCourseDefaults.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/player-course-defaults/:presetPlayerName/:courseId',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  scorecard: {
    scan: {
      method: 'POST' as const,
      path: '/api/scorecard/scan',
      input: z.object({
        imageBase64: z.string(),
        playerNames: z.array(z.string()),
        courseName: z.string().optional(),
      }),
      responses: {
        200: z.object({
          success: z.boolean(),
          scores: z.array(z.object({
            playerName: z.string(),
            holes: z.array(z.object({
              holeNumber: z.number(),
              strokes: z.number().nullable(),
              confidence: z.enum(['high', 'medium', 'low']).optional(),
            })),
          })),
          rawText: z.string().optional(),
        }),
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
  },
  groups: {
    list: {
      method: 'GET' as const,
      path: '/api/groups',
      responses: {
        200: z.array(z.custom<typeof groups.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/groups',
      input: z.object({
        name: z.string().min(1),
      }),
      responses: {
        201: z.custom<typeof groups.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
  },
  golfCourseApi: {
    search: {
      method: 'GET' as const,
      path: '/api/golf-course-api/search',
      responses: {
        200: z.object({
          courses: z.array(z.object({
            id: z.number(),
            club_name: z.string(),
            course_name: z.string(),
            location: z.object({
              address: z.string().optional(),
              city: z.string().optional(),
              state: z.string().optional(),
              country: z.string().optional(),
            }).optional(),
          })),
        }),
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
    getCourse: {
      method: 'GET' as const,
      path: '/api/golf-course-api/courses/:id',
      responses: {
        200: z.object({
          id: z.number(),
          club_name: z.string(),
          course_name: z.string(),
          location: z.object({
            address: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            country: z.string().optional(),
          }).optional(),
          tees: z.object({
            male: z.array(z.object({
              tee_name: z.string(),
              course_rating: z.number(),
              slope_rating: z.number(),
              par_total: z.number(),
              total_yards: z.number().optional(),
              holes: z.array(z.object({
                par: z.number(),
                yardage: z.number().optional(),
                handicap: z.number(),
              })),
            })).optional(),
            female: z.array(z.object({
              tee_name: z.string(),
              course_rating: z.number(),
              slope_rating: z.number(),
              par_total: z.number(),
              total_yards: z.number().optional(),
              holes: z.array(z.object({
                par: z.number(),
                yardage: z.number().optional(),
                handicap: z.number(),
              })),
            })).optional(),
          }).optional(),
        }),
        404: errorSchemas.notFound,
        500: errorSchemas.internal,
      },
    },
    importCourse: {
      method: 'POST' as const,
      path: '/api/golf-course-api/import',
      input: z.object({
        externalId: z.number(),
        courseName: z.string(),
        selectedTee: z.string(),
      }),
      responses: {
        200: z.object({
          courseId: z.number(),
          holesImported: z.number(),
          teesImported: z.number(),
        }),
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
  },
  ryderCup: {
    list: {
      method: 'GET' as const,
      path: '/api/ryder-cup',
      responses: {
        200: z.array(z.custom<typeof ryderCupEvents.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/ryder-cup/:id',
      responses: {
        200: z.any(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/ryder-cup',
      input: z.object({
        name: z.string().min(1),
        courseName: z.string().min(1),
        courseId: z.number().optional(),
        buyInAmount: z.number().optional(),
        teamWinBonus: z.number().optional(),
        matchWinBonus: z.number().optional(),
        matchTieBonus: z.number().optional(),
        dailySkinsPot: z.number().optional(),
        targetPoints: z.number().optional(),
        useHandicaps: z.boolean().optional(),
        numberOfDays: z.number().optional(),
        dayConfigs: z.array(z.object({
          dayNumber: z.number(),
          date: z.string().optional(), // ISO date string
          teeTimes: z.array(z.string()).optional(), // e.g. ["8:00 AM", "8:12 AM"]
          courseId: z.number().optional(),
          courseName: z.string().optional(),
        })).optional(),
        teamA: z.object({
          name: z.string().min(1),
          color: z.string().optional(),
          members: z.array(z.object({
            playerName: z.string().min(1),
            handicapIndex: z.number().optional(),
          })).length(6),
        }),
        teamB: z.object({
          name: z.string().min(1),
          color: z.string().optional(),
          members: z.array(z.object({
            playerName: z.string().min(1),
            handicapIndex: z.number().optional(),
          })).length(6),
        }),
      }),
      responses: {
        201: z.custom<typeof ryderCupEvents.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    generateSchedule: {
      method: 'POST' as const,
      path: '/api/ryder-cup/:id/generate-schedule',
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/ryder-cup/:id',
      responses: {
        204: z.void(),
        403: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    updateHandicaps: {
      method: 'PATCH' as const,
      path: '/api/ryder-cup/:id/handicaps',
      input: z.object({
        useHandicaps: z.boolean(),
      }),
      responses: {
        200: z.custom<typeof ryderCupEvents.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    updateClosestToHolePayout: {
      method: 'PATCH' as const,
      path: '/api/ryder-cup/:id/closest-to-hole-payout',
      input: z.object({
        closestToHolePayout: z.number().min(0),
      }),
      responses: {
        200: z.custom<typeof ryderCupEvents.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    updateTeam: {
      method: 'PATCH' as const,
      path: '/api/ryder-cup/teams/:teamId',
      input: z.object({
        name: z.string().min(1).optional(),
        color: z.string().optional(),
      }),
      responses: {
        200: z.custom<typeof ryderCupTeams.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    updateTeamMemberHandicap: {
      method: 'PATCH' as const,
      path: '/api/ryder-cup/members/:memberId/handicap',
      input: z.object({
        handicapIndex: z.number().nullable(),
      }),
      responses: {
        200: z.custom<typeof ryderCupTeamMembers.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    addSideMatch: {
      method: 'POST' as const,
      path: '/api/ryder-cup/:id/side-matches',
      input: z.object({
        dayId: z.number(),
        matchFormat: z.string(),
        useNetScoring: z.boolean().optional(),
        purseAmount: z.number().optional(),
        sideA: z.object({
          playerNames: z.array(z.string().min(1)),
        }),
        sideB: z.object({
          playerNames: z.array(z.string().min(1)),
        }),
      }),
      responses: {
        201: z.custom<typeof ryderCupPairings.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    recordResult: {
      method: 'POST' as const,
      path: '/api/ryder-cup/pairings/:pairingId/result',
      input: z.object({
        winningSideId: z.number().optional(),
        winningMargin: z.string().optional(),
      }),
      responses: {
        200: z.any(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    recalculateResults: {
      method: 'POST' as const,
      path: '/api/ryder-cup/:eventId/recalculate-results',
      responses: {
        200: z.object({ updatedCount: z.number() }),
        403: errorSchemas.forbidden,
        404: errorSchemas.notFound,
      },
    },
    recordSkin: {
      method: 'POST' as const,
      path: '/api/ryder-cup/days/:dayId/skins',
      input: z.object({
        holeNumber: z.number().min(1).max(18),
        winnerName: z.string().nullable(),
      }),
      responses: {
        200: z.custom<typeof ryderCupSkins.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    getDaySkins: {
      method: 'GET' as const,
      path: '/api/ryder-cup/days/:dayId/skins',
      responses: {
        200: z.array(z.custom<typeof ryderCupSkins.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    recordClosestToHole: {
      method: 'POST' as const,
      path: '/api/ryder-cup/days/:dayId/closest-to-hole',
      input: z.object({
        holeNumber: z.number().min(1).max(18),
        winnerName: z.string().nullable(),
      }),
      responses: {
        200: z.custom<typeof ryderCupClosestToHole.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    getClosestToHoleWinners: {
      method: 'GET' as const,
      path: '/api/ryder-cup/days/:dayId/closest-to-hole',
      responses: {
        200: z.array(z.custom<typeof ryderCupClosestToHole.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    getAllClosestToHoleWinners: {
      method: 'GET' as const,
      path: '/api/ryder-cup/:id/closest-to-hole',
      responses: {
        200: z.array(z.custom<typeof ryderCupClosestToHole.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    getSideMatches: {
      method: 'GET' as const,
      path: '/api/ryder-cup/:id/matches',
      responses: {
        200: z.array(z.custom<typeof matches.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    getSideMatchLedger: {
      method: 'GET' as const,
      path: '/api/ryder-cup/:id/side-match-ledger',
      responses: {
        200: z.object({
          matches: z.array(z.any()),
          eventMatches: z.array(z.any()),
          scores: z.array(z.any()),
          courseData: z.record(z.string(), z.object({
            holes: z.array(z.any()),
            tees: z.array(z.any()),
          })).optional(),
        }),
        404: errorSchemas.notFound,
      },
    },
    updateDayCourse: {
      method: 'PATCH' as const,
      path: '/api/ryder-cup/days/:dayId/course',
      input: z.object({
        courseId: z.number(),
        courseName: z.string().min(1),
      }),
      responses: {
        200: z.custom<typeof ryderCupDays.$inferSelect>(),
        403: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    updateDaySchedule: {
      method: 'PATCH' as const,
      path: '/api/ryder-cup/days/:dayId/schedule',
      input: z.object({
        date: z.string().optional(), // ISO date string
        teeTimes: z.array(z.string()).optional(), // e.g. ["8:00 AM", "8:12 AM"]
      }),
      responses: {
        200: z.custom<typeof ryderCupDays.$inferSelect>(),
        403: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    updatePairingTeeTime: {
      method: 'PATCH' as const,
      path: '/api/ryder-cup/pairings/:pairingId/tee-time',
      input: z.object({
        teeTime: z.string().nullable(), // null to unassign
      }),
      responses: {
        200: z.custom<typeof ryderCupPairings.$inferSelect>(),
        403: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    reorderPairings: {
      method: 'PATCH' as const,
      path: '/api/ryder-cup/days/:dayId/reorder-pairings',
      input: z.object({
        pairingOrder: z.array(z.number()), // array of pairing IDs in desired order
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
        403: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    updateSidePlayer: {
      method: 'PATCH' as const,
      path: '/api/ryder-cup/sides/:sideId/player',
      input: z.object({
        playerNumber: z.number().min(1).max(2), // 1 or 2
        handicapIndex: z.number().nullable().optional(),
        teeId: z.number().nullable().optional(),
      }),
      responses: {
        200: z.custom<typeof ryderCupPairingSides.$inferSelect>(),
        403: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    savePairingScores: {
      method: 'POST' as const,
      path: '/api/ryder-cup/sides/:sideId/scores',
      input: z.object({
        scores: z.array(z.object({
          holeNumber: z.number().min(1).max(18),
          player1Strokes: z.number().nullable(),
          player2Strokes: z.number().nullable(),
        })),
        matchResult: z.object({
          winningSideId: z.number().nullable(),
          winningMargin: z.string().nullable(),
          isComplete: z.boolean(),
        }).optional(),
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
        403: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    getPairingScorecard: {
      method: 'GET' as const,
      path: '/api/ryder-cup/pairings/:pairingId/scorecard',
      responses: {
        200: z.object({
          pairing: z.any(),
          sides: z.array(z.any()),
          course: z.any().nullable(),
        }),
        404: errorSchemas.notFound,
      },
    },
    listTransactions: {
      method: 'GET' as const,
      path: '/api/ryder-cup/:id/transactions',
      responses: {
        200: z.array(z.object({
          id: z.number(),
          eventId: z.number(),
          payerName: z.string(),
          description: z.string(),
          amount: z.number(),
          createdAt: z.string().nullable(),
          splits: z.array(z.object({
            id: z.number(),
            transactionId: z.number(),
            playerName: z.string(),
            amount: z.number(),
          })),
        })),
        404: errorSchemas.notFound,
      },
    },
    createTransaction: {
      method: 'POST' as const,
      path: '/api/ryder-cup/:id/transactions',
      input: z.object({
        payerName: z.string().min(1),
        description: z.string().min(1),
        amount: z.number().min(1), // Amount in cents
        splitPlayerNames: z.array(z.string()).min(1), // Players to split the cost between
      }),
      responses: {
        201: z.custom<typeof ryderCupTransactions.$inferSelect>(),
        400: errorSchemas.validation,
        403: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    deleteTransaction: {
      method: 'DELETE' as const,
      path: '/api/ryder-cup/:id/transactions/:transactionId',
      responses: {
        200: z.object({ success: z.boolean() }),
        403: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
  },
  profile: {
    get: {
      method: 'GET' as const,
      path: '/api/profile',
      responses: {
        200: z.object({
          id: z.string(),
          email: z.string().nullable(),
          firstName: z.string().nullable(),
          lastName: z.string().nullable(),
          phone: z.string().nullable(),
          presetPlayerName: z.string().nullable(),
          aliases: z.array(z.string()),
          handicapIndex: z.number().nullable(),
        }),
        401: z.object({ message: z.string() }),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/profile',
      input: z.object({
        firstName: z.string().max(100).optional(),
        lastName: z.string().max(100).optional(),
        email: z.string().email().max(255).optional(),
        phone: z.string().max(20).optional(),
        aliases: z.array(z.string().max(50)).max(10).optional(),
        handicapIndex: z.number().min(0).max(540).nullable().optional(), // Stored as tenths
      }),
      responses: {
        200: z.object({
          id: z.string(),
          email: z.string().nullable(),
          firstName: z.string().nullable(),
          lastName: z.string().nullable(),
          phone: z.string().nullable(),
          presetPlayerName: z.string().nullable(),
          aliases: z.array(z.string()),
          handicapIndex: z.number().nullable(),
        }),
        400: errorSchemas.validation,
        401: z.object({ message: z.string() }),
      },
    },
  },
  sms: {
    sendVerification: {
      method: 'POST' as const,
      path: '/api/sms/verification/send',
      input: z.object({
        phone: z.string().min(10),
      }),
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() }),
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
    verifyCode: {
      method: 'POST' as const,
      path: '/api/sms/verification/verify',
      input: z.object({
        phone: z.string().min(10),
        code: z.string().length(6),
      }),
      responses: {
        200: z.object({ success: z.boolean(), verified: z.boolean() }),
        400: errorSchemas.validation,
      },
    },
    sendMessage: {
      method: 'POST' as const,
      path: '/api/sms/send',
      input: z.object({
        to: z.string().min(10),
        message: z.string().min(1).max(1600),
      }),
      responses: {
        200: z.object({ success: z.boolean(), sid: z.string().optional() }),
        400: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
  },
  notifications: {
    getPreferences: {
      method: 'GET' as const,
      path: '/api/notifications/preferences',
      responses: {
        200: z.object({
          matchInvitations: z.boolean(),
          scoreUpdates: z.boolean(),
          betResults: z.boolean(),
          matchReminders: z.boolean(),
        }),
        401: z.object({ message: z.string() }),
      },
    },
    updatePreferences: {
      method: 'PUT' as const,
      path: '/api/notifications/preferences',
      input: z.object({
        matchInvitations: z.boolean().optional(),
        scoreUpdates: z.boolean().optional(),
        betResults: z.boolean().optional(),
        matchReminders: z.boolean().optional(),
      }),
      responses: {
        200: z.object({
          matchInvitations: z.boolean(),
          scoreUpdates: z.boolean(),
          betResults: z.boolean(),
          matchReminders: z.boolean(),
        }),
        400: errorSchemas.validation,
        401: z.object({ message: z.string() }),
      },
    },
  },
  messages: {
    list: {
      method: 'GET' as const,
      path: '/api/messages',
      responses: {
        200: z.array(z.object({
          id: z.number(),
          matchId: z.number().nullable(),
          senderId: z.string(),
          senderName: z.string().nullable(),
          recipientId: z.string().nullable(),
          content: z.string(),
          readAt: z.string().nullable(),
          createdAt: z.string(),
        })),
        401: z.object({ message: z.string() }),
      },
    },
    listByMatch: {
      method: 'GET' as const,
      path: '/api/matches/:id/messages',
      responses: {
        200: z.array(z.object({
          id: z.number(),
          matchId: z.number().nullable(),
          senderId: z.string(),
          senderName: z.string().nullable(),
          recipientId: z.string().nullable(),
          content: z.string(),
          readAt: z.string().nullable(),
          createdAt: z.string(),
        })),
        401: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    send: {
      method: 'POST' as const,
      path: '/api/messages',
      input: z.object({
        matchId: z.number().optional(),
        recipientId: z.string().optional(),
        content: z.string().min(1).max(2000),
      }),
      responses: {
        201: z.object({
          id: z.number(),
          matchId: z.number().nullable(),
          senderId: z.string(),
          recipientId: z.string().nullable(),
          content: z.string(),
          createdAt: z.string(),
        }),
        400: errorSchemas.validation,
        401: z.object({ message: z.string() }),
      },
    },
    markRead: {
      method: 'PATCH' as const,
      path: '/api/messages/:id/read',
      responses: {
        200: z.object({ success: z.boolean() }),
        401: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

import { z } from 'zod';
import { 
  insertMatchSchema, 
  matches, 
  insertScoreSchema, 
  scores, 
  players,
  eventMatches,
  courses,
  courseHoles
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
        teamA: z.object({
          name: z.string().min(1),
          playerIds: z.array(z.number()).min(1),
        }),
        teamB: z.object({
          name: z.string().min(1),
          playerIds: z.array(z.number()).min(1),
        }),
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

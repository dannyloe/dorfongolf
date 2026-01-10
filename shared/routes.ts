import { z } from 'zod';
import { 
  insertMatchSchema, 
  matches, 
  insertScoreSchema, 
  scores, 
  participants 
} from './schema';

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
          participants: any[];
          scores: any[];
        }>(),
        404: errorSchemas.notFound,
      },
    },
    join: {
      method: 'POST' as const,
      path: '/api/matches/:id/join',
      responses: {
        200: z.custom<typeof participants.$inferSelect>(),
        404: errorSchemas.notFound,
        400: z.object({ message: z.string() }),
      },
    },
    submitScore: {
      method: 'POST' as const,
      path: '/api/matches/:id/scores',
      input: z.object({
        holeNumber: z.number().min(1).max(18),
        strokes: z.number().min(1),
        userId: z.string().optional(),
      }),
      responses: {
        200: z.custom<typeof scores.$inferSelect>(),
        400: errorSchemas.validation,
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

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

// Types derived from shared routes
type MatchListResponse = z.infer<typeof api.matches.list.responses[200]>;
type MatchDetailResponse = z.infer<typeof api.matches.get.responses[200]>;
type CreateMatchInput = z.infer<typeof api.matches.create.input>;
type AddPlayerInput = z.infer<typeof api.matches.addPlayer.input>;
type ScoreInput = z.infer<typeof api.matches.submitScore.input>;

export function useMatches() {
  return useQuery({
    queryKey: [api.matches.list.path],
    queryFn: async () => {
      const res = await fetch(api.matches.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch matches");
      return api.matches.list.responses[200].parse(await res.json());
    },
  });
}

export function useMatch(id: number) {
  return useQuery({
    queryKey: [api.matches.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.matches.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch match");
      return api.matches.get.responses[200].parse(await res.json());
    },
    enabled: !!id && !isNaN(id),
  });
}

export function useCreateMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateMatchInput) => {
      const res = await fetch(api.matches.create.path, {
        method: api.matches.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = await res.json();
          throw new Error(error.message || "Validation failed");
        }
        throw new Error("Failed to create match");
      }
      return api.matches.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.list.path] });
    },
  });
}

export function useAddPlayer(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: AddPlayerInput) => {
      const url = buildUrl(api.matches.addPlayer.path, { id: matchId });
      const res = await fetch(url, {
        method: api.matches.addPlayer.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to add player");
      return api.matches.addPlayer.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.get.path, matchId] });
      queryClient.invalidateQueries({ queryKey: [api.matches.list.path] });
    },
  });
}

export function useSubmitScore(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ScoreInput) => {
      const url = buildUrl(api.matches.submitScore.path, { id: matchId });
      const res = await fetch(url, {
        method: api.matches.submitScore.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to submit score");
      return api.matches.submitScore.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.get.path, matchId] });
    },
  });
}

export function useDeleteMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (matchId: number) => {
      const url = buildUrl(api.matches.delete.path, { id: matchId });
      const res = await fetch(url, {
        method: api.matches.delete.method,
        credentials: "include",
      });
      
      if (res.status === 403) {
        const error = await res.json();
        throw new Error(error.message);
      }
      if (!res.ok) throw new Error("Failed to delete match");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.list.path] });
    },
  });
}

export function useUpdateMatchStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ matchId, completed }: { matchId: number; completed: boolean }) => {
      const url = buildUrl(api.matches.updateStatus.path, { id: matchId });
      const res = await fetch(url, {
        method: api.matches.updateStatus.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to update match status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.list.path] });
    },
  });
}

export function useUpdateHandicapped(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (isHandicapped: boolean) => {
      const url = buildUrl(api.matches.updateHandicapped.path, { id: matchId });
      const res = await fetch(url, {
        method: api.matches.updateHandicapped.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isHandicapped }),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to update handicapped status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.get.path, matchId] });
      queryClient.invalidateQueries({ queryKey: [api.matches.list.path] });
    },
  });
}

type UpdateDetailsInput = { name?: string; courseId?: number; courseName?: string; createdAt?: string };

export function useUpdateMatchDetails(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UpdateDetailsInput) => {
      const url = buildUrl(api.matches.updateDetails.path, { id: matchId });
      const res = await fetch(url, {
        method: api.matches.updateDetails.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to update match details");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.get.path, matchId] });
      queryClient.invalidateQueries({ queryKey: [api.matches.list.path] });
    },
  });
}

type CreateEventMatchInput = z.infer<typeof api.eventMatches.create.input>;

export function useCreateEventMatch(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateEventMatchInput) => {
      const url = buildUrl(api.eventMatches.create.path, { id: matchId });
      const res = await fetch(url, {
        method: api.eventMatches.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to create match");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.get.path, matchId] });
    },
  });
}

export function useDeleteEventMatch(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventMatchId: number) => {
      const url = buildUrl(api.eventMatches.delete.path, { id: eventMatchId });
      const res = await fetch(url, {
        method: api.eventMatches.delete.method,
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to delete event match");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.get.path, matchId] });
    },
  });
}

type CreatePressInput = z.infer<typeof api.eventMatches.createPress.input>;

export function useCreatePress(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventMatchId, startHole }: { eventMatchId: number; startHole: number }) => {
      const url = buildUrl(api.eventMatches.createPress.path, { id: eventMatchId });
      const res = await fetch(url, {
        method: api.eventMatches.createPress.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startHole }),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to create press");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.get.path, matchId] });
    },
  });
}

type UpdateAutoPressInput = z.infer<typeof api.eventMatches.updateAutoPress.input>;

export function useUpdateAutoPress(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventMatchId, ...data }: { eventMatchId: number } & UpdateAutoPressInput) => {
      const url = buildUrl(api.eventMatches.updateAutoPress.path, { id: eventMatchId });
      const res = await fetch(url, {
        method: api.eventMatches.updateAutoPress.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to update auto press settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.get.path, matchId] });
    },
  });
}

export function useUpdateNetScoring(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventMatchId, useNetScoring }: { eventMatchId: number; useNetScoring: boolean }) => {
      const url = buildUrl(api.eventMatches.updateNetScoring.path, { id: eventMatchId });
      const res = await fetch(url, {
        method: api.eventMatches.updateNetScoring.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useNetScoring }),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to update net scoring");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.get.path, matchId] });
    },
  });
}

// Course types
export interface CourseHole {
  id: number;
  courseId: number;
  holeNumber: number;
  par: number;
  handicap: number | null;
}

export interface Course {
  id: number;
  name: string;
  holes: CourseHole[];
  totalPar: number;
}

export function useCourses() {
  return useQuery({
    queryKey: [api.courses.list.path],
    queryFn: async () => {
      const res = await fetch(api.courses.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch courses");
      return res.json() as Promise<Course[]>;
    },
  });
}

type CreateCourseInput = z.infer<typeof api.courses.create.input>;
type UpdateHoleInput = z.infer<typeof api.courses.updateHole.input>;

export function useCreateCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateCourseInput) => {
      const res = await fetch(api.courses.create.path, {
        method: api.courses.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to create course");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.courses.list.path] });
    },
  });
}

export function useUpdateCourseHole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, holeNumber, ...data }: { courseId: number; holeNumber: number } & UpdateHoleInput) => {
      const url = buildUrl(api.courses.updateHole.path, { id: courseId, holeNumber });
      const res = await fetch(url, {
        method: api.courses.updateHole.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to update hole");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.courses.list.path] });
    },
  });
}

export function useDeleteCourse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (courseId: number) => {
      const url = buildUrl(api.courses.delete.path, { id: courseId });
      const res = await fetch(url, {
        method: api.courses.delete.method,
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to delete course");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.courses.list.path] });
    },
  });
}

// Scorecard scanning types and hook
export interface ScannedHole {
  holeNumber: number;
  strokes: number | null;
  confidence?: 'high' | 'medium' | 'low';
}

export interface ScannedPlayer {
  playerName: string;
  holes: ScannedHole[];
}

export interface ScanResult {
  success: boolean;
  scores: ScannedPlayer[];
  rawText?: string;
}

type ScanScorecardInput = z.infer<typeof api.scorecard.scan.input>;

export function useScanScorecard() {
  return useMutation({
    mutationFn: async (data: ScanScorecardInput): Promise<ScanResult> => {
      const res = await fetch(api.scorecard.scan.path, {
        method: api.scorecard.scan.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to scan scorecard");
      }
      return res.json();
    },
  });
}

// Player Handicap types and hooks
export interface PlayerHandicap {
  id: number;
  presetPlayerName: string;
  handicapIndex: number | null;
  updatedAt: string | null;
}

export function usePlayerHandicaps() {
  return useQuery({
    queryKey: [api.playerHandicaps.list.path],
    queryFn: async () => {
      const res = await fetch(api.playerHandicaps.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch player handicaps");
      return res.json() as Promise<PlayerHandicap[]>;
    },
  });
}

export function useUpsertPlayerHandicap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ presetPlayerName, handicapIndex }: { presetPlayerName: string; handicapIndex: number | null }) => {
      const url = buildUrl(api.playerHandicaps.upsert.path, { presetPlayerName });
      const res = await fetch(url, {
        method: api.playerHandicaps.upsert.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handicapIndex }),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to update player handicap");
      return res.json() as Promise<PlayerHandicap>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.playerHandicaps.list.path] });
    },
  });
}

export function useUpdatePlayerMatchHandicap(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ playerId, handicapIndex }: { playerId: number; handicapIndex: number | null }) => {
      const url = buildUrl(api.matches.updatePlayerHandicap.path, { matchId, playerId });
      const res = await fetch(url, {
        method: api.matches.updatePlayerHandicap.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handicapIndex }),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to update player handicap");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.get.path, matchId] });
    },
  });
}

export function useCourseTees(courseId: number | null | undefined) {
  return useQuery({
    queryKey: ['/api/courses', courseId, 'tees'],
    queryFn: async () => {
      if (!courseId) return [];
      const res = await fetch(`/api/courses/${courseId}/tees`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch course tees');
      return res.json() as Promise<Array<{
        id: number;
        courseId: number;
        name: string;
        slopeRating: number;
        courseRating: number;
        color: string | null;
      }>>;
    },
    enabled: !!courseId,
  });
}

export function useUpdatePlayerTee(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ playerId, teeId }: { playerId: number; teeId: number | null }) => {
      const url = buildUrl(api.matches.updatePlayerTee.path, { matchId, playerId });
      const res = await fetch(url, {
        method: api.matches.updatePlayerTee.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teeId }),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to update player tee");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.get.path, matchId] });
    },
  });
}

export type CourseTee = {
  id: number;
  courseId: number;
  name: string;
  slopeRating: number;
  courseRating: number;
  color: string | null;
};

export function useCreateCourseTee(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tee: { name: string; slopeRating: number; courseRating: number; color?: string | null }) => {
      const res = await fetch(`/api/courses/${courseId}/tees`, {
        method: 'POST',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tee),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to create tee");
      }
      return res.json() as Promise<CourseTee>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'tees'] });
    },
  });
}

export function useUpdateCourseTee(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ teeId, ...data }: { teeId: number; name?: string; slopeRating?: number; courseRating?: number; color?: string | null }) => {
      const res = await fetch(`/api/courses/${courseId}/tees/${teeId}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to update tee");
      }
      return res.json() as Promise<CourseTee>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'tees'] });
    },
  });
}

export function useDeleteCourseTee(courseId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (teeId: number) => {
      const res = await fetch(`/api/courses/${courseId}/tees/${teeId}`, {
        method: 'DELETE',
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to delete tee");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId, 'tees'] });
    },
  });
}

export type MatchPlayerHandicap = {
  id: number;
  eventMatchId: number;
  playerId: number;
  courseHandicap: number;
};

export function useMatchPlayerHandicaps(matchId: number | undefined) {
  return useQuery({
    queryKey: ['/api/matches', matchId, 'match-player-handicaps'],
    queryFn: async (): Promise<Map<number, MatchPlayerHandicap[]>> => {
      if (!matchId) return new Map<number, MatchPlayerHandicap[]>();
      const res = await fetch(`/api/matches/${matchId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch match');
      const match = await res.json();
      const eventMatches = match.eventMatches || [];
      
      const allHandicaps: Array<[number, MatchPlayerHandicap[]]> = [];
      for (const em of eventMatches) {
        const hcpRes = await fetch(`/api/event-matches/${em.id}/player-handicaps`, { credentials: 'include' });
        if (hcpRes.ok) {
          const handicaps = await hcpRes.json() as MatchPlayerHandicap[];
          allHandicaps.push([em.id, handicaps]);
        }
      }
      return new Map(allHandicaps);
    },
    enabled: !!matchId,
    structuralSharing: false, // Maps don't work well with structural sharing
  });
}

export function useUpsertMatchPlayerHandicap(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventMatchId, playerId, courseHandicap }: { eventMatchId: number; playerId: number; courseHandicap: number }) => {
      const res = await fetch(`/api/event-matches/${eventMatchId}/player-handicaps/${playerId}`, {
        method: 'PUT',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseHandicap }),
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to update match player handicap");
      }
      return res.json() as Promise<MatchPlayerHandicap>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/matches', matchId, 'match-player-handicaps'] });
      queryClient.invalidateQueries({ queryKey: [api.matches.get.path, matchId] });
    },
  });
}

export function useCloneEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: number) => {
      const url = buildUrl(api.matches.clone.path, { id: eventId });
      const res = await fetch(url, {
        method: api.matches.clone.method,
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to clone event");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.list.path] });
    },
  });
}

export function useCopyBetsFromEvent(targetEventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sourceEventId: number) => {
      const url = buildUrl(api.matches.copyBets.path, { id: targetEventId });
      const res = await fetch(url, {
        method: api.matches.copyBets.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceEventId }),
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to copy bets");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.matches.get.path, targetEventId] });
    },
  });
}

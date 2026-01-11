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

// Course types
export interface CourseHole {
  id: number;
  courseId: number;
  holeNumber: number;
  par: number;
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

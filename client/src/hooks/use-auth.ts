import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, storeSessionId, clearSessionId } from "@/lib/queryClient";
import type { User } from "@shared/models/auth";

function getSessionHeader(): Record<string, string> {
  try {
    const sid = localStorage.getItem("cap_sid");
    return sid ? { "X-Session-Id": sid } : {};
  } catch {
    return {};
  }
}

async function fetchUser(): Promise<User | null> {
  const base = import.meta.env.VITE_API_BASE_URL || (!import.meta.env.DEV ? "https://dorfongolf.com" : "");
  const response = await fetch(`${base}/api/auth/user`, {
    credentials: "include",
    headers: getSessionHeader(),
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      clearSessionId();
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      window.location.href = "/";
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", credentials);
      const data = await res.json();
      if (data.sessionId) storeSessionId(data.sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,
  };
}

import { QueryClient, QueryFunction } from "@tanstack/react-query";

const SESSION_ID_KEY = "cap_sid";

export function storeSessionId(id: string) {
  try { localStorage.setItem(SESSION_ID_KEY, id); } catch {}
}
export function clearSessionId() {
  try { localStorage.removeItem(SESSION_ID_KEY); } catch {}
}
function getSessionId(): string | null {
  try { return localStorage.getItem(SESSION_ID_KEY); } catch { return null; }
}

function resolveUrl(url: string): string {
  const base = import.meta.env.VITE_API_BASE_URL || (!import.meta.env.DEV ? "https://dorfongolf.com" : "");
  if (base && url.startsWith("/")) {
    return `${base}${url}`;
  }
  return url;
}

function sessionHeaders(): Record<string, string> {
  const sid = getSessionId();
  return sid ? { "X-Session-Id": sid } : {};
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) {
      const p = window.location.pathname;
      if (p !== "/" && p !== "/register") {
        window.location.href = "/";
      }
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(resolveUrl(url), {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...sessionHeaders(),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const rawUrl = queryKey.join("/") as string;
    const res = await fetch(resolveUrl(rawUrl), {
      credentials: "include",
      headers: sessionHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

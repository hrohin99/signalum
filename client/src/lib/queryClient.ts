import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase, getCachedToken } from "./supabase";

async function getAuthHeaders(): Promise<Record<string, string>> {
  // 1. Try the module-level cached token (set synchronously by onAuthStateChange)
  let token = getCachedToken();

  // 2. If cache is empty, try getSession() (async read from localStorage)
  if (!token) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  }

  // 3. Last resort: force a token refresh
  if (!token) {
    const { data } = await supabase.auth.refreshSession();
    token = data.session?.access_token ?? null;
  }

  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const isHtml = text.trimStart().startsWith("<");
    if (isHtml) {
      const transientCodes: Record<number, string> = {
        502: "The AI service is temporarily unavailable. Please try again in a moment.",
        503: "The AI service is temporarily unavailable. Please try again in a moment.",
        529: "The AI service is overloaded. Please try again in a moment.",
      };
      throw new Error(transientCodes[res.status] || `Server error (${res.status}). Please try again.`);
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    method,
    headers: {
      ...authHeaders,
      ...(data ? { "Content-Type": "application/json" } : {}),
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
    const authHeaders = await getAuthHeaders();
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: authHeaders,
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
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

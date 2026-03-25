import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables");
}

// --- Singleton preservation across Vite HMR reloads ---
// Vite re-executes this module on every HMR cycle. Without this guard, each
// cycle creates a fresh GoTrueClient (causing the "Multiple GoTrueClient
// instances" warning) and resets _cachedAccessToken to null, which causes
// every API call to lose its auth header until the async onAuthStateChange
// callback fires again.
type HotData = {
  supabaseClient?: SupabaseClient;
  authSubscription?: { unsubscribe: () => void };
  cachedToken?: string | null;
};

const hot = import.meta.hot as { data: HotData } | undefined;

let _client: SupabaseClient;
if (hot?.data.supabaseClient) {
  // Reuse the existing client — session and listeners are preserved.
  _client = hot.data.supabaseClient;
} else {
  _client = createClient(supabaseUrl || "", supabaseAnonKey || "");
}

export const supabase = _client;

// Token cache — shared across HMR cycles via hot.data.
let _cachedAccessToken: string | null = hot?.data.cachedToken ?? null;

// Unsubscribe the previous listener (if any) before registering a new one.
hot?.data.authSubscription?.unsubscribe();

const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
  _cachedAccessToken = session?.access_token ?? null;
  if (hot) hot.data.cachedToken = _cachedAccessToken;
});

if (hot) {
  hot.data.supabaseClient = _client;
  hot.data.authSubscription = subscription;
  hot.data.cachedToken = _cachedAccessToken;
}

export function getCachedToken(): string | null {
  return _cachedAccessToken;
}

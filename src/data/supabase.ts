import { AuthClient } from "@supabase/auth-js";
import { FunctionsClient } from "@supabase/functions-js";
import { PostgrestClient } from "@supabase/postgrest-js";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Only the auth, RPC and Edge Function clients — the full supabase-js bundle
 * also ships realtime and storage, which this app never uses. The wiring
 * mirrors supabase-js 2.119 `SupabaseClient` so sessions stay compatible:
 * same storage key, same apikey/Authorization rules.
 */
function createLightClient(base: string, apiKey: string) {
  const root = new URL(base.endsWith("/") ? base : base + "/");
  // New-format keys are not JWTs and never go out as a Bearer token.
  const newKey =
    apiKey.startsWith("sb_publishable_") || apiKey.startsWith("sb_secret_");
  const auth = new AuthClient({
    url: new URL("auth/v1", root).href,
    headers: { Authorization: `Bearer ${apiKey}`, apikey: apiKey },
    storageKey: `sb-${root.hostname.split(".")[0]}-auth-token`,
    flowType: "pkce",
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  });
  const authed =
    (allowKeyAsBearer: boolean): typeof fetch =>
    async (input, init) => {
      const { data } = await auth.getSession();
      const token = data.session?.access_token ?? null;
      const headers = new Headers(init?.headers);
      if (!headers.has("apikey")) headers.set("apikey", apiKey);
      if (!headers.has("Authorization")) {
        const bearer = token ?? (allowKeyAsBearer ? apiKey : null);
        if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
      }
      return fetch(input, { ...init, headers });
    };
  const rest = new PostgrestClient(new URL("rest/v1", root).href, {
    schema: "public",
    fetch: authed(true),
  });
  const functions = new FunctionsClient(new URL("functions/v1", root).href, {
    customFetch: authed(!newKey),
  });
  return {
    auth,
    functions,
    rpc: (name: string, args: Record<string, unknown> = {}) =>
      rest.rpc(name, args),
    from: (table: string) => rest.from(table),
  };
}
export const supabase = url && key ? createLightClient(url, key) : null;
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase) throw Error("Supabase 환경변수가 설정되지 않았습니다.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw Error(error.message);
  return data as T;
}
export async function login() {
  if (!supabase) throw Error("Supabase 환경변수가 설정되지 않았습니다.");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: new URL(import.meta.env.BASE_URL, location.origin).href,
    },
  });
  if (error) throw error;
}

import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
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

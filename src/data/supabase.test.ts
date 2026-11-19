import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

const URL_ = "https://abcdefgh.supabase.co";
const session = {
  access_token: "user-jwt",
  refresh_token: "refresh",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: {
    id: "u1",
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "",
  },
};
type Seen = {
  url: string;
  apikey: string | null;
  authorization: string | null;
};
function recorder() {
  const seen: Seen[] = [];
  const fake = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    seen.push({
      url: String(input),
      apikey: h.get("apikey"),
      authorization: h.get("Authorization"),
    });
    return new Response("null", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { seen, fake };
}
async function light(key: string) {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", URL_);
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", key);
  return (await import("./supabase")).supabase!;
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("light Supabase client matches supabase-js", () => {
  for (const key of ["sb_publishable_test", "eyJlegacy.anon.key"])
    for (const signedIn of [false, true])
      it(`sends the same headers (${key.slice(0, 6)}…, signed in: ${signedIn})`, async () => {
        const storageKey = "sb-abcdefgh-auth-token";
        if (signedIn) localStorage.setItem(storageKey, JSON.stringify(session));
        const mine = recorder();
        vi.stubGlobal("fetch", mine.fake);
        const client = await light(key);
        await client.rpc("read_dataset");
        await client.functions.invoke("push-subscription", { body: {} });
        const theirs = recorder();
        const reference = createClient(URL_, key, {
          auth: {
            flowType: "pkce",
            persistSession: true,
            autoRefreshToken: false,
          },
          global: { fetch: theirs.fake as typeof fetch },
        });
        await reference.rpc("read_dataset");
        await reference.functions.invoke("push-subscription", { body: {} });
        const pick = (s: Seen[]) =>
          s
            .filter((x) => /rest\/v1|functions\/v1/.test(x.url))
            .map(({ url, apikey, authorization }) => ({
              url,
              apikey,
              authorization,
            }));
        expect(pick(mine.seen)).toEqual(pick(theirs.seen));
        expect(pick(mine.seen)).toHaveLength(2);
        if (signedIn)
          expect(pick(mine.seen)[0].authorization).toBe("Bearer user-jwt");
      });
  it("keeps the supabase-js session storage key so existing logins survive", async () => {
    localStorage.setItem("sb-abcdefgh-auth-token", JSON.stringify(session));
    vi.stubGlobal("fetch", recorder().fake);
    const client = await light("sb_publishable_test");
    const { data } = await client.auth.getSession();
    expect(data.session?.access_token).toBe("user-jwt");
  });
});

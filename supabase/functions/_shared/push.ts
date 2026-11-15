// @deno-types="npm:@types/web-push@3.6.4"
import webpush from "npm:web-push@3.6.7";
import { validEndpoint } from "./http.ts";
export async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth_secret: string },
  payload: unknown,
) {
  if (!validEndpoint(subscription.endpoint)) throw Error("INVALID_ENDPOINT");
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY"),
    privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) throw Error("VAPID_NOT_CONFIGURED");
  return await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret },
    },
    JSON.stringify(payload),
    {
      vapidDetails: {
        subject: "https://muminjun.github.io/weekflow/",
        publicKey,
        privateKey,
      },
      TTL: 300,
      timeout: 10000,
    },
  );
}

#!/usr/bin/env sh
set -eu
npx --yes deno check --config supabase/functions/deno.json supabase/functions/push-subscription/index.ts supabase/functions/dispatch-push/index.ts supabase/functions/delete-account/index.ts supabase/functions/calendar-feed/index.ts

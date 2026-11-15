import { it, expect } from "vitest";
import { emptyData } from "../data/demo";
import { availability, stats } from "./selectors";
import { toUTC } from "./planner";
it("uses user weekend rules, holidays and explicit exceptions in priority order", () => {
  const d = emptyData(crypto.randomUUID());
  d.availability_rules.push({
    id: crypto.randomUUID(),
    user_id: d.profile.id,
    version: 1,
    weekday: 6,
    start_minute: 540,
    end_minute: 720,
  });
  expect(availability(d, "2026-11-14", false).focusMinutes).toBe(180);
  expect(availability(d, "2026-11-14", true).focusMinutes).toBe(0);
  d.availability_overrides.push({
    id: crypto.randomUUID(),
    user_id: d.profile.id,
    version: 1,
    local_date: "2026-11-14",
    mode: "replace",
    windows: [{ startMinute: 600, endMinute: 660 }],
  });
  expect(availability(d, "2026-11-14", true).focusMinutes).toBe(60);
});
it("clips cross-midnight review minutes to the viewed week", () => {
  const d = emptyData(crypto.randomUUID());
  d.time_blocks.push({
    id: crypto.randomUUID(),
    user_id: d.profile.id,
    version: 1,
    kind: "event",
    week_task_id: null,
    event_title: "overnight",
    event_note: "",
    category_id: null,
    start_at: toUTC("2026-11-08", 1380, d.profile.timezone),
    end_at: toUTC("2026-11-09", 60, d.profile.timezone),
    local_date: "2026-11-08",
    state: "planned",
    completed_at: null,
  });
  expect(stats(d, "2026-11-09").eventMinutes).toBe(60);
});

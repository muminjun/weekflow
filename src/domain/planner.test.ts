import { describe, it, expect } from "vitest";
import {
  weekOf,
  addDays,
  union,
  parseWindows,
  subtract,
  minutes,
  dayStatus,
  snap,
  occurrenceDates,
  csvCell,
} from "./planner";
describe("calendar and interval invariants", () => {
  it("uses Monday across year boundaries", () => {
    expect(weekOf("2027-01-01")).toBe("2026-12-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("unions overlaps before subtracting events and tasks", () => {
    expect(
      union([
        [540, 660],
        [600, 720],
        [720, 780],
      ]),
    ).toEqual([[540, 780]]);
    expect(
      subtract(
        [[540, 1080]],
        [
          [600, 660],
          [630, 720],
        ],
      ),
    ).toEqual([
      [540, 600],
      [720, 1080],
    ]);
    expect(
      minutes(
        subtract(
          [[540, 1080]],
          [
            [0, 600],
            [1000, 1440],
          ],
        ),
      ),
    ).toBe(400);
  });
  it("snaps quarter hours and respects both day bounds", () => {
    expect(snap(608)).toBe(615);
    expect(snap(-9)).toBe(0);
    expect(snap(1490)).toBe(1440);
  });
  it("distinguishes partial from done without completing the Todo", () => {
    expect(dayStatus(["done", "planned"])).toBe("partial");
    expect(dayStatus(["done", "done"])).toBe("done");
    expect(dayStatus(["skipped"])).toBe("empty");
    expect(dayStatus(["done"], "planned")).toBe("planned");
  });
  it("bounds recurrence and pauses when holiday avoidance is unknown", () => {
    expect(
      occurrenceDates(
        {
          starts_on: "2026-11-09",
          weekdays: [1, 3, 5],
          skip_public_holidays: false,
        },
        "2026-11-09",
        "2026-11-15",
        null,
      ),
    ).toEqual(["2026-11-09", "2026-11-11", "2026-11-13"]);
    expect(() =>
      occurrenceDates(
        { starts_on: "2026-11-09", weekdays: [1], skip_public_holidays: true },
        "2026-11-09",
        "2026-11-15",
        null,
      ),
    ).toThrow("HOLIDAY_DATA_UNKNOWN");
  });
  it("escapes spreadsheet formulas and quotes", () => {
    expect(csvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
});
import { overlapLanes } from "./planner";
it("keeps approved overlaps in separately interactive lanes", () => {
  const lanes = overlapLanes([
    { id: "a", start: 540, end: 600 },
    { id: "b", start: 570, end: 660 },
    { id: "c", start: 630, end: 720 },
    { id: "d", start: 720, end: 780 },
  ]);
  expect(lanes.get("a")).toEqual({ lane: 0, count: 2 });
  expect(lanes.get("b")).toEqual({ lane: 1, count: 2 });
  expect(lanes.get("c")).toEqual({ lane: 0, count: 2 });
  expect(lanes.get("d")).toEqual({ lane: 0, count: 1 });
});
describe("parseWindows", () => {
  it("reads common Korean and compact time-range spellings", () => {
    expect(parseWindows("09:00-12:00, 13:00-18:00")).toEqual([
      [540, 720],
      [780, 1080],
    ]);
    expect(parseWindows("9-12")).toEqual([[540, 720]]);
    expect(parseWindows("0930~1200")).toEqual([[570, 720]]);
    expect(parseWindows("9시-12시 30분")).toEqual([[540, 750]]);
    expect(parseWindows("13:00-24:00")).toEqual([[780, 1440]]);
  });
  it("treats empty and 휴무 as closed", () => {
    expect(parseWindows("")).toEqual([]);
    expect(parseWindows(" 휴무 ")).toEqual([]);
  });
  it("explains malformed or overlapping input instead of throwing a TypeError", () => {
    expect(() => parseWindows("09:00")).toThrow(/09:00-12:00처럼/);
    expect(() => parseWindows("12-9")).toThrow(/이해하지 못했어요/);
    expect(() => parseWindows("9-12,11-13")).toThrow(/겹치는/);
  });
});

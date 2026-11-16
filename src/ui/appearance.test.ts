import { expect, it } from "vitest";
import { readAppearance, saveAppearance } from "./appearance";
it("recovers from corrupt, wrong-shape and blocked storage", () => {
  for (const value of [
    "{",
    "null",
    '"dark"',
    '{"theme":"evil","text":"tiny"}',
  ]) {
    expect(readAppearance({ getItem: () => value })).toEqual({
      theme: "blue",
      text: "default",
    });
  }
  expect(
    readAppearance({
      getItem: () => {
        throw Error("blocked");
      },
    }),
  ).toEqual({ theme: "blue", text: "default" });
});
it("roundtrips device appearance and tolerates quota failure", () => {
  let saved = "";
  expect(
    saveAppearance(
      { theme: "dark", text: "large" },
      {
        setItem: (_k, v) => {
          saved = v;
        },
      },
    ),
  ).toBe(true);
  expect(readAppearance({ getItem: () => saved })).toEqual({
    theme: "dark",
    text: "large",
  });
  expect(
    saveAppearance(
      { theme: "mint", text: "default" },
      {
        setItem: () => {
          throw Error("quota");
        },
      },
    ),
  ).toBe(false);
});

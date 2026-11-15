import { it, expect } from "vitest";
import { emptyData } from "../data/demo";
import { exportBackup, parseBackup } from "./backup";
it("exports only domain data and rejects malformed relations or versions", () => {
  const data = emptyData(crypto.randomUUID());
  const out = exportBackup(data);
  expect(out).not.toContain("push_subscriptions");
  expect(parseBackup(out).schemaVersion).toBe(1);
  expect(() =>
    parseBackup(out.replace('"schemaVersion": 1', '"schemaVersion": 99')),
  ).toThrow();
  const broken = JSON.parse(out);
  broken.data.tasks.push({ id: "bad", title: "bad" });
  expect(() => parseBackup(JSON.stringify(broken))).toThrow();
});

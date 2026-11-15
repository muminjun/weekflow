import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { emptyData, uuid } from "./demo";
import {
  applyLocal,
  persistCommand,
  reconcileCache,
  readCache,
  clearPrivate,
} from "./local";
import type { Command } from "../domain/types";
it("a concurrent server refresh cannot overwrite a durable pending edit", async () => {
  const user = uuid(),
    server = emptyData(user);
  const command: Command = {
    mutationId: uuid(),
    changes: [
      {
        table: "tasks",
        action: "insert",
        row: {
          id: uuid(),
          title: "durable edit",
          description: "",
          state: "open",
          category_id: null,
          due_on: null,
          estimate_minutes: 60,
          completed_at: null,
        },
      },
    ],
  };
  const local = applyLocal(server, command.changes);
  await Promise.all([
    persistCommand(user, command, local),
    reconcileCache(user, server),
  ]);
  expect((await readCache(user))?.tasks[0].title).toBe("durable edit");
  await clearPrivate(user);
});

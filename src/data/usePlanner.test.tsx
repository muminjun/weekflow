import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { emptyData, uuid } from "./demo";
import { applyLocal, pending } from "./local";
import { usePlanner } from "./usePlanner";
import type { Change, Dataset } from "../domain/types";

const { rpc, gate } = vi.hoisted(() => ({
  rpc: vi.fn(),
  gate: { pending: null as Promise<void> | null, entered: 0 },
}));
vi.mock("./supabase", () => ({ rpc }));
// Lets a test hold resolve() between reading the queue and rewriting it.
vi.mock("./local", async (importOriginal) => {
  const m = await importOriginal<typeof import("./local")>();
  return {
    ...m,
    pending: async (user: string) => {
      const queue = await m.pending(user);
      if (gate.pending) {
        gate.entered++;
        await gate.pending;
      }
      return queue;
    },
  };
});

/** Minimal in-memory server speaking the RPCs usePlanner uses. */
function fakeServer(user: string) {
  const s = {
    data: emptyData(user) as Dataset,
    token: 1,
    versionRpc: "missing" as "missing" | "ok",
    reject: new Map<string, string>(),
    sent: [] as string[],
    reads: 0,
    probes: 0,
    readGate: null as Promise<void> | null,
  };
  rpc.mockImplementation(
    async (name: string, args: Record<string, unknown> = {}) => {
      switch (name) {
        case "ensure_profile":
          return null;
        case "dataset_version":
          s.probes++;
          if (s.versionRpc === "missing")
            throw Error(
              "Could not find the function public.dataset_version without parameters in the schema cache",
            );
          return { v: s.token };
        case "read_dataset": {
          s.reads++;
          const snapshot = structuredClone(s.data);
          if (s.readGate) await s.readGate;
          return snapshot;
        }
        case "apply_changes": {
          const id = args.p_mutation_id as string;
          const err = s.reject.get(id);
          if (err) {
            s.reject.delete(id);
            throw Error(err);
          }
          s.sent.push(id);
          s.data = applyLocal(s.data, args.p_changes as Change[]);
          s.token++;
          return null;
        }
      }
      throw Error("unexpected rpc " + name);
    },
  );
  return s;
}

function setup(user: string) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => usePlanner(user, null), { wrapper });
  mounted.push(hook.unmount);
  return hook;
}

const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 10));
  });

const taskInsert = (title: string): Change => ({
  table: "tasks",
  action: "insert",
  row: {
    id: uuid(),
    title,
    description: "",
    category_id: null,
    due_on: null,
    estimate_minutes: 60,
    state: "open",
    completed_at: null,
  },
});

let now = 10_000_000;
let tick: (() => void) | null = null;
const mounted: (() => void)[] = [];
beforeEach(() => {
  now = 10_000_000;
  tick = null;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  // Capture the hook's 30s poll so tests can fire it deterministically
  // (faking setInterval globally would also stall testing-library's waitFor).
  const real = window.setInterval.bind(window);
  vi.spyOn(window, "setInterval").mockImplementation(((
    cb: () => void,
    ms?: number,
  ) => {
    if (ms === 30000) {
      tick = cb;
      return -1;
    }
    return real(cb, ms);
  }) as typeof window.setInterval);
});
afterEach(() => {
  mounted.splice(0).forEach((u) => u());
  vi.restoreAllMocks();
  rpc.mockReset();
});
const poll = () => act(() => tick?.());

describe("usePlanner sync", () => {
  it("initial load normalises server timestamps and reports syncState saved", async () => {
    const user = uuid();
    const server = fakeServer(user);
    const block = {
      id: uuid(),
      user_id: user,
      version: 1,
      kind: "event",
      week_task_id: null,
      event_title: "late",
      event_note: "",
      category_id: null,
      start_at: "2026-11-16T14:00:00+00:00",
      end_at: "2026-11-16T15:00:00+00:00",
      local_date: "2026-11-16",
      state: "planned",
      completed_at: null,
    } as const;
    server.data.time_blocks.push({ ...block });
    const { result } = setup(user);
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    expect(result.current.status).toMatch(/^저장됨/);
    expect(result.current.data?.time_blocks[0].end_at).toBe(
      "2026-11-16T15:00:00.000Z",
    );
  });

  it("periodic ticks with an empty queue do not reload the dataset (fallback: 5 min)", async () => {
    const user = uuid();
    const server = fakeServer(user);
    const { result } = setup(user);
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    const reads = server.reads;
    const data = result.current.data;
    const status = result.current.status;
    for (let i = 0; i < 4; i++) {
      now += 30_000;
      poll();
      await settle();
    }
    expect(server.reads).toBe(reads);
    expect(result.current.data).toBe(data);
    expect(result.current.status).toBe(status); // no clock rewrite per poll
    // dataset_version is missing: after 5 minutes a full reload happens, but
    // identical data must not replace state.
    now += 5 * 60_000;
    poll();
    await waitFor(() => expect(server.reads).toBe(reads + 1));
    await settle();
    expect(result.current.data).toBe(data);
  });

  it("uses dataset_version to reload only when the token changes", async () => {
    const user = uuid();
    const server = fakeServer(user);
    server.versionRpc = "ok";
    const { result } = setup(user);
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    const reads = server.reads;
    now += 30_000;
    poll();
    await settle();
    expect(server.reads).toBe(reads);
    // Another device writes.
    server.data = applyLocal(server.data, [taskInsert("from phone")]);
    server.token++;
    now += 30_000;
    poll();
    await waitFor(() =>
      expect(result.current.data?.tasks.map((t) => t.title)).toEqual([
        "from phone",
      ]),
    );
    expect(server.reads).toBe(reads + 1);
  });

  it("focus reloads are throttled to 60s since the last load", async () => {
    const user = uuid();
    const server = fakeServer(user);
    const { result } = setup(user);
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    const reads = server.reads;
    now += 10_000;
    act(() => void window.dispatchEvent(new Event("focus")));
    await settle();
    expect(server.reads).toBe(reads);
    now += 60_000;
    act(() => void window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(server.reads).toBe(reads + 1));
  });

  it("a commit that sends triggers exactly one fresh reload", async () => {
    const user = uuid();
    const server = fakeServer(user);
    const { result } = setup(user);
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    const reads = server.reads;
    await act(() => result.current.commit([taskInsert("A")]));
    await waitFor(() => expect(server.sent).toHaveLength(1));
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    expect(server.reads).toBe(reads + 1);
    expect(result.current.data?.tasks[0].title).toBe("A");
  });

  it("reload() never dedupes onto an older in-flight read", async () => {
    const user = uuid();
    const server = fakeServer(user);
    const { result } = setup(user);
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    let open!: () => void;
    server.readGate = new Promise<void>((r) => (open = r));
    const reads = server.reads;
    let first!: Promise<unknown>;
    act(() => {
      first = result.current.reload(); // snapshot taken now, response held
    });
    await waitFor(() => expect(server.reads).toBe(reads + 1));
    server.data = applyLocal(server.data, [taskInsert("newer")]);
    server.readGate = null;
    await act(() => result.current.reload());
    expect(server.reads).toBe(reads + 2);
    expect(result.current.data?.tasks.map((t) => t.title)).toEqual(["newer"]);
    open();
    await act(async () => void (await first));
    // The stale response must not overwrite the newer data.
    expect(result.current.data?.tasks.map((t) => t.title)).toEqual(["newer"]);
  });

  it("resolve is serialized with commits so a concurrent commit is not lost", async () => {
    const user = uuid();
    const server = fakeServer(user);
    const { result } = setup(user);
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    const conflicted = taskInsert("conflicted");
    // Reject the next command once.
    const original = rpc.getMockImplementation()!;
    let rejected = false;
    rpc.mockImplementation(
      async (name: string, args: Record<string, unknown> = {}) => {
        if (name === "apply_changes" && !rejected) {
          rejected = true;
          server.reject.set(args.p_mutation_id as string, "VERSION_CONFLICT");
        }
        return original(name, args);
      },
    );
    await act(() => result.current.commit([conflicted]));
    await waitFor(() => expect(result.current.conflict).not.toBeNull());
    expect(result.current.syncState).toBe("error");
    let open!: () => void;
    gate.pending = new Promise<void>((r) => (open = r));
    gate.entered = 0;
    let resolving!: Promise<void>, committing!: Promise<void>;
    act(() => {
      resolving = result.current.resolve(false);
    });
    await waitFor(() => expect(gate.entered).toBe(1)); // resolve has read the queue
    act(() => {
      committing = result.current.commit([taskInsert("during resolve")]);
    });
    await settle(); // an unserialized commit would persist now and then be wiped
    gate.pending = null;
    open();
    await act(async () => {
      await resolving;
      await committing;
    });
    await waitFor(() => expect(server.sent).toHaveLength(1));
    await waitFor(() => expect(result.current.syncState).toBe("saved"));
    expect(server.data.tasks.map((t) => t.title)).toEqual(["during resolve"]);
    expect(await pending(user)).toHaveLength(0);
  });
});

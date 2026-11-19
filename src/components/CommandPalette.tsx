import { useMemo, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { Modal } from "./Modal";
import type { Block, Dataset, Task, WeekTask } from "../domain/types";
import { titleOf } from "../domain/selectors";
import { dayLabel, timeLabel, localMinute } from "../domain/planner";
import { previewQuickAdd } from "../domain/quickAdd";

export interface Command {
  id: string;
  label: string;
  /** Shortcut shown on the right, e.g. "N". */
  keys?: string;
  /** Extra words that should find this command. */
  aliases?: string;
  run: () => void;
}
type Item = {
  id: string;
  group: "만들기" | "명령" | "일정" | "할 일";
  label: string;
  detail?: string;
  keys?: string;
  run: () => void;
};

const recentKey = "weekflow.palette.recent";
function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(recentKey) ?? "[]");
  } catch {
    return [];
  }
}
function remember(id: string) {
  try {
    const list = [id, ...readRecent().filter((x) => x !== id)].slice(0, 12);
    localStorage.setItem(recentKey, JSON.stringify(list));
  } catch {
    /* private mode: no ranking memory */
  }
}

const initials = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
/** "회의 준비" → "ㅎㅇ ㅈㅂ", so typing initial consonants also matches. */
const chosung = (text: string) =>
  [...text]
    .map((ch) => {
      const code = ch.charCodeAt(0) - 0xac00;
      return code >= 0 && code < 11172 ? initials[Math.floor(code / 588)] : ch;
    })
    .join("");
/** Higher is better; 0 means no match. */
export function matchScore(query: string, text: string) {
  const q = query.trim().toLocaleLowerCase().replace(/\s+/g, "");
  if (!q) return 1;
  const t = text.toLocaleLowerCase().replace(/\s+/g, "");
  if (t.startsWith(q)) return 4;
  if (t.includes(q)) return 3;
  if (/^[ㄱ-ㅎ]+$/.test(q) && chosung(t).includes(q)) return 2;
  // Letters in order, e.g. "주회" → "주간 회고".
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i === q.length ? 1 : 0;
}

export function CommandPalette({
  data,
  week,
  commands,
  onClose,
  onCreate,
  onOpenBlock,
  onOpenTask,
}: {
  data: Dataset;
  week: string;
  commands: Command[];
  onClose: () => void;
  onCreate: (raw: string) => void;
  onOpenBlock: (block: Block) => void;
  onOpenTask: (task: Task, weekTask?: WeekTask) => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent] = useState(readRecent);
  const zone = data.profile.timezone;
  const items = useMemo(() => {
    const out: Item[] = [];
    const parsed = previewQuickAdd(query, data, week);
    if (query.trim() && parsed.chips.length)
      out.push({
        id: "create",
        group: "만들기",
        label: `＋ ${parsed.title || query.trim()}`,
        detail: parsed.chips.join(" · "),
        run: () => onCreate(query),
      });
    const ranked = commands
      .map((c) => ({
        c,
        score: Math.max(
          matchScore(query, c.label),
          c.aliases ? matchScore(query, c.aliases) - 0.5 : 0,
        ),
      }))
      .filter((x) => x.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          (recent.indexOf(a.c.id) + 1 || 99) -
            (recent.indexOf(b.c.id) + 1 || 99),
      );
    for (const { c } of ranked.slice(0, query ? 6 : 10))
      out.push({
        id: c.id,
        group: "명령",
        label: c.label,
        keys: c.keys,
        run: c.run,
      });
    if (query.trim()) {
      const blocks = data.time_blocks
        .filter((b) => b.state !== "skipped")
        .map((b) => ({ b, score: matchScore(query, titleOf(data, b)) }))
        .filter((x) => x.score >= 2)
        // This week first, then nearest in time.
        .sort(
          (x, y) =>
            y.score - x.score ||
            Math.abs(Date.parse(x.b.local_date) - Date.parse(week)) -
              Math.abs(Date.parse(y.b.local_date) - Date.parse(week)),
        )
        .slice(0, 5);
      for (const { b } of blocks)
        out.push({
          id: "block:" + b.id,
          group: "일정",
          label: titleOf(data, b),
          detail: `${dayLabel(b.local_date)} ${timeLabel(localMinute(b.start_at, zone))}`,
          run: () => onOpenBlock(b),
        });
      const tasks = data.tasks
        .filter((t) => t.state !== "archived")
        .map((t) => ({ t, score: matchScore(query, t.title) }))
        .filter((x) => x.score >= 2)
        .slice(0, 5);
      for (const { t } of tasks) {
        const wt = data.week_tasks
          .filter((w) => w.task_id === t.id)
          .sort((a, b) => b.week_start.localeCompare(a.week_start))[0];
        out.push({
          id: "task:" + t.id,
          group: "할 일",
          label: t.title,
          detail: [
            t.state === "done" ? "완료" : "",
            t.due_on ? `${dayLabel(t.due_on)}까지` : "",
          ]
            .filter(Boolean)
            .join(" · "),
          run: () => onOpenTask(t, wt),
        });
      }
    }
    // Plain text with nothing parsed: offer it as a Todo after real matches.
    if (query.trim() && !parsed.chips.length)
      out.push({
        id: "create",
        group: "만들기",
        label: `＋ ‘${query.trim()}’ 할 일로 추가`,
        run: () => onCreate(query),
      });
    return out;
  }, [
    query,
    data,
    week,
    commands,
    recent,
    zone,
    onCreate,
    onOpenBlock,
    onOpenTask,
  ]);
  const current = Math.min(active, Math.max(0, items.length - 1));
  function choose(item: Item | undefined) {
    if (!item) return;
    remember(item.id);
    onClose();
    // Let the palette dialog unmount before the next one opens.
    requestAnimationFrame(item.run);
  }
  return (
    <Modal
      title="무엇을 할까요?"
      onClose={onClose}
      description="명령, 일정, 할 일을 찾거나 바로 만들어요."
    >
      <div className="palette">
        <label className="palette-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">명령 또는 검색어</span>
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={
              items[current] ? `palette-${current}` : undefined
            }
            aria-autocomplete="list"
            autoComplete="off"
            placeholder="명령, 일정 검색 또는 ‘내일 3시 회의’"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const step = e.key === "ArrowDown" ? 1 : -1;
                setActive(
                  (current + step + items.length) % Math.max(1, items.length),
                );
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(items[current]);
              }
            }}
          />
        </label>
        <ul id="palette-list" role="listbox" aria-label="결과">
          {items.map((item, i) => (
            <li
              key={item.id}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === current}
              data-group={item.group}
              className={i === current ? "active" : ""}
              onPointerMove={() => setActive(i)}
              onClick={() => choose(item)}
            >
              {(i === 0 || items[i - 1].group !== item.group) && (
                <span className="palette-group" aria-hidden="true">
                  {item.group}
                </span>
              )}
              <span className="palette-label">{item.label}</span>
              {item.detail && (
                <span className="palette-detail">{item.detail}</span>
              )}
              {item.keys && <kbd>{item.keys}</kbd>}
              {i === current && <CornerDownLeft size={14} aria-hidden="true" />}
            </li>
          ))}
          {!items.length && (
            <li className="palette-empty" role="presentation">
              찾는 항목이 없어요. ‘내일 3시 회의’처럼 적으면 바로 만들 수
              있어요.
            </li>
          )}
        </ul>
      </div>
    </Modal>
  );
}

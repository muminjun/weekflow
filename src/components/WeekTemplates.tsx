import { useState } from "react";
import { confirmAction } from "../ui/Confirmations";
import { userMessage } from "../ui/errors";
import { TextField } from "../ui/Controls";
import { uuid } from "../data/demo";
import { dayLabel, timeLabel } from "../domain/planner";
import type { Change, Dataset, WeekTemplate } from "../domain/types";
import {
  applyTemplate,
  TEMPLATE_LIMIT,
  templateFromWeek,
} from "../domain/templates";

export interface WeekTemplatesProps {
  data: Dataset;
  /** Monday (yyyy-MM-dd) of the week on screen; templates apply here. */
  week: string;
  commit: (changes: Change[], ack?: boolean) => Promise<void>;
  onClose: () => void;
}

/**
 * Modal content for saving the shown week as a template and applying one
 * after a preview. Applying is a single commit, so one undo reverts it.
 */
export function WeekTemplates({
  data,
  week,
  commit,
  onClose,
}: WeekTemplatesProps) {
  const templates = [...(data.week_templates ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, "ko"),
  );
  const [name, setName] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const full = templates.length >= TEMPLATE_LIMIT;
  const draft = templateFromWeek(data, week, name || "이번 주");
  const previewing = templates.find((t) => t.id === previewId);

  async function run(work: () => Promise<void>, done?: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      if (done) setMessage(done);
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || full) return;
    const row = templateFromWeek(data, week, trimmed, uuid);
    void run(async () => {
      await commit([{ table: "week_templates", action: "insert", row }]);
      setName("");
    }, `‘${row.name}’ 템플릿을 저장했어요.`);
  }

  if (previewing)
    return (
      <TemplatePreview
        data={data}
        week={week}
        template={previewing}
        busy={busy}
        error={error}
        onBack={() => {
          setPreviewId(null);
          setError("");
        }}
        onApply={(changes, ack) =>
          void run(async () => {
            await commit(changes, ack);
            onClose();
          })
        }
      />
    );

  return (
    <div className="week-templates">
      <p className="helper-text">
        자주 반복되는 주의 일정·할 일·목표를 저장해 두고, 보이는 주에 미리 본 뒤
        한 번에 적용해요.
      </p>
      <form className="template-save" onSubmit={save}>
        <label>
          템플릿 이름
          <TextField
            name="template-name"
            placeholder="예: 평상 주, 시험 주"
            maxLength={80}
            value={name}
            disabled={full}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          className="primary"
          disabled={busy || full || !name.trim() || !draft.blocks.length}
        >
          이번 주를 템플릿으로 저장
        </button>
      </form>
      <p className="helper-text">
        {draft.blocks.length
          ? `블록 ${draft.blocks.length}개${draft.goals.length ? ` · 목표 ${draft.goals.length}개` : ""}를 저장해요. 건너뛴 블록은 빠져요.`
          : "이번 주에 저장할 블록이 없어요."}
      </p>
      {full && (
        <p className="notice" role="status">
          템플릿은 최대 {TEMPLATE_LIMIT}개까지 저장할 수 있어요. 쓰지 않는
          템플릿을 삭제해 주세요.
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <h3 className="template-heading">
        저장된 템플릿 {templates.length}/{TEMPLATE_LIMIT}
      </h3>
      {!templates.length && (
        <p className="empty-note">아직 저장한 템플릿이 없어요.</p>
      )}
      <ul className="template-list">
        {templates.map((t) => (
          <li key={t.id} className="template-row">
            {renaming?.id === t.id ? (
              <form
                className="template-rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  const next = renaming.name.trim();
                  if (!next || next === t.name) return setRenaming(null);
                  void run(async () => {
                    await commit([
                      {
                        table: "week_templates",
                        action: "update",
                        row: { id: t.id, name: next.slice(0, 80) },
                        expected_version: t.version,
                      },
                    ]);
                    setRenaming(null);
                  }, "이름을 바꿨어요.");
                }}
              >
                <TextField
                  autoFocus
                  aria-label={`${t.name} 새 이름`}
                  maxLength={80}
                  value={renaming.name}
                  onChange={(e) =>
                    setRenaming({ id: t.id, name: e.target.value })
                  }
                />
                <button className="primary" disabled={busy}>
                  저장
                </button>
                <button type="button" onClick={() => setRenaming(null)}>
                  취소
                </button>
              </form>
            ) : (
              <>
                <div className="template-summary">
                  <b>{t.name}</b>
                  <small>
                    블록 {t.blocks.length}개
                    {t.goals.length ? ` · 목표 ${t.goals.length}개` : ""}
                  </small>
                </div>
                <div className="template-actions">
                  <button
                    className="primary"
                    disabled={busy}
                    aria-label={`${t.name} 적용`}
                    onClick={() => {
                      setMessage("");
                      setPreviewId(t.id);
                    }}
                  >
                    적용
                  </button>
                  <button
                    disabled={busy}
                    aria-label={`${t.name} 이름 바꾸기`}
                    onClick={() => setRenaming({ id: t.id, name: t.name })}
                  >
                    이름 바꾸기
                  </button>
                  <button
                    className="danger"
                    disabled={busy}
                    aria-label={`${t.name} 삭제`}
                    onClick={async () => {
                      if (
                        !(await confirmAction(
                          `‘${t.name}’ 템플릿을 삭제할까요? 이미 적용한 일정은 그대로 남아요.`,
                        ))
                      )
                        return;
                      void run(
                        () =>
                          commit([
                            {
                              table: "week_templates",
                              action: "delete",
                              row: { id: t.id },
                              expected_version: t.version,
                            },
                          ]),
                        "템플릿을 삭제했어요.",
                      );
                    }}
                  >
                    삭제
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TemplatePreview({
  data,
  week,
  template,
  busy,
  error,
  onBack,
  onApply,
}: {
  data: Dataset;
  week: string;
  template: WeekTemplate;
  busy: boolean;
  error: string;
  onBack: () => void;
  onApply: (changes: Change[], ack: boolean) => void;
}) {
  // Ids are drawn once per preview so what is shown is exactly what is saved.
  const [result] = useState(() => applyTemplate(data, template, week, uuid));
  const days = new Map<string, typeof result.placements>();
  for (const p of result.placements)
    days.set(p.date, [...(days.get(p.date) ?? []), p]);
  const conflicts = result.conflicts.length;
  return (
    <div className="week-templates template-preview">
      <p className="helper-text">
        ‘{template.name}’을 {dayLabel(week)}부터 시작하는 주에 적용해요. 한 번의
        실행 취소로 되돌릴 수 있어요.
      </p>
      {conflicts > 0 && (
        <p className="notice template-conflict" role="status">
          기존 일정과 겹치는 블록이 {conflicts}개 있어요. 적용하면 나란히
          표시돼요.
        </p>
      )}
      {!result.placements.length && !result.goals.length && (
        <p className="empty-note">추가할 내용이 없어요.</p>
      )}
      {[...days].map(([date, items]) => (
        <section className="template-day" key={date}>
          <h3>{dayLabel(date)}</h3>
          <ul>
            {items.map((p, i) => (
              <li
                key={i}
                className={
                  p.overlaps.length ? "template-item overlap" : "template-item"
                }
              >
                <span className="template-time">
                  {timeLabel(p.start)}–{timeLabel(p.end % 1440)}
                </span>
                <span className="template-title">
                  {p.block.title}
                  <small>
                    {p.block.kind === "task"
                      ? p.reused
                        ? "할 일 · 기존 할 일에 연결"
                        : "할 일 · 새로 추가"
                      : "일정"}
                  </small>
                </span>
                {p.overlaps.length > 0 && (
                  <span className="template-overlap">
                    겹침: {p.overlaps.map((o) => o.title).join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {result.goals.length > 0 && (
        <section className="template-day">
          <h3>추가할 목표</h3>
          <ul>
            {result.goals.map((g) => (
              <li key={g} className="template-item">
                <span className="template-title">{g}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="button" onClick={onBack} disabled={busy}>
          목록으로
        </button>
        <button
          className="primary"
          disabled={busy || !result.changes.length}
          onClick={() => onApply(result.changes, conflicts > 0)}
        >
          적용
        </button>
      </div>
    </div>
  );
}

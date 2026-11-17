import { shouldAskCalendar, setAskCalendar } from "../ui/calendarPreference";
import { NotificationSetup } from "./NotificationSetup";
import { confirmAction, promptAction } from "../ui/Confirmations";
import { Select } from "../ui/Select";
import { Input } from "../ui/Input";
import { userMessage } from "../ui/errors";
import { useState } from "react";
import { Download, Upload, LogOut, Bell, Trash2 } from "lucide-react";
import { Modal } from "./Modal";
import type { Change, Dataset, Rule } from "../domain/types";
import {
  parseBackup,
  exportBackup,
  exportCSV,
  download,
  type Backup,
} from "../domain/backup";
import { uuid } from "../data/demo";
import { timeLabel, today } from "../domain/planner";
import { rpc, supabase } from "../data/supabase";
import { pushAction } from "../data/push";
import type { Commit } from "./Editors";
import { RepeatRuleEditor } from "./RepeatRuleEditor";
export function Settings({
  data,
  commit,
  onClose,
  onLogout,
  onReload,
  preview,
}: {
  data: Dataset;
  commit: Commit;
  onClose: () => void;
  onLogout: () => Promise<void>;
  onReload: () => Promise<unknown>;
  preview: boolean;
}) {
  const [askCalendar, setAskCalendarState] = useState(shouldAskCalendar);
  const [tab, setTab] = useState("기본");
  const [notificationEnabled, setNotificationEnabled] = useState(
    data.notification_preferences.enabled,
  );
  const [message, setMessage] = useState("");
  const [backup, setBackup] = useState<Backup | null>(null);
  const [csvBom, setCsvBom] = useState(true);
  const [rule, setRule] = useState<Rule | null>(null);
  async function run(fn: () => Promise<unknown>, success: string) {
    try {
      setMessage("처리 중…");
      await fn();
      setMessage(success);
    } catch (e) {
      setMessage(userMessage(e));
    }
  }
  return (
    <Modal title="설정" onClose={onClose} wide>
      <div className="settings-tabs">
        {["기본", "카테고리", "반복", "알림", "백업", "계정", "사용법"].map(
          (t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ),
        )}
      </div>
      <div className="settings-content">
        {tab === "사용법" && (
          <section className="help-section">
            <h3>한 화면에서 만드는 나의 한 주</h3>
            <p>
              할 일을 적고 빈 시간에 배치하세요. 처음 안내를 다시 보면서 화면의
              기능을 살펴볼 수 있어요.
            </p>
            <button
              className="primary"
              onClick={() => {
                onClose();
                requestAnimationFrame(() =>
                  window.dispatchEvent(new Event("weekflow:show-coach")),
                );
              }}
            >
              사용법 다시 보기
            </button>
          </section>
        )}
        {tab === "기본" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const timezone = String(f.get("timezone"));
              try {
                new Intl.DateTimeFormat("ko-KR", { timeZone: timezone });
              } catch {
                setMessage("유효한 IANA 시간대를 입력해 주세요.");
                return;
              }
              const start = Number(f.get("display_start_minute")),
                end = Number(f.get("display_end_minute"));
              if (end <= start) {
                setMessage("종료 시간은 시작보다 늦어야 합니다.");
                return;
              }
              const changes: Change[] = [
                {
                  table: "profiles",
                  action: "update",
                  row: {
                    id: data.profile.id,
                    timezone,
                    pixels_per_hour: Number(f.get("pixels_per_hour")),
                    display_start_minute: start,
                    display_end_minute: end,
                  },
                  expected_version: data.profile.version,
                },
                ...data.availability_rules.map((r) => ({
                  table: "availability_rules" as const,
                  action: "delete" as const,
                  row: { id: r.id },
                  expected_version: r.version,
                })),
              ];
              try {
                for (let d = 1; d <= 7; d++) {
                  const value = String(f.get(`day${d}`) ?? "");
                  for (const s of value.split(",").filter((s) => s.trim())) {
                    const [a, b] = s.trim().split("-"),
                      n = (t: string) =>
                        t
                          .split(":")
                          .reduce(
                            (a, x, i) => a + Number(x) * (i === 0 ? 60 : 1),
                            0,
                          );
                    const start_minute = n(a),
                      end_minute = n(b);
                    if (
                      !Number.isFinite(start_minute) ||
                      !Number.isFinite(end_minute) ||
                      start_minute < 0 ||
                      end_minute > 1440 ||
                      end_minute <= start_minute
                    )
                      throw Error("시간 구간을 확인해 주세요.");
                    changes.push({
                      table: "availability_rules",
                      action: "insert",
                      row: { id: uuid(), weekday: d, start_minute, end_minute },
                    });
                  }
                }
                void run(() => commit(changes), "기본 설정을 저장했습니다.");
              } catch (e) {
                setMessage(userMessage(e));
              }
            }}
          >
            <label className="check-label">
              <Input
                type="checkbox"
                checked={askCalendar}
                onChange={(e) => {
                  setAskCalendarState(e.target.checked);
                  setAskCalendar(e.target.checked);
                }}
              />
              모바일 일정 저장 후 기기 달력 추가 안내
            </label>
            <p className="helper-text">
              이 브라우저에 기억해요. 달력으로 복사한 일정은 WEEKFLOW와 자동
              동기화되지 않아요.
            </p>
            <div className="form-pair">
              <label>
                시간대
                <Input name="timezone" defaultValue={data.profile.timezone} />
              </label>
              <label>
                시간표 확대
                <Select
                  name="pixels_per_hour"
                  defaultValue={data.profile.pixels_per_hour}
                >
                  {[48, 64, 80].map((v) => (
                    <option key={v} value={v}>
                      {v}px / 시간
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="form-pair">
              <label>
                표시 시작
                <Select
                  name="display_start_minute"
                  defaultValue={data.profile.display_start_minute}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i * 60}>
                      {timeLabel(i * 60)}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                표시 종료
                <Select
                  name="display_end_minute"
                  defaultValue={data.profile.display_end_minute}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={(i + 1) * 60}>
                      {timeLabel((i + 1) * 60)}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <fieldset>
              <legend>요일별 활동 시간 · 쉼표로 여러 구간</legend>
              {["월", "화", "수", "목", "금", "토", "일"].map((d, i) => (
                <label className="availability-setting" key={d}>
                  <span>{d}</span>
                  <Input
                    name={`day${i + 1}`}
                    placeholder="휴무 또는 09:00-12:00,13:00-18:00"
                    defaultValue={data.availability_rules
                      .filter((r) => r.weekday === i + 1)
                      .map(
                        (r) =>
                          `${timeLabel(r.start_minute)}-${timeLabel(r.end_minute)}`,
                      )
                      .join(",")}
                  />
                </label>
              ))}
            </fieldset>
            <p className="small muted">
              주 시작은 월요일, 시간 스냅은 15분입니다. 공휴일은 기본 휴무이며
              날짜별 예외가 우선합니다.
            </p>
            <button className="primary">설정 저장</button>
            <p className="small muted">
              PWA 설치: Chrome 주소창의 설치 아이콘 또는 iPhone Safari의 공유 →
              홈 화면에 추가를 사용하세요.
            </p>
          </form>
        )}
        {tab === "카테고리" && (
          <>
            <p className="small muted">
              색상은 연결된 Todo와 작업 블록에 함께 적용됩니다.
            </p>
            {data.categories.map((c) => (
              <form
                className="category-setting"
                key={c.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(
                    () =>
                      commit([
                        {
                          table: "categories",
                          action: "update",
                          row: {
                            id: c.id,
                            name: String(f.get("name")).trim(),
                            color: String(f.get("color")),
                            archived_at: f.has("archive")
                              ? new Date().toISOString()
                              : null,
                          },
                          expected_version: c.version,
                        },
                      ]),
                    "카테고리를 저장했습니다.",
                  );
                }}
              >
                <Input
                  type="color"
                  name="color"
                  aria-label={`${c.name} 색상`}
                  defaultValue={c.color}
                />
                <Input
                  name="name"
                  aria-label={`${c.name} 이름`}
                  defaultValue={c.name}
                  required
                  maxLength={60}
                />
                <label className="check-label">
                  <Input
                    type="checkbox"
                    name="archive"
                    defaultChecked={!!c.archived_at}
                  />
                  보관
                </label>
                <button>저장</button>
                <button
                  type="button"
                  aria-label={`${c.name} 삭제`}
                  onClick={async () => {
                    const target = await promptAction(
                      "연결된 작업과 일정을 옮길 카테고리 이름을 입력하세요.\n" +
                        data.categories
                          .filter((x) => x.id !== c.id && !x.archived_at)
                          .map((x) => x.name)
                          .join(", "),
                    );
                    if (!target) return;
                    const dest = data.categories.find(
                      (x) =>
                        x.id !== c.id && x.name === target && !x.archived_at,
                    );
                    if (!dest) {
                      setMessage("이동할 카테고리를 확인하세요.");
                      return;
                    }
                    const changes: Change[] = [
                      ...data.tasks
                        .filter((t) => t.category_id === c.id)
                        .map((t) => ({
                          table: "tasks" as const,
                          action: "update" as const,
                          row: { id: t.id, category_id: dest.id },
                          expected_version: t.version,
                        })),
                      ...data.time_blocks
                        .filter((b) => b.category_id === c.id)
                        .map((b) => ({
                          table: "time_blocks" as const,
                          action: "update" as const,
                          row: { id: b.id, category_id: dest.id },
                          expected_version: b.version,
                        })),
                      ...data.recurrence_rules
                        .filter((r) => r.template.category_id === c.id)
                        .map((r) => ({
                          table: "recurrence_rules" as const,
                          action: "update" as const,
                          row: {
                            id: r.id,
                            template: { ...r.template, category_id: dest.id },
                          },
                          expected_version: r.version,
                        })),
                      {
                        table: "categories",
                        action: "delete",
                        row: { id: c.id },
                        expected_version: c.version,
                      },
                    ];
                    void run(
                      () => commit(changes, true),
                      "이동 후 삭제했습니다.",
                    );
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </form>
            ))}
            <form
              className="category-setting"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    commit([
                      {
                        table: "categories",
                        action: "insert",
                        row: {
                          id: uuid(),
                          name: String(f.get("name")).trim(),
                          color: String(f.get("color")),
                          sort_order: data.categories.length,
                        },
                      },
                    ]),
                  "카테고리를 추가했습니다.",
                );
              }}
            >
              <Input
                type="color"
                name="color"
                aria-label="새 카테고리 색상"
                defaultValue="#DBE8BD"
              />
              <Input
                name="name"
                aria-label="새 카테고리 이름"
                placeholder="새 카테고리"
                required
                maxLength={60}
              />
              <button>추가</button>
            </form>
          </>
        )}
        {tab === "반복" && (
          <>
            <p className="small muted">
              반복은 조회 중인 주만 생성합니다. 공휴일 제외는 공식 데이터가
              확인된 기간에만 생성합니다.
            </p>
            {data.recurrence_rules.map((r) => (
              <div className="rule-row" key={r.id}>
                <span>
                  <b>{String(r.template.title)}</b>
                  <small>
                    {r.kind === "task" ? "Todo" : "고정 일정"} ·{" "}
                    {r.weekdays
                      .map(
                        (d) =>
                          ["월", "화", "수", "목", "금", "토", "일"][d - 1],
                      )
                      .join(" ")}{" "}
                    · {r.is_active ? "진행 중" : "중지됨"}
                  </small>
                </span>
                <button onClick={() => setRule(r)}>이후 수정</button>
                <button
                  onClick={() =>
                    void run(
                      () =>
                        commit([
                          {
                            table: "recurrence_rules",
                            action: "update",
                            row: { id: r.id, is_active: !r.is_active },
                            expected_version: r.version,
                          },
                        ]),
                      "규칙 상태를 변경했습니다.",
                    )
                  }
                >
                  {r.is_active ? "중지" : "재개"}
                </button>
              </div>
            ))}
            {!data.recurrence_rules.length && (
              <p>
                등록된 반복이 없습니다. Todo 또는 일정 편집에서 반복을
                설정하세요.
              </p>
            )}
            {rule && (
              <RepeatRuleEditor
                data={data}
                rule={rule}
                commit={commit}
                onClose={() => setRule(null)}
              />
            )}
          </>
        )}
        {tab === "알림" && (
          <>
            <NotificationSetup
              data={data}
              commit={commit}
              preview={preview}
              onEnabled={() => setNotificationEnabled(true)}
            />
            <p className="small muted">
              앱 내부 알림은 플래너의 알림함에서 확인합니다. OS Push는
              HTTPS·브라우저 지원·서버 실행이 필요하며 수분 지연될 수 있습니다.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    commit([
                      {
                        table: "notification_preferences",
                        action: "update",
                        row: {
                          user_id: data.profile.id,
                          enabled: f.has("enabled"),
                          event_reminder_minutes: Number(f.get("minutes")),
                          due_d1: f.has("due_d1"),
                          due_today: f.has("due_today"),
                          rollover_prompt: f.has("rollover_prompt"),
                          weekly_review: f.has("weekly_review"),
                          quiet_start: String(f.get("quiet_start")) || null,
                          quiet_end: String(f.get("quiet_end")) || null,
                        },
                        expected_version: data.notification_preferences.version,
                      },
                    ]),
                  "알림 설정을 저장했습니다.",
                );
              }}
            >
              {(
                [
                  "enabled",
                  "due_d1",
                  "due_today",
                  "rollover_prompt",
                  "weekly_review",
                ] as const
              ).map((key, i) => (
                <label className="check-label" key={key}>
                  <Input
                    type="checkbox"
                    role="switch"
                    name={key}
                    checked={
                      key === "enabled" ? notificationEnabled : undefined
                    }
                    onChange={
                      key === "enabled"
                        ? (e) => setNotificationEnabled(e.target.checked)
                        : undefined
                    }
                    defaultChecked={
                      key === "enabled"
                        ? undefined
                        : data.notification_preferences[key]
                    }
                  />
                  {
                    [
                      "알림 사용",
                      "마감 하루 전",
                      "마감 당일",
                      "이월 제안",
                      "주간 회고",
                    ][i]
                  }
                </label>
              ))}
              <label>
                일정 시작 몇 분 전
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  name="minutes"
                  defaultValue={
                    data.notification_preferences.event_reminder_minutes
                  }
                />
              </label>
              <div className="form-pair">
                <label>
                  방해금지 시작
                  <Input
                    type="time"
                    name="quiet_start"
                    defaultValue={
                      data.notification_preferences.quiet_start ?? ""
                    }
                  />
                </label>
                <label>
                  방해금지 종료
                  <Input
                    type="time"
                    name="quiet_end"
                    defaultValue={data.notification_preferences.quiet_end ?? ""}
                  />
                </label>
              </div>
              <button className="primary">알림 설정 저장</button>
            </form>
            <div className="secondary-actions">
              {(["unsubscribe"] as const).map((action) => (
                <button
                  key={action}
                  disabled={preview}
                  onClick={() =>
                    void run(
                      () => pushAction(action),
                      "기기 구독을 해제했습니다.",
                    )
                  }
                >
                  <Bell size={14} />이 기기 구독 해제
                </button>
              ))}
            </div>
            {preview && (
              <p className="notice">
                체험에서는 실제 Push를 등록하지 않습니다.
              </p>
            )}
          </>
        )}
        {tab === "백업" && (
          <>
            <p className="small muted">
              인증 토큰과 Push 구독 키는 백업에 포함하지 않습니다. JSON 최대
              10MB.
            </p>
            <div className="secondary-actions">
              <button
                onClick={() =>
                  download(`weekflow-${today()}.json`, exportBackup(data))
                }
              >
                <Download size={15} />
                전체 JSON
              </button>
              <button
                onClick={() =>
                  download(
                    `weekflow-todos-${today()}.csv`,
                    exportCSV(data, csvBom),
                    "text/csv;charset=utf-8",
                  )
                }
              >
                <Download size={15} />
                Todo CSV {csvBom ? "(UTF-8 BOM)" : ""}
              </button>
            </div>
            <label className="check-label">
              <Input
                type="checkbox"
                checked={csvBom}
                onChange={(e) => setCsvBom(e.target.checked)}
              />
              CSV에 UTF-8 BOM 포함
            </label>
            <label className="file-label">
              <Upload size={18} />
              JSON 백업 선택
              <Input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 10 * 1024 * 1024) {
                    setMessage("10MB 이하의 파일만 가능합니다.");
                    return;
                  }
                  void file
                    .text()
                    .then((text) => {
                      setBackup(parseBackup(text));
                      setMessage(
                        "검증 완료 · 아직 데이터는 변경하지 않았습니다.",
                      );
                    })
                    .catch((e) => {
                      setBackup(null);
                      setMessage(userMessage(e));
                    });
                }}
              />
            </label>
            {backup && (
              <div className="import-preview">
                <b>가져오기 미리보기</b>
                <p>
                  Todo {backup.data.tasks.length}개 · 블록{" "}
                  {backup.data.time_blocks.length}개 · 목표{" "}
                  {backup.data.goals.length}개
                </p>
                <p>
                  동일 UUID Todo{" "}
                  {
                    backup.data.tasks.filter((t) =>
                      data.tasks.some((x) => x.id === t.id),
                    ).length
                  }
                  개 · 교체 시 현재 Todo {data.tasks.length}개를 지웁니다.
                </p>
                {(["merge", "replace"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={mode === "replace" ? "danger" : ""}
                    disabled={preview}
                    onClick={async () => {
                      if (
                        !(await confirmAction(
                          mode === "replace"
                            ? "현재 계정의 도메인 데이터를 모두 지우고 교체합니다. 계속할까요?"
                            : "같은 ID는 백업 내용으로 병합합니다. 계속할까요?",
                        ))
                      )
                        return;
                      if (
                        mode === "replace" &&
                        (await promptAction(
                          "최종 확인: 교체 를 입력하세요.",
                        )) !== "교체"
                      )
                        return;
                      void run(async () => {
                        await rpc("import_backup", {
                          p_backup: backup,
                          p_mode: mode,
                          p_confirm: mode === "replace" ? "REPLACE" : "MERGE",
                        });
                        await onReload();
                        setBackup(null);
                      }, "원자적 복원을 완료했습니다.");
                    }}
                  >
                    {mode === "merge" ? "병합하여 복원" : "전체 교체하여 복원"}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {tab === "계정" && (
          <>
            <p>데이터는 현재 로그인한 사용자에게만 연결됩니다.</p>
            <p className="small muted">
              로그아웃하면 이 기기의 개인 캐시와 미전송 큐를 삭제합니다. 먼저
              동기화를 완료하거나 JSON 백업을 저장하세요.
            </p>
            <button onClick={() => void run(onLogout, "로그아웃했습니다.")}>
              <LogOut size={16} /> {preview ? "체험 종료" : "로그아웃"}
            </button>
            {!preview && (
              <>
                <hr />
                <h3>계정과 모든 데이터 삭제</h3>
                <p className="small muted">
                  복구할 수 없습니다. 최근 로그인 확인이 필요합니다.
                </p>
                <button
                  className="danger"
                  onClick={async () => {
                    if (
                      !(await confirmAction(
                        "계정과 모든 데이터, Push 구독을 영구 삭제할까요?",
                      ))
                    )
                      return;
                    if (
                      (await promptAction(
                        "최종 확인: WEEKFLOW 삭제 를 입력하세요.",
                      )) !== "WEEKFLOW 삭제"
                    )
                      return;
                    void run(async () => {
                      const { error } = await supabase!.functions.invoke(
                        "delete-account",
                        { body: { confirm: "DELETE" } },
                      );
                      if (error) throw error;
                      await onLogout();
                    }, "계정을 삭제했습니다.");
                  }}
                >
                  <Trash2 size={15} />
                  계정 영구 삭제
                </button>
              </>
            )}
          </>
        )}
      </div>
      {message && (
        <p className="settings-message" role="status">
          {message}
        </p>
      )}
    </Modal>
  );
}

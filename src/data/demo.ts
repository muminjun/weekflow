import type { Dataset } from "../domain/types";
import { addDays, toUTC } from "../domain/planner";
export const uuid = () => crypto.randomUUID();
export function emptyData(id: string): Dataset {
  const base = () => ({ id: uuid(), user_id: id, version: 1 });
  return {
    profile: {
      id,
      timezone: "Asia/Seoul",
      pixels_per_hour: 64,
      display_start_minute: 240,
      display_end_minute: 1440,
      onboarding_completed: true,
      version: 1,
    },
    categories: ["WORK", "PERSONAL", "STUDY", "HEALTH", "ROUTINE", "OTHER"].map(
      (name, i) => ({
        ...base(),
        name,
        color: [
          "#F1C9B9",
          "#DBE8BD",
          "#CBDDEA",
          "#E5D7EB",
          "#EADFBD",
          "#DFE0DC",
        ][i],
        sort_order: i,
      }),
    ),
    tasks: [],
    week_tasks: [],
    week_task_day_marks: [],
    goals: [],
    goal_week_tasks: [],
    time_blocks: [],
    availability_rules: [1, 2, 3, 4, 5].map((weekday) => ({
      ...base(),
      weekday,
      start_minute: 540,
      end_minute: 1080,
    })),
    availability_overrides: [],
    recurrence_rules: [],
    recurrence_occurrences: [],
    week_reviews: [],
    notification_preferences: {
      user_id: id,
      enabled: false,
      event_reminder_minutes: 10,
      due_d1: true,
      due_today: true,
      rollover_prompt: true,
      weekly_review: true,
      quiet_start: null,
      quiet_end: null,
      version: 1,
    },
    in_app_notifications: [],
  };
}
export function demoData(week: string): Dataset {
  const id = uuid(),
    d = emptyData(id);
  const titles = [
    "브랜드 리뉴얼 기획안",
    "레퍼런스 리서치 & 무드보드",
    "랜딩 페이지 디자인",
    "이번 주 읽을 책 30페이지",
    "주간 지출 정리",
    "포트폴리오 업데이트",
  ];
  titles.forEach((title, i) => {
    const task_id = uuid(),
      wt = uuid();
    d.tasks.push({
      id: task_id,
      user_id: id,
      version: 1,
      title,
      description: "",
      category_id: d.categories[i === 3 ? 2 : i === 4 ? 1 : 0].id,
      due_on: i < 3 ? addDays(week, 4) : null,
      estimate_minutes: 120,
      state: "open",
      completed_at: null,
    });
    d.week_tasks.push({
      id: wt,
      user_id: id,
      version: 1,
      task_id,
      week_start: week,
      state: "open",
      completed_at: null,
      sort_order: i,
    });
  });
  const taskBlock = (
    index: number,
    day: number,
    start: number,
    duration: number,
    state: "planned" | "done" = "planned",
  ) =>
    d.time_blocks.push({
      id: uuid(),
      user_id: id,
      version: 1,
      kind: "task",
      week_task_id: d.week_tasks[index].id,
      event_title: null,
      event_note: "",
      category_id: null,
      start_at: toUTC(addDays(week, day), start, d.profile.timezone),
      end_at: toUTC(addDays(week, day), start + duration, d.profile.timezone),
      local_date: addDays(week, day),
      state,
      completed_at:
        state === "done"
          ? toUTC(addDays(week, day), start + duration, d.profile.timezone)
          : null,
    });
  for (const [day, start, duration, title, cat] of [
    [0, 600, 60, "주간 팀 미팅", 0],
    [0, 720, 60, "점심", 5],
    [1, 720, 60, "점심", 5],
    [2, 600, 60, "프로젝트 체크인", 0],
    [2, 720, 60, "점심", 5],
    [3, 840, 120, "외부 미팅", 0],
    [4, 660, 60, "디자인 리뷰", 0],
  ] as [number, number, number, string, number][]) {
    d.time_blocks.push({
      id: uuid(),
      user_id: id,
      version: 1,
      kind: "event",
      week_task_id: null,
      event_title: title,
      event_note: "",
      category_id: d.categories[cat].id,
      start_at: toUTC(addDays(week, day), start, d.profile.timezone),
      end_at: toUTC(addDays(week, day), start + duration, d.profile.timezone),
      local_date: addDays(week, day),
      state: "planned",
      completed_at: null,
    });
  }
  taskBlock(0, 0, 660, 60, "done");
  taskBlock(0, 0, 780, 120);
  taskBlock(1, 1, 540, 180);
  taskBlock(2, 1, 780, 180);
  taskBlock(1, 2, 540, 60);
  taskBlock(2, 2, 780, 120);
  taskBlock(3, 3, 540, 60);
  taskBlock(5, 3, 600, 120);
  taskBlock(2, 4, 540, 120);
  taskBlock(4, 4, 780, 60);
  d.goals.push({
    id: uuid(),
    user_id: id,
    version: 1,
    week_start: week,
    title: "생각을 구체적인 결과물로 만들기",
    note: "",
    sort_order: 0,
  });
  d.goal_week_tasks.push(
    ...d.week_tasks.slice(0, 3).map((w) => ({
      user_id: id,
      goal_id: d.goals[0].id,
      week_task_id: w.id,
    })),
  );
  return d;
}

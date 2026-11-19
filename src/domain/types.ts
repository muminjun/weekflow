export interface Base {
  id: string;
  user_id: string;
  version: number;
  created_at?: string;
  updated_at?: string;
}
export interface Profile {
  id: string;
  timezone: string;
  pixels_per_hour: number;
  display_start_minute: number;
  display_end_minute: number;
  onboarding_completed: boolean;
  version: number;
}
export interface Category extends Base {
  name: string;
  color: string;
  archived_at?: string | null;
  sort_order: number;
}
export interface Task extends Base {
  title: string;
  description: string;
  category_id: string | null;
  due_on: string | null;
  estimate_minutes: number | null;
  state: "open" | "done" | "archived";
  completed_at: string | null;
}
export interface WeekTask extends Base {
  task_id: string;
  week_start: string;
  state: "open" | "done" | "carried" | "skipped";
  completed_at: string | null;
  carried_to_week?: string | null;
  sort_order: number;
}
export interface Block extends Base {
  kind: "event" | "task";
  week_task_id: string | null;
  event_title: string | null;
  event_note: string;
  category_id: string | null;
  start_at: string;
  end_at: string;
  local_date: string;
  state: "planned" | "done" | "skipped";
  completed_at: string | null;
}
export interface Mark extends Base {
  week_task_id: string;
  local_date: string;
  mark: "planned" | "done";
}
export interface Goal extends Base {
  week_start: string;
  title: string;
  note: string;
  sort_order: number;
}
export interface GoalLink {
  user_id: string;
  goal_id: string;
  week_task_id: string;
}
export interface Rule extends Base {
  kind: "event" | "task";
  frequency: "daily" | "weekly";
  starts_on: string;
  ends_on: string | null;
  weekdays: number[];
  skip_public_holidays: boolean;
  timezone: string;
  template: Record<string, unknown>;
  is_active: boolean;
}
export interface Occurrence extends Base {
  rule_id: string;
  local_date: string;
  state: "generated" | "exception" | "cancelled";
  task_id: string | null;
  time_block_id: string | null;
  overrides: Record<string, unknown>;
}
export interface AvailabilityRule extends Base {
  weekday: number;
  start_minute: number;
  end_minute: number;
}
export interface Override extends Base {
  local_date: string;
  mode: "closed" | "replace";
  windows: { startMinute: number; endMinute: number }[];
}
export interface Review extends Base {
  week_start: string;
  did_well: string;
  could_improve: string;
  next_week_action: string;
  stats_snapshot: Stats | null;
  finalized_at: string | null;
}
export interface Stats {
  done: number;
  total: number;
  eventMinutes: number;
  plannedMinutes: number;
  doneMinutes: number;
  carried: number;
}
export interface Preferences {
  user_id: string;
  enabled: boolean;
  event_reminder_minutes: number;
  due_d1: boolean;
  due_today: boolean;
  rollover_prompt: boolean;
  weekly_review: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  version: number;
}
export interface AppNotification extends Base {
  kind: string;
  title: string;
  body: string;
  target_ref: string | null;
  read_at: string | null;
}
/** A focus timer run tied to a block; minutes are measured, not planned. */
export interface BlockSession extends Base {
  block_id: string;
  started_at: string;
  ended_at: string | null;
  note: string;
}
export interface TemplateBlock {
  /** 1 = 월 … 7 = 일 */
  weekday: number;
  start_minute: number;
  duration: number;
  kind: "event" | "task";
  title: string;
  category_id: string | null;
  note: string;
}
/** A reusable week shape ("평상 주", "시험 주") applied on demand. */
export interface WeekTemplate extends Base {
  name: string;
  blocks: TemplateBlock[];
  goals: string[];
}
export interface Dataset {
  profile: Profile;
  categories: Category[];
  tasks: Task[];
  week_tasks: WeekTask[];
  week_task_day_marks: Mark[];
  goals: Goal[];
  goal_week_tasks: GoalLink[];
  time_blocks: Block[];
  availability_rules: AvailabilityRule[];
  availability_overrides: Override[];
  recurrence_rules: Rule[];
  recurrence_occurrences: Occurrence[];
  week_reviews: Review[];
  /** Empty until migration 015 is applied on the server. */
  block_sessions: BlockSession[];
  week_templates: WeekTemplate[];
  notification_preferences: Preferences;
  in_app_notifications: AppNotification[];
}
export type Table =
  | Exclude<keyof Dataset, "profile" | "notification_preferences">
  | "profiles"
  | "notification_preferences";
export interface Change {
  table: Table;
  action: "insert" | "update" | "delete" | "upsert";
  row: Record<string, unknown>;
  expected_version?: number;
}
export interface Command {
  mutationId: string;
  changes: Change[];
  acknowledgeConflict?: boolean;
}
export interface HolidayYear {
  schemaVersion: 1;
  year: number;
  source: "KASI-SpcdeInfoService";
  fetchedAt: string;
  complete: boolean;
  items: { date: string; names: string[]; isHoliday: boolean }[];
}

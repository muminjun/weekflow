create extension if not exists pgcrypto;

-- 1. ENUM
create type public.task_state as enum ('open','done','archived');
create type public.week_task_state as enum ('open','done','carried','skipped');
create type public.day_mark_state as enum ('planned','done');
create type public.block_kind as enum ('event','task');
create type public.block_state as enum ('planned','done','skipped');
create type public.recurrence_kind as enum ('event','task');
create type public.recurrence_frequency as enum ('daily','weekly');
create type public.recurrence_occurrence_state as enum ('generated','exception','cancelled');
create type public.availability_override_mode as enum ('closed','replace');
create type public.notification_job_state as enum ('pending','sending','sent','retry','failed','cancelled');

-- 2. 사용자 설정
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'Asia/Seoul',
  week_starts_on smallint not null default 1 check (week_starts_on = 1),
  display_start_minute smallint not null default 240 check (display_start_minute between 0 and 1439),
  display_end_minute smallint not null default 1440 check (display_end_minute between 1 and 1800),
  pixels_per_hour smallint not null default 64 check (pixels_per_hour between 32 and 160),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  check (display_end_minute > display_start_minute)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (id, user_id)
);
create unique index categories_unique_active_name
  on public.categories(user_id, lower(name)) where archived_at is null;

-- 3. Todo 원본 및 주간 수행 이력
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text not null default '',
  category_id uuid,
  due_on date,
  estimate_minutes int check (estimate_minutes is null or (estimate_minutes between 15 and 10080 and estimate_minutes % 15 = 0)),
  state public.task_state not null default 'open',
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories(id, user_id)
);
create index tasks_by_owner_due on public.tasks(user_id,due_on) where archived_at is null;

create table public.week_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid not null,
  week_start date not null,
  state public.week_task_state not null default 'open',
  sort_order int not null default 0,
  completed_at timestamptz,
  carried_to_week date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  check (extract(isodow from week_start) = 1),
  unique (id, user_id),
  unique (user_id, task_id, week_start),
  foreign key (task_id, user_id) references public.tasks(id, user_id) on delete cascade
);
create index week_tasks_by_week on public.week_tasks(user_id,week_start,state);

create table public.week_task_day_marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_task_id uuid not null,
  local_date date not null,
  mark public.day_mark_state not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (user_id,week_task_id,local_date),
  foreign key (week_task_id,user_id) references public.week_tasks(id,user_id) on delete cascade
);

-- 4. GOALS 및 연결
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  title text not null check (char_length(trim(title)) between 1 and 240),
  note text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  check (extract(isodow from week_start) = 1),
  unique (id,user_id)
);
create index goals_by_week on public.goals(user_id,week_start);

create table public.goal_week_tasks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid not null,
  week_task_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id,goal_id,week_task_id),
  foreign key (goal_id,user_id) references public.goals(id,user_id) on delete cascade,
  foreign key (week_task_id,user_id) references public.week_tasks(id,user_id) on delete cascade
);

-- 5. Event 또는 Task time block
create table public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.block_kind not null,
  week_task_id uuid,
  event_title text,
  event_note text not null default '',
  category_id uuid,
  start_at timestamptz not null,
  end_at timestamptz not null,
  local_date date not null,
  state public.block_state not null default 'planned',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (id,user_id),
  check (end_at > start_at),
  check (end_at <= start_at + interval '7 days'),
  check ((kind = 'task' and week_task_id is not null and event_title is null)
      or (kind = 'event' and week_task_id is null and event_title is not null and char_length(trim(event_title)) between 1 and 240)),
  foreign key (week_task_id,user_id) references public.week_tasks(id,user_id) on delete cascade,
  foreign key (category_id,user_id) references public.categories(id,user_id)
);
create index time_blocks_by_time on public.time_blocks(user_id,start_at,end_at);

-- 6. 주간/날짜별 사용 가능 시간
create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_minute smallint not null check (start_minute between 0 and 1439),
  end_minute smallint not null check (end_minute between 1 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  check (end_minute > start_minute),
  unique (user_id,weekday,start_minute,end_minute)
);

create table public.availability_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  local_date date not null,
  mode public.availability_override_mode not null,
  windows jsonb not null default '[]'::jsonb check (jsonb_typeof(windows) = 'array'),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (user_id,local_date)
);

-- 7. 반복 템플릿 및 회차
create table public.recurrence_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.recurrence_kind not null,
  frequency public.recurrence_frequency not null,
  weekdays smallint[] not null default '{}',
  starts_on date not null,
  ends_on date,
  skip_public_holidays boolean not null default false,
  timezone text not null default 'Asia/Seoul',
  template jsonb not null check (jsonb_typeof(template) = 'object'),
  is_active boolean not null default true,
  parent_rule_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  check (ends_on is null or ends_on >= starts_on),
  check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  unique (id,user_id),
  foreign key (parent_rule_id,user_id) references public.recurrence_rules(id,user_id)
);

create table public.recurrence_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  rule_id uuid not null,
  local_date date not null,
  state public.recurrence_occurrence_state not null default 'generated',
  task_id uuid,
  time_block_id uuid,
  overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(overrides) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (user_id,rule_id,local_date),
  check (not (task_id is not null and time_block_id is not null)),
  foreign key (rule_id,user_id) references public.recurrence_rules(id,user_id) on delete cascade,
  foreign key (task_id,user_id) references public.tasks(id,user_id) on delete set null (task_id),
  foreign key (time_block_id,user_id) references public.time_blocks(id,user_id) on delete set null (time_block_id)
);

-- 8. 회고
create table public.week_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  did_well text not null default '',
  could_improve text not null default '',
  next_week_action text not null default '',
  stats_snapshot jsonb,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  check (extract(isodow from week_start) = 1),
  unique (user_id,week_start)
);

-- 9. 알림
create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  event_reminder_minutes int not null default 10 check (event_reminder_minutes between 0 and 1440),
  due_d1 boolean not null default true,
  due_today boolean not null default true,
  rollover_prompt boolean not null default true,
  weekly_review boolean not null default true,
  quiet_start time,
  quiet_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_secret text not null,
  device_label text,
  is_active boolean not null default true,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,endpoint)
);

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  source_id uuid,
  due_at timestamptz not null,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  state public.notification_job_state not null default 'pending',
  attempts int not null default 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id,idempotency_key)
);
create index notification_jobs_ready on public.notification_jobs(state,due_at)
  where state in ('pending','retry');

create table public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  target_ref text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index in_app_notifications_by_user on public.in_app_notifications(user_id,created_at desc);

-- 10. 멱등 오퍼레이션 수신 기록(사용자 직접 수정 금지)
create table public.client_mutations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  mutation_id uuid not null,
  operation text not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id,mutation_id)
);

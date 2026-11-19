# 남은 개선 마무리 (2026-11-19)

이전 감사에서 보류한 항목을 완료한다. 여러 작업자가 같은 작업 트리에서 동시에 일하므로 파일 소유권을 지킨다. 커밋·푸시·실DB 적용은 하지 않는다.

## 공통 데이터 계약 (migration `015_focus_templates_feed_errors.sql`)

`src/domain/types.ts`에 `BlockSession`, `TemplateBlock`, `WeekTemplate`, `Dataset.block_sessions`, `Dataset.week_templates`가 이미 추가되어 있다.

- `block_sessions`: `id uuid pk`, `user_id`, `block_id uuid` → `time_blocks(id)` on delete cascade(같은 사용자 소유 복합 FK 방식은 기존 테이블을 따름), `started_at timestamptz not null`, `ended_at timestamptz null`(≥ started_at, 최대 24시간), `note text default '' (≤ 1000)`, `version`, `created_at`, `updated_at`. 사용자당 열린 세션(ended_at null)은 최대 1개.
- `week_templates`: `id`, `user_id`, `name text 1..80`, `blocks jsonb`(배열 ≤ 200, 각 원소 `{weekday 1..7, start_minute 0..1425 15분 단위, duration 15..1440 15분 단위, kind 'event'|'task', title 1..240, category_id uuid|null, note ≤ 1000}`), `goals jsonb`(문자열 배열 ≤ 20, 각 ≤ 240), `version`, timestamps. 사용자당 최대 30개.
- 두 테이블 모두 `read_dataset()` 결과에 포함하고, `apply_changes`(insert/update/delete, expected_version), `import_backup`/백업 형식, `dataset_version` 트리거, RLS, 계정 삭제에 포함한다.
- 캘린더 구독: `calendar_feeds(user_id pk, token_hash text, created_at, last_used_at)`. 클라이언트에는 노출하지 않는다. RPC `rotate_calendar_feed() returns text`(새 토큰 평문을 한 번만 반환, 기존 토큰 무효화), `revoke_calendar_feed()`, `calendar_feed_status() returns jsonb {enabled, created_at, last_used_at}`. Edge Function `calendar-feed`(verify_jwt=false): `GET /functions/v1/calendar-feed?token=…` → 토큰 해시 조회 → 과거 30일~미래 90일 블록을 `text/calendar` ICS로 반환. 잘못된 토큰은 404, 사용자당 분당 요청 제한.
- 오류 보고: `client_errors(id bigserial, user_id uuid null, message ≤ 500, stack ≤ 4000, url ≤ 500, user_agent ≤ 300, release ≤ 40, created_at)`. RPC `report_client_error(p jsonb) returns void`, authenticated 전용, 사용자당 시간당 30건 초과 시 조용히 무시. 30일 보존(기존 `purge_expired_records`에 추가).

## 클라이언트 동작
- 집중 타이머: 블록 편집에서 시작/종료. 시간은 타임스탬프로 계산(백그라운드 탭 지연 무관), 실행 중 Wake Lock 요청(지원 시), 종료 시 세션 저장. 회고 인사이트에서 실측 집중 시간을 계획 시간과 구분해 보여준다.
- 주 템플릿: 현재 주를 템플릿으로 저장 / 템플릿을 보이는 주에 미리보기 후 한 번에 적용(한 번의 실행 취소로 되돌림).
- 블록 복제: 블록 편집의 `복제`와 Alt+드래그 복사.
- 마감 → 시간표 끌어 놓기: DEADLINE 행을 시간표로 끌면 이번 주 연결과 블록을 한 번에 만든다. 모바일은 `배치` 버튼.

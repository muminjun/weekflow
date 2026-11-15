# WEEKFLOW — AI 바이브코딩 최종 구현 프롬프트

> 사용 방법: AI 코딩 세션(Codex, Claude Code, Cursor 등)에 **이 파일 내용과** `WEEKFLOW_01_PRODUCT_SPEC.md`, `WEEKFLOW_02_IMPLEMENTATION_PLAN.md`를 함께 제공한다. 가능하면 사용자가 제공한 WORKIVE 위클리 플래너 **스크린샷 5장**도 업로드한다.  
> 이 지시문은 단순한 화면 목업이 아닌 **실제로 배포 가능한 전체 웹서비스 구현**을 요구한다.

---

## AI 개발 에이전트에게 보낼 프롬프트 — 시작

당신은 시니어 풀스택 엔지니어, UI/UX 엔지니어, DB/보안 엔지니어, 테스트 엔지니어 역할을 함께 수행한다.

### 1. 과제

**WEEKFLOW**라는 개인용 주간 Todo·타임블로킹 플래너 웹서비스를 처음부터 끝까지 구현하라. UI는 첨부된 WORKIVE 종이형 위클리 플래너 레퍼런스의 배치·비율·격자·컬러·요일별 기록 방식을 매우 충실히 참고하되, 기존 브랜드 로고·상표·고유 그래픽·상용 폰트 파일을 가져오지 말고 독립된 이름과 자산을 사용하라.

이 앱은 다음 조건을 **모두** 충족해야 한다.

- PC: 월~일 7일 시간표, 우측 GOALS/DEADLINE/TO-DO, 하단 WEEKLY REVIEW의 종이형 화면.
- 모바일: 하루 집중형 타임라인 + 요일 선택 + Todo 바텀시트.
- Todo 하나를 여러 날짜·시간 블록으로 배치, 각 블록과 Todo 전체 별도 완료.
- 15분 단위 드래그·리사이즈·미리보기·시간 중복 경고 후 승인.
- 평일 기본 09:00~18:00 가용시간, 공휴일·주말 기본 0, 날짜별 수동 예외.
- 우측 Todo 행에 M/T/W/T/F/S/S **7칸 점·X·partial·완료 후 선** 기록.
- 목표 선택 연결, Todo 마감일과 DEADLINE 자동 연결, 회고 통계+질문 입력.
- 다음 주 미완료 Todo 이월 **제안 후 사용자 선택**, 이전 주 이력 보존.
- Event와 Todo 모두 반복(매일·평일·선택 요일·공휴일 제외), 회차별 완료·예외 처리.
- 카테고리별 자동 파스텔 색상, 사용자 수정 가능.
- Google 로그인 필수, Supabase RLS로 사용자별 데이터 분리, 여러 기기 동기화.
- 공식 한국 공휴일 API(한국천문연구원 특일 정보)와 주말/대체공휴일 표시.
- 브라우저 OS **Web Push 실제 발송**, 앱 내부 알림, 권한 거부 대체 동작.
- JSON 전체 내보내기·안전한 병합/교체 가져오기, CSV Todo 내보내기.
- 오프라인 조회/임시 편집/재동기화, 충돌 검출/선택 UI, Undo.
- GitHub Pages 무료 정적 호스팅 + Supabase 무료 Auth/DB/Edge Functions/Cron 구조.

**중요:** 사용자는 '모든 기능을 첫 정식 릴리스에 포함'하도록 확정했다. 구현을 단계별로 나눌 수는 있지만, 미구현 기능을 제거하거나 '추후 추가'로 돌리지 말라. 실제 기능이 완성되기 전에는 완료했다고 말하지 말라.

### 2. 권위 있는 요구사항 문서

아래 우선순위를 따른다.

1. `WEEKFLOW_01_PRODUCT_SPEC.md` — 기능별 확정 동작, 화면, 사용자 흐름, 예외, 수락 기준.
2. `WEEKFLOW_02_IMPLEMENTATION_PLAN.md` — 데이터 구조/SQL 초안, RLS, RPC, API, 빌드·배포·QA 계획.
3. 제공된 레퍼런스 이미지 5장 — 시각적 구성(단, 브랜드 저작물 복제 금지).
4. 이 지시문 — 작업 수행 절차와 완료 정의.

문서가 누락되어 있다면 **먼저 파일 존재 여부를 확인**하고, 필요한 경우 이 프롬프트의 요구사항을 기준으로 가능한 범위까지 진행하되 빠진 자료를 명시하라. 가짜 구현을 만들지 말라.

### 3. 기술 스택과 배포

- **UI:** React, TypeScript strict, Vite, CSS Variables 중심의 paper UI, 필요한 경우 Radix UI 등 headless 접근성 컴포넌트.
- **상태:** TanStack Query + 최소한의 로컬 상태, Zod validation.
- **시간:** date-fns/date-fns-tz 또는 확실히 검증된 시간대 계산 라이브러리; 기본 Asia/Seoul / 월요일 시작.
- **D&D:** dnd-kit 또는 실제 15분 이동·리사이즈·키보드 대체 조작이 가능한 검증된 구현.
- **오프라인:** IndexedDB 기반 로컬 캐시/보류 명령 큐 + server version conflict.
- **서버:** Supabase Auth(Google), PostgreSQL, RLS, 필요한 RPC/Edge Functions, pg_cron/pg_net.
- **Push:** 프로젝트 경로에 맞는 PWA Service Worker, Web Push 표준 VAPID, 서버 예약 발송. iOS의 홈 화면 PWA 제약 안내.
- **공휴일:** 공공데이터포털 한국천문연구원 특일 API (`getRestDeInfo`) XML→검증된 JSON으로 정규화, GitHub Actions Secret과 예약/수동 갱신, 실패 시 캐시 폴백. API 키 프런트 노출 금지.
- **호스팅:** GitHub Pages `https://<USER>.github.io/<REPO>/` 기준으로 Vite base, asset URL, HashRouter, OAuth callback, manifest/SW scope를 모두 동작하게 설정.
- **테스트:** Vitest, React Testing Library, Playwright, SQL/RLS 통합 테스트. CI에 typecheck/lint/test/build 포함.
- **계정/요금:** 처음에는 월 0원 사용 가능한 범위로 구성. 무료 Supabase 프로젝트 중지/푸시 지연 가능성을 사용자에게 정직하게 안내. 유료 서비스를 묵시적으로 활성화하지 말 것.

### 4. 반드시 재현할 레퍼런스 UI

디자인 토큰은 첨부 PRD의 값을 기본으로 사용하고, 참고 이미지와 비교해서 조정하라.

- **배경:** 아이보리 `#F7F6EF` 부근, 검정 `#272723`, 연한 얇은 그리드 `#E0DED5`.
- **강조:** 라임 `#D9EE83` 부근, 일정은 살구/연두/하늘/라벤더/모래/회색 파스텔.
- **텍스트:** 작고 굵은 영문 라벨(`GOALS`, `DEADLINE`, `TO-DO`, `WEEKLY REVIEW`) + 가독성 있는 한국어 일정명.
- **구성:** 페이지 전체가 한 장의 플래너처럼 보이게. 큰 둥근 카드/강한 그림자/일반 SaaS 대시보드 스타일 금지.
- **좌측:** 월~일 7열, 날마다 날짜/가용시간/휴일 표시, 세로 시간축(기본 04:00~24:00), 15분 스냅, 파스텔 블록/점선 가용 구간.
- **우측:** GOALS, DEADLINE, TO-DO(7칸 트래커와 색점/제목/인라인 입력). 비어 있는 줄도 레퍼런스처럼 표시.
- **하단:** WEEKLY REVIEW: 계산된 통계와 3개 회고 항목.
- **휴일:** 토요일 푸른색, 일요일/공휴일 붉은색, 이름 표시, 오늘 라임 강조.
- **데스크톱:** 7일+우측 패널이 기본, 작은 노트북은 시간표 가로 스크롤. **모바일:** 하루 집중형+Todo 바텀시트.
- 시각 검수 시 레퍼런스 이미지를 보며 스크린샷을 비교하고, 글씨가 읽기 어려울 정도로 작아지지 않게 최적화하라.

### 5. DB/데이터 모델에서 절대 틀리지 말 것

PRD와 구현계획서의 기본 SQL을 **실제 Supabase migration**으로 구현하되 테이블 생성에 그치지 말고 관련 트리거/제약/RLS/RPC를 완성하라.

- `tasks`: 논리 Todo 원본.
- `week_tasks`: 해당 주 상태. 이월 시 같은 `task_id`에 새 주 연결 생성. 과거 주는 `carried`로 보존.
- `time_blocks`: `event`면 독립 고정 일정, `task`면 `week_task_id` 참조. Task를 여러 블록에 나눠 배치할 수 있음.
- `goals` ↔ `goal_week_tasks` ↔ `week_tasks`: 같은 주 검증. 지난주 목표의 달성률이 이후 상태로 변하지 않게.
- `week_task_day_marks`: 7칸 수동 기록. 자동 표시는 시간 블록으로 계산.
- `recurrence_rules`, `recurrence_occurrences`: 회차별 생성·예외·취소, unique+멱등, 무한 미래 생성 금지.
- `availability_rules`, `availability_overrides`: 날짜 수동값 우선, 구간 합집합/차집합.
- `week_reviews`: 확정된 회고 통계 snapshot.
- `notification_preferences`, `push_subscriptions`, `notification_jobs`, `in_app_notifications`.
- `client_mutations`: 오프라인 재전송 idempotency.
- 모든 사용자 테이블 RLS+복합 FK 소유자 격리, `updated_at`과 `version` 낙관적 잠금.

**불변 규칙:** 작업 마감일은 임의 이동하지 않는다. Todo를 완료했다고 미래 시간 블록을 허위 완료 처리하지 않는다. 반복 Todo와 이월 Todo를 혼동하지 않는다. 지난주의 블록·리뷰 기록을 다음주 변경으로 덮어쓰지 않는다.

### 6. 실제 기능 구현 체크리스트

- [ ] Google OAuth 로그인/로그아웃, 첫 방문 온보딩, 기본 카테고리/설정 생성.
- [ ] 월/주 탐색, 오늘 복귀, ISO week, 월/연도 경계.
- [ ] Todo Enter 생성/팝오버 수정/삭제, Event 생성/수정/삭제.
- [ ] Todo→시간표 다중 블록, 15분 드래그·리사이즈·미리보기, 충돌 경고/승인.
- [ ] 블록별 완료/건너뜀, Todo 전체 완료, 7칸 점·X·부분수행·완료 후 선.
- [ ] 평일/주말·공휴일·수동 예외 가용 시간 계산과 점선 구간.
- [ ] 목표/마감 자동 연동, 회고 통계/확정 스냅샷.
- [ ] 선택적 이월 및 반복 Event/Todo 회차 독립/이후 전체 변경.
- [ ] 모바일 하루 집중형/바텀시트/터치 대체 입력.
- [ ] 온라인 동기화 + 오프라인 큐 + 동시 수정 비교 + Undo.
- [ ] 공휴일 API 수집/캐시/검증/갱신 + API 장애 처리.
- [ ] 실제 Web Push 기기 구독·발송·클릭 이동·해제, 내부 알림/권한 거부 대체.
- [ ] 전체 JSON 다운로드·검증 복원·병합/교체·CSV 출력.
- [ ] 온보딩·빈 상태·저장 실패·세션 만료·접근성·보안.
- [ ] GitHub Pages/Edge Functions/Cron 배포 가이드, 자동/수동 테스트.

이 목록의 모든 항목은 **시각적 버튼만이 아니라 DB/백엔드와 연결되어 실제 동작**해야 한다.

### 7. 구현 순서(동일 정식 릴리스 범위 내 작업 분해)

1. 저장소/개발환경/폰트·디자인 토큰/기본 CI.
2. Supabase 전체 스키마, RLS, 트리거, Google OAuth.
3. PC/모바일 종이형 플래너 골격과 주 이동.
4. Todo/Event/시간표/드래그/완료/7칸 기록.
5. 가용시간/공휴일/Goal/Deadline/Review/이월.
6. 반복 Event·Todo 엔진과 예외.
7. PWA/SW/실 Web Push/Cron/오프라인 동기화.
8. JSON 백업·복원/CSV/오류 UX/보안.
9. 테스트/시각 QA/실 배포/문서/운영 체크.

각 단계가 끝날 때 실행한 테스트를 보고하되, **현재 세션에서 다음 단계를 계속 수행**하라. 필수 외부 자격증명/계정 설정이 없으면 실제 호출·배포만 차단된 것으로 기록하고 가능한 모든 로컬 코드/테스트를 완료하라. 계정 키가 없다는 이유로 임시 성공 메시지나 가짜 서버 데이터를 만들지 말라.

### 8. 사용자에게 필요한 최소 수동 설정

사용자의 외부 계정 권한이 없으면 다음 작업은 사용자가 제공/설정해야 한다. UI에 **정확한 설정 경로·URL·값의 형식만** 제공하고 실제 secret 값을 채팅/코드/문서에 노출하지 말라.

- GitHub Pages를 호스팅할 저장소 URL/권한.
- Supabase Free 프로젝트 URL와 publishable key, DB schema 배포 권한.
- Google Cloud OAuth client 설정(Supabase auth callback과 Pages redirect URL 구분).
- 한국천문연구원 특일 API 활용 신청 후 GitHub Secret 설정.
- VAPID 공개/개인키 생성 및 적절한 Secret 등록.
- Supabase Cron→Edge 호출 권한과 Vault secret.

비밀값이 없으면 `.env.example`, secrets checklist, 가이드, 테스트용 stub을 만들 수 있으나 **실연동 완료로 표시하지 말 것**. 공휴일은 오직 실제 API나 공식 검증 캐시로 처리한다.

### 9. 테스트와 완료 기준

필수 실행:

```bash
npm ci
npm run typecheck
npm run lint
npm run test -- --run
npm run test:integration
npm run test:e2e
npm run build
```

필수 검증:

- 사용자 A/B 간 RLS와 연결 FK 침해 테스트.
- 같은 Todo를 서로 다른 요일 2블록에 배치하고 별도 완료.
- 이동·리사이즈·충돌 경고 승인/취소/Undo.
- 7칸 트래커 계획·부분 수행·X·완료 후 줄.
- 2026년 및 주/연도 경계 공휴일, 중복 휴일, API 실패.
- 반복 회차 멱등/예외/이후 전체 수정, 이월 중복 방지.
- 과거 리뷰 스냅샷/Goal 변경 불변.
- 오프라인 변경 동기화 및 2기기 동시 편집 충돌 UI.
- JSON export/import 동치 + CSV escape.
- GitHub Pages 하위 경로의 OAuth/manifest/SW/공휴일 JSON.
- 실제 브라우저·기기 Push 수신, 푸시 미지원/권한 거부 UX.

**절대 금지:** `테스트를 실행하지 않았는데 PASS라고 보고`, 알림 권한만 구현하고 실제 푸시 구현이라고 보고, 모든 데이터가 localStorage에만 있는데 서버 연동 완료라고 보고, 마이그레이션만 적고 RLS를 생략, 하드코딩 공휴일을 API 연동이라고 보고, 작동하지 않는 샘플 버튼을 남기기.

### 10. 최종 산출물과 보고 양식

반드시 남겨야 할 산출물:

- 실행 가능한 React/Vite 전체 코드, TypeScript types, CSS/컴포넌트.
- `supabase/migrations/*.sql` 및 RLS/RPC/Edge Functions/Cron.
- CI, GitHub Pages Pages workflow, 공휴일 sync workflow.
- PWA manifest/Service Worker, VAPID 구성.
- `.env.example`, `.gitignore`, SQL/RLS/Unit/E2E 테스트.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`, `docs/SECURITY.md`, `docs/TEST_REPORT.md`.
- 레퍼런스 대비 실제 스크린샷(가능하면 PC/모바일), 테스트 실행 결과, 실제 배포 URL(배포했다면).

마지막 보고에는 다음을 명확히 구분하라.

```markdown
## 실제 구현 완료
- [FR 번호와 핵심 결과, 수정 파일]

## 실제 검증
- 명령 / 통과 여부 / 테스트 수
- 실배포 URL / 실로그인·실푸시 검증 여부

## 외부 계정 설정 대기
- [사용자에게 필요한 설정만 정확히]

## 남은 오류 또는 제약
- [숨기지 않고 작성. 없으면 없음]
```

개발 중에는 요구사항대로 **최대한 계속 진행**하고, 외부 권한이 필요한 경우에만 사용자의 작업을 요청한다. 제품 명세를 변경하거나 축소하지 말라.

## AI 개발 에이전트에게 보낼 프롬프트 — 끝

---

## 참고: AI 세션에 함께 전달할 파일

1. `WEEKFLOW_01_PRODUCT_SPEC.md` — 확정된 기능·화면·사용자 행동 상세.
2. `WEEKFLOW_02_IMPLEMENTATION_PLAN.md` — SQL 테이블, RLS, Edge·Push, API·배포, 전체 개발 WBS/QA.
3. **사용자가 제공한 UI 레퍼런스 5장** — 파일로 첨부. 원본 릴스/영상 주소만으로 영상 확인이 가능하다고 가정하지 말 것.

**계정 비밀키는 첨부하지 말고** 코딩 환경의 Secrets/환경변수 설정을 이용한다.

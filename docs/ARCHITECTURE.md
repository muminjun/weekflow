# 아키텍처와 일관성 계약

정적 React 앱은 GitHub Pages에서 실행됩니다. Supabase Auth의 PKCE Google 로그인이 쿼리 문자열로 Pages 루트에 돌아온 뒤 HashRouter로 플래너를 엽니다. 브라우저에는 공개 URL·publishable key·VAPID 공개키만 들어갑니다.

## 데이터

`tasks`는 논리 Todo, `week_tasks`는 주간 상태입니다. `time_blocks`는 독립 Event 또는 주간 Todo를 참조하는 작업 블록입니다. `week_task_day_marks`는 수동 기록만 저장하고 자동 기록은 블록 상태로 계산합니다. `goal_week_tasks`는 같은 주의 연결만 허용합니다.

이월은 같은 task에 새 주간 연결을 만들고 이전 연결을 carried로 남깁니다. 반복은 각 날짜에 별도 task를 생성합니다. recurrence_occurrences의 unique 키와 cancelled tombstone이 재생성을 방지합니다. 반복 편집은 단일 회차 예외 또는 이후 새 규칙으로 분기합니다.

모든 개인 테이블은 RLS를 사용합니다. 복합 FK는 `(id,user_id)`로 소유자를 검증합니다. 변경은 version을 올리며 RPC는 expected_version을 확인합니다. 원자적 batch / 이월 / 반복 생성 / 복원은 트랜잭션으로 실행됩니다. 모든 브라우저 쓰기는 owner 검증 RPC로만 허용합니다.

## 시간

사용자의 IANA 시간대를 기준으로 날짜를 결정하고 DB에는 UTC timestamptz를 저장합니다. start_at에서 계산한 local_date를 서버가 강제합니다. 시간 블록은 15분 배수만 허용하고 자정 이후는 날짜별로 나누어 표시합니다. 회고 시간도 주 경계에 맞춰 잘라 계산합니다.

집중 가능 = 날짜 예외 또는 요일 규칙 − 고정 Event. 아직 빈 시간 = 집중 가능 − 작업 블록. 모든 차감은 합집합 후 수행해 겹친 시간을 두 번 빼지 않습니다. 날짜 예외가 휴일보다 우선합니다. 공휴일 미확인 시 잠정값을 표시하고 휴일 제외 반복은 보류합니다.

## 동기화와 PWA

IndexedDB는 사용자 ID로 캐시를 구분하고 큐와 낙관적 상태를 같은 transaction으로 기록합니다. 변경 명령에는 UUID 멱등 키가 있습니다. 재접속·수동 재시도·30초 확인으로 순차 전송합니다. VERSION_CONFLICT는 서버/내 변경 비교 후 선택합니다. 로그아웃은 계정의 캐시·큐·Query 캐시를 정리합니다.

Service Worker는 앱 셸·정적 리소스·검증된 공휴일만 캐시합니다. Supabase 응답과 인증은 공용 CacheStorage에 저장하지 않습니다. 사용자별 데이터는 IndexedDB에서만 관리합니다. 새 SW는 미전송 변경을 저장한 후 사용자가 적용하도록 안내합니다.

## 백업과 알림

백업은 휴대 가능한 도메인 데이터와 알림 설정만 포함합니다. 복원은 현재 인증 사용자로 ID를 재매핑하고 자연 키를 병합합니다. 교체 모드는 이중 확인하며 SQL 오류 시 전체 rollback됩니다.

Cron은 Vault의 랜덤 secret header로 dispatch-push를 호출합니다. 서버는 예약 작업을 atomic claim하고 원본·설정·방해금지를 확인합니다. 내부 알림은 job별 한 번만 생성합니다. Push 기기별 결과를 저장하고 404/410 구독을 제거합니다. 네트워크 모호성 때문에 OS 알림의 exactly-once 도착은 보장하지 않습니다.

Cron은 앱이 닫혀 있어도 service_role 전용 materialize_for_user로 향후 7일 회차를 준비합니다. 서버도 Pages의 검증된 공식 공휴일 캐시를 사용하고 미확인 기간의 휴일 제외 패턴은 보류합니다. 한 사용자의 생성 실패는 다른 사용자의 알림을 막지 않도록 격리합니다.

## 2026-11-16 UI presentation layer

The planner now uses a finite `100dvh` workspace, not a document-height paper planner. `Timeline` measures the grid's actual available height with ResizeObserver and supplies one effective pixels/hour value to every position and pointer calculation. Fit mode starts at 09–18 and supports range navigation, outside-event jumps and a readable agenda. Full 00–24 and the saved profile range are explicit detail modes with calendar-local scrolling. No fit setting is written to the profile. Midnight slices keep the original event duration and drag anchor; outside navigation uses a slice in the visible week.

`src/ui` owns native controls, device-local appearance and user-facing error copy; `src/domain/view.ts` contains presentation geometry and category text contrast. The four palettes and rem type tokens live in CSS. Document-root theme attributes cover Radix portals without remounting the planner. `public/appearance.js` applies validated appearance before React paint and is included in the SW precache and cache version hash. Authentication, dataset, RPC/version checking, queue and IndexedDB behavior remain unchanged.

The follow-up UI pass adds Radix Select and Popover (React 19 compatible) to the existing Dialog basis. `src/ui/Input.tsx` routes date/time/color/number/file controls; all form values remain native DOM values. The confirmation host resolves asynchronous decisions instead of blocking window dialogs. First-week notification activation uses existing preference/profile mutations after push registration succeeds. Coachmarks store only device-local completion and replay without resetting the app or dataset. The default schedule viewport and saved profile range are unchanged.

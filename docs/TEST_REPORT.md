# 테스트 보고서

검사 환경: macOS arm64, Node 22.19, Chromium 159, PGlite PostgreSQL, 실제 Supabase Free 서울 프로젝트. 2026-11-15~16 작업 세션.

## 확인된 실검증

- 실 Supabase API 검사 19개 통과: 임시 A/B Auth 세션, 프로필 초기화, 원자적 생성, 멱등 재전송, A/B RLS 조회 격리, 타인 수정 차단, 버전 충돌, 익명 접근 차단, 도메인 백업의 타 계정 ID 재매핑, Cron secret 누락 거절, 구독 없는 Push 테스트 거절, 익명 계정 삭제 차단. 임시 사용자는 삭제했습니다.
- 프로덕션 빌드의 실DB 브라우저 검사: 온라인 저장, SW를 통한 오프라인 새로고침과 IndexedDB 보존, 재접속 후 1회 저장, 동시 변경 비교 후 서버 선택, 주간 연결을 포함한 생성 Undo.
- 실서버 19개 개인 테이블의 relrowsecurity=true 확인. 5분 Cron active=true, Edge 3개 배포.
- PC/모바일 axe의 serious/critical 위반 0건 확인 (수정 후). 이는 모든 수동 접근성 검증의 대체가 아닙니다.
- `docs/screenshots/`: 실제 Playwright PC/모바일/실인증 테스트 화면. 원본 참고 이미지와 레이아웃을 대조했습니다.

## 실패를 발견하고 수정한 항목

- 다른 계정 백업 import 시 기본 카테고리·가용 규칙의 자연 키 충돌 → 자연 키 매핑과 전체 rollback 검사 추가.
- 연한 보조 텍스트 대비와 반복 select label → 대비 강화, 접근 가능한 이름·폼 label 수정.
- 주말 사용자 규칙 무시 / 주 경계의 자정 넘는 통계 → 우선순위와 구간 자르기 테스트 추가.
- SW 정적 캐시와 Vary: Origin 차이로 오프라인 module fetch 실패 → 공개 정적 리소스에 한해 ignoreVary 매칭, 실 브라우저 오프라인 재실행 통과.
- 업데이트 설치가 브라우저 HTTP 캐시의 이전 HTML을 새 Cache Storage에 저장하는 오류 → 사전 캐시 요청에 cache: reload 적용. 이전 HTML이 한 시간 캐시된 상태에서 새 SW 활성화 후 오프라인 재실행하는 PC/모바일 E2E가 수정 전 2개 실패, 수정 후 2개 통과했습니다.
- 큐·캐시 저장 경쟁 → 같은 IndexedDB transaction, 명령 직렬화.
- 겹침 승인 후 블록이 서로 가림 → 겹침 레인 배치와 pointer E2E 회귀 검사.

## 미검증 / 정식 릴리스 gate

- 다른 실제 기기에서의 Google 로그인. 현재 Mac Chrome에서 실제 Google 로그인·클라우드 저장은 확인했습니다.
- 데스크톱 OS 배너 표시·클릭 이동과 호환 모바일에서 실제 Push 수신·클릭 이동. Mac Chrome Service Worker 수신·표시 등록은 확인했으나 사용자가 OS 배너를 보지 못했다고 응답했습니다. 브라우저 수신 목록과 실제 OS 배너를 구분합니다.
- 실 iOS/Safari·VoiceOver 수동 검수, 실제 기기 PWA 설치와 Push 거절/해제 경로.

이 gate가 남아 있으므로 프로젝트를 WEEKFLOW 1.0 완료로 표시하지 않습니다.

## 2026-11-16 검증 갱신

- Google OAuth 클라이언트 생성, 프로덕션 공개, Supabase 연결 완료. 배포 URL에서 실제 계정 선택·동의 후 Google 세션으로 플래너 진입을 확인했습니다. 임시 Todo를 UI로 생성하고 저장 표시, 새로고침 후 유지, 실제 DB의 Google 사용자 소유 행을 확인한 뒤 해당 검사용 행만 삭제했습니다.
- KASI 공식 API의 2025년 19일, 2026년 22일, 2027년 24일 수집 완료. 각 연도 12개월 전체 응답을 검증했습니다.
- 별도 코드 검토에서 발견한 큐 순서, 거절 복구, 반복 계보, 알림 선호 변경을 수정하고 회귀 테스트를 추가했습니다.
- 연속 입력 중 다음 문장 삭제, 캐시/큐 병렬 갱신 경쟁도 재현 테스트로 보완했습니다.
- 실제 임시 Auth 계정 브라우저에서 거절 변경 복구와 연속 편집 순서 보존을 확인했습니다. 기기 세션은 검사 후 삭제했습니다.
- 카테고리가 비어 있는 복원 후 프로필 초기화 시 기존 가용 규칙과 충돌하는 오류를 실패 테스트로 재현했습니다. 초기화를 사용자 프로필 잠금과 중복 무시로 수정하고 013 마이그레이션을 실제 DB에 적용했습니다.
- GitHub Pages 배포와 Quality gates 실행 성공. 실URL의 앱·manifest·Service Worker·공휴일 캐시·약관·개인정보처리방침 HTTP 200을 확인했습니다. 최초 배포의 환경 허용 브랜치를 master에서 main으로 수정하고 재실행했습니다.
- `live-desktop.png`, `live-mobile.png`는 실배포 URL의 명시적 메모리 체험 화면입니다. PC의 7열/사이드패널과 모바일 하루 표시/하단 내비게이션을 시각 검수했고 수평 넘침은 없습니다. 실제 모바일 하드웨어 검수로 간주하지 않습니다.
- Mac Chrome에서 사용자가 알림 권한을 허용한 후 실제 구독을 등록하고 테스트 Push를 발송했습니다. Service Worker의 `getNotifications()`에서 ‘WEEKFLOW 테스트 알림’과 본문이 표시됨을 확인했습니다. 구독 정보·토큰은 출력하지 않았습니다.
- 사용자가 배너가 보이지 않는다고 응답해 macOS 알림 설정을 열었습니다. 브라우저 수신 성공을 OS 배너·클릭 성공으로 보고하지 않습니다.
- 사용자가 제보한 일반 Edge 오류 문구를 조사했습니다. 실배포 재요청에서 HTTP 429 / RATE_LIMIT을 확인했습니다. Push 응답 본문을 안전하게 해석해 1분 간격 제한, 구독 누락, 인증 만료, 전송 실패를 한국어로 안내하도록 수정했습니다. 수정 전 4개 실패 → 수정 후 4개 통과하는 회귀 검사를 실행했습니다. 같은 HTTP 429인 기기 10개 등록 제한도 시간 제한과 구분하는 회귀 검사를 추가했습니다.
- Cron SQL 실행 성공 이외에 `net._http_response`를 확인해 기본 5초 제한의 시간 초과를 발견했습니다. `supabase/cron.sql`과 초기 구성 스크립트를 120초 제한으로 수정하고, 같은 Vault 인증 경로의 실호출 HTTP 200 / `processed: 0`을 확인했습니다.
- 이어서 실제 구독을 가진 Google 사용자의 임시 일정과 알림 설정으로 예약 알림 경로를 검증했습니다. 작업 상태 `sent`, 앱 내부 알림 1개, 장치 발송 기록 `sent`/201 1개를 확인하고, Chrome의 알림 목록에서도 ‘일정이 곧 시작돼요’ 수신을 확인했습니다. 임시 일정·작업·앱 내부 알림은 삭제했고 알림 설정은 버전 검사 후 원래 값으로 복원했습니다. 실제 시간 기반 Cron의 다음 주기 실행도 운영 응답에서 확인할 수 있습니다.
- 2026-11-16 08:45 KST의 실제 5분 Cron 주기에서도 `net._http_response` HTTP 200을 확인했습니다. 최신 커밋 5701b8f의 Quality gates와 Pages 배포 모두 성공했습니다.

## 최종 로컬 자동 검사

- npm ci, typecheck, lint: 통과.
- Vitest: 40개 통과 (PostgreSQL 통합 17개 포함).
- Playwright: 9개 통과, 1개 제외. 모바일 pointer drag 검사는 터치 대체 시간 선택 경로를 별도 검사하므로 제외했습니다. PWA의 이전 버전 캐시 → 업데이트 → 오프라인 재실행 검사 2개를 포함합니다.
- Deno Edge 타입 검사: 3개 함수 통과.
- production build: 통과. 초기 JS 청크 약 568kB(압축 약 168kB)로 Vite의 500kB 경고가 남습니다. 플래너는 별도 lazy 청크입니다.
- npm audit: 전체 의존성 취약점 0건.
- source secret scan: 비밀키 패턴 없음.

## 2026-11-16 viewport UI 개편 검증

이번 세션에서 직접 실행한 결과:

- typecheck / lint / production build / check:secrets 통과.
- Vitest 47개 통과: 기존 동기화·반복·백업 검사와 PostgreSQL 통합 17개 유지. 외관 저장 실패/잘못된 JSON, 정확한 15분 높이·범위 clipping·카테고리 대비·오류 안내 추가.
- Playwright 30개 통과, 2개 제외. 제외는 모바일 포인터 드래그/자정 포인터 이동이며 모바일의 실제 시간 선택 폼 경로는 별도로 검사했다. 기존 SW HTTP 캐시 업데이트 회귀 2개 유지.
- 1366×768, 1440×900, 1920×1080, 1024×768, 390×844, 360×800에서 루트 가로/세로 스크롤 없음과 주요 영역 bounding box 확인. 본문 16px·일정 14px 실측. 큰 글자 모드에서도 작업/저장 및 루트 overflow 검사.
- 네 테마 각각 PC/모바일 화면·외관 창 캡처. 각 메인 화면 axe serious/critical 0건. 편집창 기본 테마 axe, Escape/포커스 복귀, 테마 변경 중 폼·주 유지, 새로고침 후 외관 유지와 잘못된 저장값 복구 확인.
- 설정 폼의 checkbox·number 값, 목표 저장·마감 진입·회고 저장/확정, Todo 생성/연결 배치, 7칸 수행 기록, 겹침 승인·15분 이동/시작·종료 리사이즈·Undo 확인. 백업 비교로 테마 변경 후 카테고리·프로필 불변 확인.
- 짧은 일정 키보드 편집·실제 마우스 클릭, 범위 밖 이동, 자정 두 구간, 자정 일정 가로 이동 시 원래 시간/지속 유지, 이전 주에서 이어진 일정으로 이동, 전체/저장 범위 상세 스크롤 확인. 코드 리뷰에서 발견한 세 경계 문제와 추가로 발견한 투명 키보드 전용 버튼의 포인터 가로채기를 수정했다.
- 모바일의 축소된 390×500 viewport에서 입력/저장 버튼 접근을 검사했다. 이는 실제 OS 키보드/물리 기기 수동 검증이 아니다.
- `node scripts/verify-ui.mjs http://127.0.0.1:4174/weekflow/ production`: 실제 production build의 PC/모바일 SW 제어·appearance.js 사전 캐시·오프라인 새로고침 후 새 UI/다크 선택 유지 통과. 검사는 명시적 메모리 체험이며 실제 계정 데이터를 변경하지 않는다.
- `public/sw.js`의 cache: reload와 공개 리소스 ignoreVary 경로 유지. appearance.js를 캐시 버전 해시와 사전 캐시에 추가.
- 최종 초기 JS 약 572.68kB / gzip 169.75kB. 기존 500kB 경고는 남는다. 초기 외관 적용용 classic script는 의도적으로 public asset으로 제공되어 Vite의 비번들 경고가 있으며, SW 사전 캐시와 실제 offline 실행을 검증했다. 새 UI 의존성 없음.

스크린샷: `ui-<width>x<height>.png`, `<desktop|mobile>-<blue|lime|mint|dark>-workspace.png`, `*-appearance.png`, `*-large-type.png`, `production-*-offline.png`.

이번 UI 작업은 DB/Edge/자격 증명을 변경하지 않았고 실 API 검사 스크립트는 재실행하지 않았다. 해당 스크립트는 임시 Auth 계정과 인증 설정을 변경하므로 불필요한 서버 변경을 피했다. 이전 세션의 19개 실 API 성공은 과거 결과다. 실제 macOS Push 배너/클릭, 물리 모바일 PWA/Push, 다른 실제 기기 로그인, Safari/VoiceOver 수동 검수는 여전히 미검증이다.

### 실배포 확인

- UI 커밋 `cb57c27b4ccc9fca7913ac643884920fa7130d4a`의 [Quality gates](https://github.com/muminjun/weekflow/actions/runs/43854821206)와 [Deploy Pages](https://github.com/muminjun/weekflow/actions/runs/43854821048) 모두 성공.
- `node scripts/verify-ui.mjs https://muminjun.github.io/weekflow/ live-redesign`로 실제 URL의 PC 1366×768 / 모바일 에뮬레이션 390×844에서 본문16px·일정14px, 루트 가로/세로 스크롤 없음, SW 제어와 외관 파일 사전 캐시, 오프라인 새로고침 후 새 UI·다크 유지 확인. 캐시 `weekflow-shell-/weekflow/7e2e5d8663f6`.
- 사용자가 쓰던 탭과 별개인 새 Chrome 창에서 기존 Google 로그인 세션을 보존한 채 이전 UI의 ‘새 버전 열기’를 실제로 눌렀다. 업데이트 후 authenticated=true, 새 blue 테마, 09–18 범위, 본문16px, 같은 선택 주와 할 일/블록 수, 실제 ‘저장됨’ 상태와 가로/세로 스크롤 없음 확인. 사용자 데이터 작성·삭제, 인증 설정 변경 없음.
- 시작 핸들의 15분 리사이즈와 Undo도 기존 포인터 회귀 검사에 추가하고 전체 E2E를 다시 실행해 30개 성공/2개 모바일 포인터 제외를 확인했다.
- 실제 배포 캡처: `docs/screenshots/live-redesign-desktop.png`, `live-redesign-mobile.png`, `live-redesign-*-offline.png`. 이 캡처는 명시적 메모리 체험이며 물리 모바일 검수가 아니다.

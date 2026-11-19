# WEEKFLOW

종이형 주간 Todo·타임블로킹 플래너. 아이보리 격자, 월–일 시간표, 우측 GOALS / DEADLINE / TO-DO, 7칸 수행표와 하단 회고를 제공합니다. 참고 브랜드의 로고·이미지·서체를 배포하지 않습니다.

**현재 상태: 배포 완료, 정식 릴리스 검증 중.** [WEEKFLOW 열기](https://muminjun.github.io/weekflow/). 실제 Google 로그인, Todo의 Supabase 저장과 새로고침 후 유지, 공식 공휴일 API 연결, Mac Chrome Push 수신을 확인했습니다. 실제 모바일 기기 검수가 남아 있어 1.0 완료로 표시하지 않습니다. 명시적인 체험은 메모리에서만 실행됩니다.

## 실행

Node.js 22.19+ 또는 24 LTS를 사용합니다.

```bash
npm ci
cp .env.example .env.local
# .env.local에 공개 프로젝트 URL / publishable key / VAPID 공개키 설정
npm run dev
```

기본 배포 경로는 `/weekflow/`. 로컬에서는 `.env.local`의 `VITE_BASE_PATH`에 따릅니다. 별도 도메인 루트로 배포하면 `/`로 바꾸고 OAuth 허용 redirect도 함께 수정하세요.

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run build
npm run preview -- --port 4173
```

## 구현 구조

- React + TypeScript strict + Vite, CSS Variables, Radix Dialog / Popover / Select, HashRouter
- TanStack Query, Zod, date-fns/date-fns-tz, 사용자별 IndexedDB
- Supabase Google Auth / PostgreSQL / RLS / 원자적 RPC / Edge Functions / Cron
- 커스텀 Service Worker: 앱 셸 캐시, Web Push, 알림 클릭, 버전 업데이트
- 한국천문연구원 XML → 검증된 연간 JSON → GitHub Pages 공개 캐시
- Vitest / Testing Library / PGlite PostgreSQL / Playwright / axe

`src/domain`은 날짜·구간·수행표·통계·백업 검증, `src/data`는 인증·큐·동기화, `src/components`는 반응형 UI를 담당합니다. [아키텍처](docs/ARCHITECTURE.md)를 참고하세요.

## 사용

- Todo에 제목을 입력하고 Enter. `내일 3시 회의 1시간 #업무`, `금까지 보고서`, `다음주 화 10시-11시반 치과`처럼 적으면 날짜·시간·길이·마감·카테고리를 읽어 할 일과 블록을 한 번에 만듭니다. 입력 아래에 이해한 내용이 미리 보입니다.
- `N` 새 할 일, `⌘K`/`Ctrl+K` 명령 팔레트(명령·일정·할 일 검색, 초성 검색, 자연어로 바로 만들기), `/` 일정 목록, `⌘Z`/`Ctrl+Z` 실행 취소, `⇧⌘Z`/`Ctrl+Y` 다시 실행(최대 50단계), `Esc` 편집 취소. 한글 입력 상태에서도 동작합니다.
- Todo를 시간표로 끌면 새 작업 블록이 추가됩니다. 같은 Todo를 여러 번 나눠 배치할 수 있습니다.
- 빈 시간표를 클릭하거나 끌어서 고정 일정을 만듭니다. 블록 이동과 양끝 리사이즈는 15분 단위입니다. 키보드로는 블록에서 `Alt+↑/↓`(15분 이동), `Alt+←/→`(하루 이동), `Alt+Shift+↑/↓`(길이 조절)를 씁니다.
- 블록을 클릭하거나 키보드 Enter로 날짜·시간·상태를 수정합니다. 모바일은 이 입력 방식이 기본입니다.
- 겹침은 확인 후 저장하며 각 블록을 나란히 표시합니다. 가용 구간 밖에도 경고 후 배치할 수 있습니다.
- Todo 전체 완료와 블록 완료는 별개입니다. 미래 블록을 실제 수행으로 자동 완료하지 않습니다.
- 7칸을 누르면 수동 계획 → 수동 완료 → 수동 기록 제거로 바뀝니다. 자동 기록은 연결 블록에서 계산합니다.
- 날짜의 집중 가능 시간을 눌러 그 날짜만 수정합니다. 집중 가능 시간과 아직 빈 시간을 구분합니다.
- 다음 주에서 미완료 항목을 선택해 이월합니다. 이전 주 기록과 마감은 보존됩니다.
- 빈 시간 추천의 `이번 주 자동 배치`는 배치되지 않은 할 일을 마감·길이 순으로 집중 가능 시간에 초안 배치합니다. 확인 후 한 번에 적용하며 한 번의 실행 취소로 되돌립니다.
- 주간 회고는 카테고리별 계획/완료 시간, 요일별 완료율, 예상 소요 정확도, 반복 이월, 최근 주 추세와 데이터가 충분할 때만 짧은 제안을 보여줍니다. 회고 입력은 자동 저장됩니다.
- 2주 이상 이월된 할 일에는 `N주째` 표시가 붙습니다.
- 블록 편집의 집중 타이머로 실제 집중 시간을 기록합니다(화면 꺼짐 방지, 새로고침 후에도 이어짐). 회고에서 계획·완료 시간과 실측 집중 시간을 나눠 보여줍니다.
- 주 템플릿(`⌘K → 주 템플릿` 또는 설정 → 연동)으로 한 주의 일정·목표를 저장하고 다른 주에 미리 본 뒤 한 번에 적용합니다.
- 블록을 `Alt`를 누른 채 끌면 복사, 블록 편집의 `다음 날로 복제`로 같은 시간에 복제합니다. DEADLINE 항목은 시간표로 끌거나 `배치` 버튼으로 바로 배치합니다.
- 설정 → 연동에서 읽기 전용 캘린더 구독 링크(Google·Apple·Outlook)를 만들고, 바꾸거나 끊을 수 있습니다.
- 설정에서 반복 규칙, 카테고리, 알림, 백업과 계정을 관리합니다.
- 오프라인 변경은 기기에 임시 저장합니다. 저장 완료 표시와 대기 표시를 구분하고, 충돌은 사용자 선택을 받습니다.

## 연결된 리소스

- 저장소: https://github.com/muminjun/weekflow
- Supabase: https://supabase.com/dashboard/project/emhmmorcpamlenqxwmaw (Free / Seoul)
- Google Cloud: https://console.cloud.google.com/auth/overview?project=weekflow-planner-20261115 (결제 연결 없이 생성)

설정과 Secrets 위치는 [배포 가이드](docs/DEPLOYMENT.md), 무료 운영 한계는 [운영 문서](docs/OPERATIONS.md), 보안 모델은 [보안 문서](docs/SECURITY.md)에 있습니다. 검증 범위와 미검증 항목은 [테스트 보고서](docs/TEST_REPORT.md), 릴리스 체크리스트는 [구현 계획](docs/superpowers/plans/2026-11-15-weekflow.md)에 기록합니다.

개인 데이터의 영속 저장에는 Google 로그인이 필요합니다. 서비스 키, Google client secret, VAPID 개인키와 공휴일 API 키를 `VITE_*` 환경변수에 넣지 마세요.

## 화면과 외관

메인 화면은 화면 높이에 맞춰 주간 시간표와 할 일 패널을 보여줍니다. 기본 화면 맞춤은 09–18시이며, 화살표·범위 밖 일정·일정 목록으로 다른 시간에 접근합니다. `전체 24시간` / `내 설정 범위`는 상세 스크롤 보기입니다. 이 전환은 저장된 시간표 설정을 변경하지 않습니다.

팔레트 버튼에서 클린 블루·페이퍼 라임·소프트 민트·다크와 기본/큰 글자를 선택합니다. 외관은 기기 브라우저에만 저장됩니다. 목표·마감은 작업 패널의 탭, 회고는 주간 회고 버튼으로 엽니다. 모바일은 하루 보기와 하단 할 일 시트를 사용합니다. `N`은 새 할 일 편집을 엽니다.

공식 TDS는 앱인토스 사용 범위와 일반 브라우저 제약 때문에 설치하지 않았습니다. 공식 정보 구조를 참고해 기존 React/Radix 위에 자체 UI를 구현했습니다. [설계 및 검증](docs/superpowers/specs/2026-11-16-viewport-ui-design.md).

토스증권 화면을 참고한 후속 정리로 선택창·날짜/시간·색상·체크/스위치·확인창을 공통 UI로 통일했습니다. `일정 넓게`로 작업 패널을 접을 수 있고, 첫 진입 사용법은 `설정 → 사용법`에서 다시 볼 수 있습니다. 첫 설정은 ‘알림 켜고 시작’을 우선 제공하며 실제 권한/등록 성공 후 켜집니다. 기존 계정의 선택은 자동 변경하지 않습니다. [컨트롤 적용 범위](docs/CONTROL_REFINEMENT.md).

모바일 입력/작업 공간, 호버·드래그 시간 선택, 일정 검색/오늘 보기, 빈 시간 추천, 기기 달력 복사와 Push 진단은 [모바일·계획 도구 안내](docs/MOBILE_AND_PLANNING_TOOLS.md)를 참고하세요. 기기 달력 복사는 OS 최종 확인이 필요한 ICS/공유 방식이며 자동 동기화가 아닙니다.

# WEEKFLOW — 올인원 스펙 · 구현계획 · 바이브코딩 프롬프트

> 통합본 | 2026-11-15 | 제품 요구사항 + 기술 아키텍처/DB/보안/배포/테스트 + AI 구현 프롬프트
>
> **사용법:** 이 파일 하나를 코딩 AI에 업로드한 후 맨 아래의 `AI 바이브코딩 최종 구현 프롬프트`를 실행하도록 요청하세요. 원본 플래너 스크린샷 5장을 함께 첨부하면 시각적 구현 정확도가 올라갑니다. 실제 비밀키는 문서에 넣지 말고 개발환경의 Secrets로 전달하세요.

## 목차

1. [제품 요구사항(PRD)](#1부-제품-요구사항-prd)
2. [전체 구현계획·DB·배포·검증](#2부-전체-구현계획db배포검증)
3. [AI 바이브코딩 최종 프롬프트](#3부-ai-바이브코딩-최종-프롬프트)

---

# 1부. 제품 요구사항(PRD)

# WEEKFLOW — 제품 요구사항 명세서 (PRD / UX Specification)

> 상태: **기능·UX 결정 완료 / 구현 전 명세**  
> 버전: 1.0.0  
> 작성 기준일: 2026-11-15 (Asia/Seoul)  
> 대상: AI 바이브코딩 에이전트, 제품 오너, QA  
> 연관 문서: `WEEKFLOW_02_IMPLEMENTATION_PLAN.md`, `WEEKFLOW_03_AI_BUILD_PROMPT.md`

## 0. 문서 사용법과 결정 상태

- 이 문서는 대화에서 **확정한 요구사항**을 구현 가능한 규칙으로 정리한다. 추가 승인 없이 바로 개발할 수 있도록 애매한 부분에는 명시적인 **기본 구현 정책**을 지정했다.
- **출시 범위:** 아래 기능 모두를 **첫 정식 릴리스**에 포함한다. 개발 작업은 안전을 위해 순차적으로 진행하되 일부 기능을 '나중에'로 임의 제외하지 않는다.
- 서비스명 **WEEKFLOW는 임시 프로젝트명**이다. WORKIVE의 로고·상표·전용 이미지·고유 문구·상용 서체 파일은 복제하거나 배포하지 않는다. 사용자가 제공한 이미지의 **레이아웃·시각적 원칙·기록 방식**을 참고해 독립된 웹 UI를 개발한다.
- 기준 레퍼런스: 사용자가 제공한 WORKIVE 위클리 플래너 Instagram 스크린샷 5장. AI 코딩 세션에도 해당 이미지들을 첨부해야 시각적 일치도를 검증할 수 있다.
- 이 문서는 **코드가 이미 완성되었다는 의미가 아니다.** 배포에는 소유자의 GitHub·Google Cloud·Supabase·공공데이터포털 계정 설정이 필요하다.

### 0.1 제품 한 줄 설명

> 할 일(To-do)을 이번 주의 실제 가능한 시간에 끌어 배치하고, 요일별 수행·시간 블록 완료·목표·마감·회고를 한 장의 종이형 플래너에서 관리하는 개인용 한국어 웹서비스.

### 0.2 핵심 가치와 제품 원칙

1. **Capture → Plan → Do → Review → Carry**: 생각나는 할 일을 빠르게 적고, 가능한 시간을 찾아 배치하고, 실제 수행을 체크하고, 회고하고, 미완료 작업을 선별 이월한다.
2. **단일 데이터 원본:** 같은 일을 GOALS, DEADLINE, TO-DO, 시간표에 중복 저장하지 않는다. 연결 관계를 통해 다양한 위치에 표시한다.
3. **종이 다이어리 감성:** 아이보리 배경, 가는 격자, 잔잔한 파스텔 작업 블록, 형광 연두 강조. 카드형 SaaS 대시보드로 변질되지 않는다.
4. **사용자 의사 존중:** 충돌·완료·이월·삭제·데이터 복구에서 사용자의 선택 없이 위험한 자동 변경을 하지 않는다.
5. **개인정보 보호:** Google 로그인 필수, 데이터는 사용자별 분리, 비밀키는 브라우저/저장소에 노출하지 않는다.
6. **0원 시작:** GitHub Pages + Supabase 무료 플랜 + 공식 공휴일 API. 무료 플랜에서의 중지·지연·제한은 사실대로 안내한다.

### 0.3 확정 결정 요약

| 항목 | 최종 결정 |
|---|---|
| UI | 제공된 종이형 위클리 플래너 레퍼런스를 높은 충실도로 재현하되 브랜드 자산은 재사용하지 않음 |
| 핵심 구조 | 월~일 7일 타임테이블 + 우측 GOALS/DEADLINE/TO-DO + 하단 WEEKLY REVIEW |
| Todo ↔ 시간표 | 양방향 연결. Todo 하나를 여러 시간 블록으로 분할 배치 가능 |
| 고정 일정 | Todo와 구분되는 Event. 타임테이블에서 직접 생성 |
| 사용 가능 시간 | 요일별 기본 활동시간에서 자동 계산 + 특정 날짜 수동 수정 |
| 일정 겹침 | 사전 경고·충돌 시각화, 사용자가 승인하면 저장 허용 |
| 미완료 이월 | 다음 주 진입 시 이월 제안, 사용자가 항목별 선택 |
| 완료 | Todo 전체 완료와 시간 블록별 완료를 각각 지원 |
| GOALS | Todo와 선택적으로 연결, 연동된 Todo 기반 달성률 |
| DEADLINE | Todo의 마감일을 자동 집계, 쌍방 수정 동기화 |
| REVIEW | 완료 통계 자동 계산 + 잘한 점·아쉬운 점·개선점 직접 입력 |
| 빠른 입력 | 인라인 입력 + Enter 저장, 상세 설정 팝오버 |
| 일정 편집 | 클릭 팝오버, 드래그 이동·크기 조절, 실행 취소 |
| 드래그 | 15분 스냅, 반투명 미리보기, 유효성 확인, 충돌 승인 |
| 모바일 | 하루 집중형 + 날짜 탭 + Todo 바텀시트; 터치 대체 조작 제공 |
| 반복 | 고정 일정과 Todo 모두 매일·평일·선택 요일 반복 |
| 카테고리 | 사용자가 변경 가능한 카테고리 + 자동 파스텔 색상 |
| 인증 | Google 로그인 필수 (게스트 모드 없음) |
| 주간 설정 | 월요일 시작, 04:00~24:00 시간표, 15분, 평일 기본 09:00~18:00 |
| 공휴일 | 한국천문연구원 특일 API, 주말·대체공휴일 구분, 휴일명 표시 |
| 알림 | 앱 내부 알림 + 실제 브라우저 Web Push + 설정/권한 관리 |
| 백업 | 전체 JSON 내보내기·가져오기 + Todo CSV 내보내기 |
| 범위 | **위 기능 모두 첫 출시**. 순차 구현은 허용하되 범위 축소는 금지 |

## 1. 사용자, 맥락, 목표

- 1차 이용자: 개인이 업무·공부·운동·일상 계획을 하나의 주간 화면에서 정리한다.
- 핵심 사용 환경: 노트북/데스크톱 웹을 기본으로, 스마트폰에서 하루 일정을 확인·체크·수정한다.
- 핵심 작업: 일요일 밤/월요일 아침 주간 계획, 매일 시간 블록 실행, 주말 회고 및 다음 주 이월.
- 현재 제외: 조직 멤버 초대, 공유 캘린더, 공동 편집, 결제, AI 모델 호출, Google Calendar API 양방향 동기화, 시간 추적 타이머. 사용자 요청 없이 추가하지 않는다.
- 데이터는 기기 간 동기화하고, 표준 시간대는 `Asia/Seoul`이다. 시간대 설정 변경 기능은 제공한다.

## 2. 정보 구조 및 페이지

| 경로/화면 | 기능 |
|---|---|
| `/` 또는 `/#/planner` | 로그인 여부에 따라 로그인 화면 / 이번 주 플래너 |
| 로그인 화면 | Google 로그인 버튼, 서비스 소개 및 개인정보 안내 |
| 주간 플래너 | 기본 메인: 헤더, 요일별 가용 시간, 타임라인, 우측 패널, 주간 회고 |
| Todo 상세 팝오버 | 제목, 설명, 카테고리, 목표, 마감일, 예상 소요, 반복, 완료, 삭제 |
| Event 상세 팝오버 | 제목, 날짜, 시작/종료, 고정 여부, 카테고리, 반복, 알림, 삭제 |
| 리뷰 편집 영역 | 자동 통계, 3개 회고 질문, 확정/재계산 명령 |
| 설정 패널 | 기본 시간표, 반복, 범주, 알림, PWA 설치, 백업, 계정 삭제 |
| 모바일 Todo 바텀시트 | Todo·마감·목표 탭 및 시간표 배치 동작 |
| 계정/알림 상태 | 온라인/오프라인, 동기화 실패, 푸시 구독 상태 |

### 2.1 PC 화면 배치

```text
┌────────────────────── WEEKFLOW / 2026 NOV / 주차 / 이전·오늘·다음 ─────────────────────┐
│ 날짜 범위 · 월/주 이동 · 공휴일 정보 · 동기화 상태 · 설정                           │
├────────────────────────────────────────────────────┬─────────────────────────────┤
│      MON   TUE   WED   THU   FRI   SAT   SUN         │ GOALS                       │
│      날짜 / 가용 시간 / 공휴일명                     │ 이번 주 목표 + 진행률        │
│ 04  ────────────────────────────────────────────    ├─────────────────────────────┤
│ 05  ─────── 시간별 얇은 격자 / 15분 스냅 ────────    │ DEADLINE                    │
│ 06  ─── 파스텔 고정 일정 / 작업 블록 ───────────    │ Todo 원본의 마감 항목 조회   │
│  ... 점선 집중 가능 시간 / 시간표 드래그 ───────    ├─────────────────────────────┤
│ 23  ────────────────────────────────────────────    │ TO-DO                       │
│ 24  ────────────────────────────────────────────    │ [M T W T F S S] TASK        │
│                                                   │ [· X ─ ─ ─ ─ ─] 제목       │
│                                                   │ + 인라인 새 작업 입력        │
├────────────────────────────────────────────────────┴─────────────────────────────┤
│ WEEKLY REVIEW · 자동 수치 / 잘한 점 / 아쉬운 점 / 다음 주 개선점                  │
└───────────────────────────────────────────────────────────────────────────────────┘
```

- 7일 열은 항상 동일한 폭 비율. 우측 패널은 데스크톱 300~340px 선에서 가독성을 확보한다.
- 작은 노트북: 시간표에 내부 가로 스크롤을 허용하고 오른쪽 패널은 접을 수 있다. 스크롤해도 날짜 헤더·시간축은 가능한 범위에서 고정한다.
- 타임라인 높이는 시간에 비례한다. 1시간 블록의 시각적 높이를 일관되게 정의하고 과밀하면 확대/축소(예: 48/64/80px per hour) 설정을 지원한다.
- 빈 상태도 실제 레퍼런스처럼 빈 격자와 선 중심으로 표시. 샘플 작업은 사용자가 명시적으로 체험 버튼을 눌렀을 때만 메모리에서 보여주며 계정 DB에 자동 저장하지 않는다.
- 마감·목표·할 일을 별도 커다란 카드로 분리하지 말고 하나의 종이 면에 가는 구분선으로 나눈다.

### 2.2 모바일 화면 배치

- 767px 이하: 하루 집중형. 요일 7개 선택 스트립, 하루 04:00~24:00 세로 타임라인.
- 우측 패널 대신 하단 `TO-DO` 버튼/탭 → 바텀시트. GOALS·DEADLINE은 시트 내 섹션으로 접근.
- 날짜 좌우 스와이프 또는 요일 탭으로 이동, 현재 주/날짜 표시.
- 작업 탭 → `시간표에 배치` → 날짜/시작/종료 선택으로 드래그와 **동등한 기능** 제공.
- 바텀시트와 팝오버는 키보드로도 사용 가능하며 닫을 때 원래 포커스로 복원.
- 모바일에서 정확한 15분 위치 드래그는 강제하지 않는다. 터치 환경에 적합한 시간 선택기를 주 경로로 둔다.

## 3. 시각 디자인 시스템

### 3.1 디자인 토큰 (초기값, 레퍼런스 이미지 대비 미세 조정 허용)

```css
:root {
  --paper: #F7F6EF;
  --paper-raised: #FFFEFA;
  --ink: #272723;
  --ink-muted: #77776F;
  --grid: #E0DED5;
  --grid-strong: #BDBBB2;
  --lime: #D9EE83;
  --peach: #F1C9B9;
  --sage: #DBE8BD;
  --sky: #CBDDEA;
  --lavender: #E5D7EB;
  --sand: #EADFBD;
  --gray-block: #DFE0DC;
  --saturday: #557FA7;
  --sunday-holiday: #B9574D;
  --danger: #B54F44;
  --focus-ring: #596C32;
  --hairline: 1px;
  --radius-small: 3px;
}
```

- 문서 전체 종이 질감은 **색·여백·격자** 중심으로 재현. 과한 노이즈·스큐어모피즘·그림자 금지.
- 영문 라벨(예: `GOALS`, `DEADLINE`, `TO-DO`, `WEEKLY REVIEW`)은 작고 굵게, 일정명은 가독성을 우선한 한글 폰트.
- 라이선스 확인된 무료/시스템 서체만 사용. WORKIVE의 특정 폰트 파일을 무단 추출하지 않는다.
- 전체 레이아웃은 평면적이며 모서리 곡률은 0~4px 수준. 팝오버·바텀시트만 작게 반경 적용.
- 오늘 날짜는 라임 아웃라인/상단 인디케이터로 표시, 일요일과 공휴일은 붉은색, 토요일은 푸른색, 겹치는 공휴일은 공휴일 표시 우선.
- 일정 완료: 원색 유지 + 채도/불투명도 낮춤 + X/체크. 색상만으로 의미를 전달하지 않는다.
- 스크린리더·키보드 접근, 터치 목표 영역 최소 약 44×44px, 축소 레이블에도 충분한 대비를 지킨다.

## 4. 기능 요구사항 (동작 정의 + 식별자)

### FR-01 인증·개인화

- Google 로그인 필수. 익명·게스트 데이터 저장 모드는 제공하지 않는다.
- 로그인 직후 최초 사용자에게 설정 마법사: 시간대(기본 서울), 주 시작(월), 시간표 범위(04~24), 평일 활동시간(09~18), 알림 기본 비활성.
- 신규 계정에서 카테고리 6개(WORK/PERSONAL/STUDY/HEALTH/ROUTINE/OTHER)를 사용자 소유로 생성한다. 사용자 수정 가능.
- 로그아웃 시 사용자 데이터·오프라인 캐시 및 푸시 구독 정리 정책을 명시하고 다른 계정의 정보가 보이지 않도록 한다.

### FR-02 날짜·주간 탐색

- ISO 주 개념(월요일 00:00 시작), 이전/다음 주, 오늘 돌아가기, 연도/월/주 선택.
- 한 주가 월·연도를 걸쳐도 월~일 7칸을 정확히 표시한다.
- 주간 변경 시 해당 주 Todo·블록·Goal·리뷰·마감·공휴일을 불러온다. 미래 주도 탐색 가능.
- 상태 바는 마지막 저장, 오프라인 대기, 저장 실패를 구분한다.

### FR-03 Todo 빠른 입력·편집

- 우측 TO-DO에서 인라인 제목 입력 후 Enter로 즉시 생성(기본 현재 주, `open`). 빈칸·공백 제목은 저장 불가.
- 클릭 팝오버: 제목/메모/예상 소요(15분 단위)/카테고리/선택적 목표/마감일/반복/삭제/완료.
- `N` 키로 빠른 추가(단, 다른 입력 필드에 포커스가 없을 때만), `Esc`는 취소·팝오버 닫기.
- 하나의 Todo를 다른 날짜/시간에 여러 번 배치할 수 있으며 원본 Todo는 하나만 유지한다.
- Todo 삭제 시 연결 블록의 처리 방식을 보여주고 승인 후 관련 일정·관계 제거(서버 트랜잭션). 실수 직후 Undo 가능.

### FR-04 고정 일정(Event)과 Task 블록

- Event: 회의·약속·수업 등. Todo가 필요 없으며 시간표에서 빈 구간 클릭/드래그로 생성.
- Task block: Todo에 연결된 실제 계획 시간. `task → weekly_task → time_block`으로 연결.
- 블록 드래그: 위아래는 시작 시간 이동, 좌우는 요일 변경; 위·아래 핸들로 길이 조절.
- 드래그 중 반투명 미리보기 + 선택 날짜/시작/종료 표시. 시간 스냅은 **15분**, 종료는 시작보다 늦어야 한다.
- 동일 Todo를 시간표로 다시 끌면 **새 블록 추가**. 기존 블록 이동/복제는 서로 다른 명령.
- Event를 편집해도 Todo가 생기지 않는다. Task 블록을 삭제해도 원본 Todo는 남는다.
- 겹침: 충돌 목록/시간을 표시하고 `취소` / `겹쳐서 배치` 선택. 허용 후 겹침 스타일과 접근 가능한 설명 제공.
- 가용 시간 밖에 배치할 때도 별도 부드러운 경고를 표시하되 금지하지 않는다.
- 자정 넘는 일정은 한 레코드로 저장하되 화면에는 날짜별 구간으로 분할 렌더링한다.

### FR-05 가용 시간 자동 계산 + 수동 조정

- 사용자 주간 규칙: 평일 09:00~18:00, 주말·공휴일은 기본 0분. 요일별 다중 시간 구간 설정 가능(예: 09~12, 13~18).
- 특정 날짜 예외(`기본 적용` / `사용 가능 시간 직접 지정` / `하루 휴무`)를 제공한다. **특정 날짜 수동값이 공휴일 기본값보다 우선**한다.
- 분 단위 계산은 겹치는 구간을 **합집합**으로 처리하고 중복 차감을 금지한다.
- `기본 가용 구간` → 고정 Event와 수동 불가시간을 제외 = `집중 가능 시간`.
- 집중 가능 시간에서 계획된 Task 블록의 겹치지 않는 점유 구간을 제외 = `아직 비어 있는 시간`.
- 두 수치는 구분해서 표시. Todo 블록이 가용 구간 밖에 있다고 해서 마이너스 시간이 되지 않는다.
- 계획된 Task끼리 겹쳐도 서로 다른 분을 중복 차감하지 않는다. 경고는 유지한다.
- 해당 요일 헤더에 `8h 사용 가능` 같은 수치와 집중 가능 구간 점선 미리보기를 표시한다.

### FR-06 두 종류의 완료 상태

- 시간 블록별 `planned / done / skipped`를 저장하고 사용자가 직접 누를 때만 상태 변경. 종료 시간이 지났다는 이유로 자동 완료하지 않는다.
- Todo 전체도 별도 `open / done` 상태. 연결 블록 모두 완료 시 Todo 완료 **제안**만 한다.
- 사용자가 Todo를 먼저 완료하면 미래 미완료 블록에 대해 `남김/취소 처리`를 확인하고, **실제 수행한 것으로 허위 완료 처리하지 않는다**.
- 체크 해제는 가능한 범위에서 되돌릴 수 있고 변경 이력/Undo를 제공한다.
- 주간 요약의 `완료한 계획 시간`은 **완료 처리된 블록 길이의 합**이며 실측한 집중 시간이 아니라고 명시한다.

### FR-07 레퍼런스형 7칸 Todo 기록표 (확정)

- 오른쪽 TO-DO 각 행 왼쪽에 `M T W T F S S` 7칸, 우측에 카테고리 색점·작업명. 오늘 요일은 은은하게 강조.
- **● 점:** 그 요일에 할 계획을 명시했거나 연결된 시간 블록이 예약됨.
- **X:** 그 요일의 수행을 사용자가 명시했거나 연결된 해당 요일 블록을 모두 완료함.
- **일부 수행:** 한 요일의 여러 블록 중 일부만 완료되었다면 별도 `반쪽/점+표시`와 툴팁/접근성 텍스트로 부분 완료를 구분한다. 전체 완료라고 오인시키지 않는다.
- **완전 완료 이후 줄:** Todo를 `done`으로 확정한 날짜의 X를 기준으로 남은 칸에 가는 선을 이어 그린다. **표시 효과일 뿐 실제 날짜 상태를 뒤집지 않는다.**
- 날짜에 별도 수동 수행 체크를 할 수 있으며 해당 기록은 블록의 실제 완료와 구분하여 저장한다.
- 시간이 다른 날로 이동하면 자동 계획 표시도 그 날짜로 따라 이동한다. 수동 표시가 있으면 보존한다.
- Todo가 다음 주로 이월돼도 지난주의 7칸 기록은 `weekly_task` 단위로 보존된다.

### FR-08 GOALS

- 주간 목표 여러 개 작성. Todo 연결은 선택 사항이며 목표 없이 Todo 생성 가능.
- 같은 주의 `weekly_task`에 연결한다. 목표 완료율 = 해당 목표에 연결된 주간 Todo 중 완료 수 / 연결된 Todo 수.
- 연결이 0개인 목표는 `진행 데이터 없음`으로 표시하고 100%로 계산하지 않는다.
- 다음 주 목표는 기본 새로 생성. 필요하면 선택적으로 이전 주 목표 복사.
- 이월한 Todo는 과거 목표 완료율을 사후 변경하지 않으며, 다음 주 목표 연결은 사용자가 선택한다.

### FR-09 DEADLINE

- `tasks.due_on`을 원본으로 사용하고 우측 `DEADLINE`은 계산된 뷰. 동일 마감 건의 별도 복제 금지.
- 마감일 변경은 Todo 팝오버/DEADLINE 양쪽 모두 원본을 수정한다.
- 현재 주 기한과 지연 미완료 항목을 표시. D-1, D-Day, Overdue 배지. 기한이 공휴일이어도 자동으로 옮기지 않음.
- 일자 기준 알림은 사용자 시간대의 로컬 날짜를 기준으로 판단한다.

### FR-10 WEEKLY REVIEW

- 하단 회고: `이번 주 잘한 점`, `아쉬웠던 점`, `다음 주 개선할 점` 3개 작성 칸, 자동 저장.
- 자동 통계: 주간 Todo 완료 수/전체 수, 고정 일정 시간, 계획 Task 블록 시간, 완료 처리된 Task 블록 시간, 목표 달성도, 이월 건수.
- 블록 완료 시간과 실제 측정 집중 시간을 동일시하지 않는다.
- 종료 주의 회고를 확정하면 계산 시점의 통계를 스냅샷으로 저장. 이후 작업 이월·다음 주 완료로 과거 수치를 덮어쓰지 않는다.
- 회고 메모는 확정 후에도 수정 가능. 과거 블록을 의도적으로 수정했다면 `통계 다시 계산`을 수동 제공한다.

### FR-11 미완료 Todo 이월

- 다음 주 첫 방문 시 이전 주의 `open` Todo를 모아 **선택형 제안**으로 표시. 전체 선택/개별 선택/이번에는 닫기.
- 선택 시 **동일 논리 Todo를 다음 주 `weekly_task`에 연결**하고 이전 주 연결 기록은 `carried` 상태로 보존한다.
- 지난주 Time block은 이동·삭제하지 않고 기록 그대로 남긴다. 기한을 자동 변경하지 않는다.
- 이미 다음 주에 연결된 Todo는 이월 중복 생성 불가(유니크 제약 + 멱등 처리).
- 이월하지 않은 과거 Todo는 `open/남겨 둠` 상태로 과거 주에 남고 필요시 나중에 이월 가능.
- 반복 Todo의 각 회차는 별개 Todo다. 반복으로 생성되는 다음 주 회차와 이전 회차를 자동 합치지 않으며, 반복 Todo의 자동 이월은 **기본 제외**. 사용자가 의도적으로 수동 이월할 때는 경고한다.

### FR-12 반복 일정과 반복 Todo

- 패턴: 매일, 평일, 매주 지정 요일, 시작일·종료일/무기한, `공휴일 제외` 선택.
- Event 반복: 각 회차의 시작 시각·길이·카테고리는 원본 패턴에 따르고, 이번 회차 수정은 예외만 적용.
- Todo 반복: 각 회차를 **독립 Todo 및 주간 연결**로 생성, 완료·마감·요일 기록도 독립.
- 편집 범위 `이번 회차만` / `이 회차 이후 모두`. 이후 전체 수정 시 과거 완료/회고/이월 기록은 소급 변경하지 않는다.
- 미래 회차 생성은 **현재 조회 주 + 예약 알림이 필요한 가까운 기간**만 멱등 생성. 무기한 반복을 모든 미래 날짜로 영구 생성하지 않는다.
- 동일 회차 재생성 방지 `unique(series_id, occurrence_date)`.
- 공휴일 데이터가 없으면 `공휴일 제외` 로직의 정확성을 보장할 수 없으므로 해당 기간의 반복 생성은 보류하거나 데이터 미확인 경고와 사용자 승인을 요청한다. 임의로 근무일이라고 단정하지 않는다.

### FR-13 카테고리 및 색상

- 기본: WORK(살구), PERSONAL(연두), STUDY(하늘), HEALTH(라벤더), ROUTINE(모래), OTHER(회색).
- 사용자 카테고리 추가/이름 변경/색 변경/보관 가능. 삭제 시 이미 연결된 작업을 다른 카테고리로 이동하도록 확인.
- Task와 연결 시간 블록은 카테고리 색을 자동 공유. 고정 Event도 카테고리 선택 가능.
- 색상은 식별 보조수단이며 완료/충돌/마감은 아이콘·텍스트로도 표시.

### FR-14 한국 공휴일 API·주말

- 1차 공식 소스: [공공데이터포털 한국천문연구원 특일 정보 API](https://www.data.go.kr/data/15012690/openapi.do), 공휴일 조회 기능(`getRestDeInfo`). 응답은 공식 문서 기준 XML 파싱.
- `locdate`를 `YYYY-MM-DD`, `dateName`은 명칭, `isHoliday='Y'`는 공공기관 휴일로 처리. 한 날짜에 항목이 여러 개일 수 있으므로 명칭 배열로 보존.
- 토요일·일요일은 날짜 계산으로 구분. **일요일 공휴일 중복은 하루만 휴일**로 계산한다.
- 법정·대체공휴일·추후 공고된 임시공휴일은 데이터 갱신으로 반영. 미공포/미제공 휴일은 추정하지 않는다.
- 날짜 헤더: 평일 기본, 토요일 파랑, 일요일/공휴일 빨강, 공휴일명 표기, 오늘 라임 강조.
- 주말·공휴일은 기본 활동 시간 0으로 처리하지만 특정 날짜 사용자 예외가 우선. 일정은 강제 삭제/이동하지 않는다.
- 공공 API 키는 GitHub Actions Secret 또는 서버 비밀 설정에만 둔다. 프런트·GitHub Pages 결과물에 API 키 절대 포함 금지.
- 연·월 단위로 공휴일을 받아 정적 JSON으로 캐싱하고 정기 갱신(수동 실행 경로 포함). 지난 정상 데이터가 있으면 장애 시 사용하고 `마지막 갱신일` 표시. 미확인 연도는 공휴일을 없는 것으로 간주하지 않고 `정보 없음` 안내.

### FR-15 앱 내 알림 + 실제 브라우저 푸시

- 알림 종류: 일정 시작 전(기본 10분), 마감 D-1/D-Day, 미완료 Todo/이월 제안, 주간 회고 알림.
- 기본 알림은 **꺼짐**. 사용자 버튼 클릭 후 권한 설명 → `Notification.requestPermission()` → Push 구독. 권한 거부 시 앱 내 알림만 지원.
- 사용자별·기기별 구독, 구독 해제, 알림별 온·오프, 시간대, 방해금지 시간을 설정한다.
- 브라우저가 닫혀도 가능한 Web Push는 Service Worker와 서버측 예약 발송이 담당. 데이터 변경·삭제·완료 시 오래된 알림이 발송되지 않도록 발송 직전 상태 검증.
- 동일 예약은 멱등 키로 중복 발송 방지. 푸시 전송 실패는 로깅·재시도, 만료 구독(404/410)은 정리.
- iOS에서는 호환 버전의 **홈 화면에 추가한 PWA**가 푸시 지원 대상. 지원 불가·권한 거부·무료 서버 중지 시에는 푸시 도착을 보장하지 않으며 앱 내부 알림으로 대체.
- 알림 내용은 잠금 화면에 보일 수 있으므로 민감한 세부 메모 전체를 노출하지 않는다.

### FR-16 오프라인·동기화·실행 취소

- 인터넷 끊김: 기존 주간 캐시 열람, 새 변경은 IndexedDB의 보류 큐에 저장하고 `동기화 대기` 표시.
- 재접속: 순서대로 전송 + 멱등 키, 서버 응답 후 보류 상태 제거. 저장 완료 전에는 성공으로 표시하지 않는다.
- 두 기기 동시 변경: `version` 기반 낙관적 동시성 검사. 충돌 발생 시 `서버 변경 / 내 변경` 비교 후 재시도 선택; 조용한 덮어쓰기 금지.
- Undo: 일정 이동·크기 조절·삭제·완료 등 직전 조작에서 제공. 삭제 복구는 서버 상태가 허용하는 범위에서 동작하며 지워진 비밀값을 추정 복구하지 않는다.
- 인증 세션 만료·로그아웃 시 대기 큐 데이터의 소유자 혼동을 방지, 다른 계정의 큐를 전송하지 않는다.

### FR-17 데이터 내보내기·가져오기

- JSON: 카테고리, 설정, 목표, Todo, 주간 연결, 7칸 기록, 모든 시간 블록, 가용 시간, 반복 패턴/예외, 회고, 알림 **설정** 포함.
- 제외: Google 인증 토큰, Supabase 키, Web Push 개인키, 푸시 endpoint/구독 인증키, 앱 내부 서버 비밀.
- CSV: Todo 중심 내보내기(제목, 상태, 카테고리, 마감, 주간 연결, 완료일 등). UTF-8 BOM 옵션 제공.
- JSON 파일은 `schemaVersion`, `exportedAt`, `timezone`, `data` 필드를 포함. 스키마 검증·파일 크기 제한·미리보기·중복 탐지·병합/교체 선택·최종 확인 필수.
- 복원은 서버에서 트랜잭션/배치 검증을 하고 중간 실패 시 절반만 복원된 데이터가 보이지 않게 보장. 권한은 현재 로그인 사용자에게만 적용.
- `교체`는 사용자에게 파괴적 작업임을 명확히 알리고 이중 확인. `병합`은 내부 UUID/논리 식별자로 중복을 제거.
- 백업 파일을 앱이 임의 외부 서버로 전송하지 않는다.

### FR-18 설정·PWA

- 주 시작: 월요일(기본), 표시 시간: 04:00~24:00(기본), 확대/축소, 15분 스냅 고정, 기본 평일 09~18, 요일별 가용 구간, 날짜 예외.
- 시간대: `Asia/Seoul` 기본. 날짜 경계·반복·알림을 시간대 설정에 맞춰 계산.
- 알림 설정, 카테고리 관리, 백업/복원, 데이터/계정 삭제, PWA 설치 안내.
- GitHub Pages의 하위 경로에서 PWA `start_url`, `scope`, Service Worker 파일 경로가 일치해야 한다.

## 5. 상태 모델과 데이터 일관성 (필수 구현 규칙)

### 5.1 작업 엔터티 관계

```mermaid
erDiagram
    PROFILE ||--o{ TASK : owns
    PROFILE ||--o{ CATEGORY : owns
    TASK ||--o{ WEEK_TASK : scheduled_in
    WEEK_TASK ||--o{ TIME_BLOCK : has
    WEEK_TASK ||--o{ WEEK_TASK_DAY_MARK : tracked_by
    GOAL ||--o{ GOAL_WEEK_TASK : contains
    WEEK_TASK ||--o{ GOAL_WEEK_TASK : linked_to
    PROFILE ||--o{ GOAL : owns
    PROFILE ||--o{ WEEK_REVIEW : writes
    PROFILE ||--o{ RECURRENCE_RULE : owns
    RECURRENCE_RULE ||--o{ RECURRENCE_OCCURRENCE : generates
    PROFILE ||--o{ PUSH_SUBSCRIPTION : subscribes
    PROFILE ||--o{ NOTIFICATION_JOB : receives
```

- `TASK`: 논리적 작업, 제목·마감·카테고리 등 현재 원본.
- `WEEK_TASK`: **특정 주에서 이 작업의 수행 상태**. 이월 시 새 연결을 만들어 과거 기록 불변성을 확보한다.
- `TIME_BLOCK`: Event이거나 `WEEK_TASK`에 연결된 계획 실행 블록.
- `WEEK_TASK_DAY_MARK`: 종이형 7칸 기록의 **수동 표시** 원본. 자동 표시는 블록 상태로 계산.
- `GOAL_WEEK_TASK`: 목표와 그 주의 작업 연결. 지난주 회고 통계가 다음주 완료에 끌려 변하지 않음.
- `RECURRENCE_RULE / OCCURRENCE`: 반복 템플릿과 생성된 회차, 동일 회차 중복 방지.
- `WEEK_REVIEW.stats_snapshot`: 확정된 과거 주의 통계 스냅샷.

### 5.2 결정적인 우선순위

1. 공휴일·주말 기본값보다 **특정 날짜 가용시간 수동 설정** 우선.
2. 요일 칸 자동 표시보다 **직접 기록한 수동 표시** 우선(수동 X는 실제 블록 완료를 자동으로 가장하지 않음).
3. `Todo 전체 완료`는 수동 확정이고, 블록 전체 완료는 완료 제안만 발생.
4. 공휴일 미확인인 경우 휴일 회피 자동화를 확정된 사실처럼 실행하지 않음.
5. 기한은 작업 속성이며 이월/반복/휴일에 따라 임의 이동하지 않음.
6. 일반 Todo 이월은 `WEEK_TASK` 추가, 반복 Todo 생성은 **별도 회차 TASK 생성**.
7. 리뷰 확정 스냅샷은 이후 주 작업 상태를 계산에 반영하지 않음.

## 6. 첫 방문부터 다음 주까지의 사용자 여정

1. **로그인:** Google 인증 → 첫 사용자 기본값 저장 → 빈 종이형 이번 주 플래너 진입.
2. **입력:** `TO-DO`에 '기획서 작성' Enter → 예상 3h, 마감 금요일, WORK 지정 → DEADLINE 자동 표시.
3. **목표 연결:** '기획 완성' GOAL 추가 → 기존 Todo에 연결 → 0/1 진행 표시.
4. **시간 계획:** 평일 09~18 및 공휴일 표시 확인 → 화 10~11 (1h), 목 14~16 (2h) 두 블록 생성.
5. **충돌 처리:** 목 15~16 회의가 있다면 충돌 경고 → 사용자가 겹쳐 배치 승인 시 화면에 충돌 유지.
6. **일별 체크:** 화 블록 완료 → 화요일 7칸에 X/부분 표시 → 전체 Todo는 아직 미완료.
7. **주간 완료:** 목 작업 종료 → 남은 블록 완료 → Todo 전체 완료를 제안 → 승인 시 목표 달성률 갱신.
8. **회고:** 주말에 자동 통계 확인, 3개 질문에 답변 → 리뷰 확정 스냅샷.
9. **이월:** 다음 주 이동 시 미완료 Todo 목록 제안 → 선택한 것만 새 `WEEK_TASK`로 연결, 과거 기록 그대로.
10. **모바일/푸시:** 모바일 PWA에서 하루 일정 확인, 알림 동의한 장치에 일정 알림 수신 또는 불가능하면 앱 내부 알림.

## 7. 오류·빈 상태·경계 조건

| 사례 | 기대 UX |
|---|---|
| 첫 로그인 / 빈 주 | 격자는 즉시 보이고, 작업 추가에 초점을 맞춘 부드러운 안내 |
| 주/월/연도 경계 | 월~일 날짜와 ISO 주 계산 정확, 관련 연도 공휴일 모두 조회 |
| 복수 공휴일 같은 날짜 | 공휴일 이름 배열, 휴무 수치는 1일만 반영 |
| 공휴일 API 실패 | 마지막 성공 캐시 표시, 미확인 사실 안내, 앱 사용 계속 |
| 반복 회차만 수정 | 다른 회차와 완료 기록 불변 |
| 반복 전체 이후 수정 | 해당 회차 이후만 새 패턴 반영, 과거 회차 유지 |
| 겹친 블록 이동 | 저장 전 충돌 재계산/경고, 승인 시 저장 |
| 24시 초과 / 다음날 일정 | 날짜별 분할 렌더링, 원본 시각 보존 |
| Todo를 여러 블록으로 배치 | 한 Todo 유지, 완료는 블록별·전체별 독립 |
| 주간 이월 중 여러 번 클릭 | 1개 주간 연결만 생성(멱등) |
| 푸시 거절/미지원 | 앱 내부 알림 및 설정 안내로 대체 |
| 네트워크 단절 중 편집 | IndexedDB 큐에 보류, 미동기화 명확히 표시 |
| 다른 기기에서 먼저 변경 | 버전 충돌, 두 변경 비교, 사용자 선택 |
| 백업 재가져오기 | 원본/중복 매칭, 병합·교체 예상 결과 미리보기 |
| 사용자가 모든 데이터를 삭제 | 복구 불가능 경고, 재인증/확인, 관련 구독·큐 정리 |

## 8. 품질·비기능 요구사항

- **접근성:** 키보드만으로 Todo 추가, 일정 만들기/수정, 이동/시간 변경(대체 입력), 체크, 팝오버 열기/닫기. 스크린리더용 날짜·시간·상태 이름과 focus indicator 제공.
- **반응형:** 360px 모바일, 768px 태블릿, 1280px 이상 데스크톱에서 가로 누락·입력 불가 없음.
- **보안:** Supabase RLS 모든 사용자 데이터 테이블 필수. 비밀값(서비스 롤, Google secret, VAPID private, 공휴일 API key) 빌드 결과물/프런트 env에 포함 금지.
- **성능 목표:** 7일 화면의 일상적 데이터(작업 수십 개)에서 스크롤·드래그가 부드럽게 반응. 대량 렌더링과 리렌더링 최소화, 병목 측정 기반 개선.
- **안정성:** 모든 서버 변경은 성공/실패 피드백, 멱등·낙관 잠금·재시도/복구 경로. UI 성공 표시와 실제 DB 상태가 일치.
- **데이터 보존:** 무료 플랜 자동 DB 백업을 제공한다고 가정하지 않는다. 사용자 JSON 백업·복원 및 필요 시 운영자 수동 내보내기 안내.
- **비용:** 월 0원 시작 목표이며 **사용량·플랫폼 정책·비활성 중지에 따라 지속 제공 보장 불가**. 유료 플랜 자동 전환 금지.
- **브라우저:** 현재 주요 Chromium, Firefox, Safari 최신 버전 대상. 푸시는 플랫폼 지원 수준에 따른 차이를 명시.
- **테스트:** 단위·통합·E2E·수동 모바일/푸시·접근성·RLS 격리 시나리오 통과.

## 9. 정식 출시 수락 기준 (제품 관점)

- [ ] 레퍼런스처럼 7일 시간표 + 우측 3개 섹션 + 하단 회고가 **실제 데이터**로 보인다.
- [ ] Google 로그인 후 사용자 간 데이터가 분리되고 새로고침/기기 변경에도 유지된다.
- [ ] Todo 생성 → 시간표 여러 블록 배치 → 드래그 이동/리사이즈 → 일별/전체 완료가 끝까지 동작한다.
- [ ] 15분 스냅·반투명 미리보기·충돌 경고 후 승인/취소가 모두 동작한다.
- [ ] 평일/주말/공휴일·예외 가용시간 계산이 정확하며 공식 공휴일 캐시 상태를 알 수 있다.
- [ ] 목표 진행률, DEADLINE 쌍방 수정, 7칸 점·X·완료후 줄 표시가 실제 상태와 일치한다.
- [ ] 반복 Todo·Event의 회차별 수정/완료, 선택적 이월, 과거 리뷰 스냅샷이 보존된다.
- [ ] 모바일 하루 집중형·바텀시트·터치 대체 입력으로 모든 핵심 조작이 가능하다.
- [ ] 브라우저 푸시를 실제 지원 환경에서 **장치 수신으로 검증**, 미지원 환경에 안내·대체 UX가 있다.
- [ ] JSON 내보내기 → 변경 → 가져오기 → 원상 복구가 검증되고 CSV 다운로드가 유효하다.
- [ ] 저장 실패·오프라인·기기 간 동시 수정·중복 요청·서비스 중지에 대응한다.
- [ ] `npm run typecheck`, `lint`, `test`, `build`, E2E, RLS 테스트가 통과하고 실제 GitHub Pages URL에서 동작한다.
- [ ] 가짜 데이터·작동하지 않는 버튼·공개된 비밀키·사용자 데이터 혼합이 없다.

## 10. 미구현과 구현 완료의 차이

다음은 **완료로 인정하지 않는다**: 정적 화면만 그린 경우, `localStorage`만으로 저장한 경우, 푸시 권한 팝업만 구현한 경우, 모바일 편집을 제외한 경우, 공휴일을 하드코딩한 경우, RLS가 없는 경우, Supabase 연결 실패를 모의 데이터로 숨긴 경우, 테스트를 실행하지 않고 '통과'라고 기재한 경우.

## 11. 검증 가능한 외부 기술 근거 (작성 기준일: 2026-11-15)

- GitHub Pages/Vite 프로젝트 경로: <https://vite.dev/guide/static-deploy>
- GitHub Pages 무료 공개 저장소 조건: <https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site>
- Supabase 무료 플랜·비활성 일시 정지: <https://supabase.com/pricing> / <https://supabase.com/docs/guides/platform/free-project-pausing>
- Supabase Google 로그인 및 허용 리디렉션: <https://supabase.com/docs/guides/auth/social-sign-in/auth-google> / <https://supabase.com/docs/guides/auth/redirect-urls>
- Supabase RLS: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Cron·Edge Function: <https://supabase.com/docs/guides/functions/schedule-functions>
- 한국천문연구원 특일 정보: <https://www.data.go.kr/data/15012690/openapi.do>
- iOS/iPadOS Web Push 제약: <https://webkit.org/blog/13878/> / <https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers>
- GitHub Actions 예약 워크플로 비활성/지연 가능성: <https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows>

---

**다음 문서:** `WEEKFLOW_02_IMPLEMENTATION_PLAN.md` — 아키텍처, 실제 DB 테이블, 보안 정책, API/RPC, 푸시·공휴일 잡, 배포·테스트·개발 순서.


---

# 2부. 전체 구현계획·DB·배포·검증

# WEEKFLOW — 전체 구현계획서 / 기술 설계 / DB / 배포 / 검증

> 버전: 1.0.0 · 2026-11-15 · **모든 확정 기능을 첫 릴리스에 구현**  
> 상위 요구사항: `WEEKFLOW_01_PRODUCT_SPEC.md`  
> AI 실행 프롬프트: `WEEKFLOW_03_AI_BUILD_PROMPT.md`

## 0. 구현 전략

**목표:** 월 0원으로 시작하는, 실제 여러 기기에서 동기화되는 종이형 주간 Todo·일정 서비스. 별도 상시 실행 VPS를 두지 않는다. '모든 기능 한 번에 구현'은 **최초 정식 배포 범위**를 뜻하며, 코드 작업·검증은 아래 단계별 순서로 수행한다. 코딩 중 미완성 기능을 정식 완료로 선언하면 안 된다.

### 0.1 채택 스택

| 계층 | 선정 | 이유 및 제약 |
|---|---|---|
| 프런트 | React + TypeScript + Vite | GitHub Pages 정적 빌드, 빠른 개발 |
| UI 스타일 | CSS Variables + CSS Modules 또는 Tailwind | 레퍼런스의 미세한 격자/종이형 디자인을 정확히 제어 |
| 접근성·팝오버 | Radix UI 등 접근성 기본기 있는 headless 컴포넌트 | 키보드·포커스 관리 |
| 드래그 | dnd-kit + 시간축 전용 pointer/keyboard 센서(또는 적절한 검증된 대안) | Todo→시간표, 이동, 리사이즈와 키보드 대체 동작 |
| 날짜 | date-fns + date-fns-tz 또는 검증된 Temporal 계열 | ISO 주, 시간대, 로컬 날짜 ↔ UTC 변환 |
| 데이터 캐시 | TanStack Query | 서버 상태/낙관 업데이트/재시도 |
| 오프라인 | IndexedDB(idb/Dexie 등) | 사용자별 캐시 및 보류 변경 큐 |
| 프런트 검증 | Zod | 폼, API, JSON 가져오기 스키마 |
| 라우팅 | React Router `HashRouter` | GitHub Pages 하위 경로 새로고침 404 회피 |
| 배포 | GitHub Pages + GitHub Actions | 무료 공개 저장소 기준 정적 호스팅 |
| 인증/DB/API | Supabase Auth (Google) + PostgreSQL + RLS + REST/RPC | 별도 VPS 없음, 사용자별 데이터 분리 |
| 서버 작업 | Supabase Edge Functions + Cron(`pg_cron`/`pg_net`) | 알림 작업, 복원, 반복 회차 생성 |
| PWA/Web Push | Service Worker(`vite-plugin-pwa` injectManifest 권장) + 표준 VAPID Web Push | 브라우저 푸시·홈 화면 설치 |
| 한국 공휴일 | 한국천문연구원 특일 API + GitHub Actions 빌드 캐시 JSON | 서비스 키 비공개, 조회 트래픽 절감 |
| 테스트 | Vitest + Testing Library + Playwright + Supabase CLI/SQL 테스트 | 산출물 검증 |

> 선택한 라이브러리의 최신 배포 버전·유지보수 상태는 구현 당시 확인하고 lockfile로 고정한다. 특정 라이브러리가 프로젝트 하위 경로의 Push Service Worker와 충돌하면 **Push 동작을 실제 검증한 대안**으로 교체하되 기능을 삭제하지 않는다.

### 0.2 배포 구조

```text
[PC / 모바일 브라우저]
  │
  ├── HTTPS ── [GitHub Pages: React/Vite 정적 자산 + SW + holiday JSON]
  │                ▲
  │                └── GitHub Actions: build, test, public-holiday sync, Pages 배포
  │
  ├── OAuth ──── [Google Identity / Supabase Auth]
  │
  └── HTTPS ─── [Supabase API / PostgreSQL + RLS]
                     ├── 데이터 CRUD / 원자적 RPC
                     ├── Edge Function: 알림 구독/알림 작업 실행
                     ├── Edge Function: 반복 회차 materialization, JSON 복원
                     └── Supabase Cron → Edge Function (5분 주기 예시)
                                           └── Web Push 서비스 → 기기 Service Worker
```

- **GitHub Pages는 API 서버가 아니다.** 브라우저가 DB에 접근할 때 사용자 JWT와 RLS를 사용하고, 민감 작업은 Edge Function/DB RPC로 처리한다.
- 소규모 개인 사용을 가정한다. 사용자가 많아지면 무료 DB, egress, Edge Function, 예약 작업 제한이 먼저 문제될 수 있다.
- Supabase 무료 프로젝트는 낮은 활동으로 일시 중지될 수 있으므로 알림·동기화 고가용성을 보장하지 않는다. 무료 플랜 유지·모니터링 절차를 운영 문서에 포함한다.
- GitHub Free에서 Pages를 사용하려면 일반적으로 저장소가 **공개**여야 한다. 비밀키 포함 금지.

## 1. 디렉터리 구조 (예시, 파일 책임 일치 필수)

```text
weekflow/
├── README.md
├── docs/
│   ├── PRD.md                       # 제품 명세 복사
│   ├── IMPLEMENTATION_PLAN.md       # 구현계획 복사
│   ├── ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── OPERATIONS.md
│   ├── SECURITY.md
│   └── TEST_REPORT.md
├── .github/workflows/
│   ├── ci.yml                       # PR 타입·린트·단위·E2E·빌드
│   ├── deploy-pages.yml             # main → 빌드 → Pages
│   └── sync-holidays.yml            # 예약/수동 공식 공휴일 동기화 + 재배포
├── scripts/
│   ├── fetch-holidays.ts            # 공식 XML fetch/parse/validate/cache
│   └── validate-env.ts
├── public/
│   ├── holidays/2026.json           # 성공적으로 검증된 공식 캐시만
│   ├── icons/                       # 직접 만든 앱 아이콘
│   └── offline.html                 # 필요 시 오프라인 안내
├── src/
│   ├── app/                         # bootstrap, auth, router, providers
│   ├── components/planner/          # paper layout, week grid, timeline
│   ├── components/tasks/            # inline input, 7-cell tracker, popover
│   ├── components/goals/            # goal editor/summary
│   ├── components/deadlines/        # due-date derived list
│   ├── components/review/           # review stats + prompts
│   ├── components/settings/         # availability/notifications/backup
│   ├── components/mobile/           # one-day view, todo bottom sheet
│   ├── features/auth/
│   ├── features/tasks/
│   ├── features/calendar/
│   ├── features/availability/
│   ├── features/recurrence/
│   ├── features/rollover/
│   ├── features/holidays/
│   ├── features/notifications/
│   ├── features/backup/
│   ├── features/sync/
│   ├── lib/supabase.ts
│   ├── lib/time.ts
│   ├── lib/query.ts
│   ├── types/database.types.ts
│   ├── styles/tokens.css
│   └── sw.ts                         # push/notificationclick, precache
├── supabase/
│   ├── config.toml
│   ├── migrations/                   # 테이블/RLS/트리거/RPC/Cron SQL
│   ├── functions/
│   │   ├── dispatch-push/index.ts
│   │   ├── backup-import/index.ts
│   │   ├── materialize-recurrences/index.ts
│   │   └── manage-subscription/index.ts
│   ├── seed.sql                      # 비개인 가짜 테스트 seed만
│   └── tests/                        # RLS, functions, idempotence 테스트
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
├── .gitignore
├── vite.config.ts
├── package.json
└── package-lock.json
```

## 2. 핵심 데이터 도메인과 일관성 계약

### 2.1 엔터티 역할

| 테이블 | 핵심 역할 | 주요 불변 조건 |
|---|---|---|
| `profiles` | 사용자 시간대·표시 설정 | PK = 인증 사용자 ID |
| `categories` | 개인별 카테고리·색 | 같은 이름 중복 방지, 아카이브 가능 |
| `tasks` | 논리 Todo 원본 | title, due_on, estimate, current state |
| `week_tasks` | 특정 주의 Todo 수행 이력 | (user, task, week_start) 유일 |
| `week_task_day_marks` | 수동 7칸 표시 | (week_task, local_date) 유일 |
| `goals` | 주 단위 목표 | 주 시작은 월요일 |
| `goal_week_tasks` | 목표 ↔ 해당 주 Todo 연결 | 두 엔터티의 week_start 일치 |
| `time_blocks` | 고정 Event 또는 Todo 계획 블록 | Task는 week_task 필수; Event는 title 필수 |
| `availability_rules` | 요일별 기본 가용 시간 | 분 단위, 동일 요일 겹침 규칙 UI 검증 |
| `availability_overrides` | 특정 날짜 가용 시간 예외 | 요일·공휴일 기본보다 우선 |
| `recurrence_rules` | 반복 템플릿 | 종료일/선택 요일/공휴일 제외 |
| `recurrence_occurrences` | 반복 회차/예외/취소 | (user, series, date) 유일 |
| `week_reviews` | 주간 회고 및 확정 통계 | (user, week_start) 유일 |
| `notification_preferences` | 알림 종류·시간·방해금지 | 사용자당 1개 |
| `push_subscriptions` | 기기별 Web Push 구독 | 사용자별 endpoint 관리, 서버 비밀 포함 금지 |
| `notification_jobs` | 발송 예정 작업/멱등·재시도 | (user, idempotency_key) 유일 |
| `in_app_notifications` | 앱 내 알림 목록 | 사용자별 조회 |
| `client_mutations` | 오프라인 재시도 중복 방지 | (user, mutation_id) 유일 |

### 2.2 수정 원칙

- 한 Todo를 여러 날짜에 배치해도 `tasks` 행은 하나. 각 주의 처리 상태는 `week_tasks`로 분리.
- 이월은 기존 `tasks.id`를 유지하면서 다음 주 `week_tasks`를 추가한다. 과거 time_blocks와 당시 goal link는 유지한다.
- 반복 Todo는 `recurrence_occurrences`를 통해 회차마다 **새 tasks.id**를 만든다. 이월과 반복을 혼동하지 않는다.
- 반복 Event는 회차마다 `time_blocks` Event 행 생성, 취소 회차는 `recurrence_occurrences.status='cancelled'`로 남긴다.
- 시간은 `start_at/end_at timestamptz`로 UTC 순간을 보존, 주차·day tracker·공휴일·마감은 사용자 시간대의 **local date**를 사용한다.
- `display_end_minute=1440`은 UI에서 24:00까지 의미하며 DB `time`에 `24:00` 문자열을 억지로 저장하지 않는다.
- Todo status와 week_tasks 상태는 별개. 과거 주 `carried`가 미래 Todo의 `done`으로 뒤바뀌지 않는다.
- `updated_at`, `version`을 보존한 낙관적 동시성 제어를 적용한다.

## 3. PostgreSQL 기본 스키마 (마이그레이션 설계 초안)

아래 SQL은 **바로 옮겨 작성할 수 있는 기초 DDL**이다. AI 에이전트는 이를 `supabase/migrations/`의 실행 가능한 SQL로 변환하면서 **모든 FK, 트리거, RLS, RPC를 로컬 Supabase에서 실제 적용·검증**해야 한다. 이 문서의 SQL만 복사하고 테스트 없이 배포하지 않는다.

```sql
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
```

### 3.1 마이그레이션에 **반드시** 추가할 제약·트리거

위 DDL은 구조의 출발점이고, 다음이 없으면 **구현 완료 아님**.

1. `profiles` 최초 회원 생성 처리: `auth.users` insert 후 `public.profiles` 생성(트리거는 `SECURITY DEFINER`/`search_path`/권한 주의) 또는 로그인 후 멱등 `ensure_profile()` RPC.
2. `categories`, `tasks`, `week_tasks`, `goals`, `time_blocks`, `availability_*`, `recurrence_*`, `week_reviews`, `notification_preferences` 등 수정 가능한 테이블에 `updated_at`과 `version` 자동 갱신 트리거.
3. `week_task_day_marks.local_date`가 해당 `week_tasks.week_start`부터 +6일 사이임을 검사하는 서버 검증/트리거.
4. `goal_week_tasks`의 `goals.week_start == week_tasks.week_start` 트리거. 주간 연결 불일치 금지.
5. `time_blocks`가 `kind='task'`일 경우 연결된 `week_tasks`의 week_start에 들어가는 local_date인지 검사(자정 넘는 경우 첫 날 기준). `local_date`는 `start_at`을 사용자 timezone으로 환산한 값과 일치하도록 서버에서 계산한다. 클라이언트 마음대로 다른 날짜를 쓸 수 없게 검증.
6. `availability_overrides.windows`의 항목 JSON 스키마 `{startMinute,endMinute}` 및 0~1440/중복/순서 검사 (DB 함수 또는 서버 검증 + DB CHECK).
7. `recurrence_rules.template`는 Event/Task별 필수 필드·시간대·분 단위·종료 범위를 서버에서 검증. 무한 생성/과도한 기간 조회 차단.
8. `recurrence_occurrences`의 **연결된 rule.kind**와 `task_id/time_block_id` 일치, 취소된 회차가 재생성되지 않는다는 검증. 단일 회차 삭제 시 서버에서 `state='cancelled'`를 먼저 표시하고 연결 ID를 비운 뒤 블록/작업을 제거. 참조 행이 삭제되어도 occurrence 행 자체는 보존한다.
9. 사용자 `user_id`는 세션에서 유도한다. 사용자에게 타인 `user_id`를 입력하게 하지 않는다.
10. 원자성 필요한 작업(이월/반복 회차 생성/일괄 완료/JSON 복원/알림 발송 claim)은 **서버 DB 트랜잭션·제약·RPC**로 보호한다.
11. Todo 전체 완료 시 `tasks.state` 및 해당 `week_tasks.state`를 한 트랜잭션에서 함께 갱신하고, 과거 `carried` 주간 상태는 유지한다.

### 3.2 트리거 예시

```sql
create or replace function public.set_updated_at_and_version()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end; $$;

create trigger tasks_touch before update on public.tasks
for each row execute function public.set_updated_at_and_version();

-- 위 예시를 모든 version이 있는 수정 가능 테이블에 반복 적용.
-- 단, optimistic concurrency 검사에서 클라이언트가 version을 바꿔치기하지 못하도록
-- 업데이트 시 기존 버전 조건을 WHERE에 사용하고, 신규 버전은 서버 트리거만 생성.
```

## 4. RLS / 권한 모델

### 4.1 원칙

- **모든 사용자 데이터 테이블에 RLS ENABLE.** `anon`은 로그인 필수 테이블 접근 불가.
- 프런트에는 Supabase URL과 **publishable/anon key만** 넣는다. 이것은 공개 가능한 키이며 **RLS가 보안 경계**다.
- `service_role`/secret key/VAPID private key/공공 API 키/Google OAuth client secret은 절대 `VITE_*`, JS 번들, 공개 GitHub 저장소, PWA 캐시, 로그에 넣지 않는다.
- 복합 외래키 `(id,user_id)`를 사용해 동일 사용자 엔터티끼리만 연결한다. RLS만 믿고 타인의 UUID를 참조하게 두지 않는다.
- `notification_jobs`, `client_mutations`는 사용자에게 **직접 INSERT/UPDATE/DELETE를 허용하지 않음**. 인증된 RPC/Edge Functions에서만 조작.
- `push_subscriptions`에는 브라우저 구독 암호화 키 등이 포함되므로 본인만 접근. 알림 예약은 서버 전용.

### 4.2 RLS 예시 및 생성 대상

```sql
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter table public.tasks enable row level security;
create policy tasks_select on public.tasks
  for select to authenticated using (user_id = (select auth.uid()));
create policy tasks_insert on public.tasks
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy tasks_update on public.tasks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy tasks_delete on public.tasks
  for delete to authenticated using (user_id = (select auth.uid()));

-- 동일한 4종 정책을 categories, week_tasks, day_marks, goals,
-- goal_week_tasks, time_blocks, availability_*, recurrence_*,
-- week_reviews, notification_preferences, push_subscriptions 등에 적용.
-- notification_jobs/client_mutations: 서비스 전용 함수로만 작성; 필요한 경우 본인 SELECT만 허용.
```

추가로 **테이블별 GRANT/REVOKE**와 함수의 `SECURITY DEFINER` 권한을 명시하여 정책 우회를 방지한다. `SECURITY DEFINER` RPC는 `set search_path = ''` 또는 안전한 고정 스키마를 사용하고, 내부에서 `auth.uid()` 및 데이터 소유자 검증을 반드시 수행한다.

### 4.3 반드시 통과할 사용자 격리 테스트

- 사용자 A와 B로 로그인 후 A의 `tasks`/`time_blocks`/`week_reviews`를 B가 SELECT할 때 0행.
- B가 A의 `task_id` 또는 `goal_id`를 넣어 연결하려 할 때 FK/RLS 실패.
- B가 A의 `time_block` 변경·삭제·이월 RPC를 호출하면 권한 오류.
- 익명 요청은 개인정보 테이블 조회/쓰기 실패.
- 브라우저에서 공개된 키만으로 서버 전용 알림 큐 변경 불가.
- 에지 함수의 토큰 없이 `dispatch-push`, `backup-import`를 실행할 수 없음.

## 5. API, RPC, 읽기 전략

### 5.1 데이터 읽기

| 사용자 동작 | 조회 조건 | 추가 조건 |
|---|---|---|
| 주간 열기 | `week_tasks.week_start = selectedMonday` + 관련 tasks/categories/goals/review | 반복 회차 생성 완료 후 재조회 |
| 시간표 열기 | `time_blocks.start_at < nextWeekEnd AND end_at > weekStart` | 자정 넘는 블록이 주 경계를 걸쳐도 포함 |
| DEADLINE | 선택 주 `tasks.due_on`과 열린 연체 항목 | Todo 원본에서 도출, 중복 저장 없음 |
| 7칸 기록 | `week_task_day_marks` + 그 주의 time_blocks 상태 | 자동 계획/완료 상태를 셀렉터로 계산 |
| 공휴일 | `holidays/YYYY.json` 복수 연도 | 응답 freshness/조회 실패 상태 구분 |
| 회고 통계 | 미확정 시 동적 계산, 확정 시 snapshot | 명시적 재계산만 과거 스냅샷 교체 |

TanStack Query의 캐시 키는 반드시 로그인 사용자 ID와 선택 주를 포함한다. 로그아웃 시 모든 사용자 캐시를 비워 다음 계정에 이전 데이터가 보이지 않게 한다.

### 5.2 서버 함수 계약 (권장 명명; 타입 검증 필수)

```ts
type MutationContext = { mutationId: string; expectedVersion?: number };

createTask(input: TaskCreate, context: MutationContext): Promise<Task>;
createTimeBlock(input: TimeBlockCreate & { acknowledgeConflict: boolean }, context: MutationContext): Promise<TimeBlock>;
updateTimeBlock(input: TimeBlockPatch & { acknowledgeConflict: boolean }, context: MutationContext): Promise<TimeBlock>;
completeWeekTask(input: {
  weekTaskId: string;
  complete: boolean;
  futureBlocks: 'keep' | 'skip';
}, context: MutationContext): Promise<WeekTask>;
rollOverTasks(input: {
  sourceWeek: string; targetWeek: string; weekTaskIds: string[];
}, context: MutationContext): Promise<{ created: string[]; alreadyExists: string[] }>;
markDay(input: { weekTaskId: string; date: string; mark: 'planned' | 'done' | null }, context: MutationContext): Promise<void>;
finalizeWeekReview(input: { weekStart: string; recalculate: boolean }, context: MutationContext): Promise<WeekReview>;
materializeRecurrences(input: { fromDate: string; toDate: string }, context: MutationContext): Promise<{ generated: number; existing: number }>;
previewBackupImport(input: BackupEnvelope): Promise<BackupImportPreview>;
applyBackupImport(input: { backup: BackupEnvelope; mode: 'merge' | 'replace'; confirm: string }): Promise<BackupImportResult>;
```

> 위 이름은 **계약 명세**이며 미리 존재하는 Supabase API라고 주장하지 않는다. 구현 시 DB RPC/Edge Function을 실제로 만들고 호출에 대한 통합 테스트를 작성한다.

#### 예외 응답 표준

- `UNAUTHENTICATED` → 로그인 화면/세션 갱신.
- `FORBIDDEN` → 타 사용자 ID 참조 차단.
- `VALIDATION_ERROR` → 정확한 잘못된 필드 포커스.
- `VERSION_CONFLICT` → 서버/로컬 값 비교 후 사용자 선택.
- `TIME_CONFLICT` → 겹친 블록 ID·시간 및 `acknowledgeConflict` 재시도 선택.
- `HOLIDAY_DATA_UNKNOWN` → 공휴일 제외 반복 생성/자동 결정 보류.
- `NETWORK_RETRYABLE` → 대기 큐 재전송 가능.
- `IMPORT_INVALID` → 전체 복원 취소, 실패 이유 표시.

### 5.3 멱등성과 중복 방지

- 모바일/오프라인에서 생성한 모든 쓰기 명령은 `mutationId=UUID`를 부여한다.
- 서버 트랜잭션에서 먼저 `(user_id,mutation_id)` 존재 여부 확인 → 이미 처리되었으면 저장된 결과 반환 → 아니면 검증/변경/결과 저장.
- 이월: `unique(user_id, task_id, week_start)` + 서버 `on conflict do nothing`.
- 반복: `unique(user_id, rule_id, local_date)` + 락/멱등 처리.
- 푸시: `unique(user_id,idempotency_key)` + 발송 claim/재확인. 전송 시점의 네트워크 장애 때문에 실제 Push 전달의 완전한 exactly-once 보장은 불가능함을 표시.
- 낙관적 갱신: `UPDATE ... SET ... WHERE id=? AND version=?`가 0행이면 성공 응답하지 않고 충돌 처리.

## 6. 시간 계산·드래그 구현 상세

### 6.1 일자 및 15분 스냅

```ts
const SNAP_MINUTES = 15;
function snapMinute(rawMinute: number): number {
  return Math.round(rawMinute / SNAP_MINUTES) * SNAP_MINUTES;
}
// y -> minute: (clientY - timelineTop + scrollTop) / pixelsPerHour * 60
// drag start: clip to visible range, then snap; end >= start+15m
```

- `localDateTime`을 사용자 timezone에서 UTC `timestamptz`로 변환해 저장한다.
- 기본 Todo 블록 길이 60분(추정 남은 시간이 60분 미만이면 그 값, 최소 15분). 드래그 후 팝오버/리사이즈로 조정.
- 드래그시 `mousedown/pointerdown`부터 일정 임계치 이동 전까지는 클릭 편집으로 처리하여 잘못 이동하지 않도록 한다.
- 특정 시간만 키보드로 변경 가능한 대체 조작 제공(날짜/시/분 직접 입력).
- 리사이즈 핸들은 위·아래 끝에 분리하고 스크린리더 레이블을 가진다.
- 좌우 요일 이동은 화면 좌표에서 주차/요일을 결정하되 DST/시간대 변환은 테스트한다.

### 6.2 충돌 및 가능 시간 구간 연산

```text
baseAvailability = union(요일별 기본 가용구간 또는 날짜 override)
if 공휴일/주말 and override 없음: baseAvailability = Ø
focusAvailable = baseAvailability - union(고정 Event 구간, 명시적 불가 구간)
remainingFree  = focusAvailable - union(계획된 Task 블록 구간)
conflicts      = all blocks intersecting candidate where other.id != candidate.id
```

- 구간은 `[start, end)` 반열림 구간으로 표현. `10:00~11:00`과 `11:00~12:00`은 겹치지 않는다.
- 합집합은 2개 이상 블록이 겹칠 때 중복 분을 제거. Event가 근무시간 밖이면 가용시간 차감 0.
- 공휴일과 일요일이 겹치면 휴무일 수 1로 계산.
- `focusAvailable`은 '기본적으로 집중 가능한 창'이고, `remainingFree`는 실제로 **아직 배정하지 않은** 시간. 라벨을 혼동하지 않는다.
- 저장 직전 서버에서 충돌을 다시 확인(클라이언트 미리보기만 신뢰 금지). 허용 승인 플래그가 없다면 거절하고 충돌 상세를 반환.
- 사용자가 충돌을 승인해도 색상/아웃라인/툴팁을 통해 충돌 상태를 유지한다.

### 6.3 요일별 7칸 집계

```ts
type DayIndicator = 'none' | 'planned' | 'partial' | 'done' | 'after-completion';

// 1. 이 주의 수동 마크가 있으면 그 의도된 기록을 우선 설명한다.
// 2. 수동 마크가 없으면 그 요일에 시작한 Task 블록들의 상태를 집계한다.
//    all done => X, some done => partial, any planned => dot, otherwise empty.
// 3. Todo 전체 완료일 이후 남은 주간 날짜는 행의 가는 선으로만 렌더링한다.
//    after-completion은 실제 기록 테이블에 저장하지 않는다.
```

- 요일에 수동 체크가 있어도 연결된 모든 시간 블록이 자동 완료된 것으로 간주하지 않는다.
- 월요일만 3블록, 그 중 1블록 완료라면 7칸의 월요일은 `partial`.
- `Todo 완료일`은 사용자의 시간대 날짜이며 마감일과 별개.
- 계획 블록 이동/삭제 시 수동 마크는 보존하고 자동 표시는 다시 계산한다.

## 7. 반복 일정 엔진 설계

### 7.1 생성 범위

- 사용자가 방문한 주(월~일)와 **푸시 예약을 위한 향후 30일**만 필요에 따라 생성한다.
- `recurrence_rules.frequency: daily/weekly`, `weekdays: 1..7`, `starts_on/ends_on`, `timezone`, `skip_public_holidays`, `template`.
- Event 템플릿 예: `{ "title":"팀 회의", "startMinute":600, "durationMinutes":60, "categoryId":"..." }`.
- Task 템플릿 예: `{ "title":"운동하기", "estimateMinutes":60, "dueOffsetDays":0, "categoryId":"..." }`.
- 작업별 `recurrence_occurrences` 유니크 키로 재실행해도 회차 재생성 없음.
- 반복 Todo 각 회차는 별도 TASK. 동일 주에 세 번 반복하면 월·수·금 각기 1개 TASK가 생성됨. 하나의 작업을 한 주 여러 날에 수행하려면 반복 대신 1개 Todo를 여러 블록으로 나눈다.
- 생성 배치가 중간 실패해도 재시도 멱등; 불완전한 회차는 롤백 또는 reconciliation.

### 7.2 반복 수정·삭제

| 사용자의 선택 | 엔진 동작 |
|---|---|
| 이번 회차만 변경 | 해당 `recurrence_occurrences`를 exception으로 변경, 원본 rule 유지 |
| 이번 회차 취소 | occurrence를 cancelled로 표시, 다음 materialize에서 재생성 방지 |
| 이후 반복 모두 변경 | 기존 rule을 변경 직전까지 종료, 새 rule을 변경일부터 시작(parent_rule_id 연결) |
| 과거 이미 완료한 회차 | 절대 자동 소급 수정/삭제하지 않음 |
| 공휴일 제외 | 공식 해당 날짜 공휴일 캐시 검증 후 생성 여부 판단 |
| 시간대 변경 | 로컬 시각 유지 여부 사용자 안내 후 미래 회차 재계산, 과거 시간은 보존 |

서버 Materializer는 **현재 사용자가 요청한 주만 처리**하며 관리자 cron 작업은 가입자별 향후 알림 후보 범위를 처리할 수 있다. 무제한 전 사용자·전 연도 생성 금지.

## 8. 공휴일 수집 및 JSON 캐시 설계

### 8.1 공식 API 계약

- 공식 자료: <https://www.data.go.kr/data/15012690/openapi.do>
- 공휴일 엔드포인트: 공공데이터포털 현재 문서에 나오는 `SpcdeInfoService`의 `getRestDeInfo`; 구현 당시 실제 엔드포인트·응답 구조 재검증.
- 주요 입력: `ServiceKey`, `solYear`, `solMonth`(+ 필요한 paging 값).
- 공식 출력: `locdate(YYYYMMDD)`, `dateName`, `isHoliday`, `totalCount` 등. XML 본문에서 결과코드까지 검사.
- `isHoliday = 'Y'`만 공공기관 휴일로 취급. 기념일과 휴일을 혼동하지 않는다.

### 8.2 캐시 JSON 스키마

```json
{
  "schemaVersion": 1,
  "year": 2026,
  "source": "KASI-SpcdeInfoService",
  "fetchedAt": "2026-11-15T00:00:00Z",
  "complete": true,
  "items": [
    {"date":"2026-01-01","names":["신정"],"isHoliday":true}
  ]
}
```

> 위 JSON은 **스키마 예시**이며 실제 파일은 반드시 API에서 가져온 항목으로 생성한다. 예시의 한 날짜만 들어 있는 파일을 2026년 전체 데이터라고 간주하지 않는다.

- 현재 연도 ±1 또는 ±2년 범위를 갱신, 페이지네이션 및 12개월 누락 검증.
- `complete=true`는 연·월 요청이 전부 성공하고 파싱/검증 후에만 기록. 부분 실패 시 해당 연도 캐시를 전체 정상 데이터로 교체하지 않는다.
- 동일 날짜 여러 이름은 병합·정렬하고 휴일 수치는 날짜 기준으로 계산.
- **공식 데이터가 없는 미래 연도는 `complete=false`/미확인 상태를 유지**. 가짜 공휴일 입력 금지.
- 저장 장소: GitHub Pages `/<repo>/holidays/YYYY.json` 공개 캐시. 비밀키·개인 데이터는 포함하지 않는다.
- 서버 반복 엔진도 검증된 **공개 holiday JSON**을 가져와 공휴일 제외를 판단하거나 동일 소스의 검증 캐시를 서버 내부에 유지. 데이터 부재 시 자동 생성을 보류.

### 8.3 갱신 파이프라인

1. GitHub Action `schedule`(월 1회 이상, 정각 피해서 예약) + `workflow_dispatch` 수동 실행.
2. GitHub Secret `KASI_SERVICE_KEY`를 스크립트에서만 사용해 연도별/월별 공식 API 호출.
3. 유효성 검사 성공 시 공용 JSON 생성. 장애라면 마지막 정상 캐시를 유지하고 경고 로그.
4. 신규 캐시가 있으면 저장소에 JSON만 커밋하거나 **동일 워크플로에서 빌드/배포**하여 재귀 트리거에 의존하지 않음.
5. 실제 페이지에서 캐시 최신 시각·해당 연도 상태 확인.
6. 사용자가 앱에서 `공휴일 데이터 다시 확인` 버튼을 눌러 공개 JSON을 재요청할 수 있게 함(원본 API 키 노출 없음).

**운영 리스크:** GitHub 공개 저장소는 **60일간 저장소 활동이 없으면 예약 워크플로가 자동으로 꺼질 수 있다**. GitHub Actions 예약 실행 자체도 지연/누락될 수 있다. 따라서 수동 실행 절차를 운영 문서에 남기고 `lastFetchedAt` 오래됨 경고를 UI/운영 점검에 포함한다.

## 9. Web Push / 내부 알림: 실제 구현 설계

### 9.1 권한과 기기 구독 UX

1. 로그인 후 설정에서 `브라우저 알림 켜기` 클릭.
2. 지원 환경·iOS PWA 설치 여부·https·Service Worker 확인.
3. 권한 안내 표시 → **직접 클릭 시에만** 브라우저 권한 요청.
4. 허용되면 `PushManager.subscribe({userVisibleOnly:true, applicationServerKey: VAPID_PUBLIC_KEY})` 호출.
5. `endpoint`, `keys.p256dh`, `keys.auth`를 인증된 서버에 등록(실제 구독이 생성됐는지 확인).
6. `푸시 테스트 보내기` 버튼으로 기기 도착 확인 가능(서버 전송, 시뮬레이션 아님).
7. 해제 시 서버 구독 비활성/삭제 + 브라우저 `unsubscribe`. 로그인 계정 전환 시 기기 등록도 재검토.

### 9.2 발송 스케줄러

- 사용자 선호와 시간대에 따라 Event 시작 전, D-1/D-Day, 이월, 회고 알림 작업을 생성한다.
- Cron 예: 5분마다 서버 Edge Function을 안전하게 호출. **실제 배달 시간에는 수분 지연이 있을 수 있고 보장은 없음.**
- Scheduler는 `notification_jobs`에서 기한 도래 작업을 제한된 batch로 가져와 `FOR UPDATE SKIP LOCKED` 또는 동등한 atomic claim → 전송.
- 보내기 직전에 원본 Todo/이벤트가 여전히 존재·미완료인지, 날짜/시간·설정·조용한 시간대·중복 여부를 다시 검증.
- `404/410`은 오래된 구독 제거, 일시 오류는 횟수 제한+백오프, 영구 오류는 기록.
- 한 알림이 여러 기기로 발송될 수 있으며, 발송 기록은 사용자·기기 기준으로 명확하게 기록. 사용자 계정당 알림 작업 1건과 기기별 전송 결과를 혼동하지 않는다.
- 푸시 엔드포인트가 서버 내부/사설 네트워크를 가리키지 못하도록 HTTPS·호스트 검증 및 SSRF 방어.
- VAPID private key는 **Supabase Edge Function secrets**에만 보관. 브라우저·GitHub Secrets(호스팅용 키 아닌 경우)·DB의 공개 테이블에 두지 않는다.
- Supabase Edge의 Deno 런타임과 호환되는 검증된 Web Push 암호화/서명 라이브러리를 사용하고 실제 브라우저에서 수신 테스트한다.
- 푸시 payload 예시: `{ "title":"일정이 곧 시작돼요", "body":"10분 후 예정된 일정이 있어요", "url":"/<repo>/#/planner?week=..." }`. 제목/본문 정보량은 사용자 설정/개인정보 안내에 맞춰 제한.
- `Service Worker`의 `push` 이벤트는 `showNotification` 호출, `notificationclick`은 프로젝트 기본 경로 내 정확한 주/일자 화면으로 이동.

### 9.3 실패와 0원 제약

- **권한 거부/미지원:** 앱 내부 알림 대체. 사이트를 열지 않을 때 OS 푸시를 억지로 약속하지 않는다.
- **iOS/iPadOS:** 지원 버전에서 홈 화면에 추가된 PWA로 푸시 가능, 일반 탭과 동일하다고 안내하지 않는다.
- **Supabase 무료 프로젝트 일시 중지:** Cron·Edge·DB 작업이 실행되지 않을 수 있다. 재개 후 늦은 알림은 현재 유효성 검사에 따라 폐기/정리.
- **플랫폼/브라우저별 알림 전달:** 네트워크·절전·OS 정책 영향을 받으므로 at-least-once / exactly-once를 사용자에게 보장하지 않는다.
- **사용자가 요청한 '브라우저 푸시까지'를 완료로 인정**하려면 데스크톱 Chrome + 적어도 한 호환 모바일에서 기기 수신 로그/스크린샷을 남겨야 한다.

## 10. PWA, 오프라인, 동기화

### 10.1 Service Worker

- Vite 하위 경로 기반 `scope`, manifest `start_url`, Service Worker 등록 URL을 일치시킨다.
- `vite-plugin-pwa`의 커스텀 SW(`injectManifest`)를 검토하여 캐시 + Web Push 핸들러를 **같은 범위**에서 처리한다. 중복 SW가 푸시를 가로채지 않게 한다.
- 앱 셸·정적 이미지·검증된 공휴일 JSON 캐싱, Supabase 인증/개인 API 응답을 **공용 캐시로 저장하지 않는다**.
- 로그인 사용자별 주간 데이터 캐시는 IndexedDB에서 계정별 namespace로 분리.
- 새 배포 시 SW 업데이트 안내와 오류 없는 활성화. 오래된 HTML ↔ 새 JS 해시 혼합으로 흰 화면이 되지 않게 한다.

### 10.2 동기화 큐 예시

```ts
type PendingMutation = {
  userId: string;
  mutationId: string;
  operation: 'task.create' | 'task.update' | 'block.move' | 'block.resize'
    | 'day.mark' | 'task.complete' | 'rollover' | 'review.update' | 'event.update';
  payload: unknown;
  expectedVersion?: number;
  enqueuedAt: string;
  attempts: number;
};
```

- UI에서 변화를 즉시 그릴 수 있으나 `서버 저장 완료`와 `로컬 임시 적용`을 시각적으로 분리.
- 보류 큐에는 Google OAuth 토큰/서비스 비밀을 저장하지 않는다.
- 재연결 시 FIFO로 순차 전송. 중간 충돌이 생기면 관련 체인만 멈추고 해결 안내.
- 계정 전환 시 현재 계정의 로컬 데이터를 다른 사용자에게 노출/전송 금지.
- 사용자가 브라우저 저장소를 지운 경우 미동기화 로컬 데이터가 사라질 수 있다는 경고를 제공.
- 테스트: 비행기 모드/DevTools Offline → 생성/수정 → 온라인 → DB 한 번만 반영, 새로고침/다른 기기 확인.

## 11. JSON 백업·복원

### 11.1 파일 계약

```json
{
  "schemaVersion": 1,
  "app": "WEEKFLOW",
  "exportedAt": "2026-11-15T13:00:00.000Z",
  "timezone": "Asia/Seoul",
  "data": {
    "profile": {},
    "categories": [],
    "tasks": [],
    "weekTasks": [],
    "weekTaskDayMarks": [],
    "goals": [],
    "goalWeekTasks": [],
    "timeBlocks": [],
    "availabilityRules": [],
    "availabilityOverrides": [],
    "recurrenceRules": [],
    "recurrenceOccurrences": [],
    "weekReviews": [],
    "notificationPreferences": {}
  }
}
```

- ID, FK 관계, 날짜·시간, 원본 상태를 포함하되 인증 정보·비밀키·Push 구독은 제외한다.
- 크기가 크면 처리 한도 내에서 스트리밍/페이지 분할 내보내기. 파일 크기 제한과 사용자 안내.
- `previewBackupImport`는 **DB를 변경하지 않는다**: schemaVersion 지원 여부, FK 무결성, 작업 수, 충돌 수, 예상 삭제 건수 표시.
- `merge`는 기존 동일 ID/논리키 데이터를 사용자 승인한 규칙으로 병합, `replace`는 해당 사용자 소유 도메인 데이터 교체. 두 모드 모두 원자적 처리.
- API Edge Function은 Google 인증 JWT를 검증하고 사용자 ID를 JWT로부터 가져온다. 브라우저 파일의 `userId`를 신뢰하지 않는다.
- 테스트: 내보낸 JSON을 다른 빈 테스트 사용자로 복원하여 ID 매핑/FK 유지/사용자 재할당 검사. 타 사용자 원본 데이터는 변경되지 않아야 함.
- CSV는 표 계산 도구에서 열기 쉬운 열 순서와 UTF-8 BOM 선택 지원. CSV 수식 인젝션 위험을 피하기 위해 `=,+,-,@`로 시작하는 사용자 텍스트는 안전하게 escape.

## 12. Google OAuth·Supabase 인증 실제 설정

### 12.1 소유자 준비

1. GitHub 계정/저장소 생성. GitHub Free에서 Pages 무료 사용 시 공개 저장소가 기본 조건.
2. Supabase **Free** 프로젝트 생성 → Project URL + publishable key 확보.
3. Google Cloud Console에서 OAuth 동의 화면/웹 애플리케이션 클라이언트 ID·secret 생성.
4. Google Cloud의 **Authorized redirect URI**에 Supabase 프로젝트의 `https://<project-ref>.supabase.co/auth/v1/callback` 추가.
5. Supabase Dashboard → Auth → Google provider에 ID/secret 설정.
6. Supabase Auth URL 설정: 로컬 `http://localhost:5173/` 및 배포 `https://<USER>.github.io/<REPO>/`를 허용 redirect URL에 추가.
7. 프런트에서는 `supabase.auth.signInWithOAuth({provider:'google', options:{redirectTo: window.location.origin + import.meta.env.BASE_URL}})` 사용.
8. `HashRouter`를 사용하므로 OAuth callback은 **GitHub Pages 프로젝트 루트**로 받고, 리디렉션 URL의 code/session을 Supabase JS가 적절하게 교환한 후 `/#/planner`로 이동. PKCE 사용 시 필요한 `exchangeCodeForSession` 흐름을 공식 문서와 실제 배포에서 검증.
9. 로컬 로그인/배포 로그인 모두 재접속·새로고침·로그아웃 후 복구 테스트.

**주의:** Google 측 authorized redirect URI(=Supabase callback)와 Supabase 허용 앱 redirect URL(=GitHub Pages 주소)은 **서로 다르다**. 잘못 설정하면 OAuth가 실패한다. OAuth 권한은 기본 로그인에 필요한 최소 수준만 요청하고 Google Calendar 권한을 추가하지 않는다.

### 12.2 프런트 환경변수 계약

```dotenv
# .env.example -- 값은 예시/자리표시자만. 실제 비밀 저장 금지.
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_KEY
VITE_BASE_PATH=/YOUR_REPO/
VITE_VAPID_PUBLIC_KEY=YOUR_PUBLIC_VAPID_KEY
```

| 비밀/설정 | 저장 장소 | 공개 여부 |
|---|---|---|
| `VITE_SUPABASE_URL` | Vite env / GitHub Actions variable | 공개 가능 |
| Supabase publishable/anon key | Vite env / Actions variable | 공개 가능, RLS 필수 |
| VAPID public key | Vite env | 공개 가능 |
| Google OAuth client secret | Supabase Auth 설정 | **비공개** |
| Supabase secret/service_role key | Supabase Edge Functions / Vault | **비공개** |
| VAPID private key | Supabase Edge Functions Secrets | **비공개** |
| `KASI_SERVICE_KEY` | GitHub Actions Secrets | **비공개** |
| 푸시 예약 호출 secret | Supabase Vault | **비공개** |

## 13. GitHub Pages 배포 설계

### 13.1 Vite 설정

```ts
// vite.config.ts 예시. 실제 프로젝트 구조에 맞게 검증.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react() /* VitePWA({ strategies: 'injectManifest', ... }) */],
  base: process.env.VITE_BASE_PATH ?? '/',
});
```

- `https://<USER>.github.io/<REPO>/` → Vite `base='/<REPO>/'`.
- `https://<USER>.github.io/` 루트 저장소 또는 커스텀 도메인 → `base='/'`.
- `HashRouter`로 내부 이동: `/#/planner?...`, `/#/settings` 등. 새로고침 시 GitHub Pages 404 우회.
- 이미지·manifest·공휴일 JSON·Service Worker를 `import.meta.env.BASE_URL` 기반으로 불러온다. 절대 경로 `/holidays/...` 하드코딩 금지.
- 브라우저 실제 배포에서 SW scope가 `/<REPO>/`이고 등록/구독 성공하는지 확인한다.

### 13.2 Pages GitHub Actions 예시 골격

```yaml
name: Deploy WEEKFLOW to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test -- --run
      - run: npm run build
        env:
          VITE_BASE_PATH: /${{ github.event.repository.name }}/
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ vars.VITE_SUPABASE_PUBLISHABLE_KEY }}
          VITE_VAPID_PUBLIC_KEY: ${{ vars.VITE_VAPID_PUBLIC_KEY }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

> 위 예시는 **배포 골격**이다. 실제 CI에는 E2E/RLS 테스트·보안 검사, PWA 검증, 공휴일 데이터 검증도 추가한다. Github Actions major versions 및 Node LTS는 구현 당시 공식 최신 문서로 확인하여 고정한다. Pages 설정에서 `Build and deployment → GitHub Actions`를 선택해야 한다.

### 13.3 공휴일 갱신 워크플로

- `sync-holidays.yml`에 `schedule`(예: 매월 10일 UTC 03:17)과 `workflow_dispatch` 두 트리거.
- `KASI_SERVICE_KEY` 비밀을 사용해 공식 API fetch, 정적 JSON 검증, 빌드·배포까지 **동일 실행에서 완료**.
- 공개 JSON만 커밋할 때는 `contents: write` 권한 별도 부여와 변경 내역 검토, 비밀값 포함 검사.
- Actions schedule은 누락·지연·60일 활동 없음 자동 비활성 가능. 운영자에게 수동 갱신·상태 확인 방법 문서화.
- 데이터 동기화 실패가 정상적인 `main` 배포를 불필요하게 막지 않도록 **기존 검증 캐시로 폴백**하되 '신규 캐시 갱신 성공'이라고 거짓 보고하지 않는다.

### 13.4 Edge Functions / Supabase DB 배포

```bash
# 아래는 필요한 도구/계정이 연결되었을 때 실행할 명령 예시
npm ci
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase functions deploy dispatch-push
npx supabase functions deploy backup-import
npx supabase functions deploy materialize-recurrences
npx supabase functions deploy manage-subscription
```

- 마이그레이션은 변경 순서와 롤백/복구 계획을 함께 문서화.
- 비밀은 CLI `supabase secrets set` 또는 Dashboard/Vault에서 설정. 문서/커밋에 실제 값을 입력하지 않는다.
- Cron 등록은 Supabase의 `pg_cron` + `pg_net` 공식 예시에 따라 Vault의 비밀로 Edge Function 호출. URL만 공개된 상태에서 인증 없는 트리거 허용 금지.
- Edge Function은 **사용자 API용 JWT 검증**과 **Cron 작업용 서버 비밀 검증**을 명확히 구분. `--no-verify-jwt`를 무조건 사용하면 안 된다.

## 14. 작업 분해 구조(WBS) — 모든 기능을 첫 릴리스에 포함

### 단계 0. 레포/개발환경/공식 레퍼런스 확보

**산출물:** 실행 가능한 Vite 앱, 타입/린트/테스트 환경, docs, `.env.example`, 디자인 참조, UI 컴포넌트 폴더.

- [ ] React TS/Vite 생성, 최신 안전 버전 검증 후 lockfile 고정.
- [ ] WORKIVE 스크린샷과 프런트 디자인 비교 기준 수립(로고/고유 저작물 제외).
- [ ] 폰트 라이선스, CSS Variables, 반응형 breakpoint, 헤더/시간 축/패널 레이아웃 설정.
- [ ] 테스트 툴과 GitHub Actions CI 준비.
- **검증 게이트:** 앱 로컬 실행, 타입·린트·빈 테스트·빌드 모두 정상.

### 단계 1. Supabase / Auth / DB / RLS

**산출물:** SQL migration, generated TS DB types, Google Auth, onboarding.

- [ ] `profiles`와 사용자별 모든 도메인 테이블/인덱스/복합 FK 생성.
- [ ] RLS SELECT/INSERT/UPDATE/DELETE 정책과 제한 테이블별 GRANT/REVOKE.
- [ ] 트리거: 사용자 최초 생성, `version`, 같은 주 goal link, day mark 날짜 범위.
- [ ] Google OAuth PKCE·redirect 테스트, 세션 유지/로그아웃·계정 삭제 플로우.
- [ ] RLS 공격 테스트(A→B 참조/수정 시도 포함).
- **검증 게이트:** 다른 사용자 데이터 0노출, 잘못된 참조 DB가 차단, 로그인·로그아웃 실환경 정상.

### 단계 2. 레퍼런스 1:1 구조에 가까운 UI 골격

**산출물:** desktop paper weekly layout, mobile day view, 팝오버/바텀시트.

- [ ] 월/연도/주차/날짜 이동(월요일 시작), 오늘 강조.
- [ ] 좌측 7열 04~24 시간축, 점선 가용 시간, 요일 헤더.
- [ ] 우측 GOALS/DEADLINE/TO-DO, 하단 WEEKLY REVIEW.
- [ ] 모바일 하루 집중형 + Todo 바텀시트, 태블릿 가로 스크롤.
- [ ] 실제 스크린샷과 DOM 렌더링 비교 (디자인 토큰 조정).
- **검증 게이트:** 360px/768px/1440px 레이아웃, 확대 200%, 키보드 포커스, 종이형 디자인 일치.

### 단계 3. Todo·Event·블록·드래그·완료

**산출물:** 실제 CRUD와 시간표 상호작용, 7칸 수행표.

- [ ] 빠른 Todo Enter 생성, 편집 팝오버, 카테고리 색, 마감일.
- [ ] Event 직접 생성, Todo→블록 여러 개 생성, 원본/블록 삭제 차이.
- [ ] 15분 드래그/리사이즈/미리보기, 경고 승인, Undo.
- [ ] 시간 블록별 done/skipped, Todo 전체 완료, 미래 블록 확인.
- [ ] 7칸 ●/X/partial/완료 후 선, 수동 기록.
- [ ] 터치·키보드 날짜/시간 대체 입력.
- **검증 게이트:** DB 반영/새로고침/다른 기기, 충돌 승인/취소, 다중 블록, Undo 모두 E2E 통과.

### 단계 4. 가용 시간·공휴일·주간 계획

**산출물:** 가용시간 계산기, 수동 예외, 정식 API 공휴일 파이프라인.

- [ ] 평일 09~18, 주말/공휴일 0, 날짜 예외 우선.
- [ ] 구간 합집합/차집합, 고정 Event 점유, Task 배치 후 잔여 시간.
- [ ] 공식 XML API 스크립트, 검증 JSON, GitHub Action 업데이트와 캐시 실패 폴백.
- [ ] 공휴일명·토요일·일요일·대체공휴일 색/상태, 휴일 중복 카운트 방지.
- [ ] 확인되지 않은 연도 경고와 자동화 보류.
- **검증 게이트:** 연도/주 경계·휴일 중복·API 중지·수동 오버라이드 테스트.

### 단계 5. Goals·Deadline·Review·이월

**산출물:** 주간 목표 계산, 마감 동기화, 리뷰 스냅샷, 선택적 이월.

- [ ] Goal ↔ weekly_task 선택 연결, 연결 0건 처리.
- [ ] due_on 유일 원본 DEADLINE, 편집 동기화 및 지연 상태.
- [ ] 리뷰 자동 통계, 문항 편집, 완료 기준과 스냅샷 확정.
- [ ] 미완료 선택 이월, 중복 클릭 안전, 과거 블록/목표/리뷰 보존.
- **검증 게이트:** 이월 전후 과거 통계 불변, 기한/목표 관계 정확, 복수 주 기록 유지.

### 단계 6. 반복 회차 엔진

**산출물:** daily/weekly/weekday Event/Task, 예외·공휴일 제외.

- [ ] 규칙 생성/수정/해지, 기간 제한/무기한 on-demand 생성.
- [ ] Event/Task 회차 독립 상태, 고유키 중복 방지.
- [ ] 한 회차만 수정, 이후 전체 변경(규칙 분기).
- [ ] 반복 Todo 이월 자동 제외 및 수동 이월 경고.
- [ ] 반복과 푸시 작업 생성/취소/재계산 연동.
- **검증 게이트:** 같은 주 100회 조회·동시 요청에도 회차 1개, 완료 상태 격리, 공휴일 제외 정확.

### 단계 7. PWA·오프라인·Push·내부 알림

**산출물:** 등록 SW, 실제 OS 푸시, 예약 작업, IndexedDB 큐.

- [ ] 프로젝트 하위 경로 manifest/start_url/SW 확인.
- [ ] 사용자 클릭 기반 permission, VAPID 기기 구독/해제.
- [ ] Edge Web Push 발송, pg_cron 스케줄, 일괄 발송 claim/중복방지/오류 복구.
- [ ] 개인별 알림 설정/조용한 시간/기기별 구독, 앱 내 알림.
- [ ] IndexedDB 오프라인 보류 큐 + 재연결 + 낙관 잠금 충돌 선택.
- [ ] 데스크톱 실제 푸시 + 호환 모바일 실제 푸시 검증, iOS 미지원 안내.
- **검증 게이트:** '푸시 성공'은 기기에 도착한 기록으로만 인정. 오프라인 변경 1회만 DB 반영.

### 단계 8. 백업·복원·안정화·접근성

**산출물:** JSON backup/import, CSV, 전체 오류 UX, 테스트 리포트.

- [ ] 전체 JSON 스키마버전·데이터 관계 보존·비밀 제외.
- [ ] 미리보기/중복/병합/교체/이중 확인/원자적 서버 반영.
- [ ] CSV 안전 escape와 UTF-8 호환.
- [ ] 에러·빈 상태·토스트·충돌 팝업·Undo·포커스·ARIA 점검.
- [ ] 모의 데이터/장식 버튼/하드코딩 공휴일 점검, 의존성 보안 감사.
- **검증 게이트:** 새로 내보낸 데이터를 복원해 데이터 수·관계·이력 동치, 대표 E2E 모두 통과.

### 단계 9. 최종 통합·배포·실사용 검증

**산출물:** 배포 URL, 실제 서비스, 보안/QA/운영 문서, 남은 제약 목록.

- [ ] CI/CD 안정화, GitHub Pages 및 Supabase Edge Functions/DB 적용.
- [ ] 실배포 OAuth, project base path, SW·푸시, 공휴일 JSON 접근, DB 동기화 확인.
- [ ] PC·모바일 주요 브라우저의 실제 사용 흐름 리허설.
- [ ] 비용·중지·Github Actions schedule/휴일 갱신 운영 점검.
- [ ] README 설치/배포/운영/문제해결, `TEST_REPORT.md`에 **실행한 사실만** 기록.
- **릴리스 게이트:** 아래 섹션 15의 필수 검증 체크리스트 모두 합격. 하나라도 실패하면 정식 '완성' 표현 금지.

## 15. 테스트 계획과 수락 기준(개발/QA)

### 15.1 자동화 분류

| 종류 | 예제 | 실행 위치 |
|---|---|---|
| Unit (Vitest) | ISO 주 계산, 공휴일 주말 판정, interval union/diff, 15분 snap, 7칸 표시, 리뷰 통계 | 로컬 + CI |
| Component | Enter Todo, 팝오버 닫힘/초점, 경고 승인, 모바일 바텀시트, 빈 상태 | 로컬 + CI |
| DB Integration | FK/Trigger/RLS, 같은 주 Goal 연결, Task 완료 상태, 이월, 반복 멱등 | Supabase 로컬 + CI |
| Edge Integration | VAPID Web Push payload, 인증, Cron 중복·만료 구독, 가져오기 transaction | 로컬/테스트 Supabase |
| Browser E2E | Google 로그인 후 저장·새로고침, Todo 다중 블록, 주간 탐색, 이월·회고·백업 | Playwright + 실환경 수동 |
| Accessibility | 스크린리더 레이블, 키보드 대체 경로, focus, 대비, 오류 안내 | axe + 수동 |
| Security | 사용자 A/B 격리, JWT 부재, FK 탈취 시도, secret 스캔 | CI + 로컬 SQL |
| Deployment smoke | GitHub Pages 하위 URL, deep link/hash, holiday JSON, SW, 실제 푸시, OAuth | 배포 후 수동/자동 |

### 15.2 핵심 시나리오 ID

| ID | 시나리오 | 예상 결과 |
|---|---|---|
| T-01 | 새 사용자 Google 로그인 | 빈 주간 플래너와 개인 기본 카테고리/설정 생성 |
| T-02 | Todo 생성 후 새로고침 | 같은 Todo 정확히 한 건 보임 |
| T-03 | Todo 3h를 2개 블록으로 나눔 | 1개 task, 1개 week_task, 2개 time_blocks |
| T-04 | 기존 회의와 겹치는 블록 | 승인 전 미저장, 승인 시 저장+충돌 경고 유지 |
| T-05 | 날짜 이동·리사이즈 | 15분 스냅과 저장된 UTC 시간 정확 |
| T-06 | 월요일 2블록 중 1개만 완료 | 7칸 월요일 partial, 전체 Todo open |
| T-07 | Todo 전체 완료 후 미래 블록 | 선택한 처리만 수행, 허위 done 없음 |
| T-08 | 다음 주 이월 같은 버튼 2회 | 새 week_task 1개, 과거 기록 그대로 |
| T-09 | 다음 주 Todo 완료 | 이전 주 review snapshot·goals 수치 불변 |
| T-10 | 반복 Todo 월/수/금 생성 | 서로 다른 3 task 회차, 완료 독립 |
| T-11 | 반복 규칙 하루만 예외 | 다른 회차/과거 기록 영향 없음 |
| T-12 | 주말·공휴일·수동 예외 | 기본 가용 0, 날짜 override 사용 가능 |
| T-13 | 같은 날 두 휴일 이름 | 휴일 카운트 1, 이름은 2개 표시 |
| T-14 | 공휴일 API 실패/미래 미확인 | 캐시 fallback 또는 데이터 미확인 경고 |
| T-15 | 모바일 작업→시간표 배치 | 드래그 없이 날짜·시간 선택만으로 성공 |
| T-16 | 푸시 허용 후 테스트 발송 | 실제 기기 알림 도착, 앱 열기 동작 |
| T-17 | 푸시 권한 거부 | 앱 내부 알림, 푸시 미지원 안내 |
| T-18 | 오프라인 수정→복귀 | 1회만 동기화, 실패 시 대기/충돌 메시지 |
| T-19 | 2기기 동시에 같은 Todo 수정 | `VERSION_CONFLICT`, 조용한 덮어쓰기 없음 |
| T-20 | JSON export→restore | 상태·관계·주간 기록·반복·리뷰 동치 |
| T-21 | 악성 백업/CSV 수식 | JSON 검증 실패·트랜잭션 롤백, CSV escape |
| T-22 | 타 사용자 task_id로 goal link | FK/RLS 거부, 정보 유출 없음 |
| T-23 | Pages 프로젝트 경로에서 OAuth/SW | 주소 404·SW 스코프 실패 없음 |
| T-24 | 무료 Supabase 중지/네트워크 장애 | 정직한 실패 안내, 재시도와 백업 접근 경로 |

### 15.3 테스트 픽스처

- 2026년 11월 15일을 포함한 월~일 주간 데이터, 월말·연말·연초를 걸치는 주.
- 하루 09:00~18:00 기본 가용, 10~11 회의, 10:30~12 Task, 13~15 Task, 수동 가용 09~13 예외.
- Todo '기획서 작성'(3h), 1h/2h 분할, 마감 D-1/D-Day와 과거 기한.
- 재현 가능한 공식 공휴일 응답 **테스트 fixture**와 API 오류/partial response fixture. fixture를 실제 배포 공휴일 데이터로 사용하지 않는다.
- 반복 월/수/금 세 회차, 같은 주 중 1개 완료, 1개 예외, 다음주 이월 선택.
- 사용자 A와 B 각기 독립 작업 3개, 일부 동일한 공개 문구로 데이터 격리 검증.
- Push에 구독 2개, 만료 endpoint 1개, 권한 미허용 브라우저 1개.

### 15.4 최종 자동 검사 명령(스크립트는 구현할 것)

```bash
npm ci
npm run typecheck
npm run lint
npm run test -- --run
npm run test:integration
npm run test:e2e
npm run build
npm run preview
npx supabase db lint
# 사용자 격리/알림/복원/Push 테스트는 별도 CI 또는 수동 보고서 포함
```

**테스트 보고서**에는 실행 일시·환경·명령·결과·실패 스크린샷·수동 점검·남은 제약·실제 배포 URL을 기록한다. 실제 실행하지 않은 테스트를 `PASS`라고 쓰면 안 된다.

## 16. 보안·프라이버시·위험 관리

### 16.1 최소 보안 체크

- [ ] `.env.local`, 서비스 키, OAuth secret, VAPID private, Supabase secret은 `.gitignore` 및 시크릿 스캔으로 커밋 차단.
- [ ] 모든 개인 데이터 테이블에 RLS. 조인/참조 FK는 같은 user_id로 묶음.
- [ ] 서버용 함수는 호출자 인증/권한/입력 검증/Rate limit/리소스 제한 적용.
- [ ] 공휴일/외부 API의 응답은 **데이터**로만 취급, 사용자 UI에 삽입할 때 XSS escaping.
- [ ] 사용자 입력을 raw HTML로 표시하지 않음, URL/리다이렉트 화이트리스트.
- [ ] Push endpoint SSRF/구독 키 노출 방어, 기기 구독 해지/폐기.
- [ ] JSON 백업에 토큰·비밀키·Push 인증키 포함되지 않음.
- [ ] 복원에 업로드 용량·레코드 수·스키마/UUID/date 검증·원자성.
- [ ] 사용자 삭제는 재확인 후 전체 계정 소유 데이터/구독/큐를 처리하며 결과 확인.
- [ ] 로그에 사용자 메모 본문·토큰·Authorization 헤더 원문 남기지 않음.
- [ ] 쿠키/세션/로컬 캐시 접근은 앱 종료·로그아웃·기기 공유 시 사용자 안내.

### 16.2 위험 레지스터

| 위험 | 발생/영향 | 예방 / 대응 |
|---|---|---|
| 무료 Supabase 비활성 일시 중지 | 알림·DB/API 중단 | 경고 안내, 복구 절차, 사용자의 JSON 백업, 운영 점검 |
| 무료 사용량/정책 변경 | 0원 목표 깨짐 | 요금·쿼터 모니터링, 과금 승인 없이 업그레이드 금지 |
| GitHub Actions 예약 워크플로 중지 | 휴일 갱신 늦어짐 | 수동 실행, 캐시 신선도 표시, 주기적 저장소 유지 확인 |
| iOS 브라우저 푸시 제한 | 사용자 알림 미수신 | PWA 설치 안내, 내부 알림, 실제 기기 검증 |
| Cron 지연·Push 서비스 실패 | 예정 시각 불일치 | 5분 batch·재시도·유효성 재검증, 전달 보장 문구 금지 |
| 재귀 반복 생성 | DB 폭증 | 30일 범위 제한, UNIQUE, batch limits |
| 이월/반복 작업 중복 | 통계·Todo 왜곡 | 논리 ID와 회차 ID 구분, unique·멱등 키 |
| 오프라인/동시 수정 | 데이터 유실 | IndexedDB queue, server version conflict, 사용자 비교 UI |
| 백업 스키마 진화 | 복원이 중단 | schemaVersion, importer migration 함수, 테스트 fixture |
| 예시 UI만 구현 | 서비스 기능 부재 | E2E·실 DB·실 Push 완료 기준, mock 미배포 |
| 브랜드 UI 저작물 오인 | 상표/자산 위험 | 독립 이름·자체 로고/문구/아이콘, 사용자 스크린샷은 참고용 |

## 17. 실제 배포 순서 / 소유자가 해야 할 일

### 배포 전 체크

1. GitHub 저장소 이름 확정, Pages URL 구조 확정(`/<REPO>/`).
2. Google Cloud OAuth 동의 화면·Authorized redirect URI 생성/테스트.
3. Supabase Free 프로젝트 + Google provider 설정, 정확한 Redirect URL 등록.
4. 공공데이터포털에서 **한국천문연구원 특일 API 활용 신청·서비스 키 발급**.
5. VAPID 공개/개인키 쌍 생성(직접 생성 스크립트를 repo에 제공, 비밀키 저장 금지).
6. GitHub Actions Variables/Secrets, Supabase Edge Function Secrets, Vault 설정.
7. DB migration/RLS/Edge Functions/Cron 적용 및 인증 없는 접근 차단 확인.
8. 공식 공휴일 JSON 생성·정상 연도 확인, fallback 데이터 유지.
9. Pages GitHub Actions 배포 및 실 URL 방문.
10. 실제 로그인→Todo 작성→다른 기기 동기화→푸시 테스트→백업 복원 전 흐름 확인.

### 운영 체크 (무료 서비스)

| 빈도 | 점검 |
|---|---|
| 배포 때마다 | 빌드·타입·린트·테스트·secret scan, OAuth 및 SW smoke |
| 주 1회 | Supabase 프로젝트 상태, Push 실패/반송, DB/함수 사용량 |
| 매월 | 공휴일 캐시 갱신 시각, GitHub 예약 workflow 상태, 수동 재실행 가능 여부 |
| 분기 | JSON 백업/복구 리허설, 종속성/보안 업데이트, 무료 약관·쿼터 확인 |
| 장애 시 | 사용자에게 동기화·푸시 영향 안내, 기존 데이터 보호, 재가동 후 stale job 취소 |

## 18. 릴리스 완료 정의 (Definition of Done)

다음 항목을 **모두 만족**해야 `WEEKFLOW 1.0 완료`라고 말할 수 있다.

- [ ] `WEEKFLOW_01_PRODUCT_SPEC.md`의 FR-01~FR-18 모두 실제 구현·동작 증명.
- [ ] GitHub Pages 배포 URL을 확인했고 PC/모바일에서 접근 가능.
- [ ] Google 로그인, Supabase RLS, 데이터 CRUD, 기기 동기화 정상.
- [ ] Event/Task/블록/반복/이월/목표/마감/회고, 7칸 수행표 정확.
- [ ] 공휴일 공식 API 파이프라인과 실패 대체 UX 정상.
- [ ] **실제 Web Push 기기 수신** 완료(지원 브라우저). 권한 거부 시 동작 정상.
- [ ] 오프라인 편집·동시성 충돌·Undo·에러 처리가 사용자에게 보임.
- [ ] JSON 백업/병합/교체 복원 및 CSV 안전 출력 테스트 통과.
- [ ] RLS 침해 테스트, TypeScript/린트/단위/통합/E2E, 배포 smoke 통과.
- [ ] `README.md`, `DEPLOYMENT.md`, `OPERATIONS.md`, `SECURITY.md`, `TEST_REPORT.md` 완성.
- [ ] 실제 인증·API 키는 코드/로그/배포 번들에 없음.
- [ ] 미해결 제약·무료 플랜의 중지/푸시 불확실성을 사용자에게 알림.

## 19. AI 에이전트의 작업 중 상태 보고 형식

작업 에이전트는 매 작업 묶음이 끝날 때 아래 형식으로 짧게 보고한다.

```markdown
### 완료한 범위
- [구현한 UI/DB/API/파일]

### 실행 검증
- `npm ...`: PASS/FAIL (실행한 경우에만)
- DB/RLS: PASS/FAIL (실제 확인 내용)
- E2E/푸시: PASS/FAIL/환경 부족으로 미검증

### 남은 작업
- [남은 FR ID와 이유]

### 사용자가 직접 입력해야 하는 설정
- [계정/키/리다이렉션 URL 항목; 실제 비밀값은 받거나 공개 저장하지 않음]
```

- 질문은 필수 외부 권한/키가 없을 때만. 나머지는 명세의 기본값대로 개발하고 결정 근거를 기록한다.
- 외부 계정이 연결되지 않은 상태에서 배포·로그인·푸시를 실제로 성공했다고 주장하면 안 된다.
- 특정 Edge Function 라이브러리가 Supabase Deno 런타임에서 실패하면 검증된 대안으로 변경, 바뀐 이유·테스트 증빙을 남긴다.
- Scope를 임의 축소하거나 버튼을 장식만 구현하지 않는다.

## 20. 공식 문서·참고 링크 (작성 기준일: 2026-11-15)

- Vite GitHub Pages: <https://vite.dev/guide/static-deploy>
- GitHub Pages 정책/조건: <https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site>
- GitHub Pages Custom Workflows: <https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages>
- GitHub schedule 비활성/지연: <https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows>
- Supabase Pricing/Free: <https://supabase.com/pricing>
- Supabase project pausing: <https://supabase.com/docs/guides/platform/free-project-pausing>
- Supabase Auth Google: <https://supabase.com/docs/guides/auth/social-sign-in/auth-google>
- Supabase Redirect URLs: <https://supabase.com/docs/guides/auth/redirect-urls>
- Supabase RLS: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Supabase Schedule Functions: <https://supabase.com/docs/guides/functions/schedule-functions>
- Supabase Edge Function Limits: <https://supabase.com/docs/guides/functions/limits>
- 한국천문연구원 특일 API: <https://www.data.go.kr/data/15012690/openapi.do>
- Apple Web Push: <https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers>
- WebKit iOS Web Push: <https://webkit.org/blog/13878/>

---

**다음 문서:** `WEEKFLOW_03_AI_BUILD_PROMPT.md` — 개발 AI가 이 두 문서를 기준으로 프로젝트를 실제 생성·검증하도록 지시하는 복사/붙여넣기 전용 프롬프트.


---

# 3부. AI 바이브코딩 최종 프롬프트

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


---


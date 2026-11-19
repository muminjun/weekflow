# 보안 모델

개인 테이블 19개에 RLS가 활성화돼 있는 것을 실서버에서 조회했습니다(마이그레이션 001~013 기준). 014·015가 추가하는 dataset_versions, block_sessions, week_templates, calendar_feeds, client_errors도 모두 RLS를 켜며, 적용 후 실서버에서 다시 조회해 기록하세요. 사용자 소유자는 JWT auth.uid()로 결정하며 클라이언트의 user_id를 신뢰하지 않습니다. 브라우저는 SELECT와 허용 RPC만 사용합니다. 직접 INSERT/UPDATE/DELETE는 차단하고 expected_version과 멱등 UUID를 가진 원자적 RPC를 사용합니다.

복합 FK는 타인의 Task/Category/Goal/WeekTask 연결을 막습니다. 서버 트리거는 같은 주 연결, 요일 기록 범위, start_at에서 계산한 날짜, 15분 스냅, timezone, 가용 구간을 검증합니다. SECURITY DEFINER 함수는 고정 search_path와 내부 사용자 검사를 사용하고 PUBLIC/anon 실행을 철회합니다. 예약 큐/claim은 service_role 전용입니다.

인증은 Google OAuth PKCE입니다. 토큰을 백업·로그·공용 SW 캐시에 넣지 않습니다. Supabase SDK의 기기 세션과 사용자별 IndexedDB는 같은 origin의 스크립트에서 접근하므로 XSS 방어가 중요합니다. React escaping을 사용하며 사용자 HTML을 삽입하지 않습니다. 외부 Push endpoint는 HTTPS와 승인된 push provider 호스트만 허용해 SSRF를 제한합니다.

백업은 10MB 제한, Zod 검증, UUID/date/FK 검사, 서버 트랜잭션으로 보호합니다. 다른 계정 복원은 UUID와 자연 키를 사용자별로 매핑하며 다른 사용자의 행을 갱신하지 않습니다. CSV는 =,+,-,@로 시작하는 수식을 문자로 escape합니다.

로그아웃은 기기 Push 구독 해제와 현재 계정의 캐시·큐 정리를 시도합니다. 계정 삭제는 최근 로그인·정확한 확인 문자열·사용자 JWT를 요구하고 Auth 삭제 cascade로 개인 데이터를 지웁니다. 다른 기기의 데이터는 로그아웃만으로 삭제되지 않습니다.

GitHub Pages의 호스팅 특성상 사용자 지정 HTTP 보안 헤더를 모두 제어할 수 없습니다. 라이브러리·외부 스크립트 공급망을 점검하고 인증·서버 secret은 정적 자산에 두지 않습니다. 테스트 생성 계정은 검사 후 삭제하며 실제 사용자의 데이터를 테스트에 사용하지 않습니다.

## 브라우저 보안 헤더

GitHub Pages는 응답 헤더를 설정할 수 없어 빌드 시 `index.html`에 Content-Security-Policy와 Referrer-Policy `<meta>`를 넣습니다(`vite.config.ts`). 스크립트는 같은 출처만, 네트워크는 같은 출처와 Supabase 프로젝트만 허용합니다. `frame-ancestors`(클릭재킹 방지)는 meta로 지정할 수 없어 Pages에서는 적용되지 않습니다. 별도 호스팅으로 옮기면 헤더로 추가하세요.

백업 가져오기는 서버에서 10MB·10,000행으로 제한하고, 클라이언트 연결 검사는 집합 조회로 대용량에서도 멈추지 않습니다. 비밀값 스캔은 Supabase secret/access token, Google client secret, GitHub token, Anthropic key, VAPID/공휴일 키 할당 패턴을 검사하며 CI와 배포에서 실행됩니다.

## 015 추가 표면

- `block_sessions`, `week_templates`: RLS(소유자 SELECT만), 직접 쓰기 권한 없음. 쓰기는 `apply_changes`(expected_version, 멱등 UUID, 컬럼 allow-list)와 `import_backup`으로만 합니다. 세션은 `(block_id,user_id)` 복합 FK로 타인의 블록을 참조할 수 없고, 템플릿 블록의 `category_id`는 트리거가 소유 카테고리인지 검사합니다(`TEMPLATE_CATEGORY_FORBIDDEN`). 템플릿 수(30)와 열린 세션(1)은 사용자 advisory lock 안에서 검사하고, 열린 세션은 부분 unique index로도 막습니다. 다른 계정으로 복원할 때 세션의 `block_id`와 템플릿 블록의 `category_id`도 사용자별로 다시 매핑합니다. 대상 계정에 이미 실행 중인 세션이 있으면 백업의 열린 세션은 복원하지 않습니다.
- 캘린더 구독(`calendar-feed`, verify_jwt=false): URL 토큰이 유일한 자격 증명입니다. 토큰은 서버 CSPRNG(`gen_random_uuid()` 3개 = 48바이트, 무작위 366비트)를 base64url로 만든 64자이며 발급 시 한 번만 반환됩니다. DB에는 SHA-256 hex만 저장하고, `calendar_feeds`는 RLS가 켜져 있고 정책·권한이 없어 클라이언트가 읽을 수 없습니다. 회전은 이전 해시를 즉시 대체하고, 해지는 행을 삭제합니다. 조회 RPC는 service_role 전용이며 토큰당 분당 30회 고정 창을 행 잠금 안에서 원자적으로 셉니다. 잘못된 토큰은 DB 조회 전후 모두 404이며 존재 여부를 구분해 알리지 않습니다. 함수는 토큰·해시를 로그에 남기지 않지만, 쿼리 문자열의 토큰은 Supabase 게이트웨이 요청 로그에 남을 수 있고 캘린더 앱·공유 링크로 새어 나갈 수 있습니다. 토큰을 가진 사람은 블록 제목과 메모를 읽을 수 있으므로, 유출이 의심되면 회전하거나 해지하세요. 계정 삭제 시 cascade로 지워집니다.
- 오류 보고(`report_client_error`): authenticated 전용, 테이블은 클라이언트가 읽을 수 없습니다. 필드는 서버에서 잘라 저장합니다(message 500, stack 4000, url 500, user_agent 300, release 40자). 사용자당 시간당 30건을 넘으면 오류 없이 버립니다. 30일 후 `purge_expired_records()`가 삭제하고 계정 삭제 시 cascade됩니다. 클라이언트는 토큰·이메일·백업 내용이 메시지나 URL에 들어가지 않게 정리한 뒤 보내야 합니다.

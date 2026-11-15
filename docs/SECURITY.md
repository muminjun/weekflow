# 보안 모델

개인 테이블 19개에 RLS가 활성화돼 있는 것을 실서버에서 조회했습니다. 사용자 소유자는 JWT auth.uid()로 결정하며 클라이언트의 user_id를 신뢰하지 않습니다. 브라우저는 SELECT와 허용 RPC만 사용합니다. 직접 INSERT/UPDATE/DELETE는 차단하고 expected_version과 멱등 UUID를 가진 원자적 RPC를 사용합니다.

복합 FK는 타인의 Task/Category/Goal/WeekTask 연결을 막습니다. 서버 트리거는 같은 주 연결, 요일 기록 범위, start_at에서 계산한 날짜, 15분 스냅, timezone, 가용 구간을 검증합니다. SECURITY DEFINER 함수는 고정 search_path와 내부 사용자 검사를 사용하고 PUBLIC/anon 실행을 철회합니다. 예약 큐/claim은 service_role 전용입니다.

인증은 Google OAuth PKCE입니다. 토큰을 백업·로그·공용 SW 캐시에 넣지 않습니다. Supabase SDK의 기기 세션과 사용자별 IndexedDB는 같은 origin의 스크립트에서 접근하므로 XSS 방어가 중요합니다. React escaping을 사용하며 사용자 HTML을 삽입하지 않습니다. 외부 Push endpoint는 HTTPS와 승인된 push provider 호스트만 허용해 SSRF를 제한합니다.

백업은 10MB 제한, Zod 검증, UUID/date/FK 검사, 서버 트랜잭션으로 보호합니다. 다른 계정 복원은 UUID와 자연 키를 사용자별로 매핑하며 다른 사용자의 행을 갱신하지 않습니다. CSV는 =,+,-,@로 시작하는 수식을 문자로 escape합니다.

로그아웃은 기기 Push 구독 해제와 현재 계정의 캐시·큐 정리를 시도합니다. 계정 삭제는 최근 로그인·정확한 확인 문자열·사용자 JWT를 요구하고 Auth 삭제 cascade로 개인 데이터를 지웁니다. 다른 기기의 데이터는 로그아웃만으로 삭제되지 않습니다.

GitHub Pages의 호스팅 특성상 사용자 지정 HTTP 보안 헤더를 모두 제어할 수 없습니다. 라이브러리·외부 스크립트 공급망을 점검하고 인증·서버 secret은 정적 자산에 두지 않습니다. 테스트 생성 계정은 검사 후 삭제하며 실제 사용자의 데이터를 테스트에 사용하지 않습니다.

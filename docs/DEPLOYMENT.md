# 설정과 배포

## 생성된 리소스

GitHub `muminjun/weekflow`, Supabase `emhmmorcpamlenqxwmaw` (Free, ap-northeast-2), GCP `weekflow-planner-20261115`. 유료 플랜 또는 GCP 결제 계정을 연결하지 않았습니다.

## Google 로그인 설정 기록과 재설정 절차

Google MFA는 사용자가 직접 완료했습니다. 이후 OAuth 클라이언트 생성, 프로덕션 공개 전환, Supabase의 비밀값 연결은 에이전트가 완료했습니다. 아래는 재설정 시 참고할 절차입니다.

1. [Google Auth Platform](https://console.cloud.google.com/auth/overview?project=weekflow-planner-20261115)에서 Branding/Audience/Data Access를 설정합니다. 서비스명 WEEKFLOW, 범위는 `openid email profile`만 사용합니다. Testing 상태이면 사용할 Google 계정을 테스트 사용자로 추가하세요.
2. Clients → Create Client → Web application. Authorized redirect URI는 아래 **Supabase 콜백**입니다.

```text
https://emhmmorcpamlenqxwmaw.supabase.co/auth/v1/callback
```

3. [Supabase Auth providers](https://supabase.com/dashboard/project/emhmmorcpamlenqxwmaw/auth/providers) → Google에서 Client ID / Secret을 저장하고 활성화합니다. Secret은 GitHub 또는 프런트에 넣지 않습니다.
4. Supabase URL Configuration의 Site URL과 Redirect URLs에는 **앱 주소**를 등록합니다. 이미 아래 값으로 구성했습니다.

```text
https://muminjun.github.io/weekflow/
http://127.0.0.1:5173/weekflow/
http://localhost:5173/weekflow/
```

Google URI에 Pages URL을 넣거나 Supabase 허용 redirect에 `/#/planner`만 넣는 것을 피하세요. PKCE callback은 해시가 없는 앱 루트로 돌아옵니다. Google provider 활성화 전에는 앱이 로그인 버튼을 비활성화하고 준비 중임을 알립니다. 이메일·익명 가입은 비활성화했습니다.

## 환경변수

| 이름 | 위치 | 공개 여부 |
|---|---|---|
| VITE_SUPABASE_URL | GitHub Repository Variables / .env.local | 공개 |
| VITE_SUPABASE_PUBLISHABLE_KEY | 같은 위치 | 공개 (RLS 필수) |
| VITE_VAPID_PUBLIC_KEY | 같은 위치 | 공개 |
| VITE_BASE_PATH | 같은 위치, `/weekflow/` | 공개 |
| KASI_SERVICE_KEY | GitHub Actions Secret | 비공개 |
| VAPID_PRIVATE_KEY | Supabase Edge Secrets | 비공개 |
| VAPID_PUBLIC_KEY | Supabase Edge Secrets | 공개값이지만 서버에도 설정 |
| CRON_SECRET | Supabase Edge Secrets + Vault | 비공개 |
| Google client secret | Supabase Google Provider | 비공개 |

VAPID·Cron은 이미 생성·등록했습니다. `scripts/provision-secrets.py`는 초기 구성용이며 기본적으로 기존 키 교체를 거부합니다. 키를 회전하면 모든 기기가 다시 구독해야 합니다. DB 비밀번호는 초기 생성 때 난수로 생성하고 저장하지 않았습니다. 필요하면 Supabase Settings → Database에서 재설정하세요.

## DB와 Edge

`supabase/migrations/*.sql`을 순서대로 적용합니다. 이 프로젝트의 초기 마이그레이션은 Management API로 실제 적용했습니다. CLI를 새 환경에 연결해 이력을 맞추기 전에 기존 스키마를 재실행하지 마세요. `scripts/manage-supabase.py`는 macOS Keychain의 기존 CLI token 또는 SUPABASE_ACCESS_TOKEN을 프로세스에서 읽으며 값을 출력하지 않습니다.

```bash
supabase functions deploy --project-ref emhmmorcpamlenqxwmaw --use-api
```

push-subscription / delete-account는 JWT gateway와 함수 내부 getUser 검증을 모두 사용합니다. dispatch-push만 사용자 JWT 대신 Vault secret을 검사하므로 verify_jwt=false이며, 인증 없는 요청은 403입니다. Cron은 5분 간격, HTTP 제한은 120초입니다. `python3 scripts/configure-cron.py`로 키를 교체하지 않고 `supabase/cron.sql`을 적용할 수 있습니다. 기본 5초 제한은 Edge cold start보다 짧을 수 있습니다. `cron.job_run_details` 성공은 요청 접수만 의미하므로 `net._http_response`의 상태도 확인하세요. 원격 호출·Cron 설정에 실제 secret을 문서에 복사하지 마세요.

## 공휴일

[한국천문연구원 특일 API](https://www.data.go.kr/data/15012690/openapi.do)를 신청한 후 GitHub Settings → Secrets and variables → Actions에 `KASI_SERVICE_KEY`를 저장합니다. Actions → Refresh official holidays and deploy → Run workflow. 연도별 12개월을 모두 검증해야 complete=true JSON이 생성됩니다. 미래 미공개 연도·부분 실패는 마지막 정상 파일을 보존하고 실패로 표시합니다. 현재 정상 운영 캐시는 임의 생성하지 않았습니다.

## GitHub Pages

Settings → Pages → Source: GitHub Actions. 공개 저장소에 main을 push하면 deploy-pages.yml이 타입·린트·단위·DB(PGlite)·의존성 감사·비밀값 스캔·브라우저 검사를 실행하고 dist를 배포합니다. 새 저장소를 쓸 때는 세 공개 VITE 변수와 VITE_BASE_PATH를 먼저 설정하세요. 브라우저 새로고침, Hash 경로, manifest scope, SW scope, OAuth 복귀, 휴일 JSON을 실URL에서 확인합니다.

참고: [Vite Pages 배포](https://vite.dev/guide/static-deploy), [Supabase Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Cron](https://supabase.com/docs/guides/functions/schedule-functions).

## 2026-11-16 연결 확인

기존 공공데이터포털 승인 계정의 KASI 키를 GitHub Actions Secret에 직접 등록했습니다. 키를 재발급하거나 소스에 저장하지 않았습니다. 2025·2026·2027년 각 12개월을 실제 API에서 조회해 전체 검증 캐시를 생성했습니다. Supabase Auth의 Google enabled=true, email/anonymous=false와 Google Cloud의 프로덕션 단계를 직접 확인했습니다.

GitHub Pages 실배포, 실제 Google 로그인과 클라우드 저장·새로고침 유지, Mac Chrome Push 수신을 확인했습니다. 배포 환경의 브랜치 정책은 main입니다. DB 마이그레이션 001~013이 적용되어 있습니다. **014_reliability_fixes.sql과 015_focus_templates_feed_errors.sql은 아직 적용 전**입니다(알림 재예약, 상태만 바꾸는 블록 수정의 겹침 오류, 시간대 검증, 백업 복원 순서, Push 공유 기기 정리, 보존 기간 정리, `dataset_version()`). 적용 후 `supabase/cron.sql`의 `weekflow-retention` 작업을 등록하고 기존 세 Edge Function을 다시 배포한 뒤 `calendar-feed`를 `--no-verify-jwt`로 새로 배포하세요. 클라이언트는 `dataset_version()`이 없으면 5분 간격 전체 새로고침으로 자동 대체합니다. 모바일 기기와 알림 클릭 검증은 테스트 보고서의 남은 항목을 따릅니다.

## UI 외관 및 업데이트 검수

2026-11-16 개편도 기존 `main` → Quality gates / Deploy Pages 흐름으로 배포한다. 별도 호스팅이나 Supabase 변경이 없다. 외관 초기 적용 파일 `appearance.js`는 SW 사전 캐시에 포함되고 그 내용이 캐시 버전 해시에 들어간다. `public/sw.js`의 HTTP cache reload와 공개 정적 리소스 ignoreVary 처리는 유지한다.

배포 검수는 `node scripts/verify-ui.mjs https://muminjun.github.io/weekflow/ live-redesign`로 반복할 수 있다. 새 격리 브라우저에서 메모리 체험만 사용해 PC/모바일 UI, 실제 폰트, 스크롤, SW 제어, 오프라인 재실행과 외관 유지를 검사하며 실제 계정에 쓰지 않는다. 실제 계정 검수는 별도 새 창에서 미전송 변경과 열린 폼을 먼저 확인하고 기존 ‘새 버전 열기’를 사용한다. 이번 UI 커밋의 실제 배포와 기존 로그인 세션의 업데이트 결과는 TEST_REPORT에 기록했다.

## 015 집중 기록·주 템플릿·캘린더 구독·오류 보고 (미적용)

`supabase/migrations/015_focus_templates_feed_errors.sql`은 014 다음에 적용합니다. 014가 먼저 적용되어 있어야 합니다(`apply_changes`, `import_backup`, `read_dataset`, `purge_expired_records`를 014 정의 위에 다시 정의하고 `touch_dataset_version()`을 재사용합니다). 실DB에는 아직 적용하지 않았습니다.

| 추가 | 내용 |
|---|---|
| `block_sessions` | 집중 세션. `time_blocks`와 같은 사용자 복합 FK, 블록 삭제 시 cascade. 사용자당 열린 세션(ended_at null) 1개 |
| `week_templates` | 주 템플릿. 사용자당 30개, blocks ≤ 200, goals ≤ 20 |
| `calendar_feeds` | 구독 토큰의 SHA-256 해시만 저장. 클라이언트 비공개 |
| `client_errors` | 클라이언트 오류 보고. 클라이언트 읽기 불가, 30일 보존 |
| RPC (authenticated) | `rotate_calendar_feed() → text`, `revoke_calendar_feed()`, `calendar_feed_status() → jsonb`, `report_client_error(p jsonb)` |
| RPC (service_role) | `calendar_feed_events(p_token_hash text) → jsonb` (Edge Function 전용) |

적용 순서:

1. 015 SQL을 적용합니다(Management API 또는 `supabase db push`; 기존 이력과 맞춘 뒤).
2. `supabase/cron.sql`의 `weekflow-retention`이 이미 등록되어 있으면 다시 등록할 필요가 없습니다. 같은 `purge_expired_records()`가 이제 `client_errors`도 30일 후 삭제합니다.
3. 캘린더 구독 함수를 배포합니다. `supabase/config.toml`의 `[functions.calendar-feed] verify_jwt = false`가 필요합니다(캘린더 앱은 JWT를 보낼 수 없음). 새 secret은 없으며 기본 제공 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`만 사용합니다.

```bash
supabase functions deploy calendar-feed --project-ref emhmmorcpamlenqxwmaw --use-api --no-verify-jwt
```

구독 URL 형식: `https://emhmmorcpamlenqxwmaw.supabase.co/functions/v1/calendar-feed?token=<rotate_calendar_feed() 반환값>`. 지난 30일~앞으로 90일의 건너뛰지 않은 블록(일정 제목, Todo 블록은 Todo 제목)을 `text/calendar`로 반환합니다. 응답 코드: 200, 404(형식 오류·알 수 없는/회전된/해지된 토큰), 429(토큰당 분당 30회 초과, `Retry-After`), 405(GET/HEAD 외), 500. `Cache-Control: private, max-age=300`. 확인은 실제 계정에서 토큰을 발급받아 `curl -I`로 200과 `Content-Type: text/calendar`를 보고, 토큰을 회전한 뒤 이전 URL이 404인지 봅니다. 토큰을 문서·이슈·로그에 붙여넣지 마세요.

`scripts/check-edge.sh`(`npm run check:edge`)가 새 진입점을 타입 검사하고, `npm run test:integration`이 PGlite에서 015를 포함한 전체 마이그레이션을 검증합니다.

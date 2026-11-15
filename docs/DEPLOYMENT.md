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

push-subscription / delete-account는 JWT gateway와 함수 내부 getUser 검증을 모두 사용합니다. dispatch-push만 사용자 JWT 대신 Vault secret을 검사하므로 verify_jwt=false이며, 인증 없는 요청은 403입니다. Cron은 5분 간격입니다. 원격 호출·Cron 설정에 실제 secret을 문서에 복사하지 마세요.

## 공휴일

[한국천문연구원 특일 API](https://www.data.go.kr/data/15012690/openapi.do)를 신청한 후 GitHub Settings → Secrets and variables → Actions에 `KASI_SERVICE_KEY`를 저장합니다. Actions → Refresh official holidays and deploy → Run workflow. 연도별 12개월을 모두 검증해야 complete=true JSON이 생성됩니다. 미래 미공개 연도·부분 실패는 마지막 정상 파일을 보존하고 실패로 표시합니다. 현재 정상 운영 캐시는 임의 생성하지 않았습니다.

## GitHub Pages

Settings → Pages → Source: GitHub Actions. 공개 저장소에 main을 push하면 deploy-pages.yml이 타입·린트·단위/DB·브라우저 검사를 실행하고 dist를 배포합니다. 새 저장소를 쓸 때는 세 공개 VITE 변수와 VITE_BASE_PATH를 먼저 설정하세요. 브라우저 새로고침, Hash 경로, manifest scope, SW scope, OAuth 복귀, 휴일 JSON을 실URL에서 확인합니다.

참고: [Vite Pages 배포](https://vite.dev/guide/static-deploy), [Supabase Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Cron](https://supabase.com/docs/guides/functions/schedule-functions).

## 2026-11-16 연결 확인

기존 공공데이터포털 승인 계정의 KASI 키를 GitHub Actions Secret에 직접 등록했습니다. 키를 재발급하거나 소스에 저장하지 않았습니다. 2025·2026·2027년 각 12개월을 실제 API에서 조회해 전체 검증 캐시를 생성했습니다. Supabase Auth의 Google enabled=true, email/anonymous=false와 Google Cloud의 프로덕션 단계를 직접 확인했습니다.

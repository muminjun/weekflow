import { userMessage } from "../ui/errors";
import { AppearanceMenu } from "../ui/ThemeControls";
import { ArrowUpRight, MoveRight } from "lucide-react";
import { login, supabase } from "../data/supabase";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
export function Login({ onPreview }: { onPreview: () => void }) {
  const [error, setError] = useState("");
  const auth = useQuery({
    queryKey: ["auth-capabilities"],
    queryFn: async () => {
      if (!supabase) return false;
      const res = await fetch(
        import.meta.env.VITE_SUPABASE_URL + "/auth/v1/settings",
        { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } },
      );
      if (!res.ok) throw Error("AUTH_UNAVAILABLE");
      const data = (await res.json()) as { external?: { google?: boolean } };
      return data.external?.google === true;
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
  return (
    <main className="login-page">
      <div className="login-appearance">
        <AppearanceMenu />
      </div>
      <header className="login-brand">
        WEEKFLOW<span> A LITTLE STRUCTURE. MORE FLOW.</span>
      </header>
      <div className="login-content">
        <div className="eyebrow">YOUR WEEK, ON ONE PAGE</div>
        <h1>
          할 일은 가볍게.
          <br />한 주는 <mark>나답게.</mark>
        </h1>
        <p>
          머릿속 할 일을 이번 주의 빈 시간으로.
          <br />
          계획하고, 실행하고, 나의 흐름을 기록하세요.
        </p>
        <button
          className="primary google-button"
          onClick={() => void login().catch((e) => setError(userMessage(e)))}
          disabled={!supabase || auth.data !== true}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M21.6 12.2c0-.7-.1-1.4-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.6ZM12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.6c-.9.6-2 .9-3.4.9-2.6 0-4.9-1.8-5.7-4.2H2.9v2.6A10 10 0 0 0 12 22ZM6.3 13.7a6 6 0 0 1 0-3.4V7.7H2.9a10 10 0 0 0 0 8.6l3.4-2.6ZM12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-3A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9.1 5.7l3.4 2.6A6 6 0 0 1 12 6.1Z"
            />
          </svg>
          Google로 시작하기
          <ArrowUpRight size={18} />
        </button>
        {(!supabase || auth.data === false) && (
          <p role="status" className="login-readiness">
            로그인 준비 중입니다. 플래너를 먼저 둘러보세요.
            <button className="text-button" onClick={() => void auth.refetch()}>
              다시 확인
            </button>
          </p>
        )}
        {auth.isError && (
          <p role="alert" className="error">
            인증서비스 연결을 확인할 수 없습니다.
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="text-button preview-link" onClick={onPreview}>
          저장 없이 플래너 둘러보기 <MoveRight size={18} />
        </button>
        <small>
          개인 데이터는 로그인한 계정에만 저장됩니다.
          <br />
          Google 인증 정보는 Supabase Auth에서 안전하게 처리합니다.
        </small>
      </div>
      <div className="login-paper" aria-hidden="true">
        <div className="mini-heading">
          <b>11</b>
          <span>MY WEEKLY FLOW</span>
        </div>
        <div className="mini-week">
          {["M", "T", "W", "T", "F", "S", "S"].map((v, i) => (
            <div key={i}>
              {v}
              <span className="mini-date">{9 + i}</span>
              <div className="mini-grid">
                {i < 5 && (
                  <>
                    <span className={`mini-block mini-b${i % 3}`}>
                      한 걸음씩
                    </span>
                    <span className={`mini-block mini-c${i % 3}`}>
                      나의 시간
                    </span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mini-footer">LESS OVERWHELM. MORE INTENTION.</div>
      </div>
      <footer>
        <span>
          <a href={`${import.meta.env.BASE_URL}privacy.html`}>
            개인정보 처리 안내
          </a>{" "}
          · <a href={`${import.meta.env.BASE_URL}terms.html`}>이용 안내</a>
        </span>
        계획은 여유롭게, 실행은 꾸준하게.<span>© WEEKFLOW</span>
      </footer>
    </main>
  );
}

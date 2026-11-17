import { FormFeedback } from "./ui/FormFeedback";
import { TooltipHost } from "./ui/TooltipHost";
import { ConfirmationHost } from "./ui/Confirmations";
import { confirmAction } from "./ui/Confirmations";
import { userMessage } from "./ui/errors";
import React, { useEffect, useState, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter } from "react-router-dom";
import { supabase } from "./data/supabase";
import { usePlanner } from "./data/usePlanner";
import { demoData } from "./data/demo";
import type { Dataset } from "./domain/types";
import { today, weekOf } from "./domain/planner";
import { Login } from "./components/Login";
const Planner = lazy(() =>
  import("./components/Planner").then((m) => ({ default: m.Planner })),
);
import { pushAction } from "./data/push";
import "./styles.css";
import { PwaUpdate } from "./components/PwaUpdate";
const query = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>화면을 불러오지 못했습니다.</h1>
        <p role="alert">{userMessage(this.state.error)}</p>
        <button onClick={() => location.reload()}>다시 열기</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
function App() {
  const [user, setUser] = useState<string | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [preview, setPreview] = useState<Dataset | null>(null);
  const store = usePlanner(user, preview);
  const setError = store.setError;
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setUser(data.session?.user.id ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user.id ?? null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [setError]);
  async function logout() {
    if (preview) {
      setPreview(null);
      return;
    }
    if (
      !(await confirmAction(
        "로그아웃하면 이 기기의 미전송 변경과 캐시가 삭제됩니다. 계속할까요?",
      ))
    )
      return;
    try {
      await pushAction("unsubscribe");
    } catch {
      /* unsupported/unsubscribed devices still clear private cache */
    }
    await store.clear();
    const { error } = await supabase!.auth.signOut();
    if (error) throw error;
    setUser(null);
  }
  if (!ready)
    return (
      <main className="loading">
        WEEKFLOW <span>계정을 확인하고 있어요…</span>
      </main>
    );
  if (!user && !preview)
    return <Login onPreview={() => setPreview(demoData(weekOf(today())))} />;
  if (!store.data || (!preview && store.data.profile.id !== user))
    return (
      <main className="loading">
        WEEKFLOW{" "}
        <span>
          {store.error ? userMessage(store.error) : "이번 주를 펼치고 있어요…"}
        </span>
        <button onClick={() => void store.flush()}>다시 시도</button>
        <button onClick={() => void logout()}>로그아웃</button>
      </main>
    );
  return (
    <Suspense
      fallback={
        <main className="loading">
          WEEKFLOW<span>플래너를 펼치고 있어요…</span>
        </main>
      }
    >
      <Planner
        store={store}
        data={store.data}
        preview={!!preview}
        onLogout={logout}
      />
    </Suspense>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={query}>
        <HashRouter>
          <PwaUpdate />
          <App />
          <ConfirmationHost />
          <TooltipHost />
          <FormFeedback />
        </HashRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState, useRef } from "react";
import { X, ArrowRight, Check } from "lucide-react";
export const coachmarkKey = "weekflow.coach.v1";
const steps = [
  {
    title: "생각나는 할 일부터 적어보세요",
    body: "한 줄을 적고 Enter를 누르면 이번 주 할 일에 담겨요. 모바일에서는 아래 ‘할 일’을 눌러 시작해요.",
    desktop: ".inline-task",
    mobile: ".mobile-toolbar .primary",
  },
  {
    title: "빈 시간을 나의 계획으로",
    body: "할 일을 끌어 배치하거나, 빈 시간을 두 번 눌러 일정을 만드세요. 시간은 15분 단위로 정확하게 움직여요.",
    desktop: ".timeline-grid",
    mobile: ".timeline-grid",
  },
  {
    title: "보고 싶은 시간에 집중하세요",
    body: "화면 맞춤, 전체 24시간, 내 설정 범위를 선택하세요. 범위 밖 일정도 개수와 목록으로 확인할 수 있어요.",
    desktop: ".calendar-toolbar",
    mobile: ".calendar-toolbar",
  },
  {
    title: "내 취향대로 바꾸는 화면",
    body: "팔레트에서 밝은 테마와 다크, 큰 글자를 선택하세요. 이 브라우저에 기억해 둘게요.",
    desktop: 'button[aria-label="외관 / 테마"]',
    mobile: 'button[aria-label="외관 / 테마"]',
  },
  {
    title: "한 주의 끝은 가벼운 회고",
    body: "완료한 계획을 돌아보고, 다음 주의 흐름을 정리하세요. 사용법은 설정에서 언제든 다시 볼 수 있어요.",
    desktop: ".review-entry",
    mobile: ".mobile-toolbar>button:last-child",
  },
];
function unseen() {
  try {
    return localStorage.getItem(coachmarkKey) !== "done";
  } catch {
    return true;
  }
}
export function Coachmarks({
  enabled,
  autoStart = true,
}: {
  enabled: boolean;
  autoStart?: boolean;
}) {
  const [replaying, setReplaying] = useState(false);
  const active = enabled && (autoStart || replaying);
  const [open, setOpen] = useState(unseen),
    [step, setStep] = useState(0);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    arrow: number;
    above: boolean;
    target: { top: number; left: number; width: number; height: number };
  } | null>(null);
  const content = useRef<HTMLDivElement>(null);
  function finish() {
    setOpen(false);
    try {
      localStorage.setItem(coachmarkKey, "done");
    } catch {
      /* Device storage is optional. */
    }
  }
  useEffect(() => {
    const replay = () => {
      setStep(0);
      setReplaying(true);
      setOpen(true);
    };
    window.addEventListener("weekflow:show-coach", replay);
    return () => window.removeEventListener("weekflow:show-coach", replay);
  }, []);
  useEffect(() => {
    if (!open || !active) return;
    let frame = 0;
    const update = () => {
      let el = document.querySelector<HTMLElement>(
        innerWidth < 768 ? steps[step].mobile : steps[step].desktop,
      );
      if (!el || el.getBoundingClientRect().width === 0)
        el = document.querySelector<HTMLElement>(
          'button[aria-label="빠른 추가"]',
        );
      if (!el) return;
      const b = el.getBoundingClientRect(),
        width = Math.min(340, innerWidth - 24),
        height = content.current?.getBoundingClientRect().height || 230;
      const left = Math.max(
        12,
        Math.min(innerWidth - width - 12, b.left + b.width / 2 - width / 2),
      );
      const above = b.bottom + height + 20 > innerHeight;
      setPosition({
        left,
        top: Math.max(
          12,
          Math.min(
            innerHeight - height - 12,
            above ? b.top - height - 12 : b.bottom + 12,
          ),
        ),
        above,
        arrow: Math.max(20, Math.min(width - 20, b.left + b.width / 2 - left)),
        target: {
          top: b.top - 3,
          left: b.left - 3,
          width: b.width + 6,
          height: b.height + 6,
        },
      });
    };
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(resize);
    for (const selector of [
      ".planner-body",
      ".planner-heading",
      ".app-header",
      innerWidth < 768 ? steps[step].mobile : steps[step].desktop,
    ]) {
      const target = document.querySelector(selector);
      if (target) observer.observe(target);
    }
    const mutations = new MutationObserver(resize);
    mutations.observe(document.body, { childList: true, subtree: true });
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", resize, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", resize, true);
    };
  }, [step, open, active]);
  if (!open || !active) return null;
  return (
    <Dialog.Root
      open
      modal={false}
      onOpenChange={(value) => {
        if (!value) finish();
      }}
    >
      <Dialog.Portal>
        {position && (
          <div
            className="coach-spotlight"
            style={position.target}
            aria-hidden="true"
          />
        )}
        <Dialog.Content
          ref={content}
          className="coachmark"
          aria-label="WEEKFLOW 사용법"
          aria-labelledby={undefined}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() =>
              requestAnimationFrame(() =>
                content.current
                  ?.querySelector<HTMLButtonElement>(".coach-next")
                  ?.focus(),
              ),
            );
          }}
          style={
            {
              top: position?.top ?? 12,
              left: position?.left ?? 12,
              "--coach-arrow": `${position?.arrow ?? 24}px`,
              visibility: position ? "visible" : "hidden",
            } as React.CSSProperties
          }
          data-above={position?.above}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="coach-top">
            <span>
              {step + 1} / {steps.length}
            </span>
            <Dialog.Close aria-label="사용법 닫기">
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Title aria-live="polite">{steps[step].title}</Dialog.Title>
          <Dialog.Description>{steps[step].body}</Dialog.Description>
          <div className="coach-actions">
            <button type="button" onClick={finish}>
              건너뛰기
            </button>
            {step > 0 && (
              <button type="button" onClick={() => setStep((s) => s - 1)}>
                이전
              </button>
            )}
            <button
              type="button"
              className="coach-next"
              onClick={() => {
                if (step === steps.length - 1) finish();
                else setStep((s) => s + 1);
              }}
            >
              {step === steps.length - 1 ? (
                <>
                  시작하기
                  <Check size={17} />
                </>
              ) : (
                <>
                  다음
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

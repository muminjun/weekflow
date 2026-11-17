import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
export function TooltipHost() {
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const hide = () => {
      clearTimeout(timer);
      setTooltip(null);
    };
    const show = (event: Event) => {
      if (window.matchMedia?.("(hover: none)").matches) return;
      if (event instanceof PointerEvent && event.pointerType === "touch")
        return;
      clearTimeout(timer);
      const el =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-tooltip]")
          : null;
      if (!el) {
        setTooltip(null);
        return;
      }
      timer = setTimeout(
        () => {
          const rect = el.getBoundingClientRect();
          setTooltip({
            text: el.dataset.tooltip!,
            x: Math.max(
              8,
              Math.min(innerWidth - 288, rect.left + rect.width / 2 - 140),
            ),
            y:
              rect.bottom + 10 > innerHeight - 80
                ? Math.max(8, rect.top - 76)
                : rect.bottom + 8,
          });
        },
        event.type === "focusin" ? 0 : 450,
      );
    };
    document.addEventListener("pointerover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("keydown", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("keydown", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);
  return tooltip
    ? createPortal(
        <div
          className="app-tooltip"
          role="tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>,
        document.body,
      )
    : null;
}

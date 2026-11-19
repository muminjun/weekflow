import { confirmAction } from "../ui/Confirmations";
import { useVisualViewport } from "../ui/useVisualViewport";
import { AppearanceMenu } from "../ui/ThemeControls";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
function values(form: HTMLFormElement) {
  return JSON.stringify(
    [...new FormData(form)].map(([key, value]) => [
      key,
      typeof value === "string"
        ? value
        : `${value.name}:${value.size}:${value.lastModified}`,
    ]),
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  guardChanges = false,
  dismissible = true,
  description,
}: {
  title: string;
  dismissible?: boolean;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  guardChanges?: boolean;
}) {
  const snapshots = useRef(new Map<HTMLFormElement, string>());
  const confirming = useRef(false);
  async function requestClose() {
    if (confirming.current || !dismissible) return;
    const dirty =
      guardChanges &&
      [...snapshots.current].some(
        ([form, initial]) => form.isConnected && values(form) !== initial,
      );
    if (dirty) {
      confirming.current = true;
      const discard = await confirmAction(
        "지금 닫으면 저장하지 않은 내용이 사라져요.",
        {
          title: "작성 중인 내용이 있어요",
          confirmLabel: "저장하지 않고 닫기",
          cancelLabel: "계속 작성",
        },
      );
      confirming.current = false;
      if (!discard) return;
    }
    onClose();
  }
  const viewportStyle = useVisualViewport();
  const opener = useRef(document.activeElement as HTMLElement | null);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) void requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          ref={(node) => {
            // Autofocused fields skip Radix's open-autofocus event, so the
            // baseline is captured once controls have applied their defaults.
            if (!node || !guardChanges) return;
            const frame = requestAnimationFrame(() => {
              for (const form of node.querySelectorAll("form"))
                if (!snapshots.current.has(form))
                  snapshots.current.set(form, values(form));
            });
            return () => cancelAnimationFrame(frame);
          }}
          onOpenAutoFocus={(e) => {
            // Start in the content, not on the heading's appearance menu.
            const target = e.currentTarget as HTMLElement;
            const first = target.querySelector<HTMLElement>(
              ".modal-body :is(input:not([type=hidden]):not([disabled]), textarea, select, button:not([disabled]), [href], [tabindex]:not([tabindex='-1']))",
            );
            if (first) {
              e.preventDefault();
              first.focus();
            }
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
          }}
          style={viewportStyle}
          className={`modal ${wide ? "wide" : ""}`}
        >
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <AppearanceMenu />
            {dismissible && (
              <Dialog.Close className="icon-button" aria-label="닫기">
                <X size={20} />
              </Dialog.Close>
            )}
          </div>
          <Dialog.Description className="sr-only">
            {description ?? `${title} 설정과 편집`}
          </Dialog.Description>
          <div className="modal-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

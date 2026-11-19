import { useSyncExternalStore, useRef } from "react";
import { Modal } from "../components/Modal";
type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};
type Request = {
  options?: ConfirmOptions;
  kind: "confirm" | "prompt" | "alert";
  message: string;
  resolve: (value: string | boolean | null) => void;
};
let current: Request | null = null;
const queue: Request[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function ask(kind: Request["kind"], message: string, options?: ConfirmOptions) {
  return new Promise<string | boolean | null>((resolve) => {
    queue.push({ kind, message, resolve, options });
    if (!current) current = queue.shift()!;
    emit();
  });
}
export async function confirmAction(message: string, options?: ConfirmOptions) {
  return (await ask("confirm", message, options)) === true;
}
export async function promptAction(message: string) {
  return (await ask("prompt", message)) as string | null;
}
export async function alertAction(message: string) {
  await ask("alert", message);
}
function finish(value: string | boolean | null) {
  const request = current;
  current = queue.shift() ?? null;
  emit();
  request?.resolve(value);
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function ConfirmationHost() {
  const request = useSyncExternalStore(subscribe, () => current);
  const input = useRef<HTMLInputElement>(null);
  if (!request) return null;
  return (
    <Modal
      title={
        request.options?.title ??
        (request.kind === "alert" ? "안내" : "변경 확인")
      }
      description={request.message}
      onClose={() => finish(request.kind === "prompt" ? null : false)}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          finish(
            request.kind === "prompt" ? (input.current?.value ?? "") : true,
          );
        }}
      >
        <p className="confirmation-message">{request.message}</p>
        {request.kind === "prompt" && (
          <label>
            확인 내용
            <input ref={input} autoFocus required autoComplete="off" />
          </label>
        )}
        <div className="form-actions">
          {request.kind !== "alert" && (
            <button
              type="button"
              onClick={() => finish(request.kind === "prompt" ? null : false)}
            >
              {request.options?.cancelLabel ?? "취소"}
            </button>
          )}
          <button
            className={`primary ${/영구 삭제/.test(request.message) ? "destructive" : ""}`}
          >
            {request.options?.confirmLabel ??
              (request.kind === "alert"
                ? "확인"
                : request.kind === "prompt"
                  ? "입력한 내용으로 진행"
                  : request.message.includes("겹")
                    ? "겹쳐서 배치"
                    : "계속")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { AlertCircle, X } from "lucide-react";
/** Keep native constraint validation, replace browser-specific validation balloons. */
export function FormFeedback() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    let first:
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null = null;
    let frame = 0;
    const invalid = (e: Event) => {
      const target = e.target;
      if (!(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ))
        return;
      e.preventDefault();
      if (target.hidden || first) return;
      first = target;
      const validity = target.validity;
      const message = validity.customError
        ? target.validationMessage
        : validity.valueMissing
          ? "필수 항목을 입력해 주세요."
          : validity.rangeUnderflow || validity.rangeOverflow
            ? "입력 가능한 범위를 확인해 주세요."
            : validity.stepMismatch
              ? "입력 단위를 확인해 주세요."
              : "입력 형식을 확인해 주세요.";
      setMessage(message);
      target.setAttribute("aria-invalid", "true");
      target.setAttribute("data-form-error", "true");
      frame = requestAnimationFrame(() => {
        first?.focus();
        first = null;
      });
    };
    const input = (e: Event) => {
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        if (target.validity.valid && target.dataset.formError) {
          target.removeAttribute("aria-invalid");
          delete target.dataset.formError;
          setMessage("");
        }
      }
    };
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("input", input, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("invalid", invalid, true);
      document.removeEventListener("input", input, true);
    };
  }, []);
  return message ? (
    <div className="form-feedback" role="alert">
      <AlertCircle size={20} />
      <span>{message}</span>
      <button
        type="button"
        className="icon-button"
        aria-label="입력 안내 닫기"
        onClick={() => setMessage("")}
      >
        <X size={18} />
      </button>
    </div>
  ) : null;
}

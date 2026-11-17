import { useState, useSyncExternalStore } from "react";
import { Check, Palette } from "lucide-react";
import {
  getAppearance,
  setAppearance,
  subscribeAppearance,
  themes,
  type Appearance,
} from "./appearance";
import { SegmentedControl } from "./Controls";
export function ThemeControls() {
  const value = useSyncExternalStore(subscribeAppearance, getAppearance);
  const [saved, setSaved] = useState(true);
  function update(next: Appearance) {
    setSaved(setAppearance(next));
  }
  return (
    <div className="theme-controls">
      <p className="field-label">색상 테마</p>
      <div className="theme-options">
        {themes.map((theme) => (
          <button
            type="button"
            key={theme.id}
            aria-pressed={value.theme === theme.id}
            onClick={() => update({ ...value, theme: theme.id })}
          >
            <span
              className="theme-swatch"
              style={{ background: theme.background, borderColor: theme.color }}
            >
              <i style={{ background: theme.color }} />
              {value.theme === theme.id && (
                <Check size={16} style={{ color: theme.color }} />
              )}
            </span>
            <span>{theme.name}</span>
          </button>
        ))}
      </div>
      <p className="field-label">글자 크기</p>
      <SegmentedControl
        label="글자 크기"
        value={value.text}
        options={[
          { value: "default", label: "기본" },
          { value: "large", label: "크게" },
        ]}
        onChange={(text) => update({ ...value, text })}
      />
      <p className="helper-text" role="status">
        {saved
          ? "이 브라우저에 저장됩니다. 계정 간 동기화되지 않아요."
          : "브라우저 저장이 제한되어 이번 화면에만 적용됩니다."}
      </p>
    </div>
  );
}
export function AppearanceMenu() {
  return (
    <details className="appearance-menu">
      <summary aria-label="외관 바꾸기" data-tooltip="외관 바꾸기">
        <Palette size={20} />
      </summary>
      <div className="appearance-popover">
        <ThemeControls />
      </div>
    </details>
  );
}

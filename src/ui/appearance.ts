export type Appearance = {
  theme: "blue" | "lime" | "mint" | "dark";
  text: "default" | "large";
};
export const appearanceKey = "weekflow.appearance.v1";
export const themes = [
  { id: "blue", name: "클린 블루", color: "#3182f6", background: "#f3f6fb" },
  { id: "lime", name: "페이퍼 라임", color: "#526b15", background: "#f7f6ee" },
  { id: "mint", name: "소프트 민트", color: "#086f5d", background: "#f1f8f5" },
  { id: "dark", name: "다크", color: "#81b4ff", background: "#101013" },
] as const;
export function readAppearance(storage: Pick<Storage, "getItem">): Appearance {
  try {
    const value: unknown = JSON.parse(storage.getItem(appearanceKey) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "theme" in value &&
      "text" in value &&
      themes.some((t) => t.id === value.theme) &&
      ["default", "large"].includes(String(value.text))
    ) {
      return value as Appearance;
    }
  } catch {
    /* Storage is optional, including private browsing. */
  }
  return { theme: "blue", text: "default" };
}
export function saveAppearance(
  value: Appearance,
  storage: Pick<Storage, "setItem">,
) {
  try {
    storage.setItem(appearanceKey, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function initial(): Appearance {
  try {
    return readAppearance(localStorage);
  } catch {
    return { theme: "blue", text: "default" };
  }
}
let current = initial();
const listeners = new Set<() => void>();
export const subscribeAppearance = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getAppearance = () => current;
export function applyAppearance(value: Appearance) {
  const root = document.documentElement;
  root.dataset.theme = value.theme;
  root.dataset.text = value.text;
  root.style.colorScheme = value.theme === "dark" ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      themes.find((t) => t.id === value.theme)!.background,
    );
}
export function setAppearance(value: Appearance) {
  current = value;
  applyAppearance(value);
  let saved = false;
  try {
    saved = saveAppearance(value, localStorage);
  } catch {
    /* access denied */
  }
  listeners.forEach((listener) => listener());
  return saved;
}
applyAppearance(current);
window.addEventListener("storage", (e) => {
  if (e.key !== appearanceKey && e.key !== null) return;
  current = initial();
  applyAppearance(current);
  listeners.forEach((listener) => listener());
});

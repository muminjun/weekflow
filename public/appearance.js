/* global localStorage, document */
// Before React/CSS paint; keep the validation in sync with src/ui/appearance.ts.
try {
  const p = JSON.parse(
    localStorage.getItem("weekflow.appearance.v1") || "null",
  );
  const valid =
    p &&
    ["blue", "lime", "mint", "dark"].includes(p.theme) &&
    ["default", "large"].includes(p.text);
  const theme = valid ? p.theme : "blue";
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.text = valid ? p.text : "default";
  document.documentElement.style.colorScheme =
    theme === "dark" ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]').content = {
    blue: "#f3f6fb",
    lime: "#f7f6ee",
    mint: "#f1f8f5",
    dark: "#151a23",
  }[theme];
} catch {
  document.documentElement.dataset.theme = "blue";
}

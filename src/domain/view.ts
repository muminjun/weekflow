/** Presentation only: never writes the user's saved profile range or category. */
export function fitScale(height: number, from: number, to: number) {
  return (Math.max(1, height) * 60) / Math.max(15, to - from);
}
export function clippedGeometry(
  s: number,
  e: number,
  from: number,
  to: number,
  scale: number,
) {
  const start = Math.max(s, from),
    end = Math.min(e, to);
  return end > start
    ? {
        top: ((start - from) * scale) / 60,
        height: ((end - start) * scale) / 60,
      }
    : null;
}
export function rangeAround(minute: number): [number, number] {
  const from = Math.max(0, Math.min(900, Math.floor(minute / 60) * 60 - 60));
  return [from, from + 540];
}
export function categoryText(color: string) {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : "dfe0dc";
  const rgb = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return luminance > 0.25
    ? "#182230"
    : luminance > 0.179
      ? "#000000"
      : "#ffffff";
}

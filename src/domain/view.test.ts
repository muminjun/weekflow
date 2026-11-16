import { expect, it } from "vitest";
import { fitScale, clippedGeometry, rangeAround, categoryText } from "./view";
it("uses one measured scale and preserves exact 15-minute duration", () => {
  const scale = fitScale(450, 540, 1080);
  expect(scale).toBe(50);
  expect(clippedGeometry(600, 615, 540, 1080, scale)).toEqual({
    top: 50,
    height: 12.5,
  });
});
it("clips midnight segments without inventing height or negative availability", () => {
  expect(clippedGeometry(0, 60, 540, 1080, 50)).toBeNull();
  expect(clippedGeometry(1050, 1440, 540, 1080, 50)).toEqual({
    top: 425,
    height: 25,
  });
  expect(clippedGeometry(0, 60, 0, 540, 50)).toEqual({ top: 0, height: 50 });
});
it("keeps a nine hour jump inside day boundaries", () => {
  expect(rangeAround(0)).toEqual([0, 540]);
  expect(rangeAround(1410)).toEqual([900, 1440]);
});
it("chooses readable ink for light and dark category fills", () => {
  expect(categoryText("#F1C9B9")).toBe("#182230");
  expect(categoryText("#102030")).toBe("#ffffff");
  expect(categoryText("#777777")).toBe("#000000");
});

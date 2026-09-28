import { describe, expect, it } from "vitest";
import { rgbaToRgb } from "./browser";

describe("rgbaToRgb", () => {
  it("drops the alpha channel and keeps pixel order", () => {
    const rgba = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 128]);
    expect(Array.from(rgbaToRgb(rgba, 2, 1).data)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

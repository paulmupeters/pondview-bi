import { describe, expect, test } from "bun:test";
import { animations, getAnimationFrame } from "@/lib/animations";

describe("animations", () => {
  test("returns the expected frame for the requested animation", () => {
    expect(getAnimationFrame("bars", 0)).toBe(animations.bars.frames[0]);
    expect(getAnimationFrame("wave", 3)).toBe(animations.wave.frames[3]);
  });

  test("wraps around when the frame index exceeds the frame count", () => {
    expect(getAnimationFrame("bars", animations.bars.frames.length)).toBe(
      animations.bars.frames[0],
    );
  });
});

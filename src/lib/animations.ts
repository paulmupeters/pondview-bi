export const animations = {
  wave: {
    interval: 100,
    frames: [
      "▁",
      "▂",
      "▃",
      "▄",
      "▅",
      "▆",
      "▇",
      "█",
      "▇",
      "▆",
      "▅",
      "▄",
      "▃",
      "▂",
    ],
  },
  bars: {
    interval: 100,
    frames: ["▐░░▌", "▐▐░▌", "▐▌░▌", "▐▐░▌", "▐─▐▌", "▐─▌░", "▐░▌─", "▐░░▌"],
  },
  blocks: {
    interval: 100,
    frames: ["□□□", "■□□", "■■□", "■■■", "□■■", "□□■"],
  },
  loading: {
    interval: 100,
    frames: ["█░░", "█░░", "██░", "██░", "███", "███"],
  },
} as const;

export type AnimationName = keyof typeof animations;

export function getAnimationFrame(
  animationName: AnimationName,
  frameIndex: number,
): string {
  const frames = animations[animationName].frames;
  const normalizedIndex =
    ((frameIndex % frames.length) + frames.length) % frames.length;

  return frames[normalizedIndex];
}

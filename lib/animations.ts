/**
 * Displays a random animation frame by frame with a delay
 * @param delay - Delay between frames in milliseconds (optional, defaults to animation's interval)
 * @param duration - Total duration to run the animation in milliseconds (optional, defaults to 3000ms)
 * @param onFrame - Callback function called with each frame character
 * @param onComplete - Callback function called when animation completes
 * @returns Animation control object with stop() method
 */
export function showRandomAnimation(
  delay?: number,
  duration: number = 3000,
  onFrame?: (frame: string) => void,
  onComplete?: () => void,
) {
  // Get all animation names
  const animationNames = Object.keys(animations);

  // Pick a random animation
  const randomAnimationName =
    animationNames[Math.floor(Math.random() * animationNames.length)];
  const randomAnimation =
    animations[randomAnimationName as keyof typeof animations];

  // Use provided delay or animation's default interval
  const frameDelay = delay ?? randomAnimation.interval;

  let currentFrameIndex = 0;
  let animationId: NodeJS.Timeout | null = null;
  const startTime = Date.now();

  const animate = () => {
    const elapsed = Date.now() - startTime;

    // Check if duration has passed
    if (elapsed >= duration) {
      if (onComplete) onComplete();
      return;
    }

    // Get current frame
    const currentFrame = randomAnimation.frames[currentFrameIndex];

    // Call the frame callback
    if (onFrame) onFrame(currentFrame);

    // Move to next frame
    currentFrameIndex = (currentFrameIndex + 1) % randomAnimation.frames.length;

    // Schedule next frame
    animationId = setTimeout(animate, frameDelay);
  };

  // Start the animation
  animate();

  // Return control object
  return {
    stop: () => {
      if (animationId) {
        clearTimeout(animationId);
        animationId = null;
      }
    },
    animationName: randomAnimationName,
    animation: randomAnimation,
  };
}

/**
 * Displays a specific animation frame by frame with a delay
 * @param animationName - Name of the animation to display
 * @param delay - Delay between frames in milliseconds (optional, defaults to animation's interval)
 * @param duration - Total duration to run the animation in milliseconds (optional, defaults to 3000ms)
 * @param onFrame - Callback function called with each frame character
 * @param onComplete - Callback function called when animation completes
 * @returns Animation control object with stop() method
 */
export function showAnimation(
  animationName: keyof typeof animations,
  delay?: number,
  duration: number = 3000,
  onFrame?: (frame: string) => void,
  onComplete?: () => void,
) {
  const animation = animations[animationName];
  if (!animation) {
    throw new Error(`Animation "${animationName}" not found`);
  }

  // Use provided delay or animation's default interval
  const frameDelay = delay ?? animation.interval;

  let currentFrameIndex = 0;
  let animationId: NodeJS.Timeout | null = null;
  const startTime = Date.now();

  const animate = () => {
    const elapsed = Date.now() - startTime;

    // Check if duration has passed
    if (elapsed >= duration) {
      if (onComplete) onComplete();
      return;
    }

    // Get current frame
    const currentFrame = animation.frames[currentFrameIndex];

    // Call the frame callback
    if (onFrame) onFrame(currentFrame);

    // Move to next frame
    currentFrameIndex = (currentFrameIndex + 1) % animation.frames.length;

    // Schedule next frame
    animationId = setTimeout(animate, frameDelay);
  };

  // Start the animation
  animate();

  // Return control object
  return {
    stop: () => {
      if (animationId) {
        clearTimeout(animationId);
        animationId = null;
      }
    },
    animationName,
    animation,
  };
}

export const animations = {
  star2: {
    interval: 70,
    frames: ["✶", "✸", "✹", "✺", "✹", "✷"],
  },
  sand: {
    interval: 80,
    frames: [
      "⠁",
      "⠂",
      "⠄",
      "⡀",
      "⡈",
      "⡐",
      "⡠",
      "⣀",
      "⣁",
      "⣂",
      "⣄",
      "⣌",
      "⣔",
      "⣤",
      "⣥",
      "⣦",
      "⣮",
      "⣶",
      "⣷",
      "⣿",
      "⡿",
      "⠿",
      "⢟",
      "⠟",
      "⡛",
      "⠛",
      "⠫",
      "⢋",
      "⠋",
      "⠍",
      "⡉",
      "⠉",
      "⠑",
      "⠡",
      "⢁",
    ],
  },
  dots: {
    interval: 400,
    frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  },
  dots2: {
    interval: 80,
    frames: ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"],
  },
  dots3: {
    interval: 120,
    frames: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
  },
  dots4: {
    interval: 100,
    frames: ["⠈", "⠉", "⠋", "⠓", "⠒", "⠐", "⠐", "⠒", "⠓", "⠋", "⠉", "⠈"],
  },
  dots5: {
    interval: 100,
    frames: ["⠋", "⠙", "⠚", "⠞", "⠖", "⠦", "⠤", "⠠"],
  },
  dots6: {
    interval: 100,
    frames: ["⠄", "⠆", "⠇", "⠋", "⠙", "⠸", "⢰", "⢠", "⢀", "⡀"],
  },
  dots7: {
    interval: 100,
    frames: [
      "⠁",
      "⠃",
      "⠇",
      "⠧",
      "⠷",
      "⠿",
      "⡿",
      "⣿",
      "⣷",
      "⣯",
      "⣟",
      "⡿",
      "⠿",
      "⠷",
      "⠧",
      "⠇",
      "⠃",
      "⠁",
    ],
  },
  dots8: {
    interval: 100,
    frames: [
      "⠁",
      "⠂",
      "⠄",
      "⡀",
      "⢀",
      "⠠",
      "⠐",
      "⠈",
      "⠉",
      "⠋",
      "⠓",
      "⠒",
      "⠐",
      "⠠",
      "⢀",
      "⡀",
      "⠄",
      "⠂",
    ],
  },
  dots9: {
    interval: 100,
    frames: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
  },
  dots10: {
    interval: 100,
    frames: [
      "⠁",
      "⠂",
      "⠄",
      "⡀",
      "⢀",
      "⠠",
      "⠐",
      "⠈",
      "⠉",
      "⠋",
      "⠓",
      "⠒",
      "⠐",
      "⠠",
      "⢀",
      "⡀",
      "⠄",
      "⠂",
    ],
  },
  dots11: {
    interval: 100,
    frames: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
  },
  dots12: {
    interval: 100,
    frames: [
      "⠁",
      "⠂",
      "⠄",
      "⡀",
      "⢀",
      "⠠",
      "⠐",
      "⠈",
      "⠉",
      "⠋",
      "⠓",
      "⠒",
      "⠐",
      "⠠",
      "⢀",
      "⡀",
      "⠄",
      "⠂",
    ],
  },
  line: {
    interval: 130,
    frames: ["-", "\\", "|", "/"],
  },
  line2: {
    interval: 100,
    frames: ["⠂", "⠂", "⠉", "⠉", "⠒", "⠒", "⠐", "⠐", "⠒", "⠒", "⠉", "⠉"],
  },
  pipe: {
    interval: 100,
    frames: ["┤", "┘", "┴", "└", "├", "┌", "┬", "┐"],
  },
  simpleDots: {
    interval: 400,
    frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  },
  simpleDotsScrolling: {
    interval: 200,
    frames: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
  },
  star: {
    interval: 70,
    frames: ["✶", "✸", "✹", "✺", "✹", "✷"],
  },
  toggle: {
    interval: 250,
    frames: ["⊶", "⊷"],
  },
  toggle2: {
    interval: 80,
    frames: ["▫", "▪"],
  },
  toggle3: {
    interval: 120,
    frames: ["□", "■"],
  },
  toggle4: {
    interval: 100,
    frames: ["▫", "▪", "▫", "▪"],
  },
  toggle5: {
    interval: 100,
    frames: ["□", "■", "□", "■"],
  },
  triangle: {
    interval: 50,
    frames: ["◢", "◣", "◤", "◥"],
  },
  arc: {
    interval: 100,
    frames: ["◜", "◠", "◝", "◞", "◡", "◟"],
  },
  arrow: {
    interval: 100,
    frames: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
  },
  arrow2: {
    interval: 80,
    frames: ["◐", "◓", "◑", "◒"],
  },
  arrow3: {
    interval: 120,
    frames: ["◜", "◠", "◝", "◞", "◡", "◟"],
  },
  bouncingBar: {
    interval: 80,
    frames: [
      "[    ]",
      "[=   ]",
      "[==  ]",
      "[=== ]",
      "[ ===]",
      "[  ==]",
      "[   =]",
      "[    ]",
      "[   =]",
      "[  ==]",
      "[ ===]",
      "[====]",
      "[=== ]",
      "[==  ]",
      "[=   ]",
    ],
  },
  bouncingBall: {
    interval: 80,
    frames: [
      "( ●    )",
      "(  ●   )",
      "(   ●  )",
      "(    ● )",
      "(     ●)",
      "(    ● )",
      "(   ●  )",
      "(  ●   )",
    ],
  },
  smiley: {
    interval: 200,
    frames: ["😊", "😄", "😁", "😃", "😀", "😆", "😅", "😂"],
  },
  monkey: {
    interval: 300,
    frames: ["🙈", "🙉", "🙊"],
  },
  hearts: {
    interval: 100,
    frames: ["💛", "💙", "💜", "💚", "❤️"],
  },
  clock: {
    interval: 100,
    frames: [
      "🕐",
      "🕑",
      "🕒",
      "🕓",
      "🕔",
      "🕕",
      "🕖",
      "🕗",
      "🕘",
      "🕙",
      "🕚",
      "🕛",
    ],
  },
  earth: {
    interval: 180,
    frames: ["🌍", "🌎", "🌏"],
  },
  moon: {
    interval: 80,
    frames: ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"],
  },
  runner: {
    interval: 140,
    frames: ["🚶", "🏃"],
  },
  pong: {
    interval: 50,
    frames: [
      "▐⠂       ▌",
      "▐⠈       ▌",
      "▐ ⠂      ▌",
      "▐ ⠠      ▌",
      "▐  ⡀     ▌",
      "▐  ⠠     ▌",
      "▐   ⠂    ▌",
      "▐   ⠈    ▌",
      "▐    ⠂   ▌",
      "▐    ⠠   ▌",
      "▐     ⡀  ▌",
      "▐     ⠠  ▌",
      "▐      ⠂ ▌",
      "▐      ⠈ ▌",
      "▐       ⠂▌",
      "▐       ⠠▌",
      "▐       ⡀▌",
      "▐      ⠠ ▌",
      "▐      ⠂ ▌",
      "▐     ⠈  ▌",
      "▐     ⠂  ▌",
      "▐    ⠠   ▌",
      "▐    ⡀   ▌",
      "▐   ⠠    ▌",
      "▐   ⠂    ▌",
      "▐  ⠈     ▌",
      "▐  ⠂     ▌",
      "▐ ⠠      ▌",
      "▐ ⡀      ▌",
      "▐⠠       ▌",
    ],
  },
  shark: {
    interval: 120,
    frames: [
      "▐|\\____________▌",
      "▐_|\\___________▌",
      "▐__|\\__________▌",
      "▐___|\\_________▌",
      "▐____|\\________▌",
      "▐_____|\\_______▌",
      "▐______|\\______▌",
      "▐_______|\\_____▌",
      "▐________|\\____▌",
      "▐_________|\\___▌",
      "▐__________|\\__▌",
      "▐___________|\\_▌",
      "▐____________|\\▌",
      "▐____________/|▌",
      "▐___________/|_▌",
      "▐__________/|__▌",
      "▐_________/|___▌",
      "▐________/|____▌",
      "▐_______/|_____▌",
      "▐______/|______▌",
      "▐_____/|_______▌",
      "▐____/|________▌",
      "▐___/|_________▌",
      "▐__/|__________▌",
      "▐_/|___________▌",
      "▐/|____________▌",
    ],
  },
  dqpb: {
    interval: 100,
    frames: ["d", "q", "p", "b"],
  },
  weather: {
    interval: 100,
    frames: ["☀️", "☁️", "⛅", "🌦️", "🌧️", "⛈️", "🌩️", "🌨️"],
  },
  christmas: {
    interval: 400,
    frames: ["🌲", "🎄"],
  },
};

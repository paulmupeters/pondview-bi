export const themeName = "default";
export const themeDisplayName = "Default";
export const themeCss = `:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.2498 0.0125 135.0835);

  --card: oklch(0.9884 0.0047 95.96);
  --card-foreground: oklch(0.2498 0.0125 135.0835);

  --popover: oklch(1 0 0 / 0.94);
  --popover-foreground: oklch(0.2498 0.0125 135.0835);

  --primary: oklch(0.6077 0.0609 134.7899);
  --primary-foreground: oklch(0.9877 0.0057 264.5329);

  --secondary: oklch(0.549 0.0378 139.7194);
  --secondary-foreground: oklch(0.9877 0.0057 264.5329);

  --muted: oklch(0.9492 0.0107 96.54);
  --muted-foreground: oklch(0.5218 0.0123 135.0835);

  --accent: oklch(0.6671 0.0434 137.2699);
  --accent-foreground: oklch(0.2031 0.0245 273.2274);

  --destructive: oklch(0.5412 0.2129 28.7117);
  --destructive-foreground: oklch(0.98 0.01 85);

  --border: oklch(0.9331 0.0163 95.2327);
  --input: oklch(0.9643 0.0096 96.25);
  --ring: oklch(0.6334 0.0745 136.8547);

  --chart-1: oklch(0.6334 0.0745 136.8547);
  --chart-2: oklch(0.5413 0.0418 136.592);
  --chart-3: oklch(0.7251 0.0964 134.9305);
  --chart-4: oklch(0.3994 0.0188 136.1989);
  --chart-5: oklch(0.2498 0.0125 135.0835);

  --sidebar: oklch(0.9855 0.006 95.48);
  --sidebar-foreground: oklch(0.2498 0.0125 135.0835);
  --sidebar-primary: oklch(0.6334 0.0745 136.8547);
  --sidebar-primary-foreground: oklch(0.247 0.0103 132.6772);
  --sidebar-accent: oklch(0.6671 0.0434 137.2699);
  --sidebar-accent-foreground: oklch(0.2031 0.0245 273.2274);
  --sidebar-border: oklch(0.9058 0.0188 96.12);
  --sidebar-ring: oklch(0.6334 0.0745 136.8547);

  --radius: 0.35rem;

  --font-sans: "Roboto", ui-sans-serif, sans-serif, system-ui;
  --font-serif: "Geist", ui-sans-serif, sans-serif, system-ui;
  --font-mono: "Space Mono", "Courier New", monospace;

  --shadow-color: oklch(0.2498 0.0125 135.0835 / 0.12);
  --shadow-2xs: 0px 1px 1px 0px var(--shadow-color);
  --shadow-xs: 0px 1px 2px 0px var(--shadow-color);
  --shadow-sm: 0px 8px 24px -10px oklch(0.2498 0.0125 135.0835 / 0.08);
  --shadow: 0px 18px 50px -18px oklch(0.2498 0.0125 135.0835 / 0.14);
  --shadow-md: 0px 24px 70px -24px oklch(0.2498 0.0125 135.0835 / 0.14);
  --shadow-lg: 0px 30px 90px -28px oklch(0.2498 0.0125 135.0835 / 0.16);
  --shadow-xl: 0px 32px 110px -32px oklch(0.2498 0.0125 135.0835 / 0.22);
  --shadow-2xl: 0px 44px 140px -40px oklch(0.2498 0.0125 135.0835 / 0.26);

  --tracking-normal: 0.025em;
  --spacing: 0.25rem;

  /* Optional aliases matching the current landing page naming */
  --pond-cream: var(--background);
  --pond-linen: var(--border);
  --pond-sage: var(--primary);
  --pond-sage-dark: var(--secondary);
  --pond-ink: var(--foreground);
  --pond-mist: var(--muted-foreground);
}

.dark {
  --background: oklch(0.2498 0.0125 135.0835);
  --foreground: oklch(0.93 0.018 96.8);

  --card: oklch(0.281 0.014 135.2);
  --card-foreground: oklch(0.93 0.018 96.8);

  --popover: oklch(0.281 0.014 135.2 / 0.96);
  --popover-foreground: oklch(0.93 0.018 96.8);

  --primary: oklch(0.6334 0.0745 136.8547);
  --primary-foreground: oklch(0.2498 0.0125 135.0835);

  --secondary: oklch(0.3349 0.0261 138.5024);
  --secondary-foreground: oklch(0.97 0 0);

  --muted: oklch(0.3382 0.0211 134.1154);
  --muted-foreground: oklch(0.7604 0.019 96.2);

  --accent: oklch(0.3939 0.0313 134.5951);
  --accent-foreground: oklch(0.93 0.018 96.8);

  --destructive: oklch(0.4493 0.1505 26.4639);
  --destructive-foreground: oklch(0.96 0.02 85);

  --border: oklch(0.3382 0.0211 134.1154);
  --input: oklch(0.3382 0.0211 134.1154);
  --ring: oklch(0.6334 0.0745 136.8547);

  --chart-1: oklch(0.6797 0.1309 132.7465);
  --chart-2: oklch(0.5832 0.0336 134.5545);
  --chart-3: oklch(0.477 0.0203 110.7352);
  --chart-4: oklch(0.3601 0.0395 135.4342);
  --chart-5: oklch(0.4446 0.0113 100.2085);

  --sidebar: oklch(0.2498 0.0125 135.0835);
  --sidebar-foreground: oklch(0.93 0.018 96.8);
  --sidebar-primary: oklch(0.6334 0.0745 136.8547);
  --sidebar-primary-foreground: oklch(0.2498 0.0125 135.0835);
  --sidebar-accent: oklch(0.3939 0.0313 134.5951);
  --sidebar-accent-foreground: oklch(0.93 0.018 96.8);
  --sidebar-border: oklch(0.3382 0.0211 134.1154);
  --sidebar-ring: oklch(0.6334 0.0745 136.8547);

  --shadow-color: oklch(0 0 0 / 0.28);
  --shadow-2xs: 0px 1px 1px 0px var(--shadow-color);
  --shadow-xs: 0px 1px 2px 0px var(--shadow-color);
  --shadow-sm: 0px 8px 24px -10px oklch(0 0 0 / 0.22);
  --shadow: 0px 18px 50px -18px oklch(0 0 0 / 0.28);
  --shadow-md: 0px 24px 70px -24px oklch(0 0 0 / 0.34);
  --shadow-lg: 0px 30px 90px -28px oklch(0 0 0 / 0.4);
  --shadow-xl: 0px 32px 110px -32px oklch(0 0 0 / 0.5);
  --shadow-2xl: 0px 44px 140px -40px oklch(0 0 0 / 0.56);

  --pond-cream: var(--background);
  --pond-linen: var(--border);
  --pond-sage: var(--primary);
  --pond-sage-dark: var(--secondary);
  --pond-ink: var(--foreground);
  --pond-mist: var(--muted-foreground);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --font-sans: var(--font-sans);
  --font-serif: var(--font-serif);
  --font-mono: var(--font-mono);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --shadow-2xs: var(--shadow-2xs);
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow: var(--shadow);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-2xl: var(--shadow-2xl);
}
`;

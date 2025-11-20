import * as defaultTheme from "./default";
import * as monoGreenTheme from "./mono-green";

export type Theme = {
  name: string;
  displayName: string;
  css: string;
};

export const themes: Record<string, Theme> = {
  [defaultTheme.themeName]: {
    name: defaultTheme.themeName,
    displayName: defaultTheme.themeDisplayName,
    css: defaultTheme.themeCss,
  },
  [monoGreenTheme.themeName]: {
    name: monoGreenTheme.themeName,
    displayName: monoGreenTheme.themeDisplayName,
    css: monoGreenTheme.themeCss,
  },
};

export const getTheme = (themeName: string): Theme | undefined => {
  return themes[themeName];
};

export const getAllThemes = (): Theme[] => {
  return Object.values(themes);
};

export const getThemeNames = (): string[] => {
  return Object.keys(themes);
};


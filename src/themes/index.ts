import * as defaultTheme from "./default";
import * as emberClayTheme from "./ember-clay";
import * as monoGreenTheme from "./moss-terminal";
import * as improvedTheme from "./rosewater";

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
  [emberClayTheme.themeName]: {
    name: emberClayTheme.themeName,
    displayName: emberClayTheme.themeDisplayName,
    css: emberClayTheme.themeCss,
  },
  [improvedTheme.themeName]: {
    name: improvedTheme.themeName,
    displayName: improvedTheme.themeDisplayName,
    css: improvedTheme.themeCss,
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

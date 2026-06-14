export type AnalysisShortcutAction = "toggleExplorer" | "createDashboard";

type AnalysisShortcut = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  label: string;
};

type KeyEventLike = Pick<
  KeyboardEvent,
  | "altKey"
  | "ctrlKey"
  | "defaultPrevented"
  | "key"
  | "metaKey"
  | "repeat"
  | "shiftKey"
  | "target"
>;

const ANALYSIS_SHORTCUTS: Record<
  "mac" | "other",
  Record<AnalysisShortcutAction, AnalysisShortcut>
> = {
  mac: {
    toggleExplorer: {
      key: "e",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
      label: "\u2318\u21e7E",
    },
    createDashboard: {
      key: "i",
      metaKey: true,
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
      label: "\u2318\u21e7I",
    },
  },
  other: {
    toggleExplorer: {
      key: "e",
      metaKey: false,
      ctrlKey: false,
      altKey: true,
      shiftKey: true,
      label: "Alt+Shift+E",
    },
    createDashboard: {
      key: "d",
      metaKey: false,
      ctrlKey: false,
      altKey: true,
      shiftKey: true,
      label: "Alt+Shift+D",
    },
  },
};

export function getAnalysisShortcutLabel(
  action: AnalysisShortcutAction,
  platform: "mac" | "other" = getShortcutPlatform(),
): string {
  return ANALYSIS_SHORTCUTS[platform][action].label;
}

export function matchAnalysisShortcut(
  event: KeyEventLike,
  platform: "mac" | "other" = getShortcutPlatform(),
): AnalysisShortcutAction | null {
  if (event.defaultPrevented || event.repeat) {
    return null;
  }

  if (isEditableEventTarget(event.target)) {
    return null;
  }

  const pressedKey = event.key.toLowerCase();
  const shortcuts = ANALYSIS_SHORTCUTS[platform];

  return (
    (Object.entries(shortcuts).find(([, shortcut]) => {
      return (
        pressedKey === shortcut.key &&
        event.metaKey === shortcut.metaKey &&
        event.ctrlKey === shortcut.ctrlKey &&
        event.altKey === shortcut.altKey &&
        event.shiftKey === shortcut.shiftKey
      );
    })?.[0] as AnalysisShortcutAction | undefined) ?? null
  );
}

function getShortcutPlatform(): "mac" | "other" {
  if (
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.userAgent)
  ) {
    return "mac";
  }

  return "other";
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }

  return (
    target.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox'], .cm-editor, .cm-content",
    ) !== null
  );
}

const NOTEBOOK_DEBUG_STORAGE_KEY = "pondview:debug:notebook-controller";
const NOTEBOOK_DEBUG_QUERY_PARAM = "debugNotebook";

let notebookDebugSequence = 0;

export function isNotebookDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const fromStorage =
      window.localStorage.getItem(NOTEBOOK_DEBUG_STORAGE_KEY) === "1";
    const fromQuery =
      new URLSearchParams(window.location.search).get(
        NOTEBOOK_DEBUG_QUERY_PARAM,
      ) === "1";

    return fromStorage || fromQuery;
  } catch {
    return false;
  }
}

export function logNotebookDebug(
  event: string,
  payload?: Record<string, unknown>,
): void {
  if (!isNotebookDebugEnabled()) {
    return;
  }

  notebookDebugSequence += 1;

  const prefix = `[notebook-debug:${notebookDebugSequence}] ${event}`;
  if (payload) {
    console.log(prefix, payload);
    return;
  }

  console.log(prefix);
}

export function getNotebookDebugInstructions(): string {
  return [
    `Enable with localStorage.setItem("${NOTEBOOK_DEBUG_STORAGE_KEY}", "1")`,
    `or append ?${NOTEBOOK_DEBUG_QUERY_PARAM}=1 to the URL.`,
  ].join(" ");
}

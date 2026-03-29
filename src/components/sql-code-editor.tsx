import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { Prec, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  type KeyBinding,
  keymap,
  WidgetType,
} from "@codemirror/view";
import CodeMirror, {
  type Extension,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { cn } from "@/lib/utils";

export type SqlCodeEditorApi = {
  /**
   * Inserts text at the current caret position (or at the end if unfocused).
   */
  insertText: (text: string) => void;
  /**
   * Replaces the entire SQL buffer with the provided value.
   */
  setValue: (value: string) => void;
  /**
   * Returns the current SQL buffer.
   */
  getValue: () => string;
  /**
   * Focuses the editor.
   */
  focus: () => void;
  /**
   * Returns whether the caret is on the first line.
   */
  isCaretOnFirstLine: () => boolean;
  /**
   * Returns whether the caret is on the last line.
   */
  isCaretOnLastLine: () => boolean;
};

export type SqlCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  autocompleteAction?: AutocompleteQueryFn;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  autoFocus?: boolean;
  onRunQuery?: () => void;
  onCancel?: () => void;
  onHistoryPrev?: () => void;
  onHistoryNext?: () => void;
};

export type SqlAutocompleteSuggestion = {
  suggestion: string;
  suggestionStart: number;
};

export type AutocompleteQueryFn = (params: {
  sql: string;
  signal: AbortSignal;
}) => Promise<SqlAutocompleteSuggestion | null>;

export type ResolvedSqlAutocompleteSuggestion = SqlAutocompleteSuggestion & {
  from: number;
  to: number;
  suffix: string;
};

export function applySqlAutocompleteSuggestion(input: {
  sql: string;
  suggestion: ResolvedSqlAutocompleteSuggestion | null;
}): { value: string; selectionStart: number; selectionEnd: number } | null {
  const suggestion = input.suggestion;
  if (!suggestion) {
    return null;
  }

  const value =
    input.sql.slice(0, suggestion.suggestionStart) +
    suggestion.suggestion +
    input.sql.slice(suggestion.to);
  const selection = suggestion.suggestionStart + suggestion.suggestion.length;

  return {
    value,
    selectionStart: selection,
    selectionEnd: selection,
  };
}

export function shouldRequestSqlAutocomplete(input: {
  sql: string;
  selectionFrom: number;
  selectionTo: number;
  docLength: number;
}): boolean {
  return (
    input.sql.trim().length > 0 &&
    input.selectionFrom === input.selectionTo &&
    input.selectionTo === input.docLength
  );
}

export function resolveSqlAutocompleteSuggestion(input: {
  sql: string;
  suggestion: SqlAutocompleteSuggestion | null;
}): ResolvedSqlAutocompleteSuggestion | null {
  const suggestion = input.suggestion;
  if (!suggestion) {
    return null;
  }

  if (
    !Number.isInteger(suggestion.suggestionStart) ||
    suggestion.suggestionStart < 0 ||
    suggestion.suggestionStart > input.sql.length
  ) {
    return null;
  }

  const existingTail = input.sql.slice(suggestion.suggestionStart);
  if (!suggestion.suggestion.startsWith(existingTail)) {
    return null;
  }

  const suffix = suggestion.suggestion.slice(existingTail.length);
  if (!suffix) {
    return null;
  }

  return {
    ...suggestion,
    from: input.sql.length,
    to: input.sql.length,
    suffix,
  };
}

class SqlAutocompleteGhostTextWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }

  eq(other: SqlAutocompleteGhostTextWidget): boolean {
    return other.text === this.text;
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "cm-sql-ghost-text";
    element.textContent = this.text;
    element.setAttribute("aria-hidden", "true");
    return element;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

const setSqlAutocompleteEffect =
  StateEffect.define<ResolvedSqlAutocompleteSuggestion | null>();

const sqlAutocompleteField =
  StateField.define<ResolvedSqlAutocompleteSuggestion | null>({
    create: () => null,
    update(value, transaction) {
      for (const effect of transaction.effects) {
        if (effect.is(setSqlAutocompleteEffect)) {
          return effect.value;
        }
      }

      if (transaction.docChanged || transaction.selection) {
        return null;
      }

      return value;
    },
    provide: (field) =>
      EditorView.decorations.from(field, (value) => {
        if (!value) {
          return Decoration.none;
        }

        return Decoration.set([
          Decoration.widget({
            side: 1,
            widget: new SqlAutocompleteGhostTextWidget(value.suffix),
          }).range(value.from),
        ]);
      }),
  });

function acceptSqlAutocomplete(view: EditorView): boolean {
  const suggestion = view.state.field(sqlAutocompleteField, false);
  if (!suggestion) {
    return false;
  }

  const nextState = applySqlAutocompleteSuggestion({
    sql: view.state.doc.toString(),
    suggestion,
  });
  if (!nextState) {
    return false;
  }

  view.dispatch({
    changes: {
      from: suggestion.suggestionStart,
      to: suggestion.to,
      insert: suggestion.suggestion,
    },
    selection: {
      anchor: nextState.selectionStart,
    },
    effects: setSqlAutocompleteEffect.of(null),
  });

  return true;
}

export function createSqlCodeEditorKeyBindings(options: {
  onRunQuery?: () => void;
  onCancel?: () => void;
  onHistoryPrev?: () => void;
  onHistoryNext?: () => void;
}): KeyBinding[] {
  const { onRunQuery, onCancel, onHistoryPrev, onHistoryNext } = options;
  const bindings: KeyBinding[] = [
    {
      key: "Tab",
      run: acceptSqlAutocomplete,
    },
  ];

  if (onRunQuery) {
    bindings.push({
      key: "Shift-Enter",
      run: () => {
        onRunQuery();
        return true;
      },
    });
  }

  if (onCancel) {
    bindings.push({
      key: "Escape",
      run: () => {
        onCancel();
        return true;
      },
    });
  }

  if (onHistoryPrev) {
    bindings.push({
      key: "ArrowUp",
      run: (view) => {
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        if (line.number === 1) {
          onHistoryPrev();
          return true;
        }
        return false;
      },
    });
  }

  if (onHistoryNext) {
    bindings.push({
      key: "ArrowDown",
      run: (view) => {
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        if (line.number === view.state.doc.lines) {
          onHistoryNext();
          return true;
        }
        return false;
      },
    });
  }

  return bindings;
}

export const SqlCodeEditor = forwardRef<SqlCodeEditorApi, SqlCodeEditorProps>(
  function SqlCodeEditor(
    {
      value,
      onChange,
      autocompleteAction,
      placeholder,
      className,
      minHeight = "8rem",
      maxHeight,
      autoFocus = false,
      onRunQuery,
      onCancel,
      onHistoryPrev,
      onHistoryNext,
    },
    ref,
  ) {
    const editorRef = useRef<ReactCodeMirrorRef>(null);
    const autocompleteActionRef = useRef<AutocompleteQueryFn | undefined>(
      autocompleteAction,
    );
    const autocompleteAbortRef = useRef<AbortController | null>(null);
    const autocompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const autocompleteRequestIdRef = useRef(0);

    // Expose imperative API
    useImperativeHandle(
      ref,
      () => ({
        insertText: (text: string) => {
          const view = editorRef.current?.view;
          if (!view) return;
          const { state } = view;
          const from = state.selection.main.from;
          const to = state.selection.main.to;
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
          });
          view.focus();
        },
        setValue: (val: string) => {
          const view = editorRef.current?.view;
          if (!view) return;
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: val },
            selection: { anchor: val.length },
          });
          view.focus();
        },
        getValue: () => {
          return editorRef.current?.view?.state.doc.toString() ?? "";
        },
        focus: () => {
          editorRef.current?.view?.focus();
        },
        isCaretOnFirstLine: () => {
          const view = editorRef.current?.view;
          if (!view) return true;
          const pos = view.state.selection.main.head;
          const line = view.state.doc.lineAt(pos);
          return line.number === 1;
        },
        isCaretOnLastLine: () => {
          const view = editorRef.current?.view;
          if (!view) return true;
          const pos = view.state.selection.main.head;
          const line = view.state.doc.lineAt(pos);
          return line.number === view.state.doc.lines;
        },
      }),
      [],
    );

    // Autofocus on mount
    useEffect(() => {
      if (autoFocus) {
        requestAnimationFrame(() => {
          editorRef.current?.view?.focus();
        });
      }
    }, [autoFocus]);

    useEffect(() => {
      autocompleteActionRef.current = autocompleteAction;
    }, [autocompleteAction]);

    const clearAutocompleteRequest = useCallback((view?: EditorView | null) => {
      if (autocompleteTimerRef.current) {
        clearTimeout(autocompleteTimerRef.current);
        autocompleteTimerRef.current = null;
      }

      if (autocompleteAbortRef.current) {
        autocompleteAbortRef.current.abort();
        autocompleteAbortRef.current = null;
      }

      const targetView = view ?? editorRef.current?.view;
      if (!targetView) {
        return;
      }

      const activeSuggestion = targetView.state.field(
        sqlAutocompleteField,
        false,
      );
      if (!activeSuggestion) {
        return;
      }

      targetView.dispatch({
        effects: setSqlAutocompleteEffect.of(null),
      });
    }, []);

    const scheduleAutocomplete = useCallback(
      (view: EditorView) => {
        const action = autocompleteActionRef.current;
        const selection = view.state.selection.main;
        const currentSql = view.state.doc.toString();

        if (
          !action ||
          !view.hasFocus ||
          !shouldRequestSqlAutocomplete({
            sql: currentSql,
            selectionFrom: selection.from,
            selectionTo: selection.to,
            docLength: view.state.doc.length,
          })
        ) {
          clearAutocompleteRequest(view);
          return;
        }

        if (autocompleteTimerRef.current) {
          clearTimeout(autocompleteTimerRef.current);
          autocompleteTimerRef.current = null;
        }

        if (autocompleteAbortRef.current) {
          autocompleteAbortRef.current.abort();
          autocompleteAbortRef.current = null;
        }

        const requestId = autocompleteRequestIdRef.current + 1;
        autocompleteRequestIdRef.current = requestId;

        const controller = new AbortController();
        autocompleteAbortRef.current = controller;

        autocompleteTimerRef.current = setTimeout(() => {
          autocompleteTimerRef.current = null;

          void action({
            sql: currentSql,
            signal: controller.signal,
          })
            .then((suggestion) => {
              if (controller.signal.aborted) {
                return;
              }

              const latestView = editorRef.current?.view;
              if (
                !latestView ||
                autocompleteRequestIdRef.current !== requestId
              ) {
                return;
              }

              const latestSelection = latestView.state.selection.main;
              const latestSql = latestView.state.doc.toString();
              if (
                !latestView.hasFocus ||
                !shouldRequestSqlAutocomplete({
                  sql: latestSql,
                  selectionFrom: latestSelection.from,
                  selectionTo: latestSelection.to,
                  docLength: latestView.state.doc.length,
                })
              ) {
                clearAutocompleteRequest(latestView);
                return;
              }

              latestView.dispatch({
                effects: setSqlAutocompleteEffect.of(
                  resolveSqlAutocompleteSuggestion({
                    sql: latestSql,
                    suggestion,
                  }),
                ),
              });
            })
            .catch((error) => {
              if ((error as Error).name === "AbortError") {
                return;
              }

              clearAutocompleteRequest(editorRef.current?.view);
            })
            .finally(() => {
              if (autocompleteAbortRef.current === controller) {
                autocompleteAbortRef.current = null;
              }
            });
        }, 180);
      },
      [clearAutocompleteRequest],
    );

    useEffect(() => {
      const view = editorRef.current?.view;
      if (!view) {
        return;
      }

      scheduleAutocomplete(view);
    }, [scheduleAutocomplete]);

    useEffect(() => {
      return () => {
        clearAutocompleteRequest(null);
      };
    }, [clearAutocompleteRequest]);

    // Custom keymap for run/cancel/history navigation
    const customKeymap = useCallback((): Extension => {
      return Prec.highest(
        keymap.of(
          createSqlCodeEditorKeyBindings({
            onRunQuery,
            onCancel,
            onHistoryPrev,
            onHistoryNext,
          }),
        ),
      );
    }, [onRunQuery, onCancel, onHistoryPrev, onHistoryNext]);

    const extensions: Extension[] = [
      customKeymap(),
      sql({ dialect: PostgreSQL }),
      EditorView.lineWrapping,
      sqlAutocompleteField,
      EditorView.updateListener.of((update) => {
        if (
          !(update.docChanged || update.selectionSet || update.focusChanged)
        ) {
          return;
        }

        if (update.focusChanged && !update.view.hasFocus) {
          clearAutocompleteRequest(update.view);
          return;
        }

        scheduleAutocomplete(update.view);
      }),
    ];

    return (
      <CodeMirror
        ref={editorRef}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        extensions={extensions}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: false,
          dropCursor: true,
          allowMultipleSelections: false,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: false,
          autocompletion: false,
          rectangularSelection: false,
          crosshairCursor: false,
          highlightSelectionMatches: false,
          searchKeymap: true,
          tabSize: 2,
        }}
        className={cn(
          "sql-code-editor w-full min-w-0 overflow-hidden bg-card",
          "[&_.cm-editor]:!font-mono [&_.cm-editor]:!text-sm",
          "[&_.cm-gutters]:!bg-popover [&_.cm-gutters]:!border-r [&_.cm-gutters]:!border-popover",
          "[&_.cm-lineNumbers]:!text-muted-foreground/70",
          "[&_.cm-content]:!text-foreground [&_.cm-content]:!caret-primary",
          "[&_.cm-activeLine]:!bg-accent/20",
          "[&_.cm-activeLineGutter]:!bg-muted",
          "[&_.cm-selectionBackground]:!bg-primary/20",
          "[&_.cm-cursor]:!border-l-2 [&_.cm-cursor]:!border-primary",
          "[&_.cm-placeholder]:!text-muted-foreground",
          "[&_.cm-sql-ghost-text]:!text-muted-foreground/60",
          "[&_.cm-scroller]:!max-h-full [&_.cm-scroller]:!overflow-y-auto [&_.cm-scroller]:!overflow-x-hidden",
          "[&_.cm-focused]:!outline-none",
          "[&_.cm-editor.cm-focused]:!outline-none",
          className,
        )}
        style={{ minHeight, maxHeight }}
        theme="none"
      />
    );
  },
);

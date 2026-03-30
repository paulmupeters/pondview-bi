import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { syntaxHighlighting } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark";
import { EditorView, type KeyBinding, keymap } from "@codemirror/view";
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
  useState,
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

export function createSqlCodeEditorKeyBindings(options: {
  onRunQuery?: () => void;
  onCancel?: () => void;
  onHistoryPrev?: () => void;
  onHistoryNext?: () => void;
}): KeyBinding[] {
  const { onRunQuery, onCancel, onHistoryPrev, onHistoryNext } = options;
  const bindings: KeyBinding[] = [];

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

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains("dark"),
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export const SqlCodeEditor = forwardRef<SqlCodeEditorApi, SqlCodeEditorProps>(
  function SqlCodeEditor(
    {
      value,
      onChange,
      autocompleteAction: _autocompleteAction,
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
    const isDark = useIsDarkMode();
    const editorRef = useRef<ReactCodeMirrorRef>(null);

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
      ...(isDark ? [syntaxHighlighting(oneDarkHighlightStyle)] : []),
      EditorView.lineWrapping,
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

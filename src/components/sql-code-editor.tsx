"use client";

import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { Prec } from "@codemirror/state";
import { type KeyBinding, keymap } from "@codemirror/view";
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
  placeholder?: string;
  className?: string;
  minHeight?: string;
  autoFocus?: boolean;
  onRunQuery?: () => void;
  onCancel?: () => void;
  onHistoryPrev?: () => void;
  onHistoryNext?: () => void;
};

export const SqlCodeEditor = forwardRef<SqlCodeEditorApi, SqlCodeEditorProps>(
  function SqlCodeEditor(
    {
      value,
      onChange,
      placeholder,
      className,
      minHeight = "8rem",
      autoFocus = false,
      onRunQuery,
      onCancel,
      onHistoryPrev,
      onHistoryNext,
    },
    ref,
  ) {
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
      const bindings: KeyBinding[] = [];

      if (onRunQuery) {
        bindings.push({
          key: "Enter",
          run: () => {
            // Only run query if not holding shift
            onRunQuery();
            return true;
          },
          shift: () => false, // Allow Shift+Enter to insert newline
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
            return false; // Let default handler move cursor
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
            return false; // Let default handler move cursor
          },
        });
      }

      return Prec.highest(keymap.of(bindings));
    }, [onRunQuery, onCancel, onHistoryPrev, onHistoryNext]);

    const extensions: Extension[] = [
      customKeymap(),
      sql({ dialect: PostgreSQL }),
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
          closeBrackets: true,
          autocompletion: false,
          rectangularSelection: false,
          crosshairCursor: false,
          highlightSelectionMatches: true,
          searchKeymap: true,
          tabSize: 2,
        }}
        className={cn(
          "sql-code-editor overflow-hidden bg-popover",
          "[&_.cm-editor]:!font-mono [&_.cm-editor]:!text-sm",
          "[&_.cm-gutters]:!bg-popover [&_.cm-gutters]:!border-r [&_.cm-gutters]:!border-popover",
          "[&_.cm-lineNumbers]:!text-muted-foreground/70",
          "[&_.cm-content]:!text-foreground [&_.cm-content]:!caret-primary",
          "[&_.cm-activeLine]:!bg-accent/20",
          "[&_.cm-activeLineGutter]:!bg-muted",
          "[&_.cm-selectionBackground]:!bg-primary/20",
          "[&_.cm-cursor]:!border-l-2 [&_.cm-cursor]:!border-primary",
          "[&_.cm-placeholder]:!text-muted-foreground",
          "[&_.cm-scroller]:!overflow-auto",
          "[&_.cm-focused]:!outline-none",
          "[&_.cm-editor.cm-focused]:!outline-none",
          className,
        )}
        style={{ minHeight }}
        theme="none"
      />
    );
  },
);

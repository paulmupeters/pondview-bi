import { useEffect, useRef, useState, type KeyboardEvent } from "react";

interface UseInlineTextEditOptions<Field extends string> {
  getValue: (field: Field) => string;
  onCommit: (field: Field, value: string) => void;
}

export function useInlineTextEdit<Field extends string>({
  getValue,
  onCommit,
}: UseInlineTextEditOptions<Field>) {
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (editingField === null) {
      return;
    }
    setDraftValue(getValue(editingField) ?? "");
  }, [editingField, getValue]);

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  const startEditing = (field: Field) => {
    setEditingField(field);
    setDraftValue(getValue(field) ?? "");
  };

  const commitEditing = () => {
    if (editingField === null) {
      return;
    }
    onCommit(editingField, draftValue);
    setEditingField(null);
  };

  const cancelEditing = () => {
    setEditingField(null);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEditing();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      skipBlurCommitRef.current = true;
      cancelEditing();
    }
  };

  const handleInputBlur = () => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    commitEditing();
  };

  return {
    editingField,
    draftValue,
    setDraftValue,
    inputRef,
    startEditing,
    handleInputBlur,
    handleInputKeyDown,
  };
}

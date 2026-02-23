"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const RIGHT_PANEL_WIDTH_STORAGE_KEY = "chat-right-panel-width";
const DEFAULT_RIGHT_PANEL_WIDTH = 40;
const MIN_RIGHT_PANEL_WIDTH = 20;
const MAX_RIGHT_PANEL_WIDTH = 60;

export function useRightPanelResize() {
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_RIGHT_PANEL_WIDTH;
    }
    const saved = window.localStorage.getItem(RIGHT_PANEL_WIDTH_STORAGE_KEY);
    const parsed = saved ? parseFloat(saved) : DEFAULT_RIGHT_PANEL_WIDTH;
    return Number.isFinite(parsed) ? parsed : DEFAULT_RIGHT_PANEL_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [pointerId, setPointerId] = useState<number | null>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Persist right panel width to localStorage.
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        RIGHT_PANEL_WIDTH_STORAGE_KEY,
        rightPanelWidth.toString(),
      );
    }
  }, [rightPanelWidth]);

  const handleResizeStart = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      setResizeStartX(e.clientX);
      setPointerId(e.pointerId);
      if (containerRef.current) {
        const containerWidth =
          containerRef.current.getBoundingClientRect().width;
        const currentRightWidth = (rightPanelWidth / 100) * containerWidth;
        setResizeStartWidth(currentRightWidth);
      }
      if (resizeHandleRef.current) {
        resizeHandleRef.current.setPointerCapture(e.pointerId);
      }
    },
    [rightPanelWidth],
  );

  const handleResizeMove = useCallback(
    (e: PointerEvent) => {
      if (!isResizing || !containerRef.current) {
        return;
      }

      const containerWidth = containerRef.current.getBoundingClientRect().width;
      const deltaX = resizeStartX - e.clientX;
      const newRightWidth = resizeStartWidth + deltaX;
      const newRightWidthPercent = (newRightWidth / containerWidth) * 100;

      const constrainedPercent = Math.max(
        MIN_RIGHT_PANEL_WIDTH,
        Math.min(MAX_RIGHT_PANEL_WIDTH, newRightWidthPercent),
      );
      setRightPanelWidth(constrainedPercent);
    },
    [isResizing, resizeStartX, resizeStartWidth],
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    if (resizeHandleRef.current && pointerId !== null) {
      resizeHandleRef.current.releasePointerCapture(pointerId);
    }
    setPointerId(null);
  }, [pointerId]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMove = (e: PointerEvent) => handleResizeMove(e);
    const handleEnd = () => void handleResizeEnd();

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
    };
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  return {
    rightPanelWidth,
    isResizing,
    resizeHandleRef,
    containerRef,
    handleResizeStart,
  };
}

import { createContext, useContext, useCallback, type ReactNode } from "react";
import type { UIMessage } from "ai";
import type { CardConfig, Config } from "@/lib/types";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import { getMessageById, updateMessageParts } from "@/lib/workspace/chat-repo";

interface ArtifactMutationContextValue {
  updateArtifactConfig: (
    artifactId: string,
    config: { chartConfig?: Config; cardConfig?: CardConfig },
  ) => Promise<void>;
  updateArtifactPayload: (
    artifactId: string,
    updater: (currentPayload: SqlAnalysisData | undefined) => SqlAnalysisData,
  ) => Promise<void>;
}

const ArtifactMutationContext =
  createContext<ArtifactMutationContextValue | null>(null);

interface ArtifactMutationProviderProps {
  chatId: string;
  messages: UIMessage[];
  setMessages: (updater: (prev: UIMessage[]) => UIMessage[]) => void;
  executeSqlArtifactType: string;
  children: ReactNode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function hasArtifactInParts(
  parts: unknown,
  artifactId: string,
  executeSqlArtifactType: string,
): boolean {
  if (!Array.isArray(parts)) {
    return false;
  }

  return parts.some((part) => {
    if (!isRecord(part)) {
      return false;
    }

    const partType =
      typeof part.type === "string" ? (part.type as string) : undefined;
    const partData = isRecord(part.data) ? part.data : undefined;
    if (
      partType === executeSqlArtifactType &&
      partData &&
      partData.id === artifactId
    ) {
      return true;
    }

    if (!partType || !partType.startsWith("tool-")) {
      return false;
    }

    const toolOutput = isRecord(part.output) ? part.output : undefined;
    const toolResult = isRecord(part.result) ? part.result : undefined;
    return (
      hasArtifactInParts(toolOutput?.parts, artifactId, executeSqlArtifactType) ||
      hasArtifactInParts(toolResult?.parts, artifactId, executeSqlArtifactType)
    );
  });
}

function updateArtifactInParts({
  parts,
  artifactId,
  executeSqlArtifactType,
  updater,
}: {
  parts: unknown;
  artifactId: string;
  executeSqlArtifactType: string;
  updater: (currentPayload: SqlAnalysisData | undefined) => SqlAnalysisData;
}): { parts: unknown[]; updated: boolean } {
  if (!Array.isArray(parts)) {
    return { parts: [], updated: false };
  }

  let updated = false;
  const nextParts = parts.map((part) => {
    if (!isRecord(part)) {
      return part;
    }

    const partType =
      typeof part.type === "string" ? (part.type as string) : undefined;
    const partData = isRecord(part.data) ? part.data : undefined;
    if (
      partType === executeSqlArtifactType &&
      partData &&
      partData.id === artifactId
    ) {
      updated = true;
      return {
        ...part,
        data: {
          ...partData,
          payload: updater(partData.payload as SqlAnalysisData | undefined),
          updatedAt: Date.now(),
        },
      };
    }

    if (!partType || !partType.startsWith("tool-")) {
      return part;
    }

    let nextPart = part;

    (["output", "result"] as const).forEach((field) => {
      const nested = isRecord(part[field]) ? part[field] : undefined;
      if (!nested) {
        return;
      }

      const nestedUpdate = updateArtifactInParts({
        parts: nested.parts,
        artifactId,
        executeSqlArtifactType,
        updater,
      });

      if (!nestedUpdate.updated) {
        return;
      }

      updated = true;
      nextPart = {
        ...nextPart,
        [field]: {
          ...nested,
          parts: nestedUpdate.parts,
        },
      };
    });

    return nextPart;
  });

  return {
    parts: nextParts,
    updated,
  };
}

export function ArtifactMutationProvider({
  chatId,
  messages,
  setMessages,
  executeSqlArtifactType,
  children,
}: ArtifactMutationProviderProps) {
  const updateArtifactPayload = useCallback(
    async (
      artifactId: string,
      updater: (currentPayload: SqlAnalysisData | undefined) => SqlAnalysisData,
    ) => {
      const targetMessage = messages.find((msg) =>
        hasArtifactInParts(msg.parts, artifactId, executeSqlArtifactType),
      );

      if (!targetMessage) {
        console.warn(`Message not found for artifact ${artifactId}`);
        return;
      }

      // Update local state optimistically.
      setMessages((prev) =>
        prev.map((msg) => {
          if (!hasArtifactInParts(msg.parts, artifactId, executeSqlArtifactType)) {
            return msg;
          }

          const next = updateArtifactInParts({
            parts: msg.parts,
            artifactId,
            executeSqlArtifactType,
            updater,
          });

          if (!next.updated) {
            return msg;
          }

          return {
            ...msg,
            parts: next.parts as UIMessage["parts"],
          };
        }),
      );

      // Persist to browser workspace.
      try {
        const storedMessage = await getMessageById(targetMessage.id);
        if (!storedMessage) {
          return;
        }

        let storedParts: unknown = [];
        if (storedMessage.parts) {
          try {
            storedParts = JSON.parse(storedMessage.parts);
          } catch {
            storedParts = [];
          }
        }

        const persistedUpdate = updateArtifactInParts({
          parts: storedParts,
          artifactId,
          executeSqlArtifactType,
          updater,
        });

        if (!persistedUpdate.updated) {
          return;
        }

        await updateMessageParts(
          chatId,
          targetMessage.id,
          JSON.stringify(persistedUpdate.parts),
        );
      } catch (error) {
        console.error("Failed to update artifact payload:", error);
      }
    },
    [chatId, executeSqlArtifactType, messages, setMessages],
  );

  const updateArtifactConfig = useCallback(
    async (
      artifactId: string,
      config: { chartConfig?: Config; cardConfig?: CardConfig },
    ) => {
      await updateArtifactPayload(artifactId, (currentPayload) => ({
        ...(currentPayload ?? {}),
        chartConfig: config.chartConfig ?? currentPayload?.chartConfig,
        cardConfig: config.cardConfig ?? currentPayload?.cardConfig,
      }));
    },
    [updateArtifactPayload],
  );

  return (
    <ArtifactMutationContext.Provider
      value={{ updateArtifactConfig, updateArtifactPayload }}
    >
      {children}
    </ArtifactMutationContext.Provider>
  );
}

export function useArtifactMutation() {
  const context = useContext(ArtifactMutationContext);
  if (!context) {
    throw new Error(
      "useArtifactMutation must be used within an ArtifactMutationProvider",
    );
  }
  return context;
}

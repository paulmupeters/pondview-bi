import { createContext, useContext, useCallback, type ReactNode } from "react";
import type { UIMessage } from "ai";
import type { CardConfig, Config } from "@/lib/types";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { ArtifactStatus } from "@/hooks/types";
import { getMessageById, updateMessageParts } from "@/lib/workspace/chat-repo";

interface ArtifactMutationContextValue {
  updateArtifactConfig: (
    artifactId: string,
    config: { chartConfig?: Config; cardConfig?: CardConfig },
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

export function ArtifactMutationProvider({
  chatId,
  messages,
  setMessages,
  executeSqlArtifactType,
  children,
}: ArtifactMutationProviderProps) {
  const updateArtifactConfig = useCallback(
    async (
      artifactId: string,
      config: { chartConfig?: Config; cardConfig?: CardConfig },
    ) => {
      // Find the message containing this artifact
      const message = messages.find((msg) =>
        msg.parts?.some(
          (part) =>
            part.type === executeSqlArtifactType &&
            (part as { data?: { id?: string } }).data?.id === artifactId,
        ),
      );

      if (!message) {
        console.warn(`Message not found for artifact ${artifactId}`);
        return;
      }

      // Find the artifact part
      const artifactPart = message.parts?.find(
        (part) =>
          part.type === executeSqlArtifactType &&
          (part as { data?: { id?: string } }).data?.id === artifactId,
      ) as
        | { data?: { payload?: SqlAnalysisData; status?: ArtifactStatus } }
        | undefined;

      if (!artifactPart?.data) {
        console.warn(`Artifact part not found for ${artifactId}`);
        return;
      }

      // Update the payload
      const updatedPayload: SqlAnalysisData = {
        ...artifactPart.data.payload,
        chartConfig:
          config.chartConfig ?? artifactPart.data.payload?.chartConfig,
        cardConfig: config.cardConfig ?? artifactPart.data.payload?.cardConfig,
      };

      // Update local state optimistically
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== message.id) return msg;
          return {
            ...msg,
            parts: msg.parts?.map((part) => {
              if (
                part.type === executeSqlArtifactType &&
                (part as { data?: { id?: string } }).data?.id === artifactId
              ) {
                return {
                  ...part,
                  data: {
                    ...((part as { data?: unknown }).data as Record<
                      string,
                      unknown
                    >),
                    payload: updatedPayload,
                    updatedAt: Date.now(),
                  },
                };
              }
              return part;
            }),
          };
        }),
      );

      // Persist to browser workspace
      try {
        const storedMessage = await getMessageById(message.id);
        if (!storedMessage) {
          return;
        }

        let parts: unknown[] = [];
        if (storedMessage.parts) {
          try {
            parts = JSON.parse(storedMessage.parts);
          } catch {
            parts = [];
          }
        }

        const updatedParts = parts.map((part) => {
          const typedPart = part as {
            type?: string;
            data?: { id?: string; payload?: unknown };
          };
          if (typedPart.data?.id === artifactId) {
            return {
              ...typedPart,
              data: {
                ...typedPart.data,
                payload: updatedPayload,
              },
            };
          }
          return part;
        });

        await updateMessageParts(chatId, message.id, JSON.stringify(updatedParts));
      } catch (error) {
        console.error("Failed to update artifact config:", error);
      }
    },
    [chatId, executeSqlArtifactType, messages, setMessages],
  );

  return (
    <ArtifactMutationContext.Provider value={{ updateArtifactConfig }}>
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

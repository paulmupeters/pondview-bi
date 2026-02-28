import { createContext, useContext, useCallback, type ReactNode } from "react";
import type { UIMessage } from "ai";
import type { CardConfig, Config } from "@/lib/types";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { ArtifactStatus } from "@/hooks/types";

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

      // Persist to database
      try {
        await fetch(`/api/chat/${chatId}/message/${message.id}/artifact`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artifactId,
            payload: updatedPayload,
          }),
        });
      } catch (error) {
        console.error("Failed to update artifact config:", error);
        // Reload messages from server on error
        try {
          const res = await fetch(`/api/chat/${chatId}`);
          if (res.ok) {
            const data = (await res.json()) as { messages?: UIMessage[] };
            if (data.messages) {
              setMessages(() => data.messages!);
            }
          }
        } catch (reloadError) {
          console.error("Failed to reload messages:", reloadError);
        }
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

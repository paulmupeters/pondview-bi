import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AiCellState } from "@/features/analysis/components/AiCell";
import { AiResponseBanner } from "@/features/analysis/components/AiCell";
import { animations } from "@/lib/animations";

function createAiState(overrides: Partial<AiCellState> = {}): AiCellState {
  return {
    promptDraft: "",
    setPromptDraft: () => {},
    promptError: null,
    latestAssistantText: null,
    transcriptMessages: [],
    isAssistantThinking: false,
    submitPrompt: async () => {},
    ...overrides,
  };
}

describe("AiResponseBanner", () => {
  test("renders the streaming animation while the assistant is thinking", () => {
    const markup = renderToStaticMarkup(
      <AiResponseBanner
        ai={createAiState({
          isAssistantThinking: true,
        })}
      />,
    );

    expect(markup).toContain("AI Response");
    expect(markup).toContain(animations.wave.frames[0]);
    expect(markup).toContain("Streaming response");
    expect(markup).not.toContain("Assistant is working...");
  });

  test("prefers the latest assistant text once it is available", () => {
    const markup = renderToStaticMarkup(
      <AiResponseBanner
        ai={createAiState({
          isAssistantThinking: true,
          latestAssistantText: "The streamed response is ready.",
        })}
      />,
    );

    expect(markup).toContain("The streamed response is ready.");
    expect(markup).not.toContain(animations.wave.frames[0]);
  });

  test("renders the latest user message above the assistant response", () => {
    const markup = renderToStaticMarkup(
      <AiResponseBanner
        ai={createAiState({
          latestAssistantText: "The assistant answered this prompt.",
          transcriptMessages: [
            {
              id: "user-1",
              role: "user",
              parts: [{ type: "text", text: "Earlier user prompt" }],
            },
            {
              id: "user-2",
              role: "user",
              parts: [{ type: "text", text: "Latest user prompt" }],
            },
          ],
        })}
      />,
    );

    expect(markup).toContain("AI generated");
    expect(markup).toContain("Latest user prompt");
    expect(markup).not.toContain("Earlier user prompt");
  });
});

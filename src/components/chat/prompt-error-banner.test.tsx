import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { PromptErrorBanner } from "@/components/chat/prompt-error-banner";

describe("PromptErrorBanner", () => {
  test("renders nothing without a message", () => {
    expect(renderToStaticMarkup(<PromptErrorBanner message={null} />)).toBe("");
  });

  test("renders the prompt error message and settings link", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <PromptErrorBanner message="Missing AI configuration." />
      </MemoryRouter>,
    );

    expect(markup).toContain("Missing AI configuration.");
    expect(markup).toContain("Open Settings");
    expect(markup).toContain("/settings");
  });
});

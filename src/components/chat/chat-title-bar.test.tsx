import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatTitleBar } from "@/components/chat/chat-title-bar";

describe("ChatTitleBar", () => {
  test("renders the untitled fallback in display mode", () => {
    const markup = renderToStaticMarkup(
      <ChatTitleBar
        model={{
          title: null,
          isEditing: false,
          draftValue: "",
          inputRef: { current: null },
          setDraftValue: () => {},
          beginEditing: () => {},
          handleBlur: () => {},
          handleKeyDown: () => {},
        }}
      />,
    );

    expect(markup).toContain("Untitled chat");
    expect(markup).toContain("Edit chat title");
  });

  test("renders an input while editing", () => {
    const markup = renderToStaticMarkup(
      <ChatTitleBar
        model={{
          title: "Revenue Analysis",
          isEditing: true,
          draftValue: "Revenue Analysis",
          inputRef: { current: null },
          setDraftValue: () => {},
          beginEditing: () => {},
          handleBlur: () => {},
          handleKeyDown: () => {},
        }}
      />,
    );

    expect(markup).toContain('value="Revenue Analysis"');
    expect(markup).toContain('placeholder="Untitled chat"');
  });
});

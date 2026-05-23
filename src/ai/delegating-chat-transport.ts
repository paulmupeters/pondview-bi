import type { ChatTransport, UIMessage } from "ai";

export function createDelegatingChatTransport<UI_MESSAGE extends UIMessage>(
  getTransport: () => ChatTransport<UI_MESSAGE> | null,
  getUnavailableMessage: () => string,
): ChatTransport<UI_MESSAGE> {
  return {
    sendMessages(options) {
      const transport = getTransport();
      if (!transport) {
        throw new Error(getUnavailableMessage());
      }

      return transport.sendMessages(options);
    },
    reconnectToStream(options) {
      return (
        getTransport()?.reconnectToStream(options) ?? Promise.resolve(null)
      );
    },
  };
}

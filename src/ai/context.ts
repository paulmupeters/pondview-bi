import type { UIMessageStreamWriter } from "ai";

// Define custom context type with userId and fullName
interface ChatContext {
  writer: UIMessageStreamWriter;
  userId: string;
  fullName: string;
}

// Simple module-level context
let currentContext: ChatContext | null = null;

export function setContext(context: ChatContext) {
  currentContext = context;
}

export function getContext(): ChatContext {
  if (!currentContext) {
    throw new Error("Context not set. Call setContext first.");
  }
  return currentContext;
}

// Helper function to get current user context (can be used in tools)
export function getCurrentUser() {
  const context = getContext();
  return {
    id: context.userId,
    fullName: context.fullName,
  };
}

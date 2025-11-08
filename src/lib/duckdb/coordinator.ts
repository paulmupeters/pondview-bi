const HEARTBEAT_INTERVAL_MS = 2000;
const STALE_AFTER_MS = HEARTBEAT_INTERVAL_MS * 5;

export type CoordinatorSubscriber = (isOwner: boolean) => void;

export interface Coordinator {
  requestOwnership(): Promise<boolean>;
  waitForRelease(): Promise<void>;
  releaseOwnership(): Promise<void>;
  subscribe(callback: CoordinatorSubscriber): () => void;
  noteServerConflict(reason: string): void;
}

interface OwnershipRecord {
  ownerId: string;
  timestamp: number;
}

const NULL_COORDINATOR: Coordinator = {
  async requestOwnership() {
    return true;
  },
  async waitForRelease() {
    return;
  },
  async releaseOwnership() {
    return;
  },
  subscribe() {
    return () => {
      return;
    };
  },
  noteServerConflict() {
    return;
  },
};

function generateTabId(name: string): string {
  const randomPart =
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
      ? crypto.randomUUID()
      : `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;

  return `${name}:${randomPart}`;
}

function readOwnership(storageKey: string): OwnershipRecord | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as OwnershipRecord | null;
    if (!parsed || typeof parsed.ownerId !== "string") {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Failed to read coordinator state; resetting lock", error);
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

function writeOwnership(storageKey: string, record: OwnershipRecord | null): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  if (!record) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(record));
}

export function createConnectionCoordinator(
  name: string,
  releaseOnUnload = false,
): Coordinator {
  if (typeof window === "undefined" || !window.localStorage) {
    return NULL_COORDINATOR;
  }

  const storageKey = `duckdb:coordinator:${name}`;
  const channelName = `duckdb:coordinator:${name}`;
  const tabId = generateTabId(name);

  const listeners = new Set<CoordinatorSubscriber>();
  let isOwner = false;
  let heartbeatTimer: number | undefined;

  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(channelName)
      : null;

  const notify = () => {
    listeners.forEach((listener) => {
      try {
        listener(isOwner);
      } catch (error) {
        console.error("Coordinator subscriber threw", error);
      }
    });
  };

  const subscribe = (callback: CoordinatorSubscriber): (() => void) => {
    listeners.add(callback);
    callback(isOwner);
    return () => {
      listeners.delete(callback);
    };
  };

  const stopHeartbeat = () => {
    if (heartbeatTimer !== undefined) {
      window.clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
  };

  const updateOwnershipState = (ownerId: string | null) => {
    const nextIsOwner = ownerId === tabId;
    if (isOwner === nextIsOwner) {
      return;
    }

    isOwner = nextIsOwner;

    if (!isOwner) {
      stopHeartbeat();
    }

    notify();
  };

  const broadcastOwnership = (ownerId: string | null) => {
    channel?.postMessage({
      type: "ownership-change",
      ownerId,
      senderId: tabId,
    });
  };

  const heartbeat = () => {
    const record = readOwnership(storageKey);
    if (!record || record.ownerId !== tabId) {
      stopHeartbeat();
      updateOwnershipState(record?.ownerId ?? null);
      return;
    }

    writeOwnership(storageKey, {
      ownerId: tabId,
      timestamp: Date.now(),
    });
  };

  const startHeartbeat = () => {
    if (heartbeatTimer !== undefined) {
      return;
    }

    heartbeatTimer = window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  };

  const claimOwnership = () => {
    writeOwnership(storageKey, {
      ownerId: tabId,
      timestamp: Date.now(),
    });
    startHeartbeat();
    updateOwnershipState(tabId);
    broadcastOwnership(tabId);
  };

  const releaseOwnershipInternal = () => {
    const record = readOwnership(storageKey);
    if (!record || record.ownerId !== tabId) {
      stopHeartbeat();
      updateOwnershipState(record?.ownerId ?? null);
      return;
    }

    stopHeartbeat();
    writeOwnership(storageKey, null);
    updateOwnershipState(null);
    broadcastOwnership(null);
  };

  channel?.addEventListener("message", (event) => {
    const { data } = event;
    if (!data || typeof data !== "object") {
      return;
    }

    if (data.senderId === tabId) {
      return;
    }

    switch (data.type) {
      case "ownership-change":
        updateOwnershipState(typeof data.ownerId === "string" ? data.ownerId : null);
        break;
      case "request-release":
        if (isOwner) {
          releaseOwnershipInternal();
        }
        break;
      default:
        break;
    }
  });

  const storageListener = (event: StorageEvent) => {
    if (event.key !== storageKey) {
      return;
    }

    const record = readOwnership(storageKey);
    updateOwnershipState(record?.ownerId ?? null);
  };

  window.addEventListener("storage", storageListener);

  if (releaseOnUnload) {
    const releaseHandler = () => {
      releaseOwnershipInternal();
    };
    window.addEventListener("beforeunload", releaseHandler);
    window.addEventListener("pagehide", releaseHandler);
  }

  const requestOwnership = async (): Promise<boolean> => {
    const record = readOwnership(storageKey);
    const now = Date.now();

    if (!record) {
      claimOwnership();
      return true;
    }

    if (record.ownerId === tabId) {
      claimOwnership();
      return true;
    }

    if (now - record.timestamp > STALE_AFTER_MS) {
      console.warn(
        `[Coordinator:${name}] ownership held by stale tab ${record.ownerId}, taking control`,
      );
      claimOwnership();
      return true;
    }

    return false;
  };

  const waitForRelease = async (): Promise<void> => {
    const record = readOwnership(storageKey);
    if (!record || record.ownerId === tabId) {
      return;
    }

    await new Promise<void>((resolve) => {
      const checkState = () => {
        const current = readOwnership(storageKey);
        if (!current || current.ownerId === tabId) {
          if (teardown) {
            teardown();
          }
        }
      };

      const pollTimer = window.setInterval(checkState, HEARTBEAT_INTERVAL_MS);

      let teardown: (() => void) | null = null;
      const unsubscribe = subscribe((currentIsOwner) => {
        if (currentIsOwner) {
          if (teardown) {
            teardown();
          }
        }
      });

      const storageHandler = (event: StorageEvent) => {
        if (event.key === storageKey) {
          checkState();
        }
      };

      window.addEventListener("storage", storageHandler);

      teardown = () => {
        window.clearInterval(pollTimer);
        window.removeEventListener("storage", storageHandler);
        unsubscribe();
        resolve();
      };

      checkState();
    });
  };

  const releaseOwnership = async (): Promise<void> => {
    releaseOwnershipInternal();
  };

  const noteServerConflict = (reason: string): void => {
    console.warn(`[Coordinator:${name}] ${reason}`);
    channel?.postMessage({
      type: "request-release",
      reason,
      senderId: tabId,
    });
  };

  return {
    requestOwnership,
    waitForRelease,
    releaseOwnership,
    subscribe,
    noteServerConflict,
  };
}


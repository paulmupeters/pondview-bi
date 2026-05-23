import { canUseBridgeAi } from "@/ai/bridge-chat";
import { hasRequiredAiConfigurationInStorage } from "@/ai/settings";
import type { SqlBackend } from "@/lib/sql/sql-runtime";

export async function hasRequiredAiConfigurationForBackend(
  backend: SqlBackend,
): Promise<boolean> {
  if (hasRequiredAiConfigurationInStorage()) {
    return true;
  }

  if (backend !== "bridge") {
    return false;
  }

  return canUseBridgeAi();
}

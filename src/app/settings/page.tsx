import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AiProvider,
  getAiProviderDisplayName,
  getApiKeyStorageKeyForProvider,
  getMissingRequiredSetting,
  loadAiSettingsFromStorage,
  saveAiSettingsToStorage,
} from "@/ai/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  clearSessionSecret,
  hasSessionSecret,
  runBridgeQuery,
  setSessionSecret,
} from "@/lib/bridge/pondview-bridge";
import {
  applyCustomCss,
  applyTheme,
  getSelectedTheme,
  setSelectedTheme as setThemeInStorage,
} from "@/lib/custom-css";
import {
  getSqlBackendPreferenceFromStorage,
  refreshBridgeHealth,
  type SqlBackend,
  setSqlBackendPreferenceInStorage,
} from "@/lib/sql/sql-runtime";
import {
  useBridgeHealthStatus,
  useSqlBackendPreference,
} from "@/lib/sql/use-sql-backend";
import {
  exportWorkspace,
  importWorkspace,
  resetWorkspace,
  validateWorkspaceImport,
} from "@/lib/workspace/export-import";
import { getAllThemes } from "@/themes";

const CSS_PLACEHOLDER = `:root{
  --background: 0 0% 100%;
  --foreground: oklch(0.1496 0 0);
  --card: oklch(1.0000 0 0);
  /* and more */
}
.dark{
  --background: oklch(0.2156 0.0224 240.6523);
  --foreground: oklch(0.9491 0 0);
  --primary: oklch(0.8280 0.1890 84.4290);
  /* and more */
}`;

const CUSTOM_THEME_VALUE = "custom";

export default function SettingsPage() {
  const [aiProvider, setAiProvider] = useState<AiProvider>("gateway");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [openResponsesUrl, setOpenResponsesUrl] = useState("");
  const [openResponsesName, setOpenResponsesName] = useState("");
  const [cssCode, setCssCode] = useState("");
  const [selectedTheme, setSelectedTheme] =
    useState<string>(CUSTOM_THEME_VALUE);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [bridgeSecret, setBridgeSecret] = useState("");
  const [hasBridgeSecret, setHasBridgeSecret] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [aiSettingsError, setAiSettingsError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<{ name: string; provider: string }[]>(
    [],
  );
  const [secretsError, setSecretsError] = useState<string | null>(null);
  const [isSecretsLoading, setIsSecretsLoading] = useState(false);
  const [isExportingWorkspace, setIsExportingWorkspace] = useState(false);
  const [isImportingWorkspace, setIsImportingWorkspace] = useState(false);
  const [isResettingWorkspace, setIsResettingWorkspace] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const availableThemes = getAllThemes();
  const sqlBackendPreference = useSqlBackendPreference();
  const bridgeHealthStatus = useBridgeHealthStatus();
  const isBridgeAvailable = hasBridgeSecret && bridgeHealthStatus === "online";
  const selectedSqlBackend: SqlBackend =
    sqlBackendPreference === "bridge" ? "bridge" : "duckdb-wasm";

  // Load settings from localStorage on mount
  useEffect(() => {
    const aiSettings = loadAiSettingsFromStorage();
    const savedCss = localStorage.getItem("CUSTOM_CSS") || "";
    const savedTheme = getSelectedTheme();

    setAiProvider(aiSettings.provider);
    setModel(aiSettings.model);
    setApiKey(aiSettings.apiKey);
    setOpenResponsesUrl(aiSettings.openResponsesUrl ?? "");
    setOpenResponsesName(aiSettings.openResponsesName ?? "");
    setCssCode(savedCss);
    // Set selected theme, or "custom" if no theme is selected but custom CSS exists
    setSelectedTheme(savedTheme || (savedCss ? CUSTOM_THEME_VALUE : "default"));
    const hasSecret = hasSessionSecret();
    setHasBridgeSecret(hasSecret);

    const savedBackendPreference = getSqlBackendPreferenceFromStorage();
    if (
      savedBackendPreference === "bridge" ||
      savedBackendPreference === "duckdb-wasm"
    ) {
      const resolvedPreference =
        savedBackendPreference === "bridge" && !hasSecret
          ? "duckdb-wasm"
          : savedBackendPreference;
      if (resolvedPreference !== savedBackendPreference) {
        setSqlBackendPreferenceInStorage(resolvedPreference);
      }
    } else {
      const defaultPreference = hasSecret ? "bridge" : "duckdb-wasm";
      setSqlBackendPreferenceInStorage(defaultPreference);
    }

    void refreshBridgeHealth();
  }, []);

  // Apply CSS on component mount (only if custom theme is selected)
  useEffect(() => {
    if (cssCode && selectedTheme === CUSTOM_THEME_VALUE) {
      applyCustomCss(cssCode);
    }
  }, [cssCode, selectedTheme]);

  useEffect(() => {
    if (!hasBridgeSecret && selectedSqlBackend === "bridge") {
      setSqlBackendPreferenceInStorage("duckdb-wasm");
    }
  }, [hasBridgeSecret, selectedSqlBackend]);

  useEffect(() => {
    if (!hasBridgeSecret) {
      return;
    }

    void refreshBridgeHealth();
    const intervalId = window.setInterval(() => {
      void refreshBridgeHealth();
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasBridgeSecret]);

  const effectiveSqlBackend: SqlBackend =
    selectedSqlBackend === "bridge" && isBridgeAvailable
      ? "bridge"
      : "duckdb-wasm";
  const isBridgeRuntimeActive = effectiveSqlBackend === "bridge";

  const fetchSecrets = useCallback(async () => {
    if (!isBridgeRuntimeActive) {
      setSecrets([]);
      setSecretsError(null);
      setIsSecretsLoading(false);
      return;
    }

    setIsSecretsLoading(true);
    setSecretsError(null);
    try {
      const result = await runBridgeQuery(
        "SELECT name, provider FROM duckdb_secrets();",
      );
      const resolved = result.rows.map((row) => ({
        name: String(row.name ?? ""),
        provider: String(row.provider ?? ""),
      }));
      setSecrets(resolved);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load secrets.";
      setSecrets([]);
      setSecretsError(message);
    } finally {
      setIsSecretsLoading(false);
    }
  }, [isBridgeRuntimeActive]);

  useEffect(() => {
    if (isBridgeRuntimeActive) {
      void fetchSecrets();
      return;
    }

    setSecrets([]);
    setSecretsError(null);
  }, [fetchSecrets, isBridgeRuntimeActive]);

  const handleSetBridgeSecret = () => {
    setSessionSecret(bridgeSecret);
    setHasBridgeSecret(hasSessionSecret());
    void refreshBridgeHealth();
    setBridgeSecret("");
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleClearBridgeSecret = () => {
    clearSessionSecret();
    setHasBridgeSecret(false);
    void refreshBridgeHealth();
    if (selectedSqlBackend === "bridge") {
      setSqlBackendPreferenceInStorage("duckdb-wasm");
    }
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleSqlBackendChange = (backend: SqlBackend) => {
    if (backend === "bridge" && !isBridgeAvailable) {
      return;
    }
    setSqlBackendPreferenceInStorage(backend);
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleExportWorkspace = async () => {
    setIsExportingWorkspace(true);
    try {
      const payload = await exportWorkspace();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "pondview-workspace-v1.json";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(href);
    } finally {
      setIsExportingWorkspace(false);
    }
  };

  const handleImportWorkspace = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsImportingWorkspace(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const payload = validateWorkspaceImport(parsed);
      await importWorkspace(payload);
      location.reload();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to import workspace.";
      setSecretsError(message);
    } finally {
      setIsImportingWorkspace(false);
      if (importFileRef.current) {
        importFileRef.current.value = "";
      }
    }
  };

  const handleResetWorkspace = async () => {
    if (
      !confirm(
        "Reset all browser workspace data (chats, dashboards, preferences)? This cannot be undone.",
      )
    ) {
      return;
    }

    setIsResettingWorkspace(true);
    try {
      await resetWorkspace();
      location.reload();
    } finally {
      setIsResettingWorkspace(false);
    }
  };

  const handleSaveAiSettings = async () => {
    const settings = {
      provider: aiProvider,
      model,
      apiKey,
      openResponsesUrl,
      openResponsesName,
    };
    const missingSetting = getMissingRequiredSetting(settings);
    if (missingSetting) {
      setAiSettingsError(`Missing ${missingSetting}.`);
      return;
    }

    setIsSaving(true);
    try {
      saveAiSettingsToStorage(settings);
      setAiSettingsError(null);
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAiProviderChange = (provider: AiProvider) => {
    const persistedApiKey = localStorage.getItem(
      getApiKeyStorageKeyForProvider(provider),
    );

    setAiProvider(provider);
    setApiKey((persistedApiKey ?? "").trim());
    setAiSettingsError(null);
  };

  const handleSaveCss = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem("CUSTOM_CSS", cssCode);
      applyCustomCss(cssCode);
      setSelectedTheme(CUSTOM_THEME_VALUE);
      setIsDialogOpen(false);
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleThemeChange = (themeName: string) => {
    setIsSaving(true);
    try {
      if (themeName === CUSTOM_THEME_VALUE) {
        // Switch to custom - clear theme selection, use custom CSS if available
        setSelectedTheme(CUSTOM_THEME_VALUE);
        setThemeInStorage(null); // Clear theme from localStorage
        const savedCss = localStorage.getItem("CUSTOM_CSS") || "";
        if (savedCss) {
          applyCustomCss(savedCss);
        }
      } else {
        // Apply selected theme and clear custom CSS
        setSelectedTheme(themeName);
        applyTheme(themeName);
        setCssCode("");
        localStorage.removeItem("CUSTOM_CSS");
      }
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <div className="p-8 max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground mb-8">
            Manage your application preferences and configuration.
          </p>

          {showSuccessMessage && (
            <div className="mb-6 p-4 rounded-lg bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200">
              Settings saved successfully!
            </div>
          )}

          {/* AI Provider Section */}
          <Card className="p-6 mb-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">
                  AI Provider Configuration
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure provider credentials and model selection for AI
                  requests.
                </p>
              </div>

              <div>
                <label
                  htmlFor="ai-provider"
                  className="text-sm font-medium mb-2 block"
                >
                  Provider
                </label>
                <Select
                  value={aiProvider}
                  onValueChange={(value) =>
                    handleAiProviderChange(value as AiProvider)
                  }
                >
                  <SelectTrigger id="ai-provider" className="mb-4">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gateway">Gateway</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="xai">xAI</SelectItem>
                    <SelectItem value="open-responses">
                      Open Responses
                    </SelectItem>
                  </SelectContent>
                </Select>

                <label
                  htmlFor="model-id"
                  className="text-sm font-medium mb-2 block"
                >
                  Model
                </label>
                <Input
                  id="model-id"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Enter model ID"
                  className="mb-4"
                />

                <label
                  htmlFor="api-key"
                  className="text-sm font-medium mb-2 block"
                >
                  {getApiKeyStorageKeyForProvider(aiProvider)}
                </label>
                <Input
                  id="api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="mb-4"
                />
                {aiProvider === "open-responses" && (
                  <>
                    <label
                      htmlFor="open-responses-url"
                      className="text-sm font-medium mb-2 block"
                    >
                      Open Responses URL
                    </label>
                    <Input
                      id="open-responses-url"
                      type="text"
                      value={openResponsesUrl}
                      onChange={(e) => setOpenResponsesUrl(e.target.value)}
                      placeholder="https://api.example.com/v1"
                      className="mb-4"
                    />

                    <label
                      htmlFor="open-responses-name"
                      className="text-sm font-medium mb-2 block"
                    >
                      Open Responses Provider Name
                    </label>
                    <Input
                      id="open-responses-name"
                      type="text"
                      value={openResponsesName}
                      onChange={(e) => setOpenResponsesName(e.target.value)}
                      placeholder="openresponses"
                      className="mb-4"
                    />
                  </>
                )}
                {aiSettingsError && (
                  <p className="mb-4 text-sm text-red-600 dark:text-red-400">
                    {aiSettingsError}
                  </p>
                )}
                <Button
                  onClick={handleSaveAiSettings}
                  disabled={isSaving}
                  className="w-full sm:w-auto"
                >
                  {isSaving
                    ? "Saving..."
                    : `Save ${getAiProviderDisplayName(aiProvider)} Settings`}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6 mb-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">
                  Duckdb Authentication
                </h2>
                <p className="text-sm text-muted-foreground">
                  Optional session-only Pondview secret for authenticated bridge
                  queries. Leave empty when Pondview is started with an empty
                  secret (no-auth mode).
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs flex items-center justify-between">
                <span className="text-muted-foreground">SQL runtime</span>
                <span className={isBridgeRuntimeActive ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                  {isBridgeRuntimeActive
                    ? "Bridge"
                    : hasBridgeSecret
                      ? bridgeHealthStatus === "offline"
                        ? "DuckDB WASM (bridge unavailable)"
                        : "DuckDB WASM (manual selection)"
                      : "DuckDB WASM"}
                </span>
              </div>
              <div>
                <label
                  htmlFor="sql-backend-select"
                  className="text-sm font-medium mb-2 block"
                >
                  Query Runtime
                </label>
                <Select
                  value={selectedSqlBackend}
                  onValueChange={(value) =>
                    handleSqlBackendChange(value as SqlBackend)
                  }
                >
                  <SelectTrigger
                    id="sql-backend-select"
                    className="w-full sm:w-auto"
                  >
                    <SelectValue placeholder="Select query runtime" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="duckdb-wasm">DuckDB WASM</SelectItem>
                    <SelectItem value="bridge" disabled={!isBridgeAvailable}>
                      Bridge {isBridgeAvailable ? "" : "(Unavailable)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="password"
                  value={bridgeSecret}
                  onChange={(event) => setBridgeSecret(event.target.value)}
                  placeholder="Enter Pondview secret"
                />
                <Button
                  onClick={handleSetBridgeSecret}
                  disabled={!bridgeSecret.trim().length}
                >
                  Set Session Secret
                </Button>
                <Button
                  variant="outline"
                  onClick={handleClearBridgeSecret}
                  disabled={!hasBridgeSecret}
                >
                  Clear
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6 mb-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">Workspace Data</h2>
                <p className="text-sm text-muted-foreground">
                  Export, import, or reset browser-local workspace state.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => void handleExportWorkspace()}
                  disabled={isExportingWorkspace}
                >
                  {isExportingWorkspace ? "Exporting..." : "Export Workspace"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => importFileRef.current?.click()}
                  disabled={isImportingWorkspace}
                >
                  {isImportingWorkspace ? "Importing..." : "Import Workspace"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void handleResetWorkspace()}
                  disabled={isResettingWorkspace}
                >
                  {isResettingWorkspace ? "Resetting..." : "Reset Workspace"}
                </Button>
              </div>

              <input
                ref={importFileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportWorkspace}
              />
            </div>
          </Card>

          {/* DuckDB Secrets Section */}
          <Card className="p-6 mb-6">
            <div className="flex flex-col gap-4">
              {isBridgeRuntimeActive ? (
                <>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <h2 className="text-xl font-semibold mb-2">
                        DuckDB Secrets
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        View persistent secrets managed by DuckDB. Use{" "}
                        <code className="bg-muted px-1 py-0.5 rounded text-xs">
                          CREATE PERSISTENT SECRET
                        </code>{" "}
                        in the DuckDB shell to add one.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => void fetchSecrets()}
                      disabled={isSecretsLoading}
                      className="whitespace-nowrap"
                    >
                      {isSecretsLoading ? "Refreshing..." : "Refresh"}
                    </Button>
                  </div>

                  <div className="border rounded-lg divide-y bg-muted/20">
                    {isSecretsLoading ? (
                      <div className="p-4 text-sm text-muted-foreground">
                        Loading secrets...
                      </div>
                    ) : secretsError ? (
                      <div className="p-4 text-sm text-red-600 dark:text-red-400">
                        {secretsError}
                      </div>
                    ) : secrets.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground">
                            No persistent secrets found. Create one and it will
                            appear here.
                      </div>
                    ) : (
                      secrets.map((secret) => (
                        <div
                          key={`${secret.provider}:${secret.name}`}
                          className="p-4 flex justify-between items-center gap-4"
                        >
                          <div>
                            <p className="font-medium">{secret.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Provider: {secret.provider || "unknown"}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div>
                  <h2 className="text-xl font-semibold mb-2">DuckDB Secrets</h2>
                  <p className="text-sm text-muted-foreground">
                      DuckDB secrets are bridge-only. SQL queries are currently
                      running through DuckDB WASM.
                    {!hasBridgeSecret
                      ? " Configure a bridge secret and switch runtime to Bridge to view secrets."
                      : bridgeHealthStatus === "offline"
                        ? " Bridge appears offline. Start Pondview bridge and switch runtime to Bridge to view secrets."
                        : " Switch runtime to Bridge to view secrets."}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Theme Selection Section */}
          <Card className="p-6 mb-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">Theme Selection</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose a default theme or create your own custom theme.
                </p>
              </div>

              <div>
                <label
                  htmlFor="theme-select"
                  className="text-sm font-medium mb-2 block"
                >
                  Select Theme
                </label>
                <Select
                  value={selectedTheme}
                  onValueChange={handleThemeChange}
                  disabled={isSaving}
                >
                  <SelectTrigger id="theme-select" className="w-full sm:w-auto">
                    <SelectValue placeholder="Select a theme" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableThemes.map((theme) => (
                      <SelectItem key={theme.name} value={theme.name}>
                        {theme.displayName}
                      </SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_THEME_VALUE}>Custom</SelectItem>
                  </SelectContent>
                </Select>
                {selectedTheme !== CUSTOM_THEME_VALUE && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Currently using:{" "}
                    <span className="font-medium">
                      {availableThemes.find((t) => t.name === selectedTheme)
                        ?.displayName || "Default"}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Style Editor Section */}
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">Custom Styles</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  {selectedTheme === CUSTOM_THEME_VALUE
                    ? "Customize the appearance of the application using CSS variables."
                    : "Select 'Custom' theme to edit your own CSS styles."}
                </p>
              </div>

              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={selectedTheme !== CUSTOM_THEME_VALUE}
                  >
                    Edit Styles
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Edit Custom CSS</DialogTitle>
                    <DialogDescription>
                      Paste your custom CSS here. Changes will be applied
                      immediately.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <Textarea
                      value={cssCode}
                      onChange={(e) => setCssCode(e.target.value)}
                      placeholder={CSS_PLACEHOLDER}
                      className="font-mono text-sm min-h-[400px]"
                    />
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSaveCss} disabled={isSaving}>
                      {isSaving ? "Saving..." : "Save Styles"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {cssCode && selectedTheme === CUSTOM_THEME_VALUE && (
                <div className="p-3 rounded-lg bg-muted text-sm">
                  <p className="font-medium mb-1">Current CSS:</p>
                  <pre className="text-xs overflow-auto max-h-40 bg-background p-2 rounded border">
                    {cssCode}
                  </pre>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

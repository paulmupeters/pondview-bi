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
  setSessionSecret,
} from "@/lib/bridge/pondview-bridge";
import {
  setExecuteSqlRawOutputPreference,
  setShowToolCallsPreference,
  useExecuteSqlRawOutputPreference,
  useShowToolCallsPreference,
} from "@/lib/chat-display-preferences";
import {
  applyCustomCss,
  applyTheme,
  getSelectedTheme,
  setSelectedTheme as setThemeInStorage,
} from "@/lib/custom-css";
import {
  type DefaultPromptMode,
  setDefaultPromptModePreference,
  useDefaultPromptModePreference,
} from "@/lib/default-prompt-mode";
import {
  clearDuckDbHttpConfigInStorage,
  clearDuckDbHttpSessionAuth,
  getDuckDbHttpConfigFromStorage,
  hasDuckDbHttpSessionAuth,
  refreshDuckDbHttpHealth,
  setDuckDbHttpConfigInStorage,
  setDuckDbHttpSessionAuth,
} from "@/lib/duckdb/duckdb-http-browser";
import { importParsedProjectArtifacts } from "@/lib/project-artifacts/import";
import { parseProjectArtifactFileSet } from "@/lib/project-artifacts/parse";
import {
  clearProjectRuntimeSelection,
  hydrateProjectRuntimeFromParsedArtifacts,
} from "@/lib/project-runtime";
import {
  getOpenProject,
  listOpenProjectFiles,
  setOpenProject,
} from "@/lib/project-store";
import {
  type BrowserProjectBundle,
  createBrowserProjectArchive,
  parseBrowserProjectArchive,
  parseBrowserProjectBundle,
  restoreBrowserProjectBundle,
} from "@/lib/project-store/project-transfer";
import {
  refreshBridgeHealth,
  type SqlBackend,
  setSqlBackendPreferenceInStorage,
} from "@/lib/sql/sql-runtime";
import {
  useBridgeRuntimeState,
  useDuckDbHttpConfig,
  useDuckDbHttpHealthStatus,
  useResolvedSqlBackend,
  useSelectedSqlBackend,
} from "@/lib/sql/use-sql-backend";
import {
  exportWorkspace,
  importWorkspace,
  validateWorkspaceImport,
} from "@/lib/workspace/export-import";
import { switchToFreshWorkspaceDatabase } from "@/lib/workspace/workspace-db";
import { getAllThemes } from "@/themes";
import { getActiveRuntimeLabel } from "./runtime-label";

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

function projectDownloadName(name: string): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
  return `pondview-project-${slug}.zip`;
}

export default function SettingsPage() {
  const [aiProvider, setAiProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [openAiCompatibleUrl, setOpenAiCompatibleUrl] = useState("");
  const [openAiCompatibleName, setOpenAiCompatibleName] = useState("");
  const [cssCode, setCssCode] = useState("");
  const [selectedTheme, setSelectedTheme] =
    useState<string>(CUSTOM_THEME_VALUE);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [bridgeSecret, setBridgeSecret] = useState("");
  const [duckDbHttpHost, setDuckDbHttpHost] = useState("");
  const [duckDbHttpPort, setDuckDbHttpPort] = useState("");
  const [duckDbHttpAuth, setDuckDbHttpAuth] = useState("");
  const [hasDuckDbHttpAuth, setHasDuckDbHttpAuth] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [aiSettingsError, setAiSettingsError] = useState<string | null>(null);
  const [runtimeSettingsError, setRuntimeSettingsError] = useState<
    string | null
  >(null);
  const [runtimeSettingsSuccess, setRuntimeSettingsSuccess] = useState<
    string | null
  >(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isTestingHttpConnection, setIsTestingHttpConnection] = useState(false);
  const [isExportingWorkspace, setIsExportingWorkspace] = useState(false);
  const [isImportingWorkspace, setIsImportingWorkspace] = useState(false);
  const [isResettingWorkspace, setIsResettingWorkspace] = useState(false);
  const [openProjectName, setOpenProjectName] = useState("");
  const [openProjectStatus, setOpenProjectStatus] = useState<string | null>(
    null,
  );
  const [openProjectError, setOpenProjectError] = useState<string | null>(null);
  const [openProjectFileCount, setOpenProjectFileCount] = useState(0);
  const [isOpeningProject, setIsOpeningProject] = useState(false);
  const [isClosingProject, setIsClosingProject] = useState(false);
  const [isExportingProject, setIsExportingProject] = useState(false);
  const [isImportingProject, setIsImportingProject] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const projectImportFileRef = useRef<HTMLInputElement>(null);
  const availableThemes = getAllThemes();
  const bridgeRuntimeState = useBridgeRuntimeState();
  const duckDbHttpConfig = useDuckDbHttpConfig();
  const duckDbHttpHealthStatus = useDuckDbHttpHealthStatus();
  const showToolCalls = useShowToolCallsPreference();
  const showExecuteSqlRawOutput = useExecuteSqlRawOutputPreference();
  const defaultPromptMode = useDefaultPromptModePreference();
  const bridgeHealthStatus = bridgeRuntimeState.healthStatus;
  const bridgeConfig = bridgeRuntimeState.config;
  const hasBridgeSessionSecret = bridgeRuntimeState.hasSessionSecret;
  const isBridgeDiscoverable = bridgeRuntimeState.isDiscoverable;
  const isBridgeQueryReady = bridgeRuntimeState.isQueryReady;
  const isDuckDbHttpConfigured = Boolean(duckDbHttpConfig);
  const selectedSqlBackend = useSelectedSqlBackend();
  const effectiveSqlBackend = useResolvedSqlBackend();

  const refreshOpenProjectCard = useCallback(async () => {
    const project = await getOpenProject();
    const files = project ? await listOpenProjectFiles() : [];
    setOpenProjectName(project?.name ?? "");
    setOpenProjectStatus(
      project ? `Open project: ${project.name}` : "No project open.",
    );
    setOpenProjectFileCount(files.length);
  }, []);

  // Load settings from localStorage on mount
  useEffect(() => {
    const aiSettings = loadAiSettingsFromStorage();
    const savedCss = localStorage.getItem("CUSTOM_CSS") || "";
    const savedTheme = getSelectedTheme();

    setAiProvider(aiSettings.provider);
    setModel(aiSettings.model);
    setApiKey(aiSettings.apiKey);
    setOpenAiCompatibleUrl(aiSettings.openAiCompatibleUrl ?? "");
    setOpenAiCompatibleName(aiSettings.openAiCompatibleName ?? "");
    setCssCode(savedCss);
    // Set selected theme, or "custom" if no theme is selected but custom CSS exists
    setSelectedTheme(savedTheme || (savedCss ? CUSTOM_THEME_VALUE : "default"));
    setHasDuckDbHttpAuth(hasDuckDbHttpSessionAuth());

    const savedDuckDbHttpConfig = getDuckDbHttpConfigFromStorage();
    setDuckDbHttpHost(savedDuckDbHttpConfig?.host ?? "");
    setDuckDbHttpPort(
      savedDuckDbHttpConfig ? String(savedDuckDbHttpConfig.port) : "",
    );

    void refreshBridgeHealth();
    if (savedDuckDbHttpConfig) {
      void refreshDuckDbHttpHealth();
    }

    void (async () => {
      try {
        await refreshOpenProjectCard();
      } catch (error) {
        setOpenProjectError(
          error instanceof Error
            ? error.message
            : "Failed to load browser-local project state.",
        );
      }
    })();
  }, [refreshOpenProjectCard]);

  useEffect(() => {
    setDuckDbHttpHost(duckDbHttpConfig?.host ?? "");
    setDuckDbHttpPort(duckDbHttpConfig ? String(duckDbHttpConfig.port) : "");
  }, [duckDbHttpConfig]);

  // Apply CSS on component mount (only if custom theme is selected)
  useEffect(() => {
    if (cssCode && selectedTheme === CUSTOM_THEME_VALUE) {
      applyCustomCss(cssCode);
    }
  }, [cssCode, selectedTheme]);

  useEffect(() => {
    if (!isDuckDbHttpConfigured) {
      return;
    }

    void refreshDuckDbHttpHealth();
    const intervalId = window.setInterval(() => {
      void refreshDuckDbHttpHealth();
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isDuckDbHttpConfigured]);

  const handleSetBridgeSecret = () => {
    setSessionSecret(bridgeSecret);
    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess(null);
    void refreshBridgeHealth();
    setBridgeSecret("");
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleClearBridgeSecret = () => {
    clearSessionSecret();
    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess(null);
    void refreshBridgeHealth();
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleSqlBackendChange = (backend: SqlBackend) => {
    if (backend === "bridge" && !isBridgeDiscoverable) {
      return;
    }

    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess(null);
    setSqlBackendPreferenceInStorage(backend);
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleSaveDuckDbHttpConfig = () => {
    const host = duckDbHttpHost.trim();
    const port = Number.parseInt(duckDbHttpPort.trim(), 10);
    const auth = duckDbHttpAuth.trim();

    if (!host) {
      setRuntimeSettingsError("DuckDB HTTP host is required.");
      setRuntimeSettingsSuccess(null);
      return;
    }

    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      setRuntimeSettingsError(
        "DuckDB HTTP port must be a valid number between 1 and 65535.",
      );
      setRuntimeSettingsSuccess(null);
      return;
    }

    if (auth.length) {
      setDuckDbHttpSessionAuth(auth);
      setHasDuckDbHttpAuth(hasDuckDbHttpSessionAuth());
      setDuckDbHttpAuth("");
    }

    setDuckDbHttpConfigInStorage({ host, port });
    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess("DuckDB HTTP connection settings saved.");
    void refreshDuckDbHttpHealth();
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleClearDuckDbHttpConfig = () => {
    clearDuckDbHttpConfigInStorage();
    setDuckDbHttpHost("");
    setDuckDbHttpPort("");
    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess("DuckDB HTTP connection settings cleared.");
    if (selectedSqlBackend === "duckdb-http") {
      setSqlBackendPreferenceInStorage("duckdb-wasm");
    }
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleClearDuckDbHttpAuth = () => {
    clearDuckDbHttpSessionAuth();
    setHasDuckDbHttpAuth(false);
    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess("DuckDB HTTP auth cleared.");
    void refreshDuckDbHttpHealth();
    if (selectedSqlBackend === "duckdb-http" && !isDuckDbHttpConfigured) {
      setSqlBackendPreferenceInStorage("duckdb-wasm");
    }
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleTestDuckDbHttpConnection = async () => {
    const host = duckDbHttpHost.trim();
    const port = Number.parseInt(duckDbHttpPort.trim(), 10);

    if (!host) {
      setRuntimeSettingsError("DuckDB HTTP host is required.");
      setRuntimeSettingsSuccess(null);
      return;
    }

    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      setRuntimeSettingsError(
        "DuckDB HTTP port must be a valid number between 1 and 65535.",
      );
      setRuntimeSettingsSuccess(null);
      return;
    }

    setIsTestingHttpConnection(true);
    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess(null);

    try {
      setDuckDbHttpConfigInStorage({ host, port });
      const status = await refreshDuckDbHttpHealth(undefined, { host, port });
      if (status === "online") {
        setRuntimeSettingsSuccess(
          "Connection successful — DuckDB HTTP is reachable.",
        );
        setShowSuccessMessage(true);
        setTimeout(() => setShowSuccessMessage(false), 3000);
      } else {
        setRuntimeSettingsSuccess(null);
        setRuntimeSettingsError(
          "Connection failed — DuckDB HTTP server is not reachable.",
        );
      }
    } catch {
      setRuntimeSettingsSuccess(null);
      setRuntimeSettingsError("Connection test failed unexpectedly.");
    } finally {
      setIsTestingHttpConnection(false);
    }
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
      setWorkspaceError(message);
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
      switchToFreshWorkspaceDatabase();
      location.reload();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to reset workspace data.";
      setWorkspaceError(message);
      setIsResettingWorkspace(false);
    }
  };

  const handleOpenProject = async () => {
    const normalizedName = openProjectName.trim();
    if (!normalizedName) {
      setOpenProjectError("Project name is required.");
      setOpenProjectStatus(null);
      return;
    }

    setIsOpeningProject(true);
    setOpenProjectError(null);
    setOpenProjectStatus(null);

    try {
      const now = Date.now();
      await setOpenProject({
        id: `browser-project-${
          normalizedName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "") || "project"
        }`,
        name: normalizedName,
        backingKind: "browser-indexeddb",
        openedAt: now,
        updatedAt: now,
      });
      clearProjectRuntimeSelection();
      await refreshOpenProjectCard();
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } catch (error) {
      setOpenProjectError(
        error instanceof Error ? error.message : "Failed to open project.",
      );
    } finally {
      setIsOpeningProject(false);
    }
  };

  const handleCloseProject = async () => {
    setIsClosingProject(true);
    setOpenProjectError(null);
    setOpenProjectStatus(null);

    try {
      await setOpenProject(null);
      clearProjectRuntimeSelection();
      await refreshOpenProjectCard();
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } catch (error) {
      setOpenProjectError(
        error instanceof Error ? error.message : "Failed to close project.",
      );
    } finally {
      setIsClosingProject(false);
    }
  };

  const handleExportProject = async () => {
    setIsExportingProject(true);
    setOpenProjectError(null);

    try {
      const project = await getOpenProject();
      if (!project) {
        throw new Error("Open a browser-local project before exporting it.");
      }

      const archive = createBrowserProjectArchive({
        project,
        files: await listOpenProjectFiles(),
      });
      const blob = new Blob([archive], {
        type: "application/zip",
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = projectDownloadName(project.name);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(href);
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } catch (error) {
      setOpenProjectError(
        error instanceof Error ? error.message : "Failed to export project.",
      );
    } finally {
      setIsExportingProject(false);
    }
  };

  const handleImportProject = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsImportingProject(true);
    setOpenProjectError(null);

    try {
      let bundle: BrowserProjectBundle;
      if (file.name.toLowerCase().endsWith(".zip")) {
        bundle = parseBrowserProjectArchive(await file.arrayBuffer());
      } else {
        try {
          bundle = parseBrowserProjectBundle(await file.text());
        } catch {
          bundle = parseBrowserProjectArchive(await file.arrayBuffer());
        }
      }
      const project = await restoreBrowserProjectBundle(bundle);
      const parsedArtifacts = parseProjectArtifactFileSet(bundle.files);
      await hydrateProjectRuntimeFromParsedArtifacts({
        project,
        parsed: parsedArtifacts,
      });
      await importParsedProjectArtifacts(parsedArtifacts, {
        defaultSourceRef:
          parsedArtifacts.projectManifest?.defaultSourceRef ??
          project.defaultSourceRef ??
          null,
      });
      await refreshOpenProjectCard();
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } catch (error) {
      setOpenProjectError(
        error instanceof Error ? error.message : "Failed to import project.",
      );
    } finally {
      setIsImportingProject(false);
      if (projectImportFileRef.current) {
        projectImportFileRef.current.value = "";
      }
    }
  };

  const handleSaveAiSettings = async () => {
    const settings = {
      provider: aiProvider,
      model,
      apiKey,
      openAiCompatibleUrl,
      openAiCompatibleName,
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

  const effectiveRuntimeLabel = getActiveRuntimeLabel({
    selectedSqlBackend,
    effectiveSqlBackend,
    isBridgeDiscoverable,
    isBridgeQueryReady,
    isDuckDbHttpConfigured,
    duckDbHttpHealthStatus,
  });
  const bridgeOptionLabel = !isBridgeDiscoverable
    ? "Bridge (Unavailable)"
    : !isBridgeQueryReady
      ? "Bridge (Auth required)"
      : "Bridge (Available)";
  const bridgeAuthStatusLabel = bridgeConfig
    ? bridgeConfig.requiresAuth
      ? hasBridgeSessionSecret
        ? "session secret set"
        : "required"
      : "not required"
    : "unknown";

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
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="xai">xAI</SelectItem>
                    <SelectItem value="openai-compatible">
                      OpenAI Compatible
                    </SelectItem>
                    <SelectItem value="gateway">AI Gateway</SelectItem>
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
                  name="ai-model-id"
                  autoComplete="off"
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
                  name="settings-ai-provider-secret"
                  autoComplete="off"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="mb-4"
                />
                {aiProvider === "openai-compatible" && (
                  <>
                    <label
                      htmlFor="openai-compatible-url"
                      className="text-sm font-medium mb-2 block"
                    >
                      Base URL
                    </label>
                    <Input
                      id="openai-compatible-url"
                      type="text"
                      name="openai-compatible-url"
                      autoComplete="off"
                      value={openAiCompatibleUrl}
                      onChange={(e) => setOpenAiCompatibleUrl(e.target.value)}
                      placeholder="https://api.example.com/v1"
                      className="mb-4"
                    />

                    <label
                      htmlFor="openai-compatible-name"
                      className="text-sm font-medium mb-2 block"
                    >
                      Provider Name
                    </label>
                    <Input
                      id="openai-compatible-name"
                      type="text"
                      name="openai-compatible-provider-name"
                      autoComplete="off"
                      value={openAiCompatibleName}
                      onChange={(e) => setOpenAiCompatibleName(e.target.value)}
                      placeholder="my-provider"
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
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">Query Runtime</h2>
                <p className="text-sm text-muted-foreground">
                  Choose where SQL runs. Bridge uses Pondview endpoints, while
                  DuckDB over HTTP connects directly from the browser to a
                  DuckDB `httpserver` instance.
                </p>
              </div>
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs flex items-center justify-between">
                <span className="text-muted-foreground">Active runtime</span>
                <span
                  className={
                    effectiveSqlBackend === "duckdb-wasm"
                      ? "text-muted-foreground"
                      : "text-green-600 dark:text-green-400"
                  }
                >
                  {effectiveRuntimeLabel}
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
                    <SelectItem value="bridge" disabled={!isBridgeDiscoverable}>
                      {bridgeOptionLabel}
                    </SelectItem>
                    <SelectItem value="duckdb-http">
                      DuckDB over HTTP
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {runtimeSettingsError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {runtimeSettingsError}
                </p>
              )}
              {runtimeSettingsSuccess && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  {runtimeSettingsSuccess}
                </p>
              )}

              {selectedSqlBackend === "bridge" && (
                <div className="space-y-3 rounded-lg border p-4">
                  <div>
                    <h3 className="text-sm font-semibold">Bridge Auth</h3>
                    <p className="text-sm text-muted-foreground">
                      Optional session-only Pondview secret for authenticated
                      bridge queries. Leave empty when Pondview is started with
                      an empty secret.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Health: {bridgeHealthStatus}
                      {bridgeConfig
                        ? ` • Endpoint: ${bridgeConfig.host}:${bridgeConfig.port} • Auth: ${bridgeAuthStatusLabel}`
                        : ` • Auth: ${bridgeAuthStatusLabel}`}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="password"
                      name="settings-bridge-secret"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-form-type="other"
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
                      disabled={!hasBridgeSessionSecret}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}

              {selectedSqlBackend === "duckdb-http" && (
                <div className="space-y-4 rounded-lg border p-4">
                  <div>
                    <h3 className="text-sm font-semibold">
                      DuckDB HTTP Connection
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Configure host, port, and optional auth for a remote
                      DuckDB{" "}
                      <code className="bg-muted px-1 py-0.5 rounded text-xs">
                        httpserver
                      </code>{" "}
                      instance.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Health: {duckDbHttpHealthStatus}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                    <Input
                      type="text"
                      value={duckDbHttpHost}
                      onChange={(event) =>
                        setDuckDbHttpHost(event.target.value)
                      }
                      placeholder="http://127.0.0.1 or duckdb-host.local"
                    />
                    <Input
                      type="text"
                      value={duckDbHttpPort}
                      onChange={(event) =>
                        setDuckDbHttpPort(event.target.value)
                      }
                      placeholder="8123"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="duckdb-http-auth"
                      className="text-sm font-medium mb-2 block"
                    >
                      Auth{" "}
                      <span className="font-normal text-muted-foreground">
                        ({hasDuckDbHttpAuth ? "set" : "not set"})
                      </span>
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        id="duckdb-http-auth"
                        type="password"
                        name="settings-duckdb-http-auth"
                        autoComplete="off"
                        data-1p-ignore="true"
                        data-lpignore="true"
                        data-form-type="other"
                        value={duckDbHttpAuth}
                        onChange={(event) =>
                          setDuckDbHttpAuth(event.target.value)
                        }
                        placeholder={
                          hasDuckDbHttpAuth
                            ? "••••••••  (enter new value, then Save Config)"
                            : "token or user:pass"
                        }
                      />
                      <Button
                        variant="outline"
                        onClick={handleClearDuckDbHttpAuth}
                        disabled={!hasDuckDbHttpAuth}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSaveDuckDbHttpConfig}>
                      Save Connection
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void handleTestDuckDbHttpConnection()}
                      disabled={isTestingHttpConnection}
                    >
                      {isTestingHttpConnection
                        ? "Testing..."
                        : "Test Connection"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleClearDuckDbHttpConfig}
                      disabled={!isDuckDbHttpConfigured}
                    >
                      Clear Config
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 mb-6">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">Project Files</h2>
                <p className="text-sm text-muted-foreground">
                  Open a browser-local project backing store so saved queries
                  and published notebooks write project artifact files
                  automatically, then export or import that file tree as a
                  project archive.
                </p>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <div className="grid gap-2">
                  <label
                    htmlFor="open-project-name"
                    className="text-sm font-medium"
                  >
                    Project Name
                  </label>
                  <Input
                    id="open-project-name"
                    type="text"
                    name="open-project-name"
                    autoComplete="off"
                    value={openProjectName}
                    onChange={(event) => setOpenProjectName(event.target.value)}
                    placeholder="My Browser Project"
                  />
                </div>

                <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Browser-local project status
                  </span>
                  <span>{openProjectStatus ?? "No project open."}</span>
                </div>

                <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs flex items-center justify-between">
                  <span className="text-muted-foreground">Tracked files</span>
                  <span>{openProjectFileCount}</span>
                </div>

                {openProjectError && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {openProjectError}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void handleOpenProject()}
                    disabled={isOpeningProject}
                  >
                    {isOpeningProject ? "Opening..." : "Open Browser Project"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleCloseProject()}
                    disabled={isClosingProject}
                  >
                    {isClosingProject ? "Closing..." : "Close Project"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void handleExportProject()}
                    disabled={isExportingProject}
                  >
                    {isExportingProject ? "Exporting..." : "Export Project"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => projectImportFileRef.current?.click()}
                    disabled={isImportingProject}
                  >
                    {isImportingProject ? "Importing..." : "Import Project"}
                  </Button>
                </div>

                <input
                  ref={projectImportFileRef}
                  type="file"
                  accept=".zip,.json,application/zip,application/json"
                  className="hidden"
                  onChange={handleImportProject}
                />
              </div>
            </div>
          </Card>

          <Card className="p-6 mb-6">
            <div className="space-y-6">
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

              {workspaceError && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {workspaceError}
                </p>
              )}

              <input
                ref={importFileRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportWorkspace}
              />
            </div>
          </Card>

          <Card className="p-6 mb-6">
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold mb-2">Chat Display</h2>
                <p className="text-sm text-muted-foreground">
                  Configure how chat opens and how tool results are shown in
                  messages.
                </p>
              </div>

              <div>
                <label
                  htmlFor="default-prompt-mode"
                  className="text-sm font-medium mb-2 block"
                >
                  Default prompt mode
                </label>
                <Select
                  value={defaultPromptMode}
                  onValueChange={(value) =>
                    setDefaultPromptModePreference(value as DefaultPromptMode)
                  }
                >
                  <SelectTrigger
                    id="default-prompt-mode"
                    className="w-full sm:w-auto"
                  >
                    <SelectValue placeholder="Select default prompt mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ai">AI</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Applies to the home page and new chat sessions unless the URL
                  explicitly sets `?mode=ai` or `?mode=manual`.
                </p>
              </div>

              <label
                htmlFor="show-tool-calls"
                className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
              >
                <div>
                  <p className="text-sm font-medium">Show tool calls</p>
                  <p className="text-xs text-muted-foreground">
                    In notebook AI transcripts, show `tool-*` cards. When
                    disabled, transcript tool cards are hidden while SQL result
                    blocks and visuals remain visible.
                  </p>
                </div>
                <input
                  id="show-tool-calls"
                  type="checkbox"
                  checked={showToolCalls}
                  onChange={(event) =>
                    setShowToolCallsPreference(event.target.checked)
                  }
                  className="h-4 w-4 rounded border-border"
                />
              </label>

              <label
                htmlFor="show-execute-sql-raw-output"
                className="flex items-center justify-between gap-4 rounded-md border border-border p-3 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div>
                  <p className="text-sm font-medium">
                    Show raw SQL tool output JSON
                  </p>
                  <p className="text-xs text-muted-foreground">
                    In notebook AI transcripts, include raw
                    `tool-execute_final_sql` and `tool-execute_exploratory_sql`
                    output in the tool card, in addition to the SQL result
                    block. This only applies when tool calls are visible.
                  </p>
                </div>
                <input
                  id="show-execute-sql-raw-output"
                  type="checkbox"
                  checked={showExecuteSqlRawOutput}
                  disabled={!showToolCalls}
                  onChange={(event) =>
                    setExecuteSqlRawOutputPreference(event.target.checked)
                  }
                  className="h-4 w-4 rounded border-border"
                />
              </label>

              <p className="text-xs text-muted-foreground">
                These display settings only affect the expandable transcript
                shown in analysis cells.
              </p>
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
                      className="font-mono text-sm min-h-100"
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

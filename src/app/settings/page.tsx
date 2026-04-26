import {
  BrainCircuit,
  Check,
  Database,
  FolderOpen,
  type LucideIcon,
  Palette,
  Pencil,
  Plus,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type AiProvider,
  getAiProviderDisplayName,
  getApiKeyStorageKeyForProvider,
  getMissingRequiredSetting,
  loadAiSettingsFromStorage,
  saveAiSettingsToStorage,
} from "@/ai/settings";
import { Button } from "@/components/ui/button";
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
import { DuckdbWasmClient } from "@/lib/duckdb/duckdb-wasm-client";
import {
  downloadSnapshotFromS3,
  listSnapshotsInS3,
  type S3BackupObject,
  testS3BackupConnection,
  uploadSnapshotToS3,
} from "@/lib/duckdb/s3-backup";
import {
  clearS3BackupConfigInStorage,
  EMPTY_S3_BACKUP_CONFIG,
  isS3BackupConfigComplete,
  readS3BackupConfigFromStorage,
  type S3BackupConfig,
  saveS3BackupConfigToStorage,
} from "@/lib/duckdb/s3-backup-storage";
import { importParsedProjectArtifacts } from "@/lib/project-artifacts/import";
import { parseProjectArtifactFileSet } from "@/lib/project-artifacts/parse";
import { hydrateProjectRuntimeFromParsedArtifacts } from "@/lib/project-runtime";
import {
  getOpenProject,
  listOpenProjectFiles,
  listProjects,
  type OpenProjectState,
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
import { cn } from "@/lib/utils";
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

type SettingsSection = "ai" | "runtime" | "projects" | "appearance";

type SectionNavItem = {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
};

const SECTION_NAV: readonly SectionNavItem[] = [
  {
    id: "projects",
    label: "Projects",
    icon: FolderOpen,
  },
  {
    id: "ai",
    label: "AI",
    icon: BrainCircuit,
  },
  {
    id: "runtime",
    label: "Query Runtime",
    icon: Database,
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: Palette,
  },
] as const;

function projectDownloadName(name: string): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
  return `pondview-project-${slug}.zip`;
}

function createProjectSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

function createNewProjectName(projects: readonly OpenProjectState[]): string {
  const names = new Set(projects.map((project) => project.name));
  if (!names.has("Untitled Project")) {
    return "Untitled Project";
  }

  let index = 2;
  while (names.has(`Untitled Project ${index}`)) {
    index += 1;
  }

  return `Untitled Project ${index}`;
}

function createBrowserProjectState(name: string): OpenProjectState {
  const now = Date.now();
  return {
    id: `browser-project-${createProjectSlug(name)}-${now}`,
    name,
    backingKind: "browser-indexeddb",
    openedAt: now,
    updatedAt: now,
    defaultSourceRef: null,
  };
}

function formatSnapshotSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function uint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("projects");
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
  const [isTestingHttpConnection, setIsTestingHttpConnection] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [isExportingSnapshot, setIsExportingSnapshot] = useState(false);
  const [isImportingSnapshot, setIsImportingSnapshot] = useState(false);
  const [s3BackupForm, setS3BackupForm] = useState<S3BackupConfig>(
    EMPTY_S3_BACKUP_CONFIG,
  );
  const [savedS3BackupConfig, setSavedS3BackupConfig] = useState<S3BackupConfig>(
    EMPTY_S3_BACKUP_CONFIG,
  );
  const [s3BackupError, setS3BackupError] = useState<string | null>(null);
  const [s3BackupSuccess, setS3BackupSuccess] = useState<string | null>(null);
  const [isTestingS3Connection, setIsTestingS3Connection] = useState(false);
  const [isBackingUpToS3, setIsBackingUpToS3] = useState(false);
  const [isListingS3Snapshots, setIsListingS3Snapshots] = useState(false);
  const [isRestoringFromS3, setIsRestoringFromS3] = useState(false);
  const [s3SnapshotList, setS3SnapshotList] = useState<S3BackupObject[] | null>(
    null,
  );
  const [s3RestoreKey, setS3RestoreKey] = useState<string | null>(null);
  const [s3CorsError, setS3CorsError] = useState(false);
  const [openProjectName, setOpenProjectName] = useState("Untitled Project");
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [knownProjects, setKnownProjects] = useState<OpenProjectState[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [isEditingProjectName, setIsEditingProjectName] = useState(false);
  const [isSavingProjectName, setIsSavingProjectName] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isSwitchingProject, setIsSwitchingProject] = useState(false);
  const [openProjectError, setOpenProjectError] = useState<string | null>(null);
  const [isExportingProject, setIsExportingProject] = useState(false);
  const [isImportingProject, setIsImportingProject] = useState(false);
  const projectImportFileRef = useRef<HTMLInputElement>(null);
  const snapshotImportFileRef = useRef<HTMLInputElement>(null);
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

  const refreshOpenProjectSummary = useCallback(async () => {
    let [project, projects] = await Promise.all([
      getOpenProject(),
      listProjects(),
    ]);

    if (!project) {
      project = projects[0] ?? createBrowserProjectState("Untitled Project");
      await setOpenProject(project);
      projects = await listProjects();
    }

    const projectName = project?.name ?? "Untitled Project";
    setKnownProjects(projects);
    setActiveProjectId(project.id);
    setOpenProjectName(projectName);
    setProjectNameDraft(projectName);
  }, []);

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
    setSelectedTheme(savedTheme || (savedCss ? CUSTOM_THEME_VALUE : "default"));
    setHasDuckDbHttpAuth(hasDuckDbHttpSessionAuth());

    const savedS3Config = readS3BackupConfigFromStorage();
    setSavedS3BackupConfig(savedS3Config);
    setS3BackupForm(savedS3Config);

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
        await refreshOpenProjectSummary();
      } catch (error) {
        setOpenProjectError(
          error instanceof Error
            ? error.message
            : "Failed to load browser-local project state.",
        );
      }
    })();
  }, [refreshOpenProjectSummary]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (SECTION_NAV.some((item) => item.id === hash)) {
      setActiveSection(hash as SettingsSection);
    }
  }, []);

  useEffect(() => {
    setDuckDbHttpHost(duckDbHttpConfig?.host ?? "");
    setDuckDbHttpPort(duckDbHttpConfig ? String(duckDbHttpConfig.port) : "");
  }, [duckDbHttpConfig]);

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

  const navigateToSection = (id: SettingsSection) => {
    setActiveSection(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  };

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

  const handleExportSnapshot = async () => {
    setIsExportingSnapshot(true);
    setSnapshotError(null);

    try {
      const snapshot = await new DuckdbWasmClient().exportDatabaseSnapshot();
      const blob = new Blob([uint8ArrayToArrayBuffer(snapshot)], {
        type: "application/vnd.duckdb.database",
      });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `pondview-snapshot-${new Date()
        .toISOString()
        .slice(0, 10)}.duckdb`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(href);
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } catch (error) {
      setSnapshotError(
        error instanceof Error ? error.message : "Failed to export snapshot.",
      );
    } finally {
      setIsExportingSnapshot(false);
    }
  };

  const handleImportSnapshot = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (
      !confirm(
        "Import this DuckDB snapshot and replace the local DuckDB WASM database? Browser workspace metadata is not reset.",
      )
    ) {
      if (snapshotImportFileRef.current) {
        snapshotImportFileRef.current.value = "";
      }
      return;
    }

    setIsImportingSnapshot(true);
    setSnapshotError(null);

    try {
      await new DuckdbWasmClient().importDatabaseSnapshot(
        await file.arrayBuffer(),
      );
      setSqlBackendPreferenceInStorage("duckdb-wasm");
      location.reload();
    } catch (error) {
      setSnapshotError(
        error instanceof Error ? error.message : "Failed to import snapshot.",
      );
    } finally {
      setIsImportingSnapshot(false);
      if (snapshotImportFileRef.current) {
        snapshotImportFileRef.current.value = "";
      }
    }
  };

  const updateS3BackupForm = <K extends keyof S3BackupConfig>(
    field: K,
    value: S3BackupConfig[K],
  ) => {
    setS3BackupForm((previous) => ({ ...previous, [field]: value }));
  };

  const handleSaveS3BackupConfig = () => {
    if (!isS3BackupConfigComplete(s3BackupForm)) {
      setS3BackupError(
        "Endpoint, region, bucket, access key, and secret are all required.",
      );
      setS3BackupSuccess(null);
      return;
    }

    saveS3BackupConfigToStorage(s3BackupForm);
    const stored = readS3BackupConfigFromStorage();
    setSavedS3BackupConfig(stored);
    setS3BackupForm(stored);
    setS3BackupError(null);
    setS3CorsError(false);
    setS3BackupSuccess("S3 backup configuration saved.");
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleClearS3BackupConfig = () => {
    clearS3BackupConfigInStorage();
    setSavedS3BackupConfig(EMPTY_S3_BACKUP_CONFIG);
    setS3BackupForm(EMPTY_S3_BACKUP_CONFIG);
    setS3SnapshotList(null);
    setS3RestoreKey(null);
    setS3BackupError(null);
    setS3CorsError(false);
    setS3BackupSuccess("S3 backup configuration cleared.");
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleTestS3BackupConnection = async () => {
    if (!isS3BackupConfigComplete(s3BackupForm)) {
      setS3BackupError(
        "Fill in all S3 fields before testing the connection.",
      );
      setS3BackupSuccess(null);
      return;
    }

    setIsTestingS3Connection(true);
    setS3BackupError(null);
    setS3BackupSuccess(null);
    setS3CorsError(false);

    const result = await testS3BackupConnection(s3BackupForm);
    if (result.ok) {
      setS3BackupSuccess("Connection successful — bucket is reachable.");
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } else {
      setS3CorsError(result.likelyCors);
      setS3BackupError(`Connection failed: ${result.error}`);
    }
    setIsTestingS3Connection(false);
  };

  const handleBackupSnapshotToS3 = async () => {
    if (!isS3BackupConfigComplete(savedS3BackupConfig)) {
      setS3BackupError(
        "Save the S3 configuration before running a backup.",
      );
      return;
    }

    setIsBackingUpToS3(true);
    setS3BackupError(null);
    setS3BackupSuccess(null);

    try {
      const snapshot = await new DuckdbWasmClient().exportDatabaseSnapshot();
      const { key } = await uploadSnapshotToS3(savedS3BackupConfig, snapshot);
      setS3BackupSuccess(`Snapshot uploaded as ${key}.`);
      setS3SnapshotList(null);
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } catch (error) {
      setS3BackupError(
        error instanceof Error ? error.message : "Failed to upload snapshot.",
      );
    } finally {
      setIsBackingUpToS3(false);
    }
  };

  const handleRefreshS3SnapshotList = async () => {
    if (!isS3BackupConfigComplete(savedS3BackupConfig)) {
      setS3BackupError(
        "Save the S3 configuration before listing snapshots.",
      );
      return;
    }

    setIsListingS3Snapshots(true);
    setS3BackupError(null);

    try {
      const snapshots = await listSnapshotsInS3(savedS3BackupConfig);
      setS3SnapshotList(snapshots);
      if (snapshots.length === 0) {
        setS3BackupSuccess("No snapshots found at the configured prefix.");
      } else {
        setS3BackupSuccess(null);
      }
    } catch (error) {
      setS3BackupError(
        error instanceof Error ? error.message : "Failed to list snapshots.",
      );
    } finally {
      setIsListingS3Snapshots(false);
    }
  };

  const handleRestoreSnapshotFromS3 = async (key: string) => {
    if (
      !confirm(
        `Restore "${key}" from S3? This replaces the local DuckDB WASM database. Browser workspace metadata is not reset.`,
      )
    ) {
      return;
    }

    setIsRestoringFromS3(true);
    setS3RestoreKey(key);
    setS3BackupError(null);
    setS3BackupSuccess(null);

    try {
      const bytes = await downloadSnapshotFromS3(savedS3BackupConfig, key);
      await new DuckdbWasmClient().importDatabaseSnapshot(bytes);
      setSqlBackendPreferenceInStorage("duckdb-wasm");
      location.reload();
    } catch (error) {
      setS3BackupError(
        error instanceof Error ? error.message : "Failed to restore snapshot.",
      );
      setIsRestoringFromS3(false);
      setS3RestoreKey(null);
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
      const blob = new Blob([uint8ArrayToArrayBuffer(archive)], {
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

  const handleEditProjectName = () => {
    setProjectNameDraft(openProjectName);
    setIsEditingProjectName(true);
    setOpenProjectError(null);
  };

  const handleCancelProjectNameEdit = () => {
    setProjectNameDraft(openProjectName);
    setIsEditingProjectName(false);
    setOpenProjectError(null);
  };

  const syncActiveProjectFromFiles = async (project: OpenProjectState) => {
    const files = await listOpenProjectFiles();
    const parsedArtifacts = parseProjectArtifactFileSet(files);
    await hydrateProjectRuntimeFromParsedArtifacts({
      project,
      parsed: parsedArtifacts,
    });
    await importParsedProjectArtifacts(parsedArtifacts, {
      projectId: project.id,
      defaultSourceRef:
        parsedArtifacts.projectManifest?.defaultSourceRef ??
        project.defaultSourceRef ??
        null,
    });
  };

  const handleProjectSwitch = async (projectId: string) => {
    if (projectId === activeProjectId) {
      return;
    }

    const project = knownProjects.find(
      (candidate) => candidate.id === projectId,
    );
    if (!project) {
      return;
    }

    setIsSwitchingProject(true);
    setIsEditingProjectName(false);
    setOpenProjectError(null);

    try {
      await setOpenProject(project);
      setActiveProjectId(project.id);
      setOpenProjectName(project.name);
      setProjectNameDraft(project.name);
      await syncActiveProjectFromFiles(project);
      await refreshOpenProjectSummary();
    } catch (error) {
      setOpenProjectError(
        error instanceof Error ? error.message : "Failed to switch project.",
      );
    } finally {
      setIsSwitchingProject(false);
    }
  };

  const handleCreateProject = async () => {
    const defaultName = createNewProjectName(knownProjects);
    const requestedName = window.prompt("Project name", defaultName);
    if (requestedName === null) {
      return;
    }

    const name = requestedName.trim();
    if (!name) {
      setOpenProjectError("Project name is required.");
      return;
    }

    setIsCreatingProject(true);
    setIsEditingProjectName(false);
    setOpenProjectError(null);

    try {
      const project = createBrowserProjectState(name);

      await setOpenProject(project);
      await syncActiveProjectFromFiles(project);
      await refreshOpenProjectSummary();
    } catch (error) {
      setOpenProjectError(
        error instanceof Error ? error.message : "Failed to create project.",
      );
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleSaveProjectName = async () => {
    const normalizedName = projectNameDraft.trim();
    if (!normalizedName) {
      setOpenProjectError("Project name is required.");
      return;
    }

    setIsSavingProjectName(true);
    setOpenProjectError(null);

    try {
      const project =
        (await getOpenProject()) ?? createBrowserProjectState(normalizedName);

      await setOpenProject({
        ...project,
        name: normalizedName,
        updatedAt: Date.now(),
      });
      await refreshOpenProjectSummary();
      setIsEditingProjectName(false);
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } catch (error) {
      setOpenProjectError(
        error instanceof Error ? error.message : "Failed to rename project.",
      );
    } finally {
      setIsSavingProjectName(false);
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
        projectId: project.id,
        defaultSourceRef:
          parsedArtifacts.projectManifest?.defaultSourceRef ??
          project.defaultSourceRef ??
          null,
      });
      await refreshOpenProjectSummary();
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
        setSelectedTheme(CUSTOM_THEME_VALUE);
        setThemeInStorage(null);
        const savedCss = localStorage.getItem("CUSTOM_CSS") || "";
        if (savedCss) {
          applyCustomCss(savedCss);
        }
      } else {
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

  const activeNavItem =
    SECTION_NAV.find((item) => item.id === activeSection) ?? SECTION_NAV[0];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-6xl px-6 py-10 lg:px-8">
          <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
              <p className="mt-1 text-muted-foreground">
                Manage your application preferences and configuration.
              </p>
            </div>

            {knownProjects.length > 0 && (
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <div className="flex items-center gap-2">
                  <Select
                    value={activeProjectId}
                    onValueChange={(value) => void handleProjectSwitch(value)}
                    disabled={
                      knownProjects.length < 2 ||
                      isSwitchingProject ||
                      isCreatingProject
                    }
                  >
                    <SelectTrigger
                      id="active-project"
                      className="w-full sm:w-64"
                    >
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {knownProjects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => void handleCreateProject()}
                    disabled={
                      isCreatingProject ||
                      isSwitchingProject ||
                      isImportingProject
                    }
                    aria-label={
                      isCreatingProject ? "Creating project" : "New project"
                    }
                    title={
                      isCreatingProject ? "Creating project..." : "New project"
                    }
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {isSwitchingProject && (
                  <p className="text-xs text-muted-foreground">
                    Switching project...
                  </p>
                )}
              </div>
            )}
          </header>

          {showSuccessMessage && (
            <output className="mb-6 flex w-1/5 items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
              <Check className="h-4 w-4" aria-hidden="true" />
              <span>Saved</span>
            </output>
          )}

          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            <SettingsNav
              items={SECTION_NAV}
              activeSection={activeSection}
              onSelect={navigateToSection}
            />

            <main className="min-w-0 flex-1 space-y-6">
              <SectionHeader
                icon={activeNavItem.icon}
                title={activeNavItem.label}
              />

              {activeSection === "ai" && (
                <>
                  <SettingsContentSection>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold">
                          Provider configuration
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Credentials and model selection for AI requests.
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor="ai-provider"
                          className="mb-2 block text-sm font-medium"
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
                          className="mb-2 block text-sm font-medium"
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
                          className="mb-2 block text-sm font-medium"
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
                              className="mb-2 block text-sm font-medium"
                            >
                              Base URL
                            </label>
                            <Input
                              id="openai-compatible-url"
                              type="text"
                              name="openai-compatible-url"
                              autoComplete="off"
                              value={openAiCompatibleUrl}
                              onChange={(e) =>
                                setOpenAiCompatibleUrl(e.target.value)
                              }
                              placeholder="https://api.example.com/v1"
                              className="mb-4"
                            />

                            <label
                              htmlFor="openai-compatible-name"
                              className="mb-2 block text-sm font-medium"
                            >
                              Provider Name
                            </label>
                            <Input
                              id="openai-compatible-name"
                              type="text"
                              name="openai-compatible-provider-name"
                              autoComplete="off"
                              value={openAiCompatibleName}
                              onChange={(e) =>
                                setOpenAiCompatibleName(e.target.value)
                              }
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
                  </SettingsContentSection>

                  <SettingsContentSection>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold">Chat display</h3>
                        <p className="text-sm text-muted-foreground">
                          Configure how chat opens and how tool results are
                          shown in messages.
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor="default-prompt-mode"
                          className="mb-2 block text-sm font-medium"
                        >
                          Default prompt mode
                        </label>
                        <Select
                          value={defaultPromptMode}
                          onValueChange={(value) =>
                            setDefaultPromptModePreference(
                              value as DefaultPromptMode,
                            )
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
                          Applies to the home page and new chat sessions unless
                          the URL explicitly sets `?mode=ai` or `?mode=manual`.
                        </p>
                      </div>

                      <label
                        htmlFor="show-tool-calls"
                        className="flex items-center justify-between gap-4 border-t pt-4"
                      >
                        <div>
                          <p className="text-sm font-medium">Show tool calls</p>
                          <p className="text-xs text-muted-foreground">
                            In notebook AI transcripts, show `tool-*` cards.
                            When disabled, transcript tool cards are hidden
                            while SQL result blocks and visuals remain visible.
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
                        className="flex items-center justify-between gap-4 border-t pt-4 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            Show raw SQL tool output JSON
                          </p>
                          <p className="text-xs text-muted-foreground">
                            In notebook AI transcripts, include raw
                            `tool-execute_final_sql` and
                            `tool-execute_exploratory_sql` output in the tool
                            card, in addition to the SQL result block. This only
                            applies when tool calls are visible.
                          </p>
                        </div>
                        <input
                          id="show-execute-sql-raw-output"
                          type="checkbox"
                          checked={showExecuteSqlRawOutput}
                          disabled={!showToolCalls}
                          onChange={(event) =>
                            setExecuteSqlRawOutputPreference(
                              event.target.checked,
                            )
                          }
                          className="h-4 w-4 rounded border-border"
                        />
                      </label>

                      <p className="text-xs text-muted-foreground">
                        These display settings only affect the expandable
                        transcript shown in analysis cells.
                      </p>
                    </div>
                  </SettingsContentSection>
                </>
              )}

              {activeSection === "runtime" && (
                <SettingsContentSection>
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold">SQL runtime</h3>
                      <p className="text-sm text-muted-foreground">
                        Choose where SQL runs. Bridge uses Pondview endpoints,
                        while DuckDB over HTTP connects directly from the
                        browser to a DuckDB `httpserver` instance.
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-b pb-3 text-sm">
                      <span className="text-muted-foreground">
                        Active runtime
                      </span>
                      <span
                        className={
                          effectiveSqlBackend === "duckdb-wasm"
                            ? "font-medium text-muted-foreground"
                            : "font-medium text-green-600 dark:text-green-400"
                        }
                      >
                        {effectiveRuntimeLabel}
                      </span>
                    </div>

                    <div>
                      <label
                        htmlFor="sql-backend-select"
                        className="mb-2 block text-sm font-medium"
                      >
                        Query runtime
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
                          <SelectItem value="duckdb-wasm">
                            DuckDB WASM
                          </SelectItem>
                          <SelectItem
                            value="bridge"
                            disabled={!isBridgeDiscoverable}
                          >
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
                      <div className="space-y-3 border-t pt-5">
                        <div>
                          <h4 className="text-sm font-semibold">Bridge auth</h4>
                          <p className="text-sm text-muted-foreground">
                            Optional session-only Pondview secret for
                            authenticated bridge queries. Leave empty when
                            Pondview is started with an empty secret.
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Health: {bridgeHealthStatus}
                            {bridgeConfig
                              ? ` • Endpoint: ${bridgeConfig.host}:${bridgeConfig.port} • Auth: ${bridgeAuthStatusLabel}`
                              : ` • Auth: ${bridgeAuthStatusLabel}`}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            type="password"
                            name="settings-bridge-secret"
                            autoComplete="off"
                            data-1p-ignore="true"
                            data-lpignore="true"
                            data-form-type="other"
                            value={bridgeSecret}
                            onChange={(event) =>
                              setBridgeSecret(event.target.value)
                            }
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
                      <div className="space-y-4 border-t pt-5">
                        <div>
                          <h4 className="text-sm font-semibold">
                            DuckDB HTTP connection
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            Configure host, port, and optional auth for a remote
                            DuckDB{" "}
                            <code className="rounded bg-muted px-1 py-0.5 text-xs">
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
                            className="mb-2 block text-sm font-medium"
                          >
                            Auth{" "}
                            <span className="font-normal text-muted-foreground">
                              ({hasDuckDbHttpAuth ? "set" : "not set"})
                            </span>
                          </label>
                          <div className="flex flex-col gap-2 sm:flex-row">
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
                            onClick={() =>
                              void handleTestDuckDbHttpConnection()
                            }
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
                </SettingsContentSection>
              )}

              {activeSection === "projects" && (
                <>
                  <SettingsContentSection>
                    <div className="space-y-5">
                      <div className="space-y-3">
                        <p className="text-sm font-medium">Project name</p>
                        {isEditingProjectName ? (
                          <div className="flex max-w-sm flex-col gap-2 sm:flex-row">
                            <Input
                              id="project-name"
                              type="text"
                              name="project-name"
                              autoComplete="off"
                              value={projectNameDraft}
                              onChange={(event) =>
                                setProjectNameDraft(event.target.value)
                              }
                              placeholder="Project name"
                              disabled={isSwitchingProject || isCreatingProject}
                            />
                            <Button
                              type="button"
                              onClick={() => void handleSaveProjectName()}
                              disabled={
                                isSavingProjectName ||
                                isSwitchingProject ||
                                isCreatingProject
                              }
                            >
                              {isSavingProjectName ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleCancelProjectNameEdit}
                              disabled={
                                isSavingProjectName ||
                                isSwitchingProject ||
                                isCreatingProject
                              }
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex max-w-sm items-center gap-2">
                            <div
                              id="project-name"
                              className="min-h-9 min-w-0 flex-1 truncate border-b py-2 text-sm font-medium"
                              title={openProjectName}
                            >
                              {openProjectName}
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={handleEditProjectName}
                              disabled={isSwitchingProject || isCreatingProject}
                              aria-label="Edit project name"
                              title="Edit project name"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {openProjectError && (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {openProjectError}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => projectImportFileRef.current?.click()}
                          disabled={
                            isImportingProject ||
                            isSwitchingProject ||
                            isCreatingProject
                          }
                        >
                          {isImportingProject ? "Opening..." : "Open Project"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void handleExportProject()}
                          disabled={
                            isExportingProject ||
                            isSwitchingProject ||
                            isCreatingProject ||
                            !activeProjectId
                          }
                        >
                          {isExportingProject
                            ? "Exporting..."
                            : "Export Project"}
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
                  </SettingsContentSection>

                  <SettingsContentSection>
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold">
                          Runtime snapshot
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Export or import the local DuckDB WASM database as a
                          non-Git `.duckdb` runtime artifact. Useful for moving
                          data between machines alongside a project archive.
                        </p>
                      </div>

                      {snapshotError && (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {snapshotError}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => void handleExportSnapshot()}
                          disabled={isExportingSnapshot || isImportingSnapshot}
                        >
                          {isExportingSnapshot
                            ? "Exporting..."
                            : "Export Snapshot"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => snapshotImportFileRef.current?.click()}
                          disabled={isImportingSnapshot || isExportingSnapshot}
                        >
                          {isImportingSnapshot
                            ? "Importing..."
                            : "Import Snapshot"}
                        </Button>
                      </div>

                      <input
                        ref={snapshotImportFileRef}
                        type="file"
                        accept=".duckdb,application/octet-stream,application/vnd.duckdb.database"
                        className="hidden"
                        onChange={handleImportSnapshot}
                      />
                    </div>
                  </SettingsContentSection>

                  <SettingsContentSection>
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold">
                          S3-compatible backup
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Back up the runtime DuckDB snapshot to an S3-compatible
                          bucket (Cloudflare R2, Backblaze B2, MinIO, etc.).
                          Credentials are stored in this browser&apos;s local
                          storage — use a scoped key limited to one bucket.
                        </p>
                      </div>

                      {s3BackupError && (
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {s3BackupError}
                        </p>
                      )}
                      {s3CorsError && (
                        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-700 dark:bg-amber-950">
                          <p className="mb-2 font-semibold text-amber-800 dark:text-amber-300">
                            This looks like a CORS error. The browser blocked
                            the request because the bucket does not allow
                            cross-origin requests from this origin.
                          </p>
                          <p className="mb-1 font-medium text-amber-800 dark:text-amber-300">
                            Add this CORS rule to your bucket:
                          </p>
                          <pre className="overflow-x-auto rounded bg-amber-100 p-2 text-amber-900 dark:bg-amber-900 dark:text-amber-100">{`[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]`}</pre>
                          <p className="mt-2 text-amber-700 dark:text-amber-400">
                            For R2: Manage bucket → Settings → CORS policy.
                            For B2: Bucket → CORS Rules. For MinIO: use{" "}
                            <code className="rounded bg-amber-100 px-0.5 dark:bg-amber-900">
                              mc anonymous set-json cors.json alias/bucket
                            </code>
                            .
                          </p>
                        </div>
                      )}
                      {s3BackupSuccess && !s3BackupError && (
                        <p className="text-sm text-green-600 dark:text-green-400">
                          {s3BackupSuccess}
                        </p>
                      )}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="s3-endpoint"
                            className="mb-1 block text-sm font-medium"
                          >
                            Endpoint
                          </label>
                          <Input
                            id="s3-endpoint"
                            type="text"
                            value={s3BackupForm.endpoint}
                            onChange={(event) =>
                              updateS3BackupForm("endpoint", event.target.value)
                            }
                            placeholder="https://<acct>.r2.cloudflarestorage.com"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="s3-region"
                            className="mb-1 block text-sm font-medium"
                          >
                            Region
                          </label>
                          <Input
                            id="s3-region"
                            type="text"
                            value={s3BackupForm.region}
                            onChange={(event) =>
                              updateS3BackupForm("region", event.target.value)
                            }
                            placeholder="auto"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="s3-bucket"
                            className="mb-1 block text-sm font-medium"
                          >
                            Bucket
                          </label>
                          <Input
                            id="s3-bucket"
                            type="text"
                            value={s3BackupForm.bucket}
                            onChange={(event) =>
                              updateS3BackupForm("bucket", event.target.value)
                            }
                            placeholder="pondview-backups"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="s3-prefix"
                            className="mb-1 block text-sm font-medium"
                          >
                            Prefix{" "}
                            <span className="font-normal text-muted-foreground">
                              (optional)
                            </span>
                          </label>
                          <Input
                            id="s3-prefix"
                            type="text"
                            value={s3BackupForm.prefix}
                            onChange={(event) =>
                              updateS3BackupForm("prefix", event.target.value)
                            }
                            placeholder="pondview/"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="s3-access-key"
                            className="mb-1 block text-sm font-medium"
                          >
                            Access Key ID
                          </label>
                          <Input
                            id="s3-access-key"
                            type="text"
                            autoComplete="off"
                            data-1p-ignore="true"
                            data-lpignore="true"
                            value={s3BackupForm.accessKeyId}
                            onChange={(event) =>
                              updateS3BackupForm(
                                "accessKeyId",
                                event.target.value,
                              )
                            }
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="s3-secret-key"
                            className="mb-1 block text-sm font-medium"
                          >
                            Secret Access Key
                          </label>
                          <Input
                            id="s3-secret-key"
                            type="password"
                            autoComplete="off"
                            data-1p-ignore="true"
                            data-lpignore="true"
                            data-form-type="other"
                            value={s3BackupForm.secretAccessKey}
                            onChange={(event) =>
                              updateS3BackupForm(
                                "secretAccessKey",
                                event.target.value,
                              )
                            }
                          />
                        </div>
                      </div>

                      <label
                        htmlFor="s3-force-path-style"
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          id="s3-force-path-style"
                          type="checkbox"
                          checked={s3BackupForm.forcePathStyle}
                          onChange={(event) =>
                            updateS3BackupForm(
                              "forcePathStyle",
                              event.target.checked,
                            )
                          }
                          className="h-4 w-4 rounded border-border"
                        />
                        <span>
                          Use path-style URLs{" "}
                          <span className="text-muted-foreground">
                            (required for MinIO and some B2 setups)
                          </span>
                        </span>
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <Button onClick={handleSaveS3BackupConfig}>
                          Save Configuration
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void handleTestS3BackupConnection()}
                          disabled={isTestingS3Connection}
                        >
                          {isTestingS3Connection
                            ? "Testing..."
                            : "Test Connection"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleClearS3BackupConfig}
                          disabled={
                            !isS3BackupConfigComplete(savedS3BackupConfig)
                          }
                        >
                          Clear Configuration
                        </Button>
                      </div>

                      {isS3BackupConfigComplete(savedS3BackupConfig) && (
                        <div className="space-y-4 border-t pt-4">
                          <div>
                            <h4 className="text-sm font-semibold">
                              Backup &amp; restore
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              Backup uploads the current DuckDB snapshot to
                              `{savedS3BackupConfig.bucket}
                              {savedS3BackupConfig.prefix
                                ? `/${savedS3BackupConfig.prefix}`
                                : "/"}
                              `. Restore replaces the local database — browser
                              workspace metadata is preserved.
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => void handleBackupSnapshotToS3()}
                              disabled={isBackingUpToS3 || isRestoringFromS3}
                            >
                              {isBackingUpToS3
                                ? "Uploading..."
                                : "Backup to S3 Now"}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() =>
                                void handleRefreshS3SnapshotList()
                              }
                              disabled={
                                isListingS3Snapshots || isRestoringFromS3
                              }
                            >
                              {isListingS3Snapshots
                                ? "Loading..."
                                : "List Snapshots"}
                            </Button>
                          </div>

                          {s3SnapshotList && s3SnapshotList.length > 0 && (
                            <ul className="space-y-2 text-sm">
                              {s3SnapshotList.map((snapshot) => (
                                <li
                                  key={snapshot.key}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded border bg-muted/30 px-3 py-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate font-mono text-xs">
                                      {snapshot.key}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatSnapshotSize(snapshot.size)}
                                      {snapshot.lastModified
                                        ? ` · ${snapshot.lastModified.toLocaleString()}`
                                        : ""}
                                    </p>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      void handleRestoreSnapshotFromS3(
                                        snapshot.key,
                                      )
                                    }
                                    disabled={
                                      isRestoringFromS3 || isBackingUpToS3
                                    }
                                  >
                                    {isRestoringFromS3 &&
                                    s3RestoreKey === snapshot.key
                                      ? "Restoring..."
                                      : "Restore"}
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  </SettingsContentSection>
                </>
              )}

              {activeSection === "appearance" && (
                <>
                  <SettingsContentSection>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold">
                          Theme selection
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Choose a default theme or create your own custom
                          theme.
                        </p>
                      </div>

                      <div>
                        <label
                          htmlFor="theme-select"
                          className="mb-2 block text-sm font-medium"
                        >
                          Select theme
                        </label>
                        <Select
                          value={selectedTheme}
                          onValueChange={handleThemeChange}
                          disabled={isSaving}
                        >
                          <SelectTrigger
                            id="theme-select"
                            className="w-full sm:w-auto"
                          >
                            <SelectValue placeholder="Select a theme" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableThemes.map((theme) => (
                              <SelectItem key={theme.name} value={theme.name}>
                                {theme.displayName}
                              </SelectItem>
                            ))}
                            <SelectItem value={CUSTOM_THEME_VALUE}>
                              Custom
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        {selectedTheme !== CUSTOM_THEME_VALUE && (
                          <p className="mt-2 text-sm text-muted-foreground">
                            Currently using:{" "}
                            <span className="font-medium">
                              {availableThemes.find(
                                (t) => t.name === selectedTheme,
                              )?.displayName || "Default"}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>
                  </SettingsContentSection>

                  <SettingsContentSection>
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-lg font-semibold">Custom styles</h3>
                        <p className="text-sm text-muted-foreground">
                          {selectedTheme === CUSTOM_THEME_VALUE
                            ? "Customize the appearance of the application using CSS variables."
                            : "Select 'Custom' theme to edit your own CSS styles."}
                        </p>
                      </div>

                      <Dialog
                        open={isDialogOpen}
                        onOpenChange={setIsDialogOpen}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            disabled={selectedTheme !== CUSTOM_THEME_VALUE}
                          >
                            Edit Styles
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Edit Custom CSS</DialogTitle>
                            <DialogDescription>
                              Paste your custom CSS here. Changes will be
                              applied immediately.
                            </DialogDescription>
                          </DialogHeader>

                          <div className="space-y-4 py-4">
                            <Textarea
                              value={cssCode}
                              onChange={(e) => setCssCode(e.target.value)}
                              placeholder={CSS_PLACEHOLDER}
                              className="min-h-100 font-mono text-sm"
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
                        <div className="rounded-lg bg-muted p-3 text-sm">
                          <p className="mb-1 font-medium">Current CSS:</p>
                          <pre className="max-h-40 overflow-auto rounded border bg-background p-2 text-xs">
                            {cssCode}
                          </pre>
                        </div>
                      )}
                    </div>
                  </SettingsContentSection>
                </>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsNav({
  items,
  activeSection,
  onSelect,
}: {
  items: readonly SectionNavItem[];
  activeSection: SettingsSection;
  onSelect: (id: SettingsSection) => void;
}) {
  return (
    <nav
      aria-label="Settings sections"
      className="w-full shrink-0 lg:sticky lg:top-6 lg:w-56"
    >
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeSection;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "lg:whitespace-normal",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-foreground" : "text-muted-foreground",
                  )}
                />
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SettingsContentSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("border-b pb-7 last:border-b-0 last:pb-0", className)}
    >
      {children}
    </section>
  );
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b pb-4">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
    </div>
  );
}

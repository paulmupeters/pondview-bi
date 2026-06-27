import {
  BrainCircuit,
  Check,
  Database,
  FolderOpen,
  Palette,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AiProvider,
  getAiProviderDisplayName,
  getMissingRequiredSetting,
  getProviderApiKeyFromStorage,
  isAiProvider,
  loadAiSettingsFromStorage,
  saveAiSettingsToStorage,
} from "@/ai/settings";
import {
  createProjectGitignore,
  createProjectManifest,
  DEFAULT_PROJECT_DATABASE_PATH,
  resolveStartupRuntimeSelection,
  validateStartupRuntime,
} from "@/components/project-startup-gate";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  clearSessionSecret,
  deleteBridgeS3BackupSecret,
  downloadBridgeS3Backup,
  getBridgeEndpoint,
  getBridgeProject,
  getBridgeSecretsStatus,
  initializeBridgeProject,
  listBridgeProjectDatabasePaths,
  listBridgeS3Backup,
  type PondviewBridgeConfig,
  pickBridgeProjectDatabasePath,
  saveBridgeAiSecret,
  saveBridgeS3BackupSecret,
  setBridgeEndpoint,
  setSessionSecret,
  testBridgeConnection,
  testBridgeS3Backup,
  uploadBridgeS3Backup,
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
import { useDefaultPromptModePreference } from "@/lib/default-prompt-mode";
import { DuckdbWasmClient } from "@/lib/duckdb/duckdb-wasm-client";
import {
  downloadSnapshotFromS3,
  isCorsLikeError,
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
import {
  hydrateProjectRuntimeFromParsedArtifacts,
  setProjectRuntimeSelection,
} from "@/lib/project-runtime";
import {
  getOpenProject,
  listOpenProjectFiles,
  listProjects,
  type OpenProjectState,
  setOpenProject,
  setProjectStoreMode,
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
  useResolvedSqlBackend,
  useSelectedSqlBackend,
} from "@/lib/sql/use-sql-backend";
import { getAllThemes } from "@/themes";
import { resolveBridgeProjectDatabaseSetup } from "./runtime-setup";
import {
  SectionHeader,
  type SectionNavItem,
  SettingsNav,
  type SettingsSection,
} from "./settings-layout";
import {
  AiSettingsSections,
  AppearanceSettingsSections,
  ExportProjectDialog,
  ProjectsSettingsSections,
  RuntimeSettingsSection,
} from "./settings-sections";

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

type BridgeProjectDatabaseChoice = "none" | "new-duckdb" | "existing-duckdb";
type BridgeProjectStorageChoice = "browser" | "local";

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
    label: "DuckDB Runtime",
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

export function getDefaultBridgeEndpoint(
  config?: PondviewBridgeConfig | null,
): string {
  if (config) {
    const host =
      config.host === "0.0.0.0" || config.host === "::"
        ? "127.0.0.1"
        : config.host;
    const protocol =
      typeof window === "undefined" ? "http:" : window.location.protocol;
    return `${protocol}//${host}:${config.port}`;
  }

  if (typeof window === "undefined") {
    return "http://127.0.0.1:17817";
  }

  return `${window.location.protocol}//127.0.0.1:17817`;
}

export function validateBridgeEndpoint(endpoint: string): string | null {
  if (!endpoint.trim().length) {
    return null;
  }

  try {
    const url = new URL(endpoint);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Bridge endpoint must use http or https.";
    }
  } catch {
    return "Bridge endpoint must be a valid URL.";
  }

  return null;
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
  const [visualizationModel, setVisualizationModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("");
  const [openAiCompatibleUrl, setOpenAiCompatibleUrl] = useState("");
  const [openAiCompatibleName, setOpenAiCompatibleName] = useState("");
  const [cssCode, setCssCode] = useState("");
  const [selectedTheme, setSelectedTheme] =
    useState<string>(CUSTOM_THEME_VALUE);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [bridgeSecret, setBridgeSecret] = useState("");
  const [bridgeEndpoint, setBridgeEndpointInput] = useState("");
  const [isTestingBridgeConnection, setIsTestingBridgeConnection] =
    useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [aiSettingsError, setAiSettingsError] = useState<string | null>(null);
  const [bridgeAiConfigured, setBridgeAiConfigured] = useState(false);
  const [runtimeSettingsError, setRuntimeSettingsError] = useState<
    string | null
  >(null);
  const [runtimeSettingsSuccess, setRuntimeSettingsSuccess] = useState<
    string | null
  >(null);
  const [bridgeProjectDatabaseChoice, setBridgeProjectDatabaseChoice] =
    useState<BridgeProjectDatabaseChoice>("none");
  const [bridgeProjectStorageChoice, setBridgeProjectStorageChoice] =
    useState<BridgeProjectStorageChoice>("browser");
  const [bridgeProjectDuckDbPath, setBridgeProjectDuckDbPath] = useState(
    DEFAULT_PROJECT_DATABASE_PATH,
  );
  const [detectedBridgeDuckDbPaths, setDetectedBridgeDuckDbPaths] = useState<
    string[]
  >([]);
  const [isPickingBridgeDuckDbPath, setIsPickingBridgeDuckDbPath] =
    useState(false);
  const [isSavingBridgeProjectSetup, setIsSavingBridgeProjectSetup] =
    useState(false);
  const [s3BackupForm, setS3BackupForm] = useState<S3BackupConfig>(
    EMPTY_S3_BACKUP_CONFIG,
  );
  const [savedS3BackupConfig, setSavedS3BackupConfig] =
    useState<S3BackupConfig>(EMPTY_S3_BACKUP_CONFIG);
  const [s3BackupError, setS3BackupError] = useState<string | null>(null);
  const [s3BackupSuccess, setS3BackupSuccess] = useState<string | null>(null);
  const [bridgeS3BackupConfigured, setBridgeS3BackupConfigured] =
    useState(false);
  const [isTestingS3Connection, setIsTestingS3Connection] = useState(false);
  const [isListingS3Snapshots, setIsListingS3Snapshots] = useState(false);
  const [isRestoringFromS3, setIsRestoringFromS3] = useState(false);
  const [s3SnapshotList, setS3SnapshotList] = useState<S3BackupObject[] | null>(
    null,
  );
  const [s3RestoreKey, setS3RestoreKey] = useState<string | null>(null);
  const [s3CorsError, setS3CorsError] = useState(false);
  const [openProjectName, setOpenProjectName] = useState("Untitled Project");
  const [openProjectBackingKind, setOpenProjectBackingKind] =
    useState<OpenProjectState["backingKind"]>("browser-indexeddb");
  const [openProjectRootPath, setOpenProjectRootPath] = useState<string | null>(
    null,
  );
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
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportIncludeSnapshot, setExportIncludeSnapshot] = useState(false);
  const projectImportFileRef = useRef<HTMLInputElement>(null);
  const availableThemes = getAllThemes();
  const bridgeRuntimeState = useBridgeRuntimeState();
  const showToolCalls = useShowToolCallsPreference();
  const showExecuteSqlRawOutput = useExecuteSqlRawOutputPreference();
  const defaultPromptMode = useDefaultPromptModePreference();
  const bridgeHealthStatus = bridgeRuntimeState.healthStatus;
  const bridgeConfig = bridgeRuntimeState.config;
  const hasBridgeSessionSecret = bridgeRuntimeState.hasSessionSecret;
  const isBridgeDiscoverable = bridgeRuntimeState.isDiscoverable;
  const isBridgeQueryReady = bridgeRuntimeState.isQueryReady;
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
    setOpenProjectBackingKind(project.backingKind);
    setOpenProjectRootPath(project.rootPath ?? null);
    setOpenProjectName(projectName);
    setProjectNameDraft(projectName);
  }, []);

  useEffect(() => {
    const aiSettings = loadAiSettingsFromStorage();
    const savedCss = localStorage.getItem("CUSTOM_CSS") || "";
    const savedTheme = getSelectedTheme();

    setAiProvider(aiSettings.provider);
    setModel(aiSettings.model);
    setVisualizationModel(aiSettings.visualizationModel);
    setApiKey(aiSettings.apiKey);
    setOllamaBaseUrl(aiSettings.ollamaBaseUrl ?? "");
    setOpenAiCompatibleUrl(aiSettings.openAiCompatibleUrl ?? "");
    setOpenAiCompatibleName(aiSettings.openAiCompatibleName ?? "");
    setCssCode(savedCss);
    setSelectedTheme(savedTheme || (savedCss ? CUSTOM_THEME_VALUE : "default"));
    setBridgeEndpointInput(getBridgeEndpoint() || getDefaultBridgeEndpoint());

    const savedS3Config = readS3BackupConfigFromStorage();
    setSavedS3BackupConfig(savedS3Config);
    setS3BackupForm(savedS3Config);

    void refreshBridgeHealth();

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
    if (!isBridgeQueryReady) {
      setBridgeS3BackupConfigured(false);
      setDetectedBridgeDuckDbPaths([]);
      return;
    }

    let cancelled = false;
    void getBridgeSecretsStatus()
      .then((status) => {
        if (cancelled) {
          return;
        }
        setBridgeAiConfigured(status.ai?.configured === true);
        if (status.ai?.configured && isAiProvider(status.ai.provider)) {
          setAiProvider(status.ai.provider);
          setModel(status.ai.model ?? "");
          setVisualizationModel(status.ai.visualizationModel ?? "");
          setApiKey("");
        }
        setBridgeS3BackupConfigured(status.s3Backup?.configured === true);
        if (status.s3Backup?.configured) {
          setSavedS3BackupConfig((previous) => ({
            ...previous,
            endpoint: status.s3Backup?.endpoint ?? previous.endpoint,
            region: status.s3Backup?.region ?? previous.region,
            bucket: status.s3Backup?.bucket ?? previous.bucket,
            accessKeyId: "",
            secretAccessKey: "",
            credentialsStored: true,
            prefix: status.s3Backup?.prefix ?? previous.prefix,
            forcePathStyle:
              status.s3Backup?.forcePathStyle ?? previous.forcePathStyle,
          }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBridgeS3BackupConfigured(false);
          setBridgeAiConfigured(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isBridgeQueryReady]);

  useEffect(() => {
    if (!isBridgeQueryReady) {
      return;
    }

    let cancelled = false;
    void listBridgeProjectDatabasePaths()
      .then((result) => {
        if (cancelled) {
          return;
        }
        setDetectedBridgeDuckDbPaths(result.paths);
        const databaseSetup = resolveBridgeProjectDatabaseSetup({
          configuredDatabasePath: result.configuredDatabasePath,
          detectedDuckDbPaths: result.paths,
          bridgeConfig,
        });
        setBridgeProjectDatabaseChoice(databaseSetup.choice);
        if (databaseSetup.duckDbPath) {
          setBridgeProjectDuckDbPath(databaseSetup.duckDbPath);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetectedBridgeDuckDbPaths([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bridgeConfig, isBridgeQueryReady]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (SECTION_NAV.some((item) => item.id === hash)) {
      setActiveSection(hash as SettingsSection);
    }
  }, []);

  useEffect(() => {
    if (cssCode && selectedTheme === CUSTOM_THEME_VALUE) {
      applyCustomCss(cssCode);
    }
  }, [cssCode, selectedTheme]);

  useEffect(() => {
    const storedEndpoint = getBridgeEndpoint();
    if (storedEndpoint) {
      return;
    }

    setBridgeEndpointInput((currentEndpoint) => {
      const previousDefault = getDefaultBridgeEndpoint();
      if (
        currentEndpoint.trim() &&
        currentEndpoint.trim() !== previousDefault
      ) {
        return currentEndpoint;
      }

      return getDefaultBridgeEndpoint(bridgeConfig);
    });
  }, [bridgeConfig]);

  const navigateToSection = (id: SettingsSection) => {
    setActiveSection(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  };

  const handleSaveBridgeEndpoint = () => {
    const endpoint = bridgeEndpoint.trim();
    const validationError = validateBridgeEndpoint(endpoint);
    if (validationError) {
      setRuntimeSettingsError(validationError);
      setRuntimeSettingsSuccess(null);
      return;
    }

    const defaultEndpoint = getDefaultBridgeEndpoint(bridgeConfig);
    setBridgeEndpoint(endpoint);
    setBridgeEndpointInput(endpoint || defaultEndpoint);
    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess(
      endpoint
        ? "Bridge endpoint saved."
        : "Bridge endpoint reset to the current Bridge endpoint.",
    );
    void refreshBridgeHealth();
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleTestBridgeConnection = async () => {
    const endpoint = bridgeEndpoint.trim();
    const validationError = validateBridgeEndpoint(endpoint);
    if (validationError) {
      setRuntimeSettingsError(validationError);
      setRuntimeSettingsSuccess(null);
      return;
    }

    setIsTestingBridgeConnection(true);
    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess(null);
    try {
      const config = await testBridgeConnection(endpoint);
      const saveHint =
        endpoint === getBridgeEndpoint() ? "" : " Save endpoint to use it.";
      if (config.requiresAuth && !hasBridgeSessionSecret) {
        setRuntimeSettingsSuccess(
          `Bridge is reachable. Set the session secret before querying.${saveHint}`,
        );
      } else {
        setRuntimeSettingsSuccess(`Bridge connection successful.${saveHint}`);
      }
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } catch (error) {
      setRuntimeSettingsError(
        error instanceof Error
          ? error.message
          : "Bridge connection test failed.",
      );
      setRuntimeSettingsSuccess(null);
    } finally {
      setIsTestingBridgeConnection(false);
    }
  };

  const handleClearBridgeEndpoint = () => {
    setBridgeEndpointInput(getDefaultBridgeEndpoint(bridgeConfig));
    setBridgeEndpoint("");
    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess(
      "Bridge endpoint reset to the current Bridge endpoint.",
    );
    void refreshBridgeHealth();
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
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
    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess(null);
    setSqlBackendPreferenceInStorage(backend);
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleBridgeProjectDatabaseChoiceChange = (
    choice: BridgeProjectDatabaseChoice,
  ) => {
    setBridgeProjectDatabaseChoice(choice);
    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess(null);
    if (choice === "new-duckdb") {
      setBridgeProjectDuckDbPath(DEFAULT_PROJECT_DATABASE_PATH);
    } else if (
      choice === "existing-duckdb" &&
      !bridgeProjectDuckDbPath.trim() &&
      detectedBridgeDuckDbPaths.length === 1
    ) {
      setBridgeProjectDuckDbPath(
        detectedBridgeDuckDbPaths[0] ?? DEFAULT_PROJECT_DATABASE_PATH,
      );
    }
  };

  const handlePickBridgeDuckDbPath = async () => {
    setIsPickingBridgeDuckDbPath(true);
    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess(null);
    try {
      const result = await pickBridgeProjectDatabasePath();
      if (result.path) {
        setBridgeProjectDatabaseChoice("existing-duckdb");
        setBridgeProjectDuckDbPath(result.path);
      }
    } catch (error) {
      setRuntimeSettingsError(
        error instanceof Error
          ? error.message
          : "Failed to choose DuckDB file.",
      );
    } finally {
      setIsPickingBridgeDuckDbPath(false);
    }
  };

  const handleSaveBridgeProjectSetup = async () => {
    const runtimeChoice =
      bridgeProjectDatabaseChoice === "none"
        ? null
        : bridgeProjectDatabaseChoice;
    const validationError = runtimeChoice
      ? validateStartupRuntime({
          runtimeChoice,
          duckDbPath: bridgeProjectDuckDbPath,
        })
      : null;
    if (validationError) {
      setRuntimeSettingsError(validationError);
      setRuntimeSettingsSuccess(null);
      return;
    }

    setIsSavingBridgeProjectSetup(true);
    setRuntimeSettingsError(null);
    setRuntimeSettingsSuccess(null);
    try {
      const { project } = await getBridgeProject();
      const runtimeSelection = runtimeChoice
        ? resolveStartupRuntimeSelection({
            runtimeChoice,
            duckDbPath: bridgeProjectDuckDbPath,
          })
        : {
            backend: "bridge" as const,
            dbIdentifier: null,
            catalogContext: null,
          };

      if (bridgeProjectStorageChoice === "local") {
        setProjectStoreMode(project.id, "bridge-filesystem");
        await initializeBridgeProject({
          files: runtimeChoice
            ? [
                {
                  path: ".gitignore",
                  content: createProjectGitignore(),
                },
                {
                  path: "pondview/project.json",
                  content: createProjectManifest(project.name, {
                    runtimeBackend: runtimeSelection.backend,
                    dbIdentifier: runtimeSelection.dbIdentifier ?? "",
                    catalogContext: runtimeSelection.catalogContext,
                  }),
                },
              ]
            : [
                {
                  path: ".gitignore",
                  content: createProjectGitignore(),
                },
                {
                  path: "pondview/project.json",
                  content: `${JSON.stringify(
                    {
                      schemaVersion: 1,
                      name: project.name,
                      defaultSourceRef: null,
                    },
                    null,
                    2,
                  )}\n`,
                },
              ],
          ...(runtimeChoice && "databasePath" in runtimeSelection
            ? { databasePath: runtimeSelection.databasePath }
            : {}),
        });
        await refreshBridgeHealth();
        await hydrateProjectRuntimeFromParsedArtifacts({
          project,
          parsed: parseProjectArtifactFileSet(await listOpenProjectFiles()),
        });
        await refreshOpenProjectSummary();
      } else {
        if (runtimeChoice && "databasePath" in runtimeSelection) {
          await initializeBridgeProject({
            files: [],
            databasePath: runtimeSelection.databasePath,
          });
          await refreshBridgeHealth();
        }
        const browserProject =
          (await getOpenProject()) ?? createBrowserProjectState(project.name);
        const nextBrowserProject = {
          ...browserProject,
          backingKind: "browser-indexeddb" as const,
          defaultSourceRef: runtimeChoice ? "local" : null,
          updatedAt: Date.now(),
        };
        setProjectStoreMode(project.id, "browser-indexeddb");
        await setOpenProject(nextBrowserProject);
        setProjectRuntimeSelection({
          projectId: nextBrowserProject.id,
          sourceRef: "local",
          runtimeBackend: runtimeSelection.backend,
          dbIdentifier: runtimeSelection.dbIdentifier,
          catalogContext: runtimeSelection.catalogContext,
          setupSql: null,
        });
        await refreshOpenProjectSummary();
      }

      setSqlBackendPreferenceInStorage(runtimeSelection.backend);
      setRuntimeSettingsSuccess("Bridge project setup saved.");
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } catch (error) {
      setRuntimeSettingsError(
        error instanceof Error
          ? error.message
          : "Failed to save Bridge project setup.",
      );
      setRuntimeSettingsSuccess(null);
    } finally {
      setIsSavingBridgeProjectSetup(false);
    }
  };

  const updateS3BackupForm = <K extends keyof S3BackupConfig>(
    field: K,
    value: S3BackupConfig[K],
  ) => {
    setS3BackupForm((previous) => ({ ...previous, [field]: value }));
  };

  const handleSaveS3BackupConfig = async () => {
    if (!isS3BackupConfigComplete(s3BackupForm)) {
      setS3BackupError(
        "Endpoint, region, bucket, access key, and secret are all required.",
      );
      setS3BackupSuccess(null);
      return;
    }

    if (effectiveSqlBackend === "bridge" && isBridgeQueryReady) {
      await saveBridgeS3BackupSecret({
        endpoint: s3BackupForm.endpoint,
        region: s3BackupForm.region,
        bucket: s3BackupForm.bucket,
        accessKeyId: s3BackupForm.accessKeyId,
        secretAccessKey: s3BackupForm.secretAccessKey,
        prefix: s3BackupForm.prefix,
        forcePathStyle: s3BackupForm.forcePathStyle,
      });
      setBridgeS3BackupConfigured(true);
      saveS3BackupConfigToStorage({
        ...s3BackupForm,
        accessKeyId: "",
        secretAccessKey: "",
        credentialsStored: true,
      });
    } else {
      saveS3BackupConfigToStorage(s3BackupForm);
    }
    const stored = readS3BackupConfigFromStorage();
    setSavedS3BackupConfig(
      effectiveSqlBackend === "bridge" && isBridgeQueryReady
        ? { ...stored, credentialsStored: true }
        : stored,
    );
    setS3BackupForm(stored);
    setS3BackupError(null);
    setS3CorsError(false);
    setS3BackupSuccess(
      effectiveSqlBackend === "bridge" && isBridgeQueryReady
        ? "S3 backup configuration saved to Bridge."
        : "S3 backup configuration saved.",
    );
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 3000);
  };

  const handleClearS3BackupConfig = async () => {
    if (isBridgeQueryReady) {
      await deleteBridgeS3BackupSecret().catch(() => undefined);
    }
    clearS3BackupConfigInStorage();
    setBridgeS3BackupConfigured(false);
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
    if (
      !(effectiveSqlBackend === "bridge" && bridgeS3BackupConfigured) &&
      !isS3BackupConfigComplete(s3BackupForm)
    ) {
      setS3BackupError("Fill in all S3 fields before testing the connection.");
      setS3BackupSuccess(null);
      return;
    }

    setIsTestingS3Connection(true);
    setS3BackupError(null);
    setS3BackupSuccess(null);
    setS3CorsError(false);

    const result =
      effectiveSqlBackend === "bridge" && bridgeS3BackupConfigured
        ? await testBridgeS3Backup()
        : await testS3BackupConnection(s3BackupForm);
    if (result.ok) {
      setS3BackupSuccess("Connection successful — bucket is reachable.");
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } else {
      setS3CorsError(result.likelyCors ?? false);
      setS3BackupError(`Connection failed: ${result.error}`);
    }
    setIsTestingS3Connection(false);
  };

  const handleRefreshS3SnapshotList = async () => {
    if (
      !(effectiveSqlBackend === "bridge" && bridgeS3BackupConfigured) &&
      !isS3BackupConfigComplete(savedS3BackupConfig)
    ) {
      setS3BackupError(
        "Save the S3 configuration and enter credentials for this browser session before listing snapshots.",
      );
      return;
    }

    setIsListingS3Snapshots(true);
    setS3BackupError(null);

    try {
      const snapshots =
        effectiveSqlBackend === "bridge" && bridgeS3BackupConfigured
          ? (await listBridgeS3Backup()).objects.map((object) => ({
              ...object,
              lastModified: object.lastModified
                ? new Date(object.lastModified)
                : null,
            }))
          : await listSnapshotsInS3(savedS3BackupConfig);
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
      const bytes =
        effectiveSqlBackend === "bridge" && bridgeS3BackupConfigured
          ? await downloadBridgeS3Backup(key)
          : await downloadSnapshotFromS3(savedS3BackupConfig, key);
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

  const handleOpenExportDialog = () => {
    setOpenProjectError(null);
    setS3BackupError(null);
    setIsExportDialogOpen(true);
  };

  const handleUnifiedExport = async ({
    downloadArchive = true,
    includeSnapshot = exportIncludeSnapshot,
    uploadSnapshotToS3Backup = false,
  }: {
    downloadArchive?: boolean;
    includeSnapshot?: boolean;
    uploadSnapshotToS3Backup?: boolean;
  } = {}) => {
    if (!downloadArchive && !uploadSnapshotToS3Backup) {
      setOpenProjectError("Choose at least one export action.");
      return;
    }

    if (
      uploadSnapshotToS3Backup &&
      !(effectiveSqlBackend === "bridge" && bridgeS3BackupConfigured) &&
      !isS3BackupConfigComplete(savedS3BackupConfig)
    ) {
      setS3BackupError(
        "Save the S3 backup configuration and enter credentials for this browser session before uploading a snapshot.",
      );
      return;
    }

    setIsExportingProject(true);
    setOpenProjectError(null);
    setS3BackupError(null);
    setS3BackupSuccess(null);
    setS3CorsError(false);

    try {
      const project = await getOpenProject();
      if (!project) {
        throw new Error("Open a browser-local project before exporting it.");
      }

      const files = await listOpenProjectFiles();
      let snapshotBytes: Uint8Array | null = null;
      let s3Key: string | null = null;
      const needsSnapshot =
        (downloadArchive && includeSnapshot) || uploadSnapshotToS3Backup;

      if (needsSnapshot) {
        snapshotBytes = await new DuckdbWasmClient().exportDatabaseSnapshot();
      }

      if (uploadSnapshotToS3Backup && snapshotBytes) {
        const result =
          effectiveSqlBackend === "bridge" && bridgeS3BackupConfigured
            ? await uploadBridgeS3Backup(snapshotBytes)
            : await uploadSnapshotToS3(savedS3BackupConfig, snapshotBytes);
        s3Key = result.key;
      }

      if (downloadArchive) {
        const archive = createBrowserProjectArchive({
          project,
          files,
          runtimeSnapshot:
            includeSnapshot && snapshotBytes
              ? {
                  bytes: snapshotBytes,
                  pointer: s3Key
                    ? {
                        kind: "s3",
                        key: s3Key,
                        sizeBytes: snapshotBytes.byteLength,
                      }
                    : undefined,
                }
              : undefined,
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
      }

      if (s3Key) {
        setS3BackupSuccess(`Snapshot uploaded as ${s3Key}.`);
        setS3SnapshotList(null);
      }

      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
      if (downloadArchive) {
        setIsExportDialogOpen(false);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to export project.";
      const likelyS3CorsError =
        uploadSnapshotToS3Backup && isCorsLikeError(error);

      if (uploadSnapshotToS3Backup && !downloadArchive) {
        setS3CorsError(likelyS3CorsError);
        setS3BackupError(message);
      } else {
        setS3CorsError(likelyS3CorsError);
        setOpenProjectError(message);
      }
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
      setOpenProjectBackingKind(project.backingKind);
      setOpenProjectRootPath(project.rootPath ?? null);
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
      visualizationModel,
      apiKey,
      ollamaBaseUrl,
      openAiCompatibleUrl,
      openAiCompatibleName,
    };
    const missingSetting = getMissingRequiredSetting(settings);
    const bridgeKeepsExistingSecret =
      effectiveSqlBackend === "bridge" &&
      isBridgeQueryReady &&
      bridgeAiConfigured &&
      missingSetting === `${getAiProviderDisplayName(aiProvider)} API key`;
    if (missingSetting && !bridgeKeepsExistingSecret) {
      setAiSettingsError(`Missing ${missingSetting}.`);
      return;
    }

    setIsSaving(true);
    try {
      if (effectiveSqlBackend === "bridge" && isBridgeQueryReady) {
        await saveBridgeAiSecret(
          bridgeKeepsExistingSecret
            ? { ...settings, apiKey: undefined }
            : settings,
        );
        setBridgeAiConfigured(true);
        saveAiSettingsToStorage({ ...settings, apiKey: "" });
      } else {
        saveAiSettingsToStorage(settings);
      }
      setAiSettingsError(null);
      setShowSuccessMessage(true);
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAiProviderChange = (provider: AiProvider) => {
    setAiProvider(provider);
    setApiKey(getProviderApiKeyFromStorage(provider));
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

  const bridgeOptionLabel = "Bridge";
  const bridgeAuthStatusLabel = bridgeConfig
    ? bridgeConfig.requiresAuth
      ? hasBridgeSessionSecret
        ? "session secret set"
        : "required"
      : "not required"
    : "unknown";
  const bridgeHealthSummary = bridgeConfig
    ? `Health: ${bridgeHealthStatus} • Endpoint: ${bridgeConfig.host}:${bridgeConfig.port} • Auth: ${bridgeAuthStatusLabel}`
    : `Health: ${bridgeHealthStatus} • Auth: ${bridgeAuthStatusLabel}`;

  const resolvedBridgeEndpoint = (
    bridgeEndpoint.trim() || getDefaultBridgeEndpoint(bridgeConfig)
  ).replace(/\/+$/, "");
  const mcpEndpointUrl = `${resolvedBridgeEndpoint}/mcp`;
  const mcpRequiresAuth = bridgeConfig?.requiresAuth ?? false;
  const mcpAllowWriteSql = bridgeConfig?.mcpAllowWriteSql ?? false;

  const activeNavItem =
    SECTION_NAV.find((item) => item.id === activeSection) ?? SECTION_NAV[0];

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex-1 overflow-auto bg-background">
        {/* Atmospheric glow */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[400px]"
          style={{
            background:
              "radial-gradient(ellipse 80% 50% at 50% 0%, hsl(var(--primary) / 0.06), transparent)",
          }}
        />

        <div className="relative mx-auto max-w-6xl px-6 py-12 lg:px-8">
          {/* Header */}
          <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <h1 className="text-5xl font-black tracking-tighter text-foreground sm:text-6xl">
                Settings
              </h1>
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
                    className="shrink-0"
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
                    Switching project…
                  </p>
                )}
              </div>
            )}
          </header>

          {/* Global success toast */}
          {showSuccessMessage && (
            <div className="mb-8 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex items-center gap-2 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>Saved</span>
              </div>
            </div>
          )}

          {/* Layout: nav sidebar + main content */}
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
                <AiSettingsSections
                  aiProvider={aiProvider}
                  onAiProviderChange={handleAiProviderChange}
                  model={model}
                  onModelChange={setModel}
                  visualizationModel={visualizationModel}
                  onVisualizationModelChange={setVisualizationModel}
                  apiKey={apiKey}
                  onApiKeyChange={setApiKey}
                  hasStoredBridgeAiKey={
                    effectiveSqlBackend === "bridge" &&
                    isBridgeQueryReady &&
                    bridgeAiConfigured
                  }
                  ollamaBaseUrl={ollamaBaseUrl}
                  onOllamaBaseUrlChange={setOllamaBaseUrl}
                  openAiCompatibleUrl={openAiCompatibleUrl}
                  onOpenAiCompatibleUrlChange={setOpenAiCompatibleUrl}
                  openAiCompatibleName={openAiCompatibleName}
                  onOpenAiCompatibleNameChange={setOpenAiCompatibleName}
                  aiSettingsError={aiSettingsError}
                  onSaveAiSettings={() => void handleSaveAiSettings()}
                  isSaving={isSaving}
                  defaultPromptMode={defaultPromptMode}
                  showToolCalls={showToolCalls}
                  onShowToolCallsChange={setShowToolCallsPreference}
                  showExecuteSqlRawOutput={showExecuteSqlRawOutput}
                  onShowExecuteSqlRawOutputChange={
                    setExecuteSqlRawOutputPreference
                  }
                  mcpEndpointUrl={mcpEndpointUrl}
                  mcpRequiresAuth={mcpRequiresAuth}
                  mcpAllowWriteSql={mcpAllowWriteSql}
                />
              )}

              {activeSection === "runtime" && (
                <RuntimeSettingsSection
                  selectedSqlBackend={selectedSqlBackend}
                  onSqlBackendChange={handleSqlBackendChange}
                  bridgeOptionLabel={bridgeOptionLabel}
                  isBridgeSelectable={isBridgeDiscoverable}
                  runtimeSettingsError={runtimeSettingsError}
                  runtimeSettingsSuccess={runtimeSettingsSuccess}
                  bridgeHealthSummary={bridgeHealthSummary}
                  bridgeEndpoint={bridgeEndpoint}
                  onBridgeEndpointChange={setBridgeEndpointInput}
                  onSaveBridgeEndpoint={handleSaveBridgeEndpoint}
                  onTestBridgeConnection={() =>
                    void handleTestBridgeConnection()
                  }
                  onClearBridgeEndpoint={handleClearBridgeEndpoint}
                  isTestingBridgeConnection={isTestingBridgeConnection}
                  bridgeSecret={bridgeSecret}
                  onBridgeSecretChange={setBridgeSecret}
                  onSetBridgeSecret={handleSetBridgeSecret}
                  onClearBridgeSecret={handleClearBridgeSecret}
                  hasBridgeSessionSecret={hasBridgeSessionSecret}
                  bridgeProjectDatabaseChoice={bridgeProjectDatabaseChoice}
                  onBridgeProjectDatabaseChoiceChange={
                    handleBridgeProjectDatabaseChoiceChange
                  }
                  bridgeProjectDuckDbPath={bridgeProjectDuckDbPath}
                  onBridgeProjectDuckDbPathChange={setBridgeProjectDuckDbPath}
                  detectedBridgeDuckDbPaths={detectedBridgeDuckDbPaths}
                  onPickBridgeDuckDbPath={() =>
                    void handlePickBridgeDuckDbPath()
                  }
                  isPickingBridgeDuckDbPath={isPickingBridgeDuckDbPath}
                  bridgeProjectStorageChoice={bridgeProjectStorageChoice}
                  onBridgeProjectStorageChoiceChange={
                    setBridgeProjectStorageChoice
                  }
                  onSaveBridgeProjectSetup={() =>
                    void handleSaveBridgeProjectSetup()
                  }
                  isSavingBridgeProjectSetup={isSavingBridgeProjectSetup}
                />
              )}

              {activeSection === "projects" && (
                <ProjectsSettingsSections
                  isEditingProjectName={isEditingProjectName}
                  projectNameDraft={projectNameDraft}
                  onProjectNameDraftChange={setProjectNameDraft}
                  isSwitchingProject={isSwitchingProject}
                  isCreatingProject={isCreatingProject}
                  isSavingProjectName={isSavingProjectName}
                  onSaveProjectName={() => void handleSaveProjectName()}
                  onCancelProjectNameEdit={handleCancelProjectNameEdit}
                  openProjectName={openProjectName}
                  openProjectBackingKind={openProjectBackingKind}
                  openProjectRootPath={openProjectRootPath}
                  onEditProjectName={handleEditProjectName}
                  openProjectError={openProjectError}
                  onOpenProjectDialog={() =>
                    projectImportFileRef.current?.click()
                  }
                  isImportingProject={isImportingProject}
                  onOpenExportDialog={handleOpenExportDialog}
                  isExportingProject={isExportingProject}
                  activeProjectId={activeProjectId}
                  showExternalProjectIntegrations={
                    effectiveSqlBackend === "bridge"
                  }
                  onUploadRuntimeSnapshotToS3={() =>
                    void handleUnifiedExport({
                      downloadArchive: false,
                      uploadSnapshotToS3Backup: true,
                    })
                  }
                  projectImportFileRef={projectImportFileRef}
                  onImportProject={(event) => void handleImportProject(event)}
                  s3BackupError={s3BackupError}
                  s3CorsError={s3CorsError}
                  s3BackupSuccess={s3BackupSuccess}
                  s3BackupForm={s3BackupForm}
                  onUpdateS3BackupForm={updateS3BackupForm}
                  onSaveS3BackupConfig={handleSaveS3BackupConfig}
                  onTestS3BackupConnection={() =>
                    void handleTestS3BackupConnection()
                  }
                  isTestingS3Connection={isTestingS3Connection}
                  onClearS3BackupConfig={handleClearS3BackupConfig}
                  savedS3BackupConfig={savedS3BackupConfig}
                  onRefreshS3SnapshotList={() =>
                    void handleRefreshS3SnapshotList()
                  }
                  isListingS3Snapshots={isListingS3Snapshots}
                  isRestoringFromS3={isRestoringFromS3}
                  s3SnapshotList={s3SnapshotList}
                  s3RestoreKey={s3RestoreKey}
                  onRestoreSnapshotFromS3={(key) =>
                    void handleRestoreSnapshotFromS3(key)
                  }
                  formatSnapshotSize={formatSnapshotSize}
                />
              )}

              {activeSection === "appearance" && (
                <AppearanceSettingsSections
                  selectedTheme={selectedTheme}
                  onThemeChange={handleThemeChange}
                  isSaving={isSaving}
                  availableThemes={availableThemes}
                  customThemeValue={CUSTOM_THEME_VALUE}
                  isDialogOpen={isDialogOpen}
                  onDialogOpenChange={setIsDialogOpen}
                  cssCode={cssCode}
                  onCssCodeChange={setCssCode}
                  onSaveCss={() => void handleSaveCss()}
                  onCancelCssDialog={() => setIsDialogOpen(false)}
                  cssPlaceholder={CSS_PLACEHOLDER}
                />
              )}

              <ExportProjectDialog
                isExportDialogOpen={isExportDialogOpen}
                onExportDialogOpenChange={(open) => {
                  setIsExportDialogOpen(open);
                  if (!open) {
                    setExportIncludeSnapshot(false);
                  }
                }}
                exportIncludeSnapshot={exportIncludeSnapshot}
                onExportIncludeSnapshotChange={setExportIncludeSnapshot}
                openProjectError={openProjectError}
                onCloseExportDialog={() => setIsExportDialogOpen(false)}
                isExportingProject={isExportingProject}
                onExportProject={() => void handleUnifiedExport()}
              />
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

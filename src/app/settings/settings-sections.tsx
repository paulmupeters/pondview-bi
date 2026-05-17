import { ChevronDown, Pencil, SlidersHorizontal } from "lucide-react";
import { type ReactNode, type RefObject, useState } from "react";
import {
  type AiProvider,
  getAiProviderDisplayName,
  getApiKeyStorageKeyForProvider,
  OLLAMA_BASE_URL,
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
  type DefaultPromptMode,
  setDefaultPromptModePreference,
} from "@/lib/default-prompt-mode";
import type { S3BackupObject } from "@/lib/duckdb/s3-backup";
import {
  isS3BackupConfigComplete,
  type S3BackupConfig,
} from "@/lib/duckdb/s3-backup-storage";
import {
  type GitHubProjectConfig,
  isGitHubProjectConfigComplete,
} from "@/lib/project-store/github-project-sync";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import { cn } from "@/lib/utils";
import type { Theme } from "@/themes";
import { SettingsContentSection } from "./settings-layout";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function AlertBlock({
  kind,
  children,
}: {
  kind: "error" | "success" | "info";
  children: ReactNode;
}) {
  const accent =
    kind === "error"
      ? "border-l-destructive text-destructive bg-destructive/5"
      : kind === "success"
        ? "border-l-green-500 text-green-700 dark:text-green-400 bg-green-500/5"
        : "border-l-primary text-foreground bg-primary/5";
  return (
    <div className={cn("rounded border-l-2 px-3 py-2 text-sm", accent)}>
      {children}
    </div>
  );
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return <AlertBlock kind="error">{children}</AlertBlock>;
}

function SuccessMessage({ children }: { children: ReactNode }) {
  return <AlertBlock kind="success">{children}</AlertBlock>;
}

function FormField({
  label,
  htmlFor,
  children,
  className,
  description,
}: {
  label: ReactNode;
  htmlFor: string;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-semibold text-foreground"
      >
        {label}
      </label>
      {description && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI settings
// ---------------------------------------------------------------------------

type AiSettingsSectionsProps = {
  aiProvider: AiProvider;
  onAiProviderChange: (provider: AiProvider) => void;
  model: string;
  onModelChange: (value: string) => void;
  visualizationModel: string;
  onVisualizationModelChange: (value: string) => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  hasStoredBridgeAiKey: boolean;
  bridgeAiStoredKeyLabel: string;
  ollamaBaseUrl: string;
  onOllamaBaseUrlChange: (value: string) => void;
  openAiCompatibleUrl: string;
  onOpenAiCompatibleUrlChange: (value: string) => void;
  openAiCompatibleName: string;
  onOpenAiCompatibleNameChange: (value: string) => void;
  aiSettingsError: string | null;
  onSaveAiSettings: () => void;
  isSaving: boolean;
  defaultPromptMode: DefaultPromptMode;
  showToolCalls: boolean;
  onShowToolCallsChange: (value: boolean) => void;
  showExecuteSqlRawOutput: boolean;
  onShowExecuteSqlRawOutputChange: (value: boolean) => void;
};

export function AiSettingsSections({
  aiProvider,
  onAiProviderChange,
  model,
  onModelChange,
  visualizationModel,
  onVisualizationModelChange,
  apiKey,
  onApiKeyChange,
  hasStoredBridgeAiKey,
  bridgeAiStoredKeyLabel,
  ollamaBaseUrl,
  onOllamaBaseUrlChange,
  openAiCompatibleUrl,
  onOpenAiCompatibleUrlChange,
  openAiCompatibleName,
  onOpenAiCompatibleNameChange,
  aiSettingsError,
  onSaveAiSettings,
  isSaving,
  defaultPromptMode,
  showToolCalls,
  onShowToolCallsChange,
  showExecuteSqlRawOutput,
  onShowExecuteSqlRawOutputChange,
}: AiSettingsSectionsProps) {
  const isOllamaProvider = aiProvider === "ollama";
  const usesCustomCompatibleSettings =
    aiProvider === "openai-compatible" || isOllamaProvider;
  const [showAdvancedAiOptions, setShowAdvancedAiOptions] = useState(false);

  return (
    <>
      <SettingsContentSection>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Provider configuration</h3>
            <p className="text-sm text-muted-foreground">
              Credentials and model selection for AI requests. API keys are kept
              only for the current browser session.
            </p>
          </div>

          <div>
            <FormField label="Provider" htmlFor="ai-provider" className="mb-4">
              <Select
                value={aiProvider}
                onValueChange={(value) =>
                  onAiProviderChange(value as AiProvider)
                }
              >
                <SelectTrigger id="ai-provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="xai">xAI</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                  <SelectItem value="openai-compatible">
                    OpenAI Compatible
                  </SelectItem>
                  <SelectItem value="gateway">AI Gateway</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Model" htmlFor="model-id" className="mb-4">
              <Input
                id="model-id"
                type="text"
                name="ai-model-id"
                autoComplete="off"
                value={model}
                onChange={(event) => onModelChange(event.target.value)}
                placeholder="Enter model ID"
              />
            </FormField>

            <div className="mb-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setShowAdvancedAiOptions((isVisible) => !isVisible)
                }
                aria-expanded={showAdvancedAiOptions}
                aria-controls="advanced-ai-options"
                className="gap-2"
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                Advanced options
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    showAdvancedAiOptions && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </Button>
            </div>

            {showAdvancedAiOptions && (
              <div
                id="advanced-ai-options"
                className="mb-4 rounded-md border bg-muted/20 p-4"
              >
                <FormField
                  label="Visualization model"
                  htmlFor="visualization-model-id"
                  description="Used for chart and card configuration. Uses structured output. Some models can write SQL well but struggle with strict structured chart output."
                >
                  <Input
                    id="visualization-model-id"
                    type="text"
                    name="ai-visualization-model-id"
                    autoComplete="off"
                    value={visualizationModel}
                    onChange={(event) =>
                      onVisualizationModelChange(event.target.value)
                    }
                    placeholder="google/gemini-3-flash"
                  />
                </FormField>
              </div>
            )}

            {!isOllamaProvider && (
              <FormField
                label={getApiKeyStorageKeyForProvider(aiProvider)}
                htmlFor="api-key"
                className="mb-4"
              >
                <Input
                  id="api-key"
                  type="password"
                  name="settings-ai-provider-secret"
                  autoComplete="off"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                  value={apiKey}
                  onChange={(event) => onApiKeyChange(event.target.value)}
                  placeholder={
                    hasStoredBridgeAiKey
                      ? `Bridge has ${bridgeAiStoredKeyLabel || "this provider"} saved; leave blank to keep it`
                      : "Enter your API key"
                  }
                />
              </FormField>
            )}

            {usesCustomCompatibleSettings && (
              <>
                <FormField
                  label="Base URL"
                  htmlFor={
                    isOllamaProvider
                      ? "ollama-base-url"
                      : "openai-compatible-url"
                  }
                  className="mb-4"
                >
                  <Input
                    id={
                      isOllamaProvider
                        ? "ollama-base-url"
                        : "openai-compatible-url"
                    }
                    type="text"
                    name={
                      isOllamaProvider
                        ? "ollama-base-url"
                        : "openai-compatible-url"
                    }
                    autoComplete="off"
                    value={
                      isOllamaProvider ? ollamaBaseUrl : openAiCompatibleUrl
                    }
                    onChange={(event) =>
                      isOllamaProvider
                        ? onOllamaBaseUrlChange(event.target.value)
                        : onOpenAiCompatibleUrlChange(event.target.value)
                    }
                    placeholder={
                      isOllamaProvider
                        ? OLLAMA_BASE_URL
                        : "https://api.example.com/v1"
                    }
                  />
                </FormField>

                {!isOllamaProvider && (
                  <FormField
                    label="Provider Name"
                    htmlFor="openai-compatible-name"
                    className="mb-4"
                  >
                    <Input
                      id="openai-compatible-name"
                      type="text"
                      name="openai-compatible-provider-name"
                      autoComplete="off"
                      value={openAiCompatibleName}
                      onChange={(event) =>
                        onOpenAiCompatibleNameChange(event.target.value)
                      }
                      placeholder="my-provider"
                    />
                  </FormField>
                )}
              </>
            )}

            {aiSettingsError && <ErrorMessage>{aiSettingsError}</ErrorMessage>}
            <Button
              onClick={onSaveAiSettings}
              disabled={isSaving}
              className="mt-4 w-full sm:w-auto"
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
              Configure how chat opens and how tool results are shown in
              messages.
            </p>
          </div>

          <FormField label="Default prompt mode" htmlFor="default-prompt-mode">
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
          </FormField>

          <label
            htmlFor="show-tool-calls"
            className="flex items-center justify-between gap-4 border-t pt-4"
          >
            <div>
              <p className="text-sm font-medium">Show tool calls</p>
              <p className="text-xs text-muted-foreground">
                In notebook AI transcripts, show `tool-*` cards. When disabled,
                transcript tool cards are hidden while SQL result blocks and
                visuals remain visible.
              </p>
            </div>
            <input
              id="show-tool-calls"
              type="checkbox"
              checked={showToolCalls}
              onChange={(event) => onShowToolCallsChange(event.target.checked)}
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
                In notebook AI transcripts, include raw `tool-execute_final_sql`
                and `tool-execute_exploratory_sql` output in the tool card, in
                addition to the SQL result block. This only applies when tool
                calls are visible.
              </p>
            </div>
            <input
              id="show-execute-sql-raw-output"
              type="checkbox"
              checked={showExecuteSqlRawOutput}
              disabled={!showToolCalls}
              onChange={(event) =>
                onShowExecuteSqlRawOutputChange(event.target.checked)
              }
              className="h-4 w-4 rounded border-border"
            />
          </label>

          <p className="text-xs text-muted-foreground">
            These display settings only affect the expandable transcript shown
            in analysis cells.
          </p>
        </div>
      </SettingsContentSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Runtime settings
// ---------------------------------------------------------------------------

type RuntimeSettingsSectionProps = {
  effectiveSqlBackend: SqlBackend;
  effectiveRuntimeLabel: string;
  selectedSqlBackend: SqlBackend;
  onSqlBackendChange: (backend: SqlBackend) => void;
  bridgeOptionLabel: string;
  isBridgeSelectable: boolean;
  runtimeSettingsError: string | null;
  runtimeSettingsSuccess: string | null;
  bridgeHealthSummary: string;
  bridgeEndpoint: string;
  onBridgeEndpointChange: (value: string) => void;
  onSaveBridgeEndpoint: () => void;
  onClearBridgeEndpoint: () => void;
  bridgeSecret: string;
  onBridgeSecretChange: (value: string) => void;
  onSetBridgeSecret: () => void;
  onClearBridgeSecret: () => void;
  hasBridgeSessionSecret: boolean;
};

export function RuntimeSettingsSection({
  effectiveSqlBackend,
  effectiveRuntimeLabel,
  selectedSqlBackend,
  onSqlBackendChange,
  bridgeOptionLabel,
  isBridgeSelectable,
  runtimeSettingsError,
  runtimeSettingsSuccess,
  bridgeHealthSummary,
  bridgeEndpoint,
  onBridgeEndpointChange,
  onSaveBridgeEndpoint,
  onClearBridgeEndpoint,
  bridgeSecret,
  onBridgeSecretChange,
  onSetBridgeSecret,
  onClearBridgeSecret,
  hasBridgeSessionSecret,
}: RuntimeSettingsSectionProps) {
  return (
    <SettingsContentSection>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold">SQL runtime</h3>
          <p className="text-sm text-muted-foreground">
            Choose where SQL runs. Bridge uses Pondview endpoints for local or
            remote DuckDB execution.
          </p>
        </div>

        <div className="flex items-center justify-between border-b pb-3 text-sm">
          <span className="text-muted-foreground">Active runtime</span>
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

        <FormField
          label="Query runtime"
          htmlFor="sql-backend-select"
          description={
            isBridgeSelectable
              ? undefined
              : "Start Pondview Bridge or save a reachable endpoint before selecting Bridge."
          }
        >
          <Select
            value={selectedSqlBackend}
            onValueChange={(value) => onSqlBackendChange(value as SqlBackend)}
          >
            <SelectTrigger id="sql-backend-select" className="w-full sm:w-auto">
              <SelectValue placeholder="Select query runtime" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="duckdb-wasm">DuckDB WASM</SelectItem>
              <SelectItem value="bridge" disabled={!isBridgeSelectable}>
                {bridgeOptionLabel}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        {runtimeSettingsError && (
          <ErrorMessage>{runtimeSettingsError}</ErrorMessage>
        )}
        {runtimeSettingsSuccess && (
          <SuccessMessage>{runtimeSettingsSuccess}</SuccessMessage>
        )}

        {selectedSqlBackend === "bridge" && (
          <div className="space-y-5 border-t pt-5">
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold">Bridge endpoint</h4>
                <p className="text-sm text-muted-foreground">
                  Override the Pondview bridge URL when the bridge is not served
                  from the same origin as this app. Leave empty to use this app
                  origin.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {bridgeHealthSummary}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="url"
                  value={bridgeEndpoint}
                  onChange={(event) =>
                    onBridgeEndpointChange(event.target.value)
                  }
                />
                <Button onClick={onSaveBridgeEndpoint}>Save Endpoint</Button>
                <Button
                  variant="outline"
                  onClick={onClearBridgeEndpoint}
                  disabled={!bridgeEndpoint.trim().length}
                >
                  Reset
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold">Bridge auth</h4>
                <p className="text-sm text-muted-foreground">
                  Optional session-only Pondview secret for authenticated bridge
                  queries. Leave empty when Pondview is started with an empty
                  secret.
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
                  onChange={(event) => onBridgeSecretChange(event.target.value)}
                  placeholder="Enter Pondview secret"
                />
                <Button
                  onClick={onSetBridgeSecret}
                  disabled={!bridgeSecret.trim().length}
                >
                  Set Session Secret
                </Button>
                <Button
                  variant="outline"
                  onClick={onClearBridgeSecret}
                  disabled={!hasBridgeSessionSecret}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SettingsContentSection>
  );
}

// ---------------------------------------------------------------------------
// Projects settings
// ---------------------------------------------------------------------------

type ProjectsSettingsSectionsProps = {
  isEditingProjectName: boolean;
  projectNameDraft: string;
  onProjectNameDraftChange: (value: string) => void;
  isSwitchingProject: boolean;
  isCreatingProject: boolean;
  isSavingProjectName: boolean;
  onSaveProjectName: () => void;
  onCancelProjectNameEdit: () => void;
  openProjectName: string;
  onEditProjectName: () => void;
  openProjectError: string | null;
  onOpenProjectDialog: () => void;
  isImportingProject: boolean;
  onOpenExportDialog: () => void;
  isExportingProject: boolean;
  activeProjectId: string;
  showExternalProjectIntegrations: boolean;
  onUploadRuntimeSnapshotToS3: () => void;
  onPushProjectArtifactsToGitHub: () => void;
  projectImportFileRef: RefObject<HTMLInputElement | null>;
  onImportProject: (event: React.ChangeEvent<HTMLInputElement>) => void;
  githubProjectError: string | null;
  githubProjectSuccess: string | null;
  githubProjectForm: GitHubProjectConfig;
  onUpdateGitHubProjectForm: <K extends keyof GitHubProjectConfig>(
    field: K,
    value: GitHubProjectConfig[K],
  ) => void;
  onSaveGitHubProjectConfig: () => void;
  onClearGitHubProjectConfig: () => void;
  savedGitHubProjectConfig: GitHubProjectConfig;
  s3BackupError: string | null;
  s3CorsError: boolean;
  s3BackupSuccess: string | null;
  s3BackupForm: S3BackupConfig;
  onUpdateS3BackupForm: <K extends keyof S3BackupConfig>(
    field: K,
    value: S3BackupConfig[K],
  ) => void;
  onSaveS3BackupConfig: () => void;
  onTestS3BackupConnection: () => void;
  isTestingS3Connection: boolean;
  onClearS3BackupConfig: () => void;
  savedS3BackupConfig: S3BackupConfig;
  onRefreshS3SnapshotList: () => void;
  isListingS3Snapshots: boolean;
  isRestoringFromS3: boolean;
  s3SnapshotList: S3BackupObject[] | null;
  s3RestoreKey: string | null;
  onRestoreSnapshotFromS3: (key: string) => void;
  formatSnapshotSize: (bytes: number) => string;
};

export function ProjectsSettingsSections({
  isEditingProjectName,
  projectNameDraft,
  onProjectNameDraftChange,
  isSwitchingProject,
  isCreatingProject,
  isSavingProjectName,
  onSaveProjectName,
  onCancelProjectNameEdit,
  openProjectName,
  onEditProjectName,
  openProjectError,
  onOpenProjectDialog,
  isImportingProject,
  onOpenExportDialog,
  isExportingProject,
  activeProjectId,
  showExternalProjectIntegrations,
  onUploadRuntimeSnapshotToS3,
  onPushProjectArtifactsToGitHub,
  projectImportFileRef,
  onImportProject,
  githubProjectError,
  githubProjectSuccess,
  githubProjectForm,
  onUpdateGitHubProjectForm,
  onSaveGitHubProjectConfig,
  onClearGitHubProjectConfig,
  savedGitHubProjectConfig,
  s3BackupError,
  s3CorsError,
  s3BackupSuccess,
  s3BackupForm,
  onUpdateS3BackupForm,
  onSaveS3BackupConfig,
  onTestS3BackupConnection,
  isTestingS3Connection,
  onClearS3BackupConfig,
  savedS3BackupConfig,
  onRefreshS3SnapshotList,
  isListingS3Snapshots,
  isRestoringFromS3,
  s3SnapshotList,
  s3RestoreKey,
  onRestoreSnapshotFromS3,
  formatSnapshotSize,
}: ProjectsSettingsSectionsProps) {
  const isProjectBusy = isSwitchingProject || isCreatingProject;
  const isGitHubConnected = isGitHubProjectConfigComplete(
    savedGitHubProjectConfig,
  );
  const isS3Connected = isS3BackupConfigComplete(savedS3BackupConfig);
  const [isEditingGitHubConfig, setIsEditingGitHubConfig] = useState(false);
  const [isEditingS3Config, setIsEditingS3Config] = useState(false);

  const handleCancelGitHubEdit = () => {
    onUpdateGitHubProjectForm("owner", savedGitHubProjectConfig.owner);
    onUpdateGitHubProjectForm("repo", savedGitHubProjectConfig.repo);
    onUpdateGitHubProjectForm("branch", savedGitHubProjectConfig.branch);
    onUpdateGitHubProjectForm(
      "pathPrefix",
      savedGitHubProjectConfig.pathPrefix,
    );
    onUpdateGitHubProjectForm("token", savedGitHubProjectConfig.token);
    setIsEditingGitHubConfig(false);
  };

  const handleSaveGitHubAndCollapse = () => {
    onSaveGitHubProjectConfig();
    if (isGitHubProjectConfigComplete(githubProjectForm)) {
      setIsEditingGitHubConfig(false);
    }
  };

  const handleClearGitHubAndCollapse = () => {
    onClearGitHubProjectConfig();
    setIsEditingGitHubConfig(false);
  };

  const githubTargetLabel = isGitHubConnected
    ? `${savedGitHubProjectConfig.owner}/${savedGitHubProjectConfig.repo}@${savedGitHubProjectConfig.branch}${
        savedGitHubProjectConfig.pathPrefix
          ? `/${savedGitHubProjectConfig.pathPrefix}`
          : ""
      }`
    : null;

  const handleCancelS3Edit = () => {
    onUpdateS3BackupForm("endpoint", savedS3BackupConfig.endpoint);
    onUpdateS3BackupForm("region", savedS3BackupConfig.region);
    onUpdateS3BackupForm("bucket", savedS3BackupConfig.bucket);
    onUpdateS3BackupForm("prefix", savedS3BackupConfig.prefix);
    onUpdateS3BackupForm("accessKeyId", savedS3BackupConfig.accessKeyId);
    onUpdateS3BackupForm(
      "secretAccessKey",
      savedS3BackupConfig.secretAccessKey,
    );
    onUpdateS3BackupForm("forcePathStyle", savedS3BackupConfig.forcePathStyle);
    setIsEditingS3Config(false);
  };

  const handleSaveS3AndCollapse = () => {
    onSaveS3BackupConfig();
    if (isS3BackupConfigComplete(s3BackupForm)) {
      setIsEditingS3Config(false);
    }
  };

  const handleClearS3AndCollapse = () => {
    onClearS3BackupConfig();
    setIsEditingS3Config(false);
  };

  const s3TargetLabel = isS3Connected
    ? `${savedS3BackupConfig.bucket}${
        savedS3BackupConfig.prefix ? `/${savedS3BackupConfig.prefix}` : ""
      }`
    : null;

  return (
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
                    onProjectNameDraftChange(event.target.value)
                  }
                  placeholder="Project name"
                  disabled={isProjectBusy}
                />
                <Button
                  type="button"
                  onClick={onSaveProjectName}
                  disabled={isSavingProjectName || isProjectBusy}
                >
                  {isSavingProjectName ? "Saving..." : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancelProjectNameEdit}
                  disabled={isSavingProjectName || isProjectBusy}
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
                  onClick={onEditProjectName}
                  disabled={isProjectBusy}
                  aria-label="Edit project name"
                  title="Edit project name"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {openProjectError && <ErrorMessage>{openProjectError}</ErrorMessage>}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={onOpenProjectDialog}
              disabled={isImportingProject || isProjectBusy}
            >
              {isImportingProject ? "Opening..." : "Open Project"}
            </Button>
            <Button
              variant="outline"
              onClick={onOpenExportDialog}
              disabled={isExportingProject || isProjectBusy || !activeProjectId}
            >
              {isExportingProject ? "Exporting..." : "Export Project..."}
            </Button>
          </div>

          <input
            ref={projectImportFileRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            className="hidden"
            onChange={onImportProject}
          />
        </div>
      </SettingsContentSection>

      {showExternalProjectIntegrations && (
        <SettingsContentSection>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">GitHub project sync</h3>
              <p className="text-sm text-muted-foreground">
                Configure a GitHub repository destination for project artifacts.
                The export flow uploads dashboards, queries, notebooks, and
                source metadata only; runtime snapshots and credentials are not
                committed. Tokens are kept only for the current browser session.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded border bg-muted/30 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Status
                </p>
                {isGitHubConnected ? (
                  <p className="truncate">
                    Connected to{" "}
                    <span className="font-mono text-xs">
                      {githubTargetLabel}
                    </span>
                  </p>
                ) : (
                  <p className="text-muted-foreground">Not connected</p>
                )}
              </div>
              {!isEditingGitHubConfig && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingGitHubConfig(true)}
                >
                  {isGitHubConnected ? "Edit connection" : "Add connection"}
                </Button>
              )}
            </div>

            {isEditingGitHubConfig && (
              <>
                {githubProjectError && (
                  <ErrorMessage>{githubProjectError}</ErrorMessage>
                )}
                {githubProjectSuccess && !githubProjectError && (
                  <SuccessMessage>{githubProjectSuccess}</SuccessMessage>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Owner" htmlFor="github-owner">
                    <Input
                      id="github-owner"
                      type="text"
                      value={githubProjectForm.owner}
                      onChange={(event) =>
                        onUpdateGitHubProjectForm("owner", event.target.value)
                      }
                      placeholder="organization-or-user"
                    />
                  </FormField>

                  <FormField label="Repository" htmlFor="github-repo">
                    <Input
                      id="github-repo"
                      type="text"
                      value={githubProjectForm.repo}
                      onChange={(event) =>
                        onUpdateGitHubProjectForm("repo", event.target.value)
                      }
                      placeholder="analytics-project"
                    />
                  </FormField>

                  <FormField label="Branch" htmlFor="github-branch">
                    <Input
                      id="github-branch"
                      type="text"
                      value={githubProjectForm.branch}
                      onChange={(event) =>
                        onUpdateGitHubProjectForm("branch", event.target.value)
                      }
                      placeholder="main"
                    />
                  </FormField>

                  <FormField
                    label={
                      <>
                        Path prefix{" "}
                        <span className="font-normal text-muted-foreground">
                          (optional)
                        </span>
                      </>
                    }
                    htmlFor="github-path-prefix"
                  >
                    <Input
                      id="github-path-prefix"
                      type="text"
                      value={githubProjectForm.pathPrefix}
                      onChange={(event) =>
                        onUpdateGitHubProjectForm(
                          "pathPrefix",
                          event.target.value,
                        )
                      }
                      placeholder="examples/revenue"
                    />
                  </FormField>

                  <FormField
                    label="GitHub token"
                    htmlFor="github-token"
                    className="sm:col-span-2"
                  >
                    <Input
                      id="github-token"
                      type="password"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-form-type="other"
                      value={githubProjectForm.token}
                      onChange={(event) =>
                        onUpdateGitHubProjectForm("token", event.target.value)
                      }
                      placeholder="Fine-grained token with contents write access"
                    />
                  </FormField>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleSaveGitHubAndCollapse}>
                    Save Configuration
                  </Button>
                  <Button variant="outline" onClick={handleCancelGitHubEdit}>
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleClearGitHubAndCollapse}
                    disabled={!isGitHubConnected}
                  >
                    Clear Configuration
                  </Button>
                </div>
              </>
            )}

            {!isEditingGitHubConfig && (
              <div className="space-y-3 border-t pt-4">
                {githubProjectError && (
                  <ErrorMessage>{githubProjectError}</ErrorMessage>
                )}
                {githubProjectSuccess && !githubProjectError && (
                  <SuccessMessage>{githubProjectSuccess}</SuccessMessage>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={onPushProjectArtifactsToGitHub}
                    disabled={
                      isExportingProject ||
                      isProjectBusy ||
                      !activeProjectId ||
                      !isGitHubConnected
                    }
                  >
                    {isExportingProject
                      ? "Pushing..."
                      : "Push project artifacts to GitHub"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SettingsContentSection>
      )}

      {showExternalProjectIntegrations && (
        <SettingsContentSection>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold">S3-compatible backup</h3>
              <p className="text-sm text-muted-foreground">
                Configure an S3-compatible bucket (Cloudflare R2, Backblaze B2,
                MinIO, etc.) so Export Project... can upload runtime snapshots
                and so saved snapshots can be restored here. Credentials are
                kept only for the current browser session - use a scoped key
                limited to one bucket.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded border bg-muted/30 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Status
                </p>
                {isS3Connected ? (
                  <p className="truncate">
                    Connected to{" "}
                    <span className="font-mono text-xs">{s3TargetLabel}</span>
                  </p>
                ) : (
                  <p className="text-muted-foreground">Not connected</p>
                )}
              </div>
              {!isEditingS3Config && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditingS3Config(true)}
                >
                  {isS3Connected ? "Edit connection" : "Add connection"}
                </Button>
              )}
            </div>

            {!isEditingS3Config && s3BackupError && (
              <ErrorMessage>{s3BackupError}</ErrorMessage>
            )}
            {!isEditingS3Config && s3BackupSuccess && !s3BackupError && (
              <SuccessMessage>{s3BackupSuccess}</SuccessMessage>
            )}

            {isEditingS3Config && (
              <>
                {s3BackupError && <ErrorMessage>{s3BackupError}</ErrorMessage>}
                {s3CorsError && (
                  <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-700 dark:bg-amber-950">
                    <p className="mb-2 font-semibold text-amber-800 dark:text-amber-300">
                      This looks like a CORS error. The browser blocked the
                      request because the bucket does not allow cross-origin
                      requests from this origin.
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
                      For R2: Manage bucket - Settings - CORS policy. For B2:
                      Bucket - CORS Rules. For MinIO: use{" "}
                      <code className="rounded bg-amber-100 px-0.5 dark:bg-amber-900">
                        mc anonymous set-json cors.json alias/bucket
                      </code>
                      .
                    </p>
                  </div>
                )}
                {s3BackupSuccess && !s3BackupError && (
                  <SuccessMessage>{s3BackupSuccess}</SuccessMessage>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Endpoint" htmlFor="s3-endpoint">
                    <Input
                      id="s3-endpoint"
                      type="text"
                      value={s3BackupForm.endpoint}
                      onChange={(event) =>
                        onUpdateS3BackupForm("endpoint", event.target.value)
                      }
                      placeholder="https://<acct>.r2.cloudflarestorage.com"
                    />
                  </FormField>

                  <FormField label="Region" htmlFor="s3-region">
                    <Input
                      id="s3-region"
                      type="text"
                      value={s3BackupForm.region}
                      onChange={(event) =>
                        onUpdateS3BackupForm("region", event.target.value)
                      }
                      placeholder="auto"
                    />
                  </FormField>

                  <FormField label="Bucket" htmlFor="s3-bucket">
                    <Input
                      id="s3-bucket"
                      type="text"
                      value={s3BackupForm.bucket}
                      onChange={(event) =>
                        onUpdateS3BackupForm("bucket", event.target.value)
                      }
                      placeholder="pondview-backups"
                    />
                  </FormField>

                  <FormField
                    label={
                      <>
                        Prefix{" "}
                        <span className="font-normal text-muted-foreground">
                          (optional)
                        </span>
                      </>
                    }
                    htmlFor="s3-prefix"
                  >
                    <Input
                      id="s3-prefix"
                      type="text"
                      value={s3BackupForm.prefix}
                      onChange={(event) =>
                        onUpdateS3BackupForm("prefix", event.target.value)
                      }
                      placeholder="pondview/"
                    />
                  </FormField>

                  <FormField label="Access Key ID" htmlFor="s3-access-key">
                    <Input
                      id="s3-access-key"
                      type="text"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      value={s3BackupForm.accessKeyId}
                      onChange={(event) =>
                        onUpdateS3BackupForm("accessKeyId", event.target.value)
                      }
                    />
                  </FormField>

                  <FormField label="Secret Access Key" htmlFor="s3-secret-key">
                    <Input
                      id="s3-secret-key"
                      type="password"
                      autoComplete="off"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-form-type="other"
                      value={s3BackupForm.secretAccessKey}
                      onChange={(event) =>
                        onUpdateS3BackupForm(
                          "secretAccessKey",
                          event.target.value,
                        )
                      }
                    />
                  </FormField>
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
                      onUpdateS3BackupForm(
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
                  <Button onClick={handleSaveS3AndCollapse}>
                    Save Configuration
                  </Button>
                  <Button variant="outline" onClick={handleCancelS3Edit}>
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onTestS3BackupConnection}
                    disabled={isTestingS3Connection}
                  >
                    {isTestingS3Connection ? "Testing..." : "Test Connection"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleClearS3AndCollapse}
                    disabled={!isS3Connected}
                  >
                    Clear Configuration
                  </Button>
                </div>
              </>
            )}

            {isS3Connected && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={onUploadRuntimeSnapshotToS3}
                    disabled={
                      isExportingProject ||
                      isProjectBusy ||
                      !activeProjectId ||
                      !isS3Connected
                    }
                  >
                    {isExportingProject
                      ? "Uploading..."
                      : "Upload runtime snapshot to S3"}
                  </Button>
                </div>

                <div>
                  <h4 className="text-sm font-semibold">Restore from S3</h4>
                  <p className="text-xs text-muted-foreground">
                    Bucket `{savedS3BackupConfig.bucket}
                    {savedS3BackupConfig.prefix
                      ? `/${savedS3BackupConfig.prefix}`
                      : "/"}
                    `. Restore replaces the local database - browser workspace
                    metadata is preserved. Upload happens from the Export
                    Project... dialog.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={onRefreshS3SnapshotList}
                    disabled={isListingS3Snapshots || isRestoringFromS3}
                  >
                    {isListingS3Snapshots ? "Loading..." : "List Snapshots"}
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
                          onClick={() => onRestoreSnapshotFromS3(snapshot.key)}
                          disabled={isRestoringFromS3}
                        >
                          {isRestoringFromS3 && s3RestoreKey === snapshot.key
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
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Appearance settings
// ---------------------------------------------------------------------------

type AppearanceSettingsSectionsProps = {
  selectedTheme: string;
  onThemeChange: (themeName: string) => void;
  isSaving: boolean;
  availableThemes: readonly Theme[];
  customThemeValue: string;
  isDialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  cssCode: string;
  onCssCodeChange: (css: string) => void;
  onSaveCss: () => void;
  onCancelCssDialog: () => void;
  cssPlaceholder: string;
};

export function AppearanceSettingsSections({
  selectedTheme,
  onThemeChange,
  isSaving,
  availableThemes,
  customThemeValue,
  isDialogOpen,
  onDialogOpenChange,
  cssCode,
  onCssCodeChange,
  onSaveCss,
  onCancelCssDialog,
  cssPlaceholder,
}: AppearanceSettingsSectionsProps) {
  return (
    <>
      <SettingsContentSection>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Theme selection</h3>
            <p className="text-sm text-muted-foreground">
              Choose a default theme or create your own custom theme.
            </p>
          </div>

          <FormField label="Select theme" htmlFor="theme-select">
            <Select
              value={selectedTheme}
              onValueChange={onThemeChange}
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
                <SelectItem value={customThemeValue}>Custom</SelectItem>
              </SelectContent>
            </Select>
            {selectedTheme !== customThemeValue && (
              <p className="mt-2 text-sm text-muted-foreground">
                Currently using:{" "}
                <span className="font-medium">
                  {availableThemes.find((theme) => theme.name === selectedTheme)
                    ?.displayName || "Default"}
                </span>
              </p>
            )}
          </FormField>
        </div>
      </SettingsContentSection>

      <SettingsContentSection>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Custom styles</h3>
            <p className="text-sm text-muted-foreground">
              {selectedTheme === customThemeValue
                ? "Customize the appearance of the application using CSS variables."
                : "Select 'Custom' theme to edit your own CSS styles."}
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={onDialogOpenChange}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                disabled={selectedTheme !== customThemeValue}
              >
                Edit Styles
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
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
                  onChange={(event) => onCssCodeChange(event.target.value)}
                  placeholder={cssPlaceholder}
                  className="min-h-100 font-mono text-sm"
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={onCancelCssDialog}>
                  Cancel
                </Button>
                <Button onClick={onSaveCss} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Styles"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {cssCode && selectedTheme === customThemeValue && (
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
  );
}

// ---------------------------------------------------------------------------
// Export project dialog
// ---------------------------------------------------------------------------

type ExportProjectDialogProps = {
  isExportDialogOpen: boolean;
  onExportDialogOpenChange: (open: boolean) => void;
  exportIncludeSnapshot: boolean;
  onExportIncludeSnapshotChange: (value: boolean) => void;
  openProjectError: string | null;
  onCloseExportDialog: () => void;
  isExportingProject: boolean;
  onExportProject: () => void;
};

export function ExportProjectDialog({
  isExportDialogOpen,
  onExportDialogOpenChange,
  exportIncludeSnapshot,
  onExportIncludeSnapshotChange,
  openProjectError,
  onCloseExportDialog,
  isExportingProject,
  onExportProject,
}: ExportProjectDialogProps) {
  return (
    <Dialog open={isExportDialogOpen} onOpenChange={onExportDialogOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export Project</DialogTitle>
          <DialogDescription>
            Download a project archive with artifacts and an optional DuckDB
            runtime snapshot.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Contents</p>
            <label
              htmlFor="export-include-artifacts"
              className="flex items-start gap-2 text-sm text-muted-foreground"
            >
              <input
                id="export-include-artifacts"
                type="checkbox"
                checked
                disabled
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span>
                Project artifacts{" "}
                <span className="text-xs">
                  (dashboards, queries, notebooks)
                </span>
              </span>
            </label>
            <label
              htmlFor="export-include-snapshot"
              className="flex items-start gap-2 text-sm"
            >
              <input
                id="export-include-snapshot"
                type="checkbox"
                checked={exportIncludeSnapshot}
                onChange={(event) =>
                  onExportIncludeSnapshotChange(event.target.checked)
                }
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span>
                Include DuckDB runtime snapshot{" "}
                <span className="text-xs text-muted-foreground">
                  (data, caches, materialized state)
                </span>
              </span>
            </label>
          </div>

          {openProjectError && <ErrorMessage>{openProjectError}</ErrorMessage>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCloseExportDialog}
            disabled={isExportingProject}
          >
            Cancel
          </Button>
          <Button onClick={onExportProject} disabled={isExportingProject}>
            {isExportingProject ? "Exporting..." : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

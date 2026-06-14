import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RuntimeSettingsSection } from "@/app/settings/settings-sections";

function noop() {}

const defaultRuntimeSetupProps = {
  bridgeProjectDatabaseChoice: "none" as const,
  onBridgeProjectDatabaseChoiceChange: noop,
  bridgeProjectDuckDbPath: "runtime/pondview-runtime.duckdb",
  onBridgeProjectDuckDbPathChange: noop,
  detectedBridgeDuckDbPaths: [],
  onPickBridgeDuckDbPath: noop,
  isPickingBridgeDuckDbPath: false,
  bridgeProjectStorageChoice: "browser" as const,
  onBridgeProjectStorageChoiceChange: noop,
  onSaveBridgeProjectSetup: noop,
  isSavingBridgeProjectSetup: false,
};

describe("RuntimeSettingsSection", () => {
  test("hides bridge settings until bridge is selected", () => {
    const markup = renderToStaticMarkup(
      <RuntimeSettingsSection
        selectedSqlBackend="duckdb-wasm"
        onSqlBackendChange={noop}
        bridgeOptionLabel="Bridge"
        isBridgeSelectable={false}
        runtimeSettingsError={null}
        runtimeSettingsSuccess={null}
        bridgeHealthSummary="Health: offline • Auth: not required"
        bridgeEndpoint="http://127.0.0.1:17817"
        onBridgeEndpointChange={noop}
        onSaveBridgeEndpoint={noop}
        onTestBridgeConnection={noop}
        onClearBridgeEndpoint={noop}
        isTestingBridgeConnection={false}
        bridgeSecret=""
        onBridgeSecretChange={noop}
        onSetBridgeSecret={noop}
        onClearBridgeSecret={noop}
        hasBridgeSessionSecret={false}
        {...defaultRuntimeSetupProps}
      />,
    );

    expect(markup).toContain("Select Bridge to configure its endpoint");
    expect(markup).not.toContain("Bridge endpoint");
  });

  test("shows bridge settings when bridge is selected but unavailable", () => {
    const markup = renderToStaticMarkup(
      <RuntimeSettingsSection
        selectedSqlBackend="bridge"
        onSqlBackendChange={noop}
        bridgeOptionLabel="Bridge"
        isBridgeSelectable={false}
        runtimeSettingsError={null}
        runtimeSettingsSuccess={null}
        bridgeHealthSummary="Health: offline • Auth: not required"
        bridgeEndpoint="http://127.0.0.1:17817"
        onBridgeEndpointChange={noop}
        onSaveBridgeEndpoint={noop}
        onTestBridgeConnection={noop}
        onClearBridgeEndpoint={noop}
        isTestingBridgeConnection={false}
        bridgeSecret=""
        onBridgeSecretChange={noop}
        onSetBridgeSecret={noop}
        onClearBridgeSecret={noop}
        hasBridgeSessionSecret={false}
        {...defaultRuntimeSetupProps}
      />,
    );

    expect(markup).toContain("Bridge endpoint");
    expect(markup).toContain("http://127.0.0.1:17817");
    expect(markup).toContain("Save Endpoint");
    expect(markup).toContain("Test Connection");
    expect(markup).toContain("settings-bridge-secret");
    expect(markup).toContain("Local database");
    expect(markup).toContain("Project storage");
    expect(markup).toContain("does not create a local DuckDB file");
  });

  test("shows bridge connection testing state", () => {
    const markup = renderToStaticMarkup(
      <RuntimeSettingsSection
        selectedSqlBackend="bridge"
        onSqlBackendChange={noop}
        bridgeOptionLabel="Bridge"
        isBridgeSelectable={false}
        runtimeSettingsError={null}
        runtimeSettingsSuccess={null}
        bridgeHealthSummary="Health: offline • Auth: not required"
        bridgeEndpoint="http://127.0.0.1:17817"
        onBridgeEndpointChange={noop}
        onSaveBridgeEndpoint={noop}
        onTestBridgeConnection={noop}
        onClearBridgeEndpoint={noop}
        isTestingBridgeConnection={true}
        bridgeSecret=""
        onBridgeSecretChange={noop}
        onSetBridgeSecret={noop}
        onClearBridgeSecret={noop}
        hasBridgeSessionSecret={false}
        {...defaultRuntimeSetupProps}
      />,
    );

    expect(markup).toContain("Testing...");
  });
});

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RuntimeSettingsSection } from "@/app/settings/settings-sections";

function noop() {}

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
        onClearBridgeEndpoint={noop}
        bridgeSecret=""
        onBridgeSecretChange={noop}
        onSetBridgeSecret={noop}
        onClearBridgeSecret={noop}
        hasBridgeSessionSecret={false}
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
        onClearBridgeEndpoint={noop}
        bridgeSecret=""
        onBridgeSecretChange={noop}
        onSetBridgeSecret={noop}
        onClearBridgeSecret={noop}
        hasBridgeSessionSecret={false}
      />,
    );

    expect(markup).toContain("Bridge endpoint");
    expect(markup).toContain("http://127.0.0.1:17817");
    expect(markup).toContain("Save Endpoint");
    expect(markup).toContain("settings-bridge-secret");
  });
});

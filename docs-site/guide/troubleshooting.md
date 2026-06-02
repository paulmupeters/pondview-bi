# Troubleshooting

If something is not working, start with the issue that is closest to what you are seeing.

## Chat is not working

Check these first:

- Your AI provider is configured in **Settings**
- Your API key is present and valid
- The model name is correct for that provider

If Pondview says AI configuration is missing, open **Settings** and save the provider, model, and key again.

## I connected data, but I cannot query it

Possible causes:

- The source was added, but the active runtime cannot use it
- You are using a remote source while the app is running in DuckDB/WASM mode
- The Bridge runtime is unavailable

If you are connecting Postgres, MySQL, SQLite, or MotherDuck, check the runtime in **Settings** and review [SQL Runtime Backends](/guide/sql-runtime-backends).

## The local CLI is not opening or connecting

The local app normally runs at `http://127.0.0.1:17817`.

Try these checks:

```bash
pondview doctor
pondview start --no-open
pondview stop
pondview start
```

Use `pondview doctor` to check whether the Bridge API is reachable. Use `pondview stop` when an old local Bridge process may still be running, then start it again.

If you are using a different port, pass the same port to each command:

```bash
pondview doctor --url http://127.0.0.1:17818
pondview stop --port 17818
pondview start --port 17818
```

## My uploaded file is missing or not showing up

Try:

- Re-importing the file
- Confirming the file type is supported
- Refreshing the workspace if the browser state looks stale

If you are relying on browser-local state, also review [Uploads and Browser Storage](/guide/uploads-and-browser-storage).

## Results do not look right

Try this workflow:

1. Ask a simpler question
2. Review the first result
3. Edit the SQL directly
4. Refine the result before saving it

This is usually the fastest way to separate "bad question" from "bad output formatting."

## Dashboards are not updating the way I expect

Check:

- Whether the underlying data source is still available
- Whether the selected runtime is the one you expect
- Whether you are looking at a saved dashboard result rather than an exploratory chat result

For dashboard execution details, see [Dashboards](/guide/dashboards) and [DuckDB Usage Overview](/guide/duckdb-usage-overview).

## Still stuck?

Use these deeper references:

- [AI Provider Configuration](/guide/ai-provider-configuration)
- [Connected Data Sources](/guide/connected-data-sources)
- [SQL Runtime Backends](/guide/sql-runtime-backends)
- [Workspace Persistence](/guide/workspace-persistence)

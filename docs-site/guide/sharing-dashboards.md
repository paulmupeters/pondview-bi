# Sharing Dashboards

This note summarizes the recommended direction for sharing Pondview dashboards
and projects across users or environments.

## Conclusion

Pondview should separate authored dashboard/project artifacts from data and
runtime state.

Project artifacts should be shared through a Git-friendly format, ideally backed
by GitHub. Data should be shared or connected through a separate data backend
such as MotherDuck, S3-compatible storage, DuckDB HTTP, a warehouse, or manual
upload.

This gives Pondview a clean sharing model:

- GitHub stores reusable BI assets: dashboards, SQL, visual definitions,
  measures, slicers, joins, source references, and published notebooks.
- Data backends store actual data, snapshots, files, or live databases.
- Local source bindings map logical project sources to concrete data locations.
- Manual upload remains available when a recipient does not have access to the
  same data infrastructure.

GitHub should not be the default place for raw data. It should hold the
reviewable analytical intent. Data should live elsewhere unless it is a tiny
demo fixture.

## Recommended Model

Use a three-part sharing model.

```text
GitHub project repository
  pondview/project.json
  pondview/sources/registry.json
  pondview/dashboards/**
  pondview/queries/**
  pondview/notebooks/**

Data backend
  MotherDuck database
  or S3-compatible bucket with Parquet, CSV, or DuckDB snapshots
  or DuckDB HTTP / warehouse / local upload

Private local bindings
  sourceRef "analytics" -> actual backend, database, catalog, and credentials
```

Shared project files should reference logical sources such as `analytics`,
`warehouse`, or `finance`, not concrete credentials, local database identifiers,
or user-specific storage paths.

Each user or deployment can then bind those source references to their own data
environment.

## Unified Export Flow

The user-facing export flow should be simpler than the internal storage model.

Pondview can keep project artifacts and runtime snapshots separate internally
while presenting one primary action:

```text
Export Project
  include project artifacts
  optionally include DuckDB runtime snapshot
  choose destinations for each layer
```

This avoids making users choose between several similar-sounding actions such as
"export project", "export runtime snapshot", and "S3-compatible backup".
Instead, the product can present one "Export Project" flow with clear options.

Recommended export options:

- Include project artifacts, enabled by default.
- Include DuckDB runtime snapshot, optional.
- Download a local project archive.
- Push project artifacts to GitHub.
- Upload the runtime snapshot to S3-compatible storage.

For a local download, the archive can contain both layers:

```text
pondview-project.zip
  pondview/
    project.json
    sources/
      registry.json
    dashboards/
    queries/
    notebooks/
  runtime/
    pondview-runtime.duckdb
  .pondview/
    export-manifest.json
```

For cloud sharing, the destinations should remain separate:

```text
GitHub
  project artifacts only

S3-compatible storage
  DuckDB runtime snapshot
```

The project export may include non-secret metadata that points to an associated
runtime snapshot, but it must not include credentials.

Example manifest metadata:

```json
{
  "schemaVersion": 1,
  "projectArtifacts": {
    "included": true
  },
  "runtimeSnapshot": {
    "included": true,
    "kind": "s3",
    "key": "pondview/snapshots/project-2026-04-27.duckdb"
  }
}
```

This gives users a simple mental model while preserving the architecture:
GitHub stores authored assets, S3-compatible storage stores runtime snapshots,
and local bindings connect the project to usable data.

## GitHub Integration

A direct GitHub integration is a good fit for project artifacts. It should be
treated as project artifact sync, not as data sharing.

Recommended capabilities:

- Open a project from a GitHub repository.
- Read `pondview/project.json` and related artifact files from the repository.
- Save project artifact changes back to a branch.
- Create a pull request for team review.
- Keep local source bindings and secrets out of Git.

A good first implementation path is:

1. Support read-only import from public GitHub repository URLs.
2. Add authenticated GitHub access for private repositories.
3. Add branch-based save and pull request creation.
4. Add conflict handling and artifact-level diff/review affordances.

Browser-only GitHub API integration is likely enough for early import/export.
For production write workflows, a backend-assisted GitHub App or OAuth service
would be safer for token handling and long-lived permissions.

## Data Sharing Options

### MotherDuck

MotherDuck is the strongest option for shared live DuckDB data. It gives teams a
single shared database target while keeping dashboards portable through
`sourceRef` bindings.

Use it when users need collaborative, always-current data.

### S3-Compatible Storage

S3-compatible storage is a strong fit for portable files, object-backed datasets,
and DuckDB snapshots.

Use it for:

- Parquet or CSV datasets
- frozen `.duckdb` snapshot handoff
- backup and restore flows
- bring-your-own-bucket workflows

DuckDB snapshots are useful for exact reproduction, offline handoff, and
debugging. They should not be the primary collaboration model because they are
binary, hard to review, hard to merge, and can become stale.

### Manual Upload

Manual upload should be a first-class fallback. When a shared project is opened
and a required source binding is missing, the user should be able to upload data
manually and bind it to the missing logical source.

Example flow:

1. User opens a shared project.
2. Pondview detects that `sourceRef: "analytics"` is unbound.
3. User chooses "Upload files".
4. Pondview loads the files into the local DuckDB runtime.
5. Pondview binds that uploaded data to `analytics`.
6. Existing dashboards run without changing their artifact definitions.

This makes shared dashboards useful even when teams do not share the same data
backend.

## Product Recommendations

- Make project artifacts the canonical sharing unit for authored BI work.
- Use GitHub for project artifact sync, review, history, and collaboration.
- Keep raw data, DuckDB files, query caches, and secrets out of Git by default.
- Use `sourceRef` values in artifacts instead of concrete runtime identifiers.
- Keep `pondview.sources.local.json` or equivalent local binding state private
  and gitignored.
- Replace separate export actions with one "Export Project" flow that can
  include both project artifacts and an optional DuckDB runtime snapshot.
- Offer manual upload whenever a project source is missing or unbound.
- Support MotherDuck as the simplest live shared-data path.
- Support S3-compatible storage for snapshots, backups, and portable datasets.
- Treat `.duckdb` snapshots as optional runtime artifacts, not project source.
- Prefer pull-request-based GitHub writes for team workflows.

## Suggested MVP

The smallest useful sharing version is:

1. Export/import Git-friendly project artifacts.
2. Add one "Export Project" flow that can include a DuckDB runtime snapshot.
3. Import project artifacts from a GitHub repository URL.
4. Detect missing source bindings during import.
5. Let users satisfy missing bindings with manual upload, MotherDuck, DuckDB
   HTTP, or S3 snapshot restore.
6. Add authenticated GitHub save-to-branch and pull-request creation after the
   read/import flow is solid.

This keeps the architecture simple while preserving the long-term shape:
GitHub for authored assets, data backends for data, and local bindings between
the two.

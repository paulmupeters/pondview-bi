"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import { useDataModel } from "@/hooks/use-data-model";
import type {
  RelationshipType,
  TableIdentifier,
  TableRelationship,
} from "@/lib/types";

type IdentifierOption = TableIdentifier & { id: string; label: string };

function formatIdentifierLabel(id: TableIdentifier) {
  if (id.schema && id.table) return `${id.schema}.${id.table}`;
  if (id.table) return id.table;
  if (id.schema) return id.schema;
  return id.databasePath;
}

export function DataModelEditor() {
  const connected = useConnectedTables();

  const databasePaths = useMemo(() => {
    const set = new Set<string>();
    for (const c of connected) set.add(c.databasePath);
    return Array.from(set);
  }, [connected]);

  const [selectedDbPath, setSelectedDbPath] = useState<string | undefined>(
    databasePaths[0],
  );

  const { relationships, addRelationship, removeRelationship } =
    useDataModel(selectedDbPath);

  const identifierOptions: IdentifierOption[] = useMemo(() => {
    if (!selectedDbPath) return [];
    const options: IdentifierOption[] = [];
    connected
      .filter((c) => c.databasePath === selectedDbPath)
      .forEach((c, idx) => {
        if (Array.isArray(c.tables) && c.tables.length > 0) {
          for (const t of c.tables) {
            const id: TableIdentifier = {
              type: c.type,
              databasePath: c.databasePath,
              schema: c.schema,
              table: t,
            };
            options.push({
              id: `${idx}-${t}`,
              label: formatIdentifierLabel(id),
              ...id,
            });
          }
        } else if (c.table) {
          const id: TableIdentifier = {
            type: c.type,
            databasePath: c.databasePath,
            schema: c.schema,
            table: c.table,
          };
          options.push({
            id: `${idx}-${c.table}`,
            label: formatIdentifierLabel(id),
            ...id,
          });
        } else if (c.schema) {
          const id: TableIdentifier = {
            type: c.type,
            databasePath: c.databasePath,
            schema: c.schema,
          };
          options.push({
            id: `${idx}-${c.schema}`,
            label: formatIdentifierLabel(id),
            ...id,
          });
        }
      });
    return options;
  }, [connected, selectedDbPath]);

  const [leftId, setLeftId] = useState<string | undefined>();
  const [rightId, setRightId] = useState<string | undefined>();
  const [relationType, setRelationType] = useState<
    RelationshipType | undefined
  >("one-to-many");
  const [join, setJoin] = useState("");
  const [description, setDescription] = useState("");

  const canAdd = Boolean(selectedDbPath && leftId && rightId && relationType);

  function resolveIdentifier(
    optionId: string | undefined,
  ): TableIdentifier | undefined {
    if (!optionId) return undefined;
    return identifierOptions.find((o) => o.id === optionId);
  }

  function handleAdd() {
    const left = resolveIdentifier(leftId);
    const right = resolveIdentifier(rightId);
    if (!selectedDbPath || !left || !right || !relationType) return;
    const rel: TableRelationship = {
      id: crypto.randomUUID(),
      left,
      right,
      relationType,
      join: join.trim() || undefined,
      description: description.trim() || undefined,
    };
    addRelationship(rel);
    setLeftId(undefined);
    setRightId(undefined);
    setJoin("");
    setDescription("");
  }

  return (
    <div className="flex h-full w-full flex-col gap-4">
      {databasePaths.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-border/60 bg-muted/30 p-10 text-center">
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              No data sources connected
            </h2>
            <p className="text-sm text-muted-foreground">
              Connect a data source to define relationships.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Scope
              </span>
              <Select value={selectedDbPath} onValueChange={setSelectedDbPath}>
                <SelectTrigger>
                  <SelectValue placeholder="Select database" />
                </SelectTrigger>
                <SelectContent>
                  {databasePaths.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <div className="mb-3 text-sm font-medium text-foreground">
              Add relationship
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-muted-foreground">
                  Left table
                </div>
                <Select value={leftId} onValueChange={setLeftId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select left table" />
                  </SelectTrigger>
                  <SelectContent>
                    {identifierOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-1">
                <div className="mb-1 text-xs text-muted-foreground">Type</div>
                <Select
                  value={relationType}
                  onValueChange={(v) => setRelationType(v as RelationshipType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Relation type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one-to-one">one-to-one</SelectItem>
                    <SelectItem value="one-to-many">one-to-many</SelectItem>
                    <SelectItem value="many-to-many">many-to-many</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <div className="mb-1 text-xs text-muted-foreground">
                  Right table
                </div>
                <Select value={rightId} onValueChange={setRightId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select right table" />
                  </SelectTrigger>
                  <SelectContent>
                    {identifierOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-5 grid grid-cols-1 gap-3 md:grid-cols-5">
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs text-muted-foreground">
                    Join condition (optional)
                  </div>
                  <Input
                    value={join}
                    onChange={(e) => setJoin(e.target.value)}
                    placeholder="e.g., left.id = right.left_id"
                  />
                </div>
                <div className="md:col-span-3">
                  <div className="mb-1 text-xs text-muted-foreground">
                    Description (optional)
                  </div>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Why or how these tables relate"
                    rows={2}
                  />
                </div>
              </div>
              <div className="md:col-span-5 flex justify-end">
                <Button type="button" onClick={handleAdd} disabled={!canAdd}>
                  Add relationship
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">
              Relationships
            </div>
            {relationships.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No relationships defined yet.
              </div>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {relationships.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-foreground">
                        {formatIdentifierLabel(r.left)}{" "}
                        <span className="text-muted-foreground">
                          {r.relationType}
                        </span>{" "}
                        {formatIdentifierLabel(r.right)}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeRelationship(r.id)}
                      >
                        Delete
                      </Button>
                    </div>
                    {r.join ? (
                      <div className="text-xs text-muted-foreground">
                        Join: {r.join}
                      </div>
                    ) : null}
                    {r.description ? (
                      <div className="text-xs text-muted-foreground">
                        {r.description}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default DataModelEditor;

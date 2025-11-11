"use client";

import { useEffect, useState } from "react";
import type {
  DimensionDef,
  DimType,
  JoinDef,
  MeasureDef,
  SegmentDef,
} from "@/../semantic-layer/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSemanticModel } from "@/hooks/use-semantic-model";

export function DataModelEditor() {
  // Semantic layer state
  const [availableExplores, setAvailableExplores] = useState<string[]>([]);
  const [selectedExplore, setSelectedExplore] = useState<string | undefined>();

  useEffect(() => {
    async function loadExplores() {
      try {
        const response = await fetch("/api/semantic-layer/models");
        if (response.ok) {
          const data = await response.json();
          const explores =
            data.explores?.map((e: { name: string }) => e.name) || [];
          setAvailableExplores(explores);
          if (explores.length > 0 && !selectedExplore) {
            setSelectedExplore(explores[0]);
          }
        }
      } catch (error) {
        console.error("Failed to load explores:", error);
      }
    }
    loadExplores();
  }, [selectedExplore]);

  const semanticModel = useSemanticModel(selectedExplore);

  // Dimension form state
  const [dimName, setDimName] = useState("");
  const [dimSql, setDimSql] = useState("");
  const [dimType, setDimType] = useState<DimType>("string");
  const [dimPrimaryKey, setDimPrimaryKey] = useState(false);
  const [dimConformKey, setDimConformKey] = useState("");

  // Measure form state
  const [measureName, setMeasureName] = useState("");
  const [measureSql, setMeasureSql] = useState("");
  const [measureAgg, setMeasureAgg] = useState<
    "sum" | "avg" | "min" | "max" | "count" | "count_distinct"
  >("sum");

  // Join form state
  const [joinName, setJoinName] = useState("");
  const [joinTo, setJoinTo] = useState("");
  const [joinType, setJoinType] = useState<"many_to_one" | "one_to_one">(
    "many_to_one",
  );
  const [joinOn, setJoinOn] = useState("");
  const [joinRequired, setJoinRequired] = useState(false);

  // Segment form state
  const [segmentName, setSegmentName] = useState("");
  const [segmentSql, setSegmentSql] = useState("");

  const canAddDimension = Boolean(selectedExplore && dimName && dimSql);
  const canAddMeasure = Boolean(selectedExplore && measureName && measureAgg);
  const canAddJoin = Boolean(selectedExplore && joinName && joinTo && joinOn);
  const canAddSegment = Boolean(selectedExplore && segmentName && segmentSql);

  async function handleAddDimension() {
    if (!selectedExplore || !dimName || !dimSql) return;
    const dimension: DimensionDef = {
      name: dimName,
      sql: dimSql,
      type: dimType,
      primaryKey: dimPrimaryKey || undefined,
      conformKey: dimConformKey.trim() || undefined,
    };
    await semanticModel.addDimension(dimension);
    setDimName("");
    setDimSql("");
    setDimType("string");
    setDimPrimaryKey(false);
    setDimConformKey("");
  }

  async function handleAddMeasure() {
    if (!selectedExplore || !measureName || !measureAgg) return;
    const measure: MeasureDef = {
      name: measureName,
      sql: measureSql.trim() || "*",
      agg: measureAgg,
    };
    await semanticModel.addMeasure(measure);
    setMeasureName("");
    setMeasureSql("");
    setMeasureAgg("sum");
  }

  async function handleAddJoin() {
    if (!selectedExplore || !joinName || !joinTo || !joinOn) return;
    const join: JoinDef = {
      name: joinName,
      to: joinTo,
      type: joinType,
      on: joinOn,
      required: joinRequired || undefined,
    };
    await semanticModel.addJoin(join);
    setJoinName("");
    setJoinTo("");
    setJoinOn("");
    setJoinType("many_to_one");
    setJoinRequired(false);
  }

  async function handleAddSegment() {
    if (!selectedExplore || !segmentName || !segmentSql) return;
    const segment: SegmentDef = {
      name: segmentName,
      sql: segmentSql,
    };
    await semanticModel.addSegment(segment);
    setSegmentName("");
    setSegmentSql("");
  }

  return (
    <div className="flex h-full w-full flex-col gap-4">
      {availableExplores.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-border/60 bg-muted/30 p-10 text-center">
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              No semantic layer models found
            </h2>
            <p className="text-sm text-muted-foreground">
              Create models in the semantic-layer/models directory.
            </p>
          </div>
        </div>
      ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Explore
              </span>
              <Select value={selectedExplore} onValueChange={setSelectedExplore}>
                <SelectTrigger>
                  <SelectValue placeholder="Select explore" />
                </SelectTrigger>
                <SelectContent>
                  {availableExplores.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
          </div>

            <Tabs defaultValue="dimensions" className="space-y-4">
              <TabsList>
                <TabsTrigger value="dimensions">Dimensions</TabsTrigger>
                <TabsTrigger value="measures">Measures</TabsTrigger>
                <TabsTrigger value="joins">Joins</TabsTrigger>
                <TabsTrigger value="segments">Segments</TabsTrigger>
              </TabsList>

              <TabsContent value="dimensions" className="space-y-4 min-w-4xl">
                <div className="rounded-2xl border border-border bg-card/60 p-4">
                  <div className="mb-3 text-sm font-medium text-foreground">
                    Add dimension
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        Name
                      </div>
                      <Input
                        value={dimName}
                        onChange={(e) => setDimName(e.target.value)}
                        placeholder="e.g., customer_id"
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        Type
                      </div>
                      <Select
                        value={dimType}
                        onValueChange={(v) => setDimType(v as DimType)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="string">string</SelectItem>
                          <SelectItem value="number">number</SelectItem>
                          <SelectItem value="boolean">boolean</SelectItem>
                          <SelectItem value="time">time</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <div className="mb-1 text-xs text-muted-foreground">
                        SQL
                      </div>
                      <Input
                        value={dimSql}
                        onChange={(e) => setDimSql(e.target.value)}
                        placeholder="e.g., orders.customer_id"
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        Primary key
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={dimPrimaryKey}
                          onChange={(e) => setDimPrimaryKey(e.target.checked)}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span className="text-xs text-muted-foreground">
                          Is primary key
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        Conform key (optional)
                      </div>
                      <Input
                        value={dimConformKey}
                        onChange={(e) => setDimConformKey(e.target.value)}
                        placeholder="e.g., customer_id"
                      />
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                      <Button
                        type="button"
                        onClick={handleAddDimension}
                        disabled={!canAddDimension}
                      >
                        Add dimension
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">
                    Dimensions
                  </div>
                  {semanticModel.dimensions.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No dimensions defined yet.
                    </div>
                  ) : (
                    <ul className="grid gap-3 md:grid-cols-2">
                      {semanticModel.dimensions.map((dim) => (
                        <li
                          key={dim.name}
                          className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                {dim.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {dim.type} • {dim.sql}
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                semanticModel.removeDimension(dim.name)
                              }
                            >
                              Delete
                            </Button>
                          </div>
                          {dim.primaryKey && (
                            <div className="text-xs text-muted-foreground">
                              Primary key
                            </div>
                          )}
                          {dim.conformKey && (
                            <div className="text-xs text-muted-foreground">
                              Conform key: {dim.conformKey}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="measures" className="space-y-4 min-w-4xl">
                <div className="rounded-2xl border border-border bg-card/60 p-4">
                  <div className="mb-3 text-sm font-medium text-foreground">
                    Add measure
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        Name
                      </div>
                      <Input
                        value={measureName}
                        onChange={(e) => setMeasureName(e.target.value)}
                        placeholder="e.g., total_revenue"
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        Aggregation
                      </div>
                      <Select
                        value={measureAgg}
                        onValueChange={(v) =>
                          setMeasureAgg(
                            v as
                            | "sum"
                            | "avg"
                            | "min"
                            | "max"
                            | "count"
                            | "count_distinct",
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sum">sum</SelectItem>
                          <SelectItem value="avg">avg</SelectItem>
                          <SelectItem value="min">min</SelectItem>
                          <SelectItem value="max">max</SelectItem>
                          <SelectItem value="count">count</SelectItem>
                          <SelectItem value="count_distinct">
                            count_distinct
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2">
                      <div className="mb-1 text-xs text-muted-foreground">
                        SQL (optional, defaults to *)
                      </div>
                      <Input
                        value={measureSql}
                        onChange={(e) => setMeasureSql(e.target.value)}
                        placeholder="e.g., orders.amount"
                      />
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                      <Button
                        type="button"
                        onClick={handleAddMeasure}
                        disabled={!canAddMeasure}
                      >
                        Add measure
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">
                    Measures
                  </div>
                  {semanticModel.measures.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No measures defined yet.
                    </div>
                  ) : (
                    <ul className="grid gap-3 md:grid-cols-2">
                      {semanticModel.measures.map((measure) => (
                        <li
                          key={measure.name}
                          className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                {measure.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {measure.agg} • {measure.sql}
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                semanticModel.removeMeasure(measure.name)
                              }
                            >
                              Delete
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="joins" className="space-y-4 min-w-4xl">
                <div className="rounded-2xl border border-border bg-card/60 p-4">
                  <div className="mb-3 text-sm font-medium text-foreground">
                    Add join
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        Name
                      </div>
                      <Input
                        value={joinName}
                        onChange={(e) => setJoinName(e.target.value)}
                        placeholder="e.g., customers"
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        To (explore name)
                      </div>
                      <Input
                        value={joinTo}
                        onChange={(e) => setJoinTo(e.target.value)}
                        placeholder="e.g., customers"
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        Type
                      </div>
                      <Select
                        value={joinType}
                        onValueChange={(v) =>
                          setJoinType(v as "many_to_one" | "one_to_one")
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="many_to_one">many_to_one</SelectItem>
                          <SelectItem value="one_to_one">one_to_one</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        Required
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={joinRequired}
                          onChange={(e) => setJoinRequired(e.target.checked)}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span className="text-xs text-muted-foreground">
                          Required join
                        </span>
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <div className="mb-1 text-xs text-muted-foreground">
                        ON condition
                      </div>
                      <Input
                        value={joinOn}
                        onChange={(e) => setJoinOn(e.target.value)}
                        placeholder="e.g., orders.customer_id = customers.id"
                      />
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                      <Button
                        type="button"
                        onClick={handleAddJoin}
                        disabled={!canAddJoin}
                      >
                        Add join
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">Joins</div>
                  {semanticModel.joins.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No joins defined yet.
                    </div>
                  ) : (
                    <ul className="grid gap-3 md:grid-cols-2">
                      {semanticModel.joins.map((join) => (
                        <li
                          key={join.name}
                          className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-foreground">
                                {join.name} → {join.to}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {join.type} • {join.on}
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => semanticModel.removeJoin(join.name)}
                            >
                              Delete
                            </Button>
                          </div>
                          {join.required && (
                            <div className="text-xs text-muted-foreground">
                              Required
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="segments" className="space-y-4 min-w-4xl">
                <div className="rounded-2xl border border-border bg-card/60 p-4">
                  <div className="mb-3 text-sm font-medium text-foreground">
                    Add segment
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        Name
                      </div>
                      <Input
                        value={segmentName}
                        onChange={(e) => setSegmentName(e.target.value)}
                        placeholder="e.g., paid_orders"
                      />
                    </div>
                    <div>
                      <div className="mb-1 text-xs text-muted-foreground">
                        SQL condition
                      </div>
                      <Textarea
                        value={segmentSql}
                        onChange={(e) => setSegmentSql(e.target.value)}
                        placeholder="e.g., orders.status = 'paid'"
                        rows={3}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={handleAddSegment}
                        disabled={!canAddSegment}
                      >
                        Add segment
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-foreground">
                    Segments
                  </div>
                  {semanticModel.segments.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No segments defined yet.
                    </div>
                  ) : (
                    <ul className="grid gap-3 md:grid-cols-2">
                        {semanticModel.segments.map((segment) => (
                          <li
                            key={segment.name}
                            className="flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium text-foreground">
                                  {segment.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {segment.sql}
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  semanticModel.removeSegment(segment.name)
                                }
                              >
                                Delete
                              </Button>
                            </div>
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
      )}
    </div>
  );
}

export default DataModelEditor;

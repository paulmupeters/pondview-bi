import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { DataModel, ExploreDef } from "./types";

interface YAMLExploreDef {
  version: number;
  explore: string;
  base: string;
  joins?: Array<{
    name: string;
    to: string;
    type: string;
    on: string;
    required?: boolean;
  }>;
  dimensions: Array<{
    name: string;
    sql: string;
    type: string;
    primaryKey?: boolean;
    conformKey?: string;
  }>;
  measures?: Array<{
    name: string;
    agg: string;
    sql?: string;
  }>;
  segments?: Array<{
    name: string;
    sql: string;
  }>;
}

export function loadModelsFromDirectory(modelsDir: string): DataModel {
  const explores: ExploreDef[] = [];

  // Read all YAML files in the directory
  const files = readdirSync(modelsDir).filter(
    (file) =>
      (file.endsWith(".yml") || file.endsWith(".yaml")) &&
      file !== "sources.yml" &&
      file !== "sources.yaml",
  );

  for (const file of files) {
    const filePath = join(modelsDir, file);
    const content = readFileSync(filePath, "utf-8");
    const yamlData = yaml.load(content) as YAMLExploreDef;

    // Convert YAML structure to ExploreDef
    const explore: ExploreDef = {
      name: yamlData.explore,
      base: yamlData.base,
      joins: yamlData.joins?.map((j) => ({
        name: j.name,
        to: j.to,
        type: j.type as "many_to_one" | "one_to_one",
        on: j.on,
        required: j.required,
      })),
      dimensions: yamlData.dimensions.map((d) => ({
        name: d.name,
        sql: d.sql,
        type: d.type as "string" | "number" | "boolean" | "time",
        primaryKey: d.primaryKey,
        conformKey: d.conformKey,
      })),
      measures: yamlData.measures?.map((m) => ({
        name: m.name,
        sql: m.sql || "*", // Default to * for count
        agg: m.agg as
          | "sum"
          | "avg"
          | "min"
          | "max"
          | "count"
          | "count_distinct",
      })),
      segments: yamlData.segments,
    };

    explores.push(explore);
  }

  return { explores };
}

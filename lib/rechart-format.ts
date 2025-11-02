import type { Config } from "./types";

type InputDataPoint = Record<string, string | number | boolean | Date>;

interface TransformedDataPoint {
  [key: string]: string | number | null | boolean | Date;
}

interface TransformationResult {
  data: TransformedDataPoint[];
  xAxisField: string;
  lineFields: string[];
}

export function transformDataForMultiLineChart(
  data: InputDataPoint[],
  chartConfig: Config
): TransformationResult {
  const { xKey, lineCategories, measurementColumn, categoryColumn } =
    chartConfig;

  const fields = Object.keys(data[0]);

  const xAxisField = xKey ?? "year"; // Assuming 'year' is always the x-axis
  const lineField = categoryColumn
    ? categoryColumn
    : fields.find((field) =>
        lineCategories?.includes(data[0][field] as string)
      ) || "";

  const xAxisValues = Array.from(
    new Set(data.map((item) => String(item[xAxisField])))
  );

  const transformedData: TransformedDataPoint[] = xAxisValues.map((xValue) => {
    const dataPoint: TransformedDataPoint = { [xAxisField]: xValue };
    lineCategories?.forEach((category) => {
      const matchingItem = data.find(
        (item) =>
          String(item[xAxisField]) === xValue &&
          String(item[lineField]) === category
      );
      dataPoint[category] = matchingItem
        ? matchingItem[measurementColumn ?? ""]
        : null;
    });
    return dataPoint;
  });

  transformedData.sort((a, b) => Number(a[xAxisField]) - Number(b[xAxisField]));

  return {
    data: transformedData,
    xAxisField,
    lineFields: lineCategories ?? [],
  };
}

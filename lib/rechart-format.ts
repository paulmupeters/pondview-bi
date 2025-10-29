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
  chartConfig: Config,
): TransformationResult {
  console.log("Input data:", data);
  const { xKey, lineCategories, measurementColumn, categoryColumn } =
    chartConfig;

  const fields = Object.keys(data[0]);
  console.log("Fields:", fields);

  const xAxisField = xKey ?? "year"; // Assuming 'year' is always the x-axis
  const lineField = categoryColumn
    ? categoryColumn
    : fields.find((field) =>
        lineCategories?.includes(data[0][field] as string)
      ) || "";

  console.log("X-axis field:", xAxisField);
  console.log("Line field:", lineField);
  console.log("Category column:", categoryColumn);

  const xAxisValues = Array.from(
    new Set(data.map((item) => String(item[xAxisField]))),
  );

  console.log("X-axis values:", xAxisValues);
  console.log("Line categories:", lineCategories);

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

  console.log("Transformed data:", transformedData);

  return {
    data: transformedData,
    xAxisField,
    lineFields: lineCategories ?? [],
  };
}

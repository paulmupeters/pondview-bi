import type {
  QueryChartConfig,
  QueryChartPoint,
} from "./query-results-chart-model";

const WIDTH = 720;
const HEIGHT = 300;
const MARGIN = { top: 18, right: 18, bottom: 48, left: 62 } as const;
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const chartColors = [
  "var(--pv-accent)",
  "var(--pv-warm)",
  "var(--pv-blue)",
  "var(--pv-coral)",
  "var(--pv-violet)",
  "var(--pv-moss)",
];

function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(value);
}

function truncateLabel(value: string, length = 13): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

function cartesianGeometry(points: QueryChartPoint[]) {
  const values = points.map((point) => point.value);
  let minimum = Math.min(0, ...values);
  let maximum = Math.max(0, ...values);
  if (minimum === maximum) {
    maximum += 1;
    minimum -= 1;
  }
  const range = maximum - minimum;
  const xStep = PLOT_WIDTH / Math.max(points.length, 1);
  const y = (value: number) =>
    MARGIN.top + ((maximum - value) / range) * PLOT_HEIGHT;
  return { minimum, maximum, xStep, y, baseline: y(0) };
}

function CartesianChart({
  config,
  points,
}: {
  config: QueryChartConfig;
  points: QueryChartPoint[];
}) {
  const geometry = cartesianGeometry(points);
  const coordinates = points.map((point, index) => ({
    ...point,
    x: MARGIN.left + geometry.xStep * index + geometry.xStep / 2,
    y: geometry.y(point.value),
  }));
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const areaPath = `${linePath} L ${coordinates.at(-1)?.x ?? MARGIN.left} ${geometry.baseline} L ${coordinates[0]?.x ?? MARGIN.left} ${geometry.baseline} Z`;
  const tickValues = Array.from(
    { length: 5 },
    (_, index) =>
      geometry.minimum + ((geometry.maximum - geometry.minimum) * index) / 4,
  ).reverse();
  const labelInterval = Math.max(1, Math.ceil(points.length / 8));

  return (
    <svg
      className="query-chart-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${config.yKey} by ${config.xKey}, ${config.type} chart`}
    >
      <title>{`${config.yKey} by ${config.xKey}`}</title>
      <defs>
        <linearGradient id="pondview-area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--pv-accent)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--pv-accent)" stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {tickValues.map((tick) => {
        const tickY = geometry.y(tick);
        return (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={tickY}
              y2={tickY}
              className="chart-gridline"
            />
            <text
              x={MARGIN.left - 10}
              y={tickY + 4}
              className="chart-axis-label chart-y-label"
            >
              {compactNumber(tick)}
            </text>
          </g>
        );
      })}

      {config.type === "area" ? (
        <path d={areaPath} fill="url(#pondview-area-fill)" />
      ) : null}
      {config.type === "line" || config.type === "area" ? (
        <path d={linePath} className="chart-line" />
      ) : null}

      {coordinates.map((point, index) => {
        const showLabel =
          index % labelInterval === 0 || index === coordinates.length - 1;
        const barWidth = Math.max(3, Math.min(52, geometry.xStep * 0.64));
        const barTop = Math.min(point.y, geometry.baseline);
        const barHeight = Math.max(1, Math.abs(geometry.baseline - point.y));
        return (
          <g key={point.id}>
            <title>{`${point.label}: ${compactNumber(point.value)}`}</title>
            {config.type === "bar" ? (
              <rect
                x={point.x - barWidth / 2}
                y={barTop}
                width={barWidth}
                height={barHeight}
                rx="4"
                className="chart-bar"
              />
            ) : (
              <circle cx={point.x} cy={point.y} r="3.5" className="chart-dot" />
            )}
            {showLabel ? (
              <text
                x={point.x}
                y={HEIGHT - MARGIN.bottom + 20}
                className="chart-axis-label chart-x-label"
              >
                {truncateLabel(point.label)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function polarPoint(
  centerX: number,
  centerY: number,
  radius: number,
  angle: number,
) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians),
  };
}

function donutArc(
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const outerStart = polarPoint(centerX, centerY, outerRadius, endAngle);
  const outerEnd = polarPoint(centerX, centerY, outerRadius, startAngle);
  const innerStart = polarPoint(centerX, centerY, innerRadius, startAngle);
  const innerEnd = polarPoint(centerX, centerY, innerRadius, endAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${innerEnd.x} ${innerEnd.y}`,
    "Z",
  ].join(" ");
}

function DonutChart({
  config,
  points,
}: {
  config: QueryChartConfig;
  points: QueryChartPoint[];
}) {
  const positivePoints = points.filter((point) => point.value > 0);
  const total = positivePoints.reduce((sum, point) => sum + point.value, 0);
  let currentAngle = 0;
  const slices = positivePoints.map((point, index) => {
    const startAngle = currentAngle;
    const sweep = total > 0 ? (point.value / total) * 360 : 0;
    currentAngle += sweep;
    return { ...point, index, startAngle, endAngle: currentAngle };
  });

  if (slices.length === 0) {
    return (
      <div className="chart-empty">
        <span aria-hidden="true">◌</span>
        <h2>A donut needs positive values</h2>
        <p>Choose another value column or switch to a cartesian chart.</p>
      </div>
    );
  }

  return (
    <div className="donut-layout">
      <svg
        className="query-chart-svg donut-svg"
        viewBox="0 0 360 300"
        role="img"
        aria-label={`${config.yKey} by ${config.xKey}, donut chart`}
      >
        <title>{`${config.yKey} by ${config.xKey}`}</title>
        {slices.map((slice) => (
          <path
            key={slice.id}
            d={donutArc(180, 148, 116, 67, slice.startAngle, slice.endAngle)}
            fill={chartColors[slice.index % chartColors.length]}
            className="donut-slice"
          >
            <title>{`${slice.label}: ${compactNumber(slice.value)}`}</title>
          </path>
        ))}
        <text x="180" y="143" className="donut-total-label">
          Total
        </text>
        <text x="180" y="167" className="donut-total-value">
          {compactNumber(total)}
        </text>
      </svg>
      <ol className="chart-legend">
        {slices.slice(0, 10).map((slice) => (
          <li key={slice.id}>
            <span
              className="legend-swatch"
              style={{
                background: chartColors[slice.index % chartColors.length],
              }}
            />
            <span className="legend-label">{slice.label}</span>
            <strong>{compactNumber(slice.value)}</strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function QueryResultsChart({
  config,
  points,
  sourceRowCount,
}: {
  config: QueryChartConfig;
  points: QueryChartPoint[];
  sourceRowCount: number;
}) {
  if (points.length === 0) {
    return (
      <div className="chart-empty">
        <span aria-hidden="true">↗</span>
        <h2>No numeric points to plot</h2>
        <p>Choose a different value column or adjust the row filter.</p>
      </div>
    );
  }

  return (
    <section
      className="chart-stage"
      aria-label={`${config.yKey} by ${config.xKey}`}
    >
      <div className="chart-canvas">
        {config.type === "pie" ? (
          <DonutChart config={config} points={points} />
        ) : (
          <CartesianChart config={config} points={points} />
        )}
      </div>
      <div className="chart-caption">
        <span>
          <strong>{config.yKey}</strong> by {config.xKey}
        </span>
        {sourceRowCount > points.length ? (
          <span>
            Plotting {points.length} of {sourceRowCount} visible rows
          </span>
        ) : (
          <span>{points.length} plotted points</span>
        )}
      </div>
    </section>
  );
}

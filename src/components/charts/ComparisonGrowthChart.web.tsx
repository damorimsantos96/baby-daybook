import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { format, parseISO } from "date-fns";
import type { Child, GrowthMetric, GrowthStandard, Measurement, PercentileMode } from "@/types";
import {
  buildComparisonChartData,
  getComparisonGuideValues,
} from "@/components/charts/comparisonChartShared";

const PAD_LEFT = 48;
const PAD_RIGHT = 16;
const PAD_TOP = 12;
const PAD_BOTTOM = 32;
const CHART_H = 440;
const MONTH_WIDTH = 5;

const GUIDE_COLORS: Record<number, string> = {
  3: "#ef4444",
  15: "#f59e0b",
  50: "#10b981",
  85: "#f59e0b",
  97: "#ef4444",
};

const COLORS = {
  axis: "#4a4b58",
  label: "#72737f",
};

interface HoverRow {
  color: string;
  date: string;
  name: string;
  percentile: number;
  value: number;
}

interface HoverInfo {
  month: number;
  rows: HoverRow[];
  svgX: number;
}

interface Props {
  children: { child: Child; measurements: Measurement[] }[];
  containerWidth?: number;
  currentChildId: string;
  label: string;
  metric: GrowthMetric;
  percentileMode: PercentileMode;
  standard: GrowthStandard;
  unit: string;
}

function toX(month: number, minMonth: number, maxMonth: number, width: number): number {
  if (maxMonth === minMonth) return PAD_LEFT + width / 2;
  return PAD_LEFT + ((month - minMonth) / (maxMonth - minMonth)) * width;
}

function toY(value: number): number {
  const height = CHART_H - PAD_TOP - PAD_BOTTOM;
  return CHART_H - PAD_BOTTOM - (value / 100) * height;
}

function buildPath(
  values: { month: number; percentile: number }[],
  minMonth: number,
  maxMonth: number,
  chartWidth: number
): string {
  return values
    .map((point, index) => {
      const x = toX(point.month, minMonth, maxMonth, chartWidth);
      const y = toY(point.percentile);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function ComparisonGrowthChart({
  children,
  containerWidth,
  currentChildId,
  label,
  metric,
  percentileMode,
  standard,
  unit,
}: Props) {
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  const prepared = useMemo(
    () =>
      buildComparisonChartData({
        children,
        currentChildId,
        metric,
        percentileMode,
        standard,
      }),
    [children, currentChildId, metric, percentileMode, standard]
  );

  const guideValues = useMemo(() => getComparisonGuideValues(percentileMode), [percentileMode]);

  const canvasWidth = useMemo(() => {
    if (!prepared) return containerWidth ?? 300;
    return Math.max((prepared.maxMonth - prepared.minMonth) * MONTH_WIDTH, containerWidth ?? 300);
  }, [containerWidth, prepared]);

  const chartWidth = canvasWidth - PAD_LEFT - PAD_RIGHT;
  const yTicks = [0, 25, 50, 75, 100];

  const xTicks = useMemo(() => {
    if (!prepared) return [];
    const ticks: number[] = [];
    const step =
      prepared.maxMonth - prepared.minMonth > 120
        ? 24
        : prepared.maxMonth - prepared.minMonth > 48
        ? 12
        : 6;
    for (let month = prepared.minMonth; month <= prepared.maxMonth; month += step) {
      ticks.push(month);
    }
    if (ticks[ticks.length - 1] !== prepared.maxMonth) ticks.push(Math.floor(prepared.maxMonth));
    return [...new Set(ticks)];
  }, [prepared]);

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    if (!prepared) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = event.clientX - rect.left;
    if (svgX < PAD_LEFT || svgX > PAD_LEFT + chartWidth) {
      setHoverInfo(null);
      return;
    }

    const month =
      prepared.minMonth +
      ((svgX - PAD_LEFT) / chartWidth) * (prepared.maxMonth - prepared.minMonth);
    const clampedMonth = Math.max(prepared.minMonth, Math.min(prepared.maxMonth, month));

    const rows = prepared.series
      .map((series) => {
        const nearestPoint =
          series.points.length > 0
            ? series.points.reduce((left, right) =>
                Math.abs(left.month - clampedMonth) < Math.abs(right.month - clampedMonth)
                  ? left
                  : right
              )
            : null;

        if (!nearestPoint || Math.abs(nearestPoint.month - clampedMonth) > 4) return null;

        return {
          color: series.color,
          date: nearestPoint.date,
          name: series.name,
          percentile: nearestPoint.percentile,
          value: nearestPoint.value,
        };
      })
      .filter((row): row is HoverRow => row != null);

    setHoverInfo(rows.length ? { month: clampedMonth, rows, svgX } : null);
  }

  if (!prepared) {
    return (
      <View style={{ marginBottom: 28 }}>
        <Text
          style={{ color: "#ecfdf5", fontSize: 14, fontWeight: "600", marginBottom: 6, marginLeft: PAD_LEFT }}
        >
          {label}
        </Text>
        <View style={{ backgroundColor: "#1c1d23", borderRadius: 10, padding: 14 }}>
          <Text style={{ color: "#72737f", fontSize: 12 }}>
            Sem dados compatÃ­veis entre filhos nesta referÃªncia.
          </Text>
        </View>
      </View>
    );
  }

  const tooltipX = hoverInfo
    ? hoverInfo.svgX > canvasWidth / 2
      ? hoverInfo.svgX - 196
      : hoverInfo.svgX + 12
    : 0;

  return (
    <View style={{ marginBottom: 28 }}>
      <Text
        style={{ color: "#ecfdf5", fontSize: 14, fontWeight: "600", marginBottom: 6, marginLeft: PAD_LEFT }}
      >
        {label}
      </Text>

      {/* @ts-ignore */}
      <svg
        width={canvasWidth}
        height={CHART_H}
        style={{ cursor: "crosshair", display: "block" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
      >
        {yTicks.map((value) => {
          const y = toY(value);
          // @ts-ignore
          return <line key={value} x1={PAD_LEFT} y1={y} x2={canvasWidth - PAD_RIGHT} y2={y} stroke={COLORS.axis} strokeWidth={0.5} />;
        })}

        {xTicks.map((month) => {
          const x = toX(month, prepared.minMonth, prepared.maxMonth, chartWidth);
          return (
            <React.Fragment key={month}>
              {/* @ts-ignore */}
              <line x1={x} y1={CHART_H - PAD_BOTTOM} x2={x} y2={CHART_H - PAD_BOTTOM + 4} stroke={COLORS.axis} strokeWidth={1} />
              {/* @ts-ignore */}
              <text x={x} y={CHART_H - PAD_BOTTOM + 14} textAnchor="middle" fill={COLORS.label} fontSize={9}>{month}m</text>
            </React.Fragment>
          );
        })}

        {yTicks.map((value) => {
          const y = toY(value);
          // @ts-ignore
          return <text key={value} x={PAD_LEFT - 4} y={y + 3} textAnchor="end" fill={COLORS.label} fontSize={9}>{`P${value}`}</text>;
        })}

        {guideValues.map((value) => {
          const y = toY(value);
          // @ts-ignore
          return <line key={value} x1={PAD_LEFT} y1={y} x2={canvasWidth - PAD_RIGHT} y2={y} stroke={GUIDE_COLORS[value]} strokeWidth={value === 50 ? 1.5 : 1} strokeDasharray={value === 50 ? undefined : value === 15 || value === 85 ? "6 3" : "4 4"} />;
        })}

        {prepared.series.map((series) => {
          if (series.points.length < 2) return null;
          const d = buildPath(series.points, prepared.minMonth, prepared.maxMonth, chartWidth);
          // @ts-ignore
          return <path key={series.childId} d={d} fill="none" stroke={series.color} strokeWidth={series.current ? 2.5 : 2} />;
        })}

        {prepared.series.flatMap((series) =>
          series.points.map((point, index) => {
            const x = toX(point.month, prepared.minMonth, prepared.maxMonth, chartWidth);
            const y = toY(point.percentile);
            // @ts-ignore
            return <circle key={`${series.childId}-${index}`} cx={x} cy={y} r={series.current ? 5 : 4} fill={series.color} />;
          })
        )}

        {hoverInfo && (
          // @ts-ignore
          <line
            x1={hoverInfo.svgX}
            y1={PAD_TOP}
            x2={hoverInfo.svgX}
            y2={CHART_H - PAD_BOTTOM}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={1}
          />
        )}

        {hoverInfo && (
          // @ts-ignore
          <foreignObject
            x={tooltipX}
            y={PAD_TOP + 4}
            width={184}
            height={60 + hoverInfo.rows.length * 48}
          >
            {/* @ts-ignore */}
            <div
              style={{
                background: "#1c1d23",
                border: "1px solid #2c2d36",
                borderRadius: 8,
                color: "#a0a1aa",
                fontFamily: "system-ui, sans-serif",
                fontSize: 11,
                lineHeight: "1.5",
                padding: "8px 10px",
                pointerEvents: "none",
              }}
            >
              <div style={{ color: "#72737f", fontSize: 10, marginBottom: 4 }}>
                {hoverInfo.month.toFixed(0)} meses
              </div>
              {hoverInfo.rows.map((row) => (
                <div key={`${row.name}-${row.date}`} style={{ marginBottom: 6 }}>
                  <div style={{ color: row.color, fontWeight: 700 }}>{row.name}</div>
                  <div style={{ color: "#ffffff" }}>
                    {`P${Math.round(row.percentile)} · ${row.value.toFixed(metric === "weight" ? 2 : 1)} ${unit}`}
                  </div>
                  <div style={{ color: "#72737f", fontSize: 9 }}>
                    {format(parseISO(row.date), "dd/MM/yyyy")}
                  </div>
                </div>
              ))}
            </div>
          </foreignObject>
        )}
      </svg>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginLeft: PAD_LEFT, marginTop: 4 }}>
        <LegendItem color={GUIDE_COLORS[50]} dashed={false} label="P50" />
        {percentileMode === 5 && <LegendItem color={GUIDE_COLORS[15]} dashed label="P15/P85" />}
        <LegendItem color={GUIDE_COLORS[3]} dashed label="P3/P97" />
        {prepared.series.map((series) => (
          <LegendItem
            key={series.childId}
            color={series.color}
            dashed={false}
            label={series.current ? `${series.name} (atual)` : series.name}
          />
        ))}
      </View>

      <Text style={{ color: "#72737f", fontSize: 10, marginLeft: PAD_LEFT, marginTop: 2 }}>
        {prepared.referenceLabel} · faixa comum atÃ© {prepared.overlapEndMonth.toFixed(0)}m
      </Text>
      {prepared.excludedChildren.length > 0 && (
        <Text style={{ color: "#72737f", fontSize: 10, marginLeft: PAD_LEFT, marginTop: 2 }}>
          Sem dados nesta referÃªncia: {prepared.excludedChildren.join(", ")}
        </Text>
      )}
    </View>
  );
}

function LegendItem({ color, dashed, label }: { color: string; dashed: boolean; label: string }) {
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 4 }}>
      <View
        style={{
          backgroundColor: color,
          borderStyle: dashed ? "dashed" : "solid",
          height: 2,
          opacity: dashed ? 0.7 : 1,
          width: 16,
        }}
      />
      <Text style={{ color: "#a0a1aa", fontSize: 10 }}>{label}</Text>
    </View>
  );
}

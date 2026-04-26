import React, { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Canvas, Circle, DashPathEffect, Line, Path, Skia, vec } from "@shopify/react-native-skia";
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
const TITLE_H = 26;

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

interface TooltipRow {
  color: string;
  date: string;
  name: string;
  p50AgeEquiv: string | null;
  percentile: number;
  value: number;
}

interface TooltipData {
  month: number;
  rows: TooltipRow[];
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
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);

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

  const yTicks = [0, 25, 50, 75, 100];

  const seriesPaths = useMemo(() => {
    if (!prepared) return [];

    return prepared.series.map((series) => {
      if (series.linePoints.length < 2) return { ...series, path: null };

      const path = Skia.Path.Make();
      series.linePoints.forEach((point, index) => {
        const x = toX(point.month, prepared.minMonth, prepared.maxMonth, chartWidth);
        const y = toY(point.percentile);
        if (index === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      return { ...series, path };
    });
  }, [chartWidth, prepared]);

  function handleTouch(locationX: number) {
    if (!prepared || locationX < PAD_LEFT || locationX > PAD_LEFT + chartWidth) {
      setTooltipData(null);
      return;
    }

    const month =
      prepared.minMonth +
      ((locationX - PAD_LEFT) / chartWidth) * (prepared.maxMonth - prepared.minMonth);
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
          p50AgeEquiv: nearestPoint.p50AgeEquiv,
          percentile: nearestPoint.percentile,
          value: nearestPoint.value,
        };
      })
      .filter((row): row is TooltipRow => row != null);

    setTooltipData(rows.length ? { month: clampedMonth, rows, svgX: locationX } : null);
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
            Sem dados compatíveis entre filhos nesta referência.
          </Text>
        </View>
      </View>
    );
  }

  const tooltipLeft =
    tooltipData && tooltipData.svgX > canvasWidth / 2
      ? tooltipData.svgX - 172
      : (tooltipData?.svgX ?? 0) + 10;

  return (
    <View style={{ marginBottom: 28 }}>
      <Text
        style={{ color: "#ecfdf5", fontSize: 14, fontWeight: "600", marginBottom: 6, marginLeft: PAD_LEFT }}
      >
        {label}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ position: "relative" }}>
          <Canvas style={{ height: CHART_H, width: canvasWidth }}>
            {yTicks.map((value) => {
              const y = toY(value);
              return (
                <Line
                  key={value}
                  p1={vec(PAD_LEFT, y)}
                  p2={vec(canvasWidth - PAD_RIGHT, y)}
                  color={COLORS.axis}
                  strokeWidth={0.5}
                />
              );
            })}

            {guideValues.map((value) => (
              <Line
                key={value}
                p1={vec(PAD_LEFT, toY(value))}
                p2={vec(canvasWidth - PAD_RIGHT, toY(value))}
                color={GUIDE_COLORS[value]}
                strokeWidth={value === 50 ? 1.5 : 1}
              >
                {value !== 50 && <DashPathEffect intervals={value === 15 || value === 85 ? [6, 3] : [4, 4]} />}
              </Line>
            ))}

            {seriesPaths.map((series) =>
              series.path ? (
                <Path
                  key={series.childId}
                  path={series.path}
                  color={series.color}
                  style="stroke"
                  strokeWidth={series.current ? 2.5 : 2}
                />
              ) : null
            )}

            {prepared.series.flatMap((series) =>
              series.points.map((point, index) => (
                <Circle
                  key={`${series.childId}-${index}`}
                  cx={toX(point.month, prepared.minMonth, prepared.maxMonth, chartWidth)}
                  cy={toY(point.percentile)}
                  r={series.current ? 5 : 4}
                  color={series.color}
                />
              ))
            )}

            {tooltipData && (
              <Line
                p1={vec(tooltipData.svgX, PAD_TOP)}
                p2={vec(tooltipData.svgX, CHART_H - PAD_BOTTOM)}
                color="rgba(255,255,255,0.25)"
                strokeWidth={1}
              />
            )}
          </Canvas>

          <View
            style={{ height: CHART_H, left: 0, position: "absolute", top: 0, width: canvasWidth }}
            onTouchStart={(event) => handleTouch(event.nativeEvent.locationX)}
            onTouchMove={(event) => handleTouch(event.nativeEvent.locationX)}
            onTouchEnd={() => setTooltipData(null)}
          />

          {tooltipData && (
            <View
              style={{
                backgroundColor: "#1c1d23",
                borderColor: "#2c2d36",
                borderRadius: 8,
                borderWidth: 1,
                left: tooltipLeft,
                minWidth: 185,
                padding: 10,
                position: "absolute",
                top: PAD_TOP + 8,
                zIndex: 10,
              }}
            >
              <Text style={{ color: "#72737f", fontSize: 10, marginBottom: 4 }}>
                {tooltipData.month.toFixed(0)} meses
              </Text>
              {tooltipData.rows.map((row) => (
                <View key={`${row.name}-${row.date}`} style={{ marginBottom: 6 }}>
                  <Text style={{ color: row.color, fontSize: 12, fontWeight: "700" }}>{row.name}</Text>
                  <Text style={{ color: "#ffffff", fontSize: 11 }}>
                    P{Math.round(row.percentile)} · {row.value.toFixed(metric === "weight" ? 2 : 1)} {unit}
                  </Text>
                  {row.p50AgeEquiv ? (
                    <Text style={{ color: "#72737f", fontSize: 9 }}>P50 aos {row.p50AgeEquiv}</Text>
                  ) : null}
                  <Text style={{ color: "#72737f", fontSize: 9 }}>
                    {format(parseISO(row.date), "dd/MM/yyyy")}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={{ height: 18, position: "relative" }}>
        {xTicks.map((month) => {
          const x = toX(month, prepared.minMonth, prepared.maxMonth, chartWidth);
          return (
            <Text
              key={month}
              style={{
                color: COLORS.label,
                fontSize: 9,
                left: x - 12,
                position: "absolute",
                textAlign: "center",
                width: 28,
              }}
            >
              {month}m
            </Text>
          );
        })}
      </View>

      <View style={{ height: CHART_H, left: 0, position: "absolute", top: TITLE_H, width: PAD_LEFT }}>
        {yTicks.map((value) => {
          const y = toY(value) - 6;
          return (
            <Text
              key={value}
              style={{
                color: COLORS.label,
                fontSize: 9,
                position: "absolute",
                right: 2,
                textAlign: "right",
                top: y,
                width: PAD_LEFT - 4,
              }}
            >
              P{value}
            </Text>
          );
        })}
      </View>

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

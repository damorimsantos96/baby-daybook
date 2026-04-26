import React, { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Canvas, Circle, DashPathEffect, Line, Path, Skia, vec } from "@shopify/react-native-skia";
import { format, parseISO } from "date-fns";
import type { Child, GrowthMetric, GrowthStandard, Measurement, PercentileMode } from "@/types";
import {
  buildComparisonChartData,
  getComparisonGuideValues,
} from "@/components/charts/comparisonChartShared";

const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 12;
const PAD_BOTTOM = 32;
const CHART_H = 440;
const MONTH_WIDTH = 5;
const PLOT_INSET_X = 12;
const TITLE_H = 26;
const TAP_TOLERANCE_PX = 28;
const TAP_MOVE_THRESHOLD = 8;

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

interface SelectedRow {
  color: string;
  date: string;
  name: string;
  p50Age: string | null;
  p50Delta: string | null;
  percentile: number;
  value: number;
}

interface SelectedData {
  month: number;
  rows: SelectedRow[];
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
  if (maxMonth === minMonth) return PAD_LEFT + PLOT_INSET_X + width / 2;
  return PAD_LEFT + PLOT_INSET_X + ((month - minMonth) / (maxMonth - minMonth)) * width;
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
  const [selectedData, setSelectedData] = useState<SelectedData | null>(null);
  const touchStartX = useRef(0);

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

  const innerChartWidth = canvasWidth - PAD_LEFT - PAD_RIGHT;
  const chartWidth = Math.max(innerChartWidth - PLOT_INSET_X * 2, 1);
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

  function handleTap(locationX: number) {
    if (!prepared) return;

    // Find globally nearest dot across all series by pixel X distance
    let nearestMonth: number | null = null;
    let minDist = Infinity;
    for (const series of prepared.series) {
      for (const point of series.points) {
        const dotX = toX(point.month, prepared.minMonth, prepared.maxMonth, chartWidth);
        const dist = Math.abs(dotX - locationX);
        if (dist < minDist) {
          minDist = dist;
          nearestMonth = point.month;
        }
      }
    }

    if (nearestMonth === null || minDist > TAP_TOLERANCE_PX) {
      setSelectedData(null);
      return;
    }

    const snappedX = toX(nearestMonth, prepared.minMonth, prepared.maxMonth, chartWidth);

    if (selectedData && Math.abs(selectedData.svgX - snappedX) < 5) {
      setSelectedData(null);
      return;
    }

    const rows = prepared.series
      .map((series) => {
        const nearestPoint =
          series.points.length > 0
            ? series.points.reduce((left, right) =>
                Math.abs(left.month - nearestMonth!) < Math.abs(right.month - nearestMonth!)
                  ? left
                  : right
              )
            : null;

        if (!nearestPoint || Math.abs(nearestPoint.month - nearestMonth!) > 4) return null;

        return {
          color: series.color,
          date: nearestPoint.date,
          name: series.name,
          p50Age: nearestPoint.p50Age,
          p50Delta: nearestPoint.p50Delta,
          percentile: nearestPoint.percentile,
          value: nearestPoint.value,
        };
      })
      .filter((row): row is SelectedRow => row != null);

    if (!rows.length) {
      setSelectedData(null);
      return;
    }

    setSelectedData({ month: nearestMonth, rows, svgX: snappedX });
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

            {selectedData && (
              <Line
                p1={vec(selectedData.svgX, PAD_TOP)}
                p2={vec(selectedData.svgX, CHART_H - PAD_BOTTOM)}
                color="rgba(255,255,255,0.3)"
                strokeWidth={1}
              />
            )}

            {selectedData &&
              prepared.series.flatMap((series) =>
                series.points
                  .filter((p) => Math.abs(p.month - selectedData.month) < 0.5)
                  .map((point, index) => (
                    <Circle
                      key={`sel-${series.childId}-${index}`}
                      cx={toX(point.month, prepared.minMonth, prepared.maxMonth, chartWidth)}
                      cy={toY(point.percentile)}
                      r={10}
                      color="rgba(255,255,255,0.15)"
                    />
                  ))
              )}
          </Canvas>

          <View
            style={{ height: CHART_H, left: 0, position: "absolute", top: 0, width: canvasWidth }}
            onTouchStart={(e) => {
              touchStartX.current = e.nativeEvent.locationX;
            }}
            onTouchEnd={(e) => {
              if (Math.abs(e.nativeEvent.locationX - touchStartX.current) <= TAP_MOVE_THRESHOLD) {
                handleTap(e.nativeEvent.locationX);
              }
            }}
          />
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
                right: 6,
                textAlign: "right",
                top: y,
                width: PAD_LEFT - 10,
              }}
            >
              P{value}
            </Text>
          );
        })}
      </View>

      {selectedData && (
        <View
          style={{
            backgroundColor: "#1c1d23",
            borderColor: "#2c2d36",
            borderRadius: 8,
            borderWidth: 1,
            marginHorizontal: 12,
            marginTop: 8,
            padding: 12,
          }}
        >
          <View
            style={{
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <Text style={{ color: "#72737f", fontSize: 11 }}>
              {Math.round(selectedData.month)} meses
            </Text>
            <Pressable onPress={() => setSelectedData(null)} hitSlop={12}>
              <Text style={{ color: "#72737f", fontSize: 18, lineHeight: 18 }}>✕</Text>
            </Pressable>
          </View>

          {selectedData.rows.map((row) => (
            <View
              key={`${row.name}-${row.date}`}
              style={{
                borderTopColor: "#2c2d36",
                borderTopWidth: selectedData.rows.indexOf(row) > 0 ? 1 : 0,
                marginTop: selectedData.rows.indexOf(row) > 0 ? 8 : 0,
                paddingTop: selectedData.rows.indexOf(row) > 0 ? 8 : 0,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View>
                  <Text style={{ color: row.color, fontSize: 13, fontWeight: "700", marginBottom: 2 }}>
                    {row.name}
                  </Text>
                  <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: "700" }}>
                    {row.value.toFixed(metric === "weight" ? 2 : 1)} {unit}
                  </Text>
                  <Text style={{ color: "#10b981", fontSize: 12, marginTop: 2 }}>
                    P{Math.round(row.percentile)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: "#72737f", fontSize: 11 }}>
                    {format(parseISO(row.date), "dd/MM/yyyy")}
                  </Text>
                  {row.p50Age ? (
                    <Text style={{ color: "#72737f", fontSize: 11, marginTop: 4 }}>
                      P50 aos {row.p50Age}{row.p50Delta ? ` (${row.p50Delta})` : ""}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          marginLeft: PAD_LEFT,
          marginTop: selectedData ? 8 : 4,
        }}
      >
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
        {prepared.referenceLabel} · faixa comum até {prepared.overlapEndMonth.toFixed(0)}m
      </Text>
      {prepared.excludedChildren.length > 0 && (
        <Text style={{ color: "#72737f", fontSize: 10, marginLeft: PAD_LEFT, marginTop: 2 }}>
          Sem dados nesta referência: {prepared.excludedChildren.join(", ")}
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

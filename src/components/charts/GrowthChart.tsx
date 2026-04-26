import React, { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Canvas, Circle, DashPathEffect, Line, Path, Skia, vec } from "@shopify/react-native-skia";
import { format, parseISO } from "date-fns";
import {
  ageInMonthsPrecise,
  getP50EquivalentInfo,
  getPercentileCurve,
  getReferenceCaption,
  getReferenceRange,
  getValuePercentile,
} from "@/utils/growthCurves";
import type {
  GrowthMetric,
  GrowthStandard,
  Measurement,
  PercentileMode,
  PercentilePoint,
  Sex,
} from "@/types";

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

const COLORS = {
  p50: "#10b981",
  p15: "#f59e0b",
  p85: "#f59e0b",
  p3: "#ef4444",
  p97: "#ef4444",
  child: "#ffffff",
  dot: "#10b981",
  axis: "#4a4b58",
  label: "#72737f",
};

function range(values: number[]): [number, number] {
  return [Math.min(...values), Math.max(...values)];
}

function toX(month: number, minMonth: number, maxMonth: number, width: number): number {
  if (maxMonth === minMonth) return PAD_LEFT + PLOT_INSET_X + width / 2;
  return PAD_LEFT + PLOT_INSET_X + ((month - minMonth) / (maxMonth - minMonth)) * width;
}

function toY(value: number, minValue: number, maxValue: number): number {
  const height = CHART_H - PAD_TOP - PAD_BOTTOM;
  if (maxValue === minValue) return PAD_TOP + height / 2;
  return CHART_H - PAD_BOTTOM - ((value - minValue) / (maxValue - minValue)) * height;
}

function interpolate(
  curve: PercentilePoint[],
  month: number,
  getter: (point: PercentilePoint) => number
): number | null {
  if (!curve.length) return null;
  if (month < curve[0].month || month > curve[curve.length - 1].month) return null;

  for (const point of curve) {
    if (point.month === month) return getter(point);
  }

  for (let index = 0; index < curve.length - 1; index += 1) {
    const left = curve[index];
    const right = curve[index + 1];
    if (left.month < month && month < right.month) {
      const t = (month - left.month) / (right.month - left.month);
      return getter(left) + (getter(right) - getter(left)) * t;
    }
  }

  return null;
}

interface SelectedData {
  childDate: string;
  childP50Age: string | null;
  childP50Delta: string | null;
  childPercentile: string | null;
  childValue: number;
  month: number;
  p15: number | null;
  p3: number | null;
  p50: number | null;
  p85: number | null;
  p97: number | null;
  svgX: number;
}

interface Props {
  birthDate: string;
  containerWidth?: number;
  label: string;
  measurements: Measurement[];
  metric: GrowthMetric;
  percentileMode: PercentileMode;
  sex: Sex;
  standard: GrowthStandard;
  unit: string;
}

export function GrowthChart({
  metric,
  label,
  unit,
  birthDate,
  sex,
  measurements,
  standard,
  percentileMode,
  containerWidth,
}: Props) {
  const [selectedData, setSelectedData] = useState<SelectedData | null>(null);
  const touchStartX = useRef(0);

  const decimals = metric === "weight" ? 2 : 1;
  const referenceRange = useMemo(() => getReferenceRange(metric, standard), [metric, standard]);

  const curve = useMemo(
    () => getPercentileCurve(metric, sex, standard, percentileMode),
    [metric, sex, standard, percentileMode]
  );

  const dataPoints = useMemo(() => {
    const rawPoints = measurements
      .filter((measurement) => {
        if (metric === "weight") return measurement.weight_kg != null;
        if (metric === "height") return measurement.height_cm != null;
        return measurement.head_circumference_cm != null;
      })
      .map((measurement) => ({
        date: measurement.date,
        ghost: false,
        month: ageInMonthsPrecise(birthDate, measurement.date),
        value:
          metric === "weight"
            ? (measurement.weight_kg as number)
            : metric === "height"
            ? (measurement.height_cm as number)
            : (measurement.head_circumference_cm as number),
      }))
      .sort((left, right) => left.month - right.month);

    if (!referenceRange) return [];

    const inRange = rawPoints.filter(
      (point) =>
        point.month >= referenceRange.startMonth && point.month <= referenceRange.endMonth
    );
    if (!inRange.length) return [];
    if (referenceRange.startMonth === 0) return inRange;

    const beforeRange = rawPoints.filter((point) => point.month < referenceRange.startMonth);
    if (!beforeRange.length) return inRange;

    return [
      { ...beforeRange[beforeRange.length - 1], ghost: true, month: referenceRange.startMonth },
      ...inRange,
    ];
  }, [birthDate, measurements, metric, referenceRange]);

  const { minMonth, maxMonth, canvasWidth } = useMemo(() => {
    if (!curve.length) return { canvasWidth: containerWidth ?? 300, maxMonth: 60, minMonth: 0 };

    const min = curve[0].month;
    const curveMax = curve[curve.length - 1].month;
    const lastDataMonth = dataPoints.length ? dataPoints[dataPoints.length - 1].month : curveMax;
    const nextCurvePoint = curve.find((point) => point.month >= lastDataMonth);
    const max = nextCurvePoint ? nextCurvePoint.month : curveMax;
    return {
      canvasWidth: Math.max((max - min) * MONTH_WIDTH, containerWidth ?? 300),
      maxMonth: max,
      minMonth: min,
    };
  }, [containerWidth, curve, dataPoints]);

  const clippedCurve = useMemo(
    () => curve.filter((point) => point.month >= minMonth && point.month <= maxMonth),
    [curve, minMonth, maxMonth]
  );

  const innerChartWidth = canvasWidth - PAD_LEFT - PAD_RIGHT;
  const chartWidth = Math.max(innerChartWidth - PLOT_INSET_X * 2, 1);

  const { minValue, maxValue } = useMemo(() => {
    const allValues = [
      ...clippedCurve.map((point) => point.p3),
      ...clippedCurve.map((point) => point.p97),
      ...dataPoints.map((point) => point.value),
    ];
    if (!allValues.length) return { maxValue: 20, minValue: 0 };

    const [min, max] = range(allValues);
    const padding = (max - min) * 0.1 || 1;
    return { maxValue: max + padding, minValue: min - padding };
  }, [clippedCurve, dataPoints]);

  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = maxMonth - minMonth > 120 ? 24 : maxMonth - minMonth > 48 ? 12 : 6;
    for (let month = minMonth; month <= maxMonth; month += step) {
      ticks.push(month);
    }
    return ticks;
  }, [maxMonth, minMonth]);

  const yTicks = useMemo(() => {
    const count = 5;
    const step = (maxValue - minValue) / count;
    return Array.from({ length: count + 1 }, (_, index) => minValue + index * step);
  }, [maxValue, minValue]);

  function buildPath(getter: (point: PercentilePoint) => number) {
    if (!clippedCurve.length) return null;

    const path = Skia.Path.Make();
    clippedCurve.forEach((point, index) => {
      const x = toX(point.month, minMonth, maxMonth, chartWidth);
      const y = toY(getter(point), minValue, maxValue);
      if (index === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    return path;
  }

  const pathP3 = buildPath((point) => point.p3);
  const pathP15 = buildPath((point) => point.p15);
  const pathP50 = buildPath((point) => point.p50);
  const pathP85 = buildPath((point) => point.p85);
  const pathP97 = buildPath((point) => point.p97);

  const childPath = useMemo(() => {
    if (dataPoints.length < 2) return null;

    const path = Skia.Path.Make();
    dataPoints.forEach((point, index) => {
      const x = toX(point.month, minMonth, maxMonth, chartWidth);
      const y = toY(point.value, minValue, maxValue);
      if (index === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    return path;
  }, [chartWidth, dataPoints, maxMonth, maxValue, minMonth, minValue]);

  function handleTap(locationX: number) {
    const nonGhostPoints = dataPoints.filter((p) => !p.ghost);
    if (!nonGhostPoints.length) {
      setSelectedData(null);
      return;
    }

    let nearest = nonGhostPoints[0];
    let minDist = Infinity;
    for (const point of nonGhostPoints) {
      const dist = Math.abs(toX(point.month, minMonth, maxMonth, chartWidth) - locationX);
      if (dist < minDist) {
        minDist = dist;
        nearest = point;
      }
    }

    if (minDist > TAP_TOLERANCE_PX) {
      setSelectedData(null);
      return;
    }

    const dotX = toX(nearest.month, minMonth, maxMonth, chartWidth);

    if (selectedData && Math.abs(selectedData.svgX - dotX) < 5) {
      setSelectedData(null);
      return;
    }

    const childP50Info = getP50EquivalentInfo(metric, sex, nearest.month, nearest.value);
    setSelectedData({
      childDate: nearest.date,
      childP50Age: childP50Info?.ageLabel ?? null,
      childP50Delta: childP50Info?.deltaLabel ?? null,
      childPercentile: getValuePercentile(metric, sex, standard, nearest.month, nearest.value),
      childValue: nearest.value,
      month: nearest.month,
      p15: interpolate(clippedCurve, nearest.month, (p) => p.p15),
      p3: interpolate(clippedCurve, nearest.month, (p) => p.p3),
      p50: interpolate(clippedCurve, nearest.month, (p) => p.p50),
      p85: interpolate(clippedCurve, nearest.month, (p) => p.p85),
      p97: interpolate(clippedCurve, nearest.month, (p) => p.p97),
      svgX: dotX,
    });
  }

  if (!curve.length || !referenceRange) return null;

  const selectedPoint = selectedData
    ? dataPoints.find((p) => !p.ghost && p.date === selectedData.childDate) ?? null
    : null;

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
            {yTicks.map((value, index) => {
              const y = toY(value, minValue, maxValue);
              return (
                <Line
                  key={index}
                  p1={vec(PAD_LEFT, y)}
                  p2={vec(canvasWidth - PAD_RIGHT, y)}
                  color={COLORS.axis}
                  strokeWidth={0.5}
                />
              );
            })}

            {pathP3 && (
              <Path path={pathP3} color={COLORS.p3} style="stroke" strokeWidth={1}>
                <DashPathEffect intervals={[4, 4]} />
              </Path>
            )}
            {pathP97 && (
              <Path path={pathP97} color={COLORS.p97} style="stroke" strokeWidth={1}>
                <DashPathEffect intervals={[4, 4]} />
              </Path>
            )}
            {percentileMode === 5 && pathP15 && (
              <Path path={pathP15} color={COLORS.p15} style="stroke" strokeWidth={1}>
                <DashPathEffect intervals={[6, 3]} />
              </Path>
            )}
            {percentileMode === 5 && pathP85 && (
              <Path path={pathP85} color={COLORS.p85} style="stroke" strokeWidth={1}>
                <DashPathEffect intervals={[6, 3]} />
              </Path>
            )}
            {pathP50 && <Path path={pathP50} color={COLORS.p50} style="stroke" strokeWidth={1.5} />}

            {childPath && <Path path={childPath} color={COLORS.child} style="stroke" strokeWidth={2} />}

            {dataPoints
              .filter((point) => !point.ghost)
              .map((point, index) => (
                <Circle
                  key={index}
                  cx={toX(point.month, minMonth, maxMonth, chartWidth)}
                  cy={toY(point.value, minValue, maxValue)}
                  r={5}
                  color={COLORS.dot}
                />
              ))}

            {selectedData && (
              <Line
                p1={vec(selectedData.svgX, PAD_TOP)}
                p2={vec(selectedData.svgX, CHART_H - PAD_BOTTOM)}
                color="rgba(255,255,255,0.3)"
                strokeWidth={1}
              />
            )}

            {selectedPoint && (
              <>
                <Circle
                  cx={toX(selectedPoint.month, minMonth, maxMonth, chartWidth)}
                  cy={toY(selectedPoint.value, minValue, maxValue)}
                  r={11}
                  color="rgba(255,255,255,0.18)"
                />
                <Circle
                  cx={toX(selectedPoint.month, minMonth, maxMonth, chartWidth)}
                  cy={toY(selectedPoint.value, minValue, maxValue)}
                  r={5}
                  color={COLORS.dot}
                />
              </>
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

      <View style={{ height: 18, marginLeft: 0, position: "relative" }}>
        {xTicks.map((month) => {
          const x = toX(month, minMonth, maxMonth, chartWidth);
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
        {yTicks.map((value, index) => {
          const ratio = (value - minValue) / (maxValue - minValue);
          const y = CHART_H - PAD_BOTTOM - ratio * (CHART_H - PAD_TOP - PAD_BOTTOM) - 6;
          return (
            <Text
              key={index}
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
              {value.toFixed(metric === "weight" ? 1 : 0)}
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
              {Math.round(selectedData.month)} meses · {format(parseISO(selectedData.childDate), "dd/MM/yyyy")}
            </Text>
            <Pressable onPress={() => setSelectedData(null)} hitSlop={12}>
              <Text style={{ color: "#72737f", fontSize: 18, lineHeight: 18 }}>✕</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Text style={{ color: "#ffffff", fontSize: 20, fontWeight: "700" }}>
                {selectedData.childValue.toFixed(decimals)} {unit}
              </Text>
              {selectedData.childPercentile ? (
                <Text style={{ color: "#10b981", fontSize: 13, marginTop: 2 }}>
                  {selectedData.childPercentile}
                </Text>
              ) : null}
              {selectedData.childP50Age ? (
                <Text style={{ color: "#72737f", fontSize: 12, marginTop: 4 }}>
                  P50 aos {selectedData.childP50Age}
                </Text>
              ) : null}
              {selectedData.childP50Delta ? (
                <Text style={{ color: "#72737f", fontSize: 12 }}>
                  P50 em {selectedData.childP50Delta}
                </Text>
              ) : null}
            </View>

            <View style={{ alignItems: "flex-end", justifyContent: "flex-start" }}>
              <Text style={{ color: COLORS.p50, fontSize: 12, marginBottom: 3 }}>
                P50: {selectedData.p50?.toFixed(decimals) ?? "--"}
              </Text>
              {percentileMode === 5 && (
                <>
                  <Text style={{ color: COLORS.p15, fontSize: 12, marginBottom: 3 }}>
                    P15: {selectedData.p15?.toFixed(decimals) ?? "--"}
                  </Text>
                  <Text style={{ color: COLORS.p85, fontSize: 12, marginBottom: 3 }}>
                    P85: {selectedData.p85?.toFixed(decimals) ?? "--"}
                  </Text>
                </>
              )}
              <Text style={{ color: COLORS.p3, fontSize: 12, marginBottom: 3 }}>
                P3: {selectedData.p3?.toFixed(decimals) ?? "--"}
              </Text>
              <Text style={{ color: COLORS.p97, fontSize: 12 }}>
                P97: {selectedData.p97?.toFixed(decimals) ?? "--"}
              </Text>
            </View>
          </View>
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
        <LegendItem color={COLORS.p50} label="P50" dashed={false} />
        {percentileMode === 5 && <LegendItem color={COLORS.p15} label="P15/P85" dashed />}
        <LegendItem color={COLORS.p3} label="P3/P97" dashed />
        <LegendItem color={COLORS.child} label="Filho(a)" dashed={false} />
      </View>

      <Text style={{ color: "#72737f", fontSize: 10, marginLeft: PAD_LEFT, marginTop: 2 }}>
        {unit} · {getReferenceCaption(metric, standard)}
      </Text>
    </View>
  );
}

function LegendItem({ color, label, dashed }: { color: string; dashed: boolean; label: string }) {
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

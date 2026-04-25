import React, { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  Canvas,
  Circle,
  DashPathEffect,
  Line,
  Path,
  Skia,
  vec,
} from "@shopify/react-native-skia";
import { format, parseISO } from "date-fns";
import { ageInMonths, getPercentileCurve, getValuePercentile } from "@/utils/growthCurves";
import type {
  GrowthMetric,
  GrowthStandard,
  Measurement,
  PercentileMode,
  PercentilePoint,
  Sex,
} from "@/types";

// ─── Layout constants ─────────────────────────────────────────────────────────
const PAD_LEFT = 48;
const PAD_RIGHT = 16;
const PAD_TOP = 12;
const PAD_BOTTOM = 32;
const CHART_H = 440;
const MONTH_WIDTH = 5;
const TITLE_H = 26;

const COLORS = {
  p50:   "#10b981",
  p15:   "#f59e0b",
  p85:   "#f59e0b",
  p3:    "#ef4444",
  p97:   "#ef4444",
  child: "#ffffff",
  dot:   "#10b981",
  axis:  "#4a4b58",
  label: "#72737f",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function range(arr: number[]): [number, number] {
  return [Math.min(...arr), Math.max(...arr)];
}

function toX(month: number, minMonth: number, maxMonth: number, w: number): number {
  if (maxMonth === minMonth) return PAD_LEFT + w / 2;
  return PAD_LEFT + ((month - minMonth) / (maxMonth - minMonth)) * w;
}

function toY(val: number, minVal: number, maxVal: number): number {
  const h = CHART_H - PAD_TOP - PAD_BOTTOM;
  if (maxVal === minVal) return PAD_TOP + h / 2;
  return CHART_H - PAD_BOTTOM - ((val - minVal) / (maxVal - minVal)) * h;
}

function interp(
  curve: PercentilePoint[],
  month: number,
  get: (p: PercentilePoint) => number
): number | null {
  if (!curve.length) return null;
  if (month <= curve[0].month) return get(curve[0]);
  const last = curve[curve.length - 1];
  if (month >= last.month) return get(last);
  for (let i = 0; i < curve.length - 1; i++) {
    if (curve[i].month <= month && month < curve[i + 1].month) {
      const t = (month - curve[i].month) / (curve[i + 1].month - curve[i].month);
      return get(curve[i]) * (1 - t) + get(curve[i + 1]) * t;
    }
  }
  return null;
}

interface TooltipData {
  svgX: number;
  month: number;
  p3: number | null;
  p50: number | null;
  p97: number | null;
  p15: number | null;
  p85: number | null;
  childValue: number | null;
  childDate: string | null;
  childPercentile: string | null;
}

interface Props {
  metric: GrowthMetric;
  label: string;
  unit: string;
  birthDate: string;
  sex: Sex;
  measurements: Measurement[];
  standard: GrowthStandard;
  percentileMode: PercentileMode;
  containerWidth?: number;
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
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);

  const decimals = metric === "weight" ? 2 : 1;

  const dataPoints = useMemo(() => {
    return measurements
      .filter((m) => {
        if (metric === "weight") return m.weight_kg != null;
        if (metric === "height") return m.height_cm != null;
        return m.head_circumference_cm != null;
      })
      .map((m) => ({
        month: ageInMonths(birthDate, m.date),
        value:
          metric === "weight"
            ? (m.weight_kg as number)
            : metric === "height"
            ? (m.height_cm as number)
            : (m.head_circumference_cm as number),
        date: m.date,
      }))
      .filter((d) => standard !== "CDC" || d.month >= 24)
      .sort((a, b) => a.month - b.month);
  }, [measurements, birthDate, metric, standard]);

  const curve = useMemo(
    () => getPercentileCurve(metric, sex, standard, percentileMode),
    [metric, sex, standard, percentileMode]
  );

  const { minMonth, maxMonth, canvasW } = useMemo(() => {
    if (!curve.length) return { minMonth: 0, maxMonth: 60, canvasW: containerWidth ?? 300 };
    const curveMin = curve[0].month;
    const curveMax = curve[curve.length - 1].month;
    const lastDataMonth = dataPoints.length > 0
      ? dataPoints[dataPoints.length - 1].month
      : curveMax;
    const lo = curveMin;
    const hi = Math.min(lastDataMonth, curveMax);
    const spanW = (hi - lo) * MONTH_WIDTH;
    const w = Math.max(spanW, containerWidth ?? 300);
    return { minMonth: lo, maxMonth: hi, canvasW: w };
  }, [curve, dataPoints, containerWidth]);

  const clippedCurve = useMemo(
    () => curve.filter((p) => p.month <= maxMonth),
    [curve, maxMonth]
  );

  const chartW = canvasW - PAD_LEFT - PAD_RIGHT;

  const { minVal, maxVal } = useMemo(() => {
    const allVals = [
      ...curve.map((p) => p.p3),
      ...curve.map((p) => p.p97),
      ...dataPoints.map((d) => d.value),
    ];
    if (!allVals.length) return { minVal: 0, maxVal: 20 };
    const [lo, hi] = range(allVals);
    const pad = (hi - lo) * 0.1 || 1;
    return { minVal: lo - pad, maxVal: hi + pad };
  }, [curve, dataPoints]);

  // ─── Build percentile paths ──────────────────────────────────────────────

  function buildPath(getter: (p: PercentilePoint) => number) {
    if (!clippedCurve.length) return null;
    const path = Skia.Path.Make();
    clippedCurve.forEach((pt, i) => {
      const x = toX(pt.month, minMonth, maxMonth, chartW);
      const y = toY(getter(pt), minVal, maxVal);
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    return path;
  }

  const pathP50 = buildPath((p) => p.p50);
  const pathP15 = buildPath((p) => p.p15);
  const pathP85 = buildPath((p) => p.p85);
  const pathP3  = buildPath((p) => p.p3);
  const pathP97 = buildPath((p) => p.p97);

  const childPath = useMemo(() => {
    if (dataPoints.length < 2) return null;
    const path = Skia.Path.Make();
    dataPoints.forEach((pt, i) => {
      const x = toX(pt.month, minMonth, maxMonth, chartW);
      const y = toY(pt.value, minVal, maxVal);
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    return path;
  }, [dataPoints, minMonth, maxMonth, chartW, minVal, maxVal]);

  // ─── Axis ticks ───────────────────────────────────────────────────────────

  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = maxMonth - minMonth > 120 ? 24 : maxMonth - minMonth > 48 ? 12 : 6;
    for (let m = minMonth; m <= maxMonth; m += step) ticks.push(m);
    return ticks;
  }, [minMonth, maxMonth]);

  const yTicks = useMemo(() => {
    const count = 5;
    const step = (maxVal - minVal) / count;
    return Array.from({ length: count + 1 }, (_, i) => minVal + i * step);
  }, [minVal, maxVal]);

  // ─── Touch tooltip ────────────────────────────────────────────────────────

  function handleTouch(locationX: number) {
    if (locationX < PAD_LEFT || locationX > PAD_LEFT + chartW) {
      setTooltipData(null);
      return;
    }
    const month = minMonth + ((locationX - PAD_LEFT) / chartW) * (maxMonth - minMonth);
    const clamped = Math.max(minMonth, Math.min(maxMonth, month));

    const nearest =
      dataPoints.length > 0
        ? dataPoints.reduce((a, b) =>
            Math.abs(a.month - clamped) < Math.abs(b.month - clamped) ? a : b
          )
        : null;

    const nearestMatch = nearest && Math.abs(nearest.month - clamped) <= 4 ? nearest : null;
    setTooltipData({
      svgX: locationX,
      month: clamped,
      p3:  interp(curve, clamped, (p) => p.p3),
      p50: interp(curve, clamped, (p) => p.p50),
      p97: interp(curve, clamped, (p) => p.p97),
      p15: interp(curve, clamped, (p) => p.p15),
      p85: interp(curve, clamped, (p) => p.p85),
      childValue: nearestMatch ? nearestMatch.value : null,
      childDate:  nearestMatch ? nearestMatch.date  : null,
      childPercentile: nearestMatch
        ? getValuePercentile(metric, sex, standard, nearestMatch.month, nearestMatch.value)
        : null,
    });
  }

  if (!curve.length) return null;

  const tooltipLeft =
    tooltipData && tooltipData.svgX > canvasW / 2
      ? tooltipData.svgX - 138
      : (tooltipData?.svgX ?? 0) + 10;

  return (
    <View style={{ marginBottom: 28 }}>
      <Text
        style={{ color: "#ecfdf5", fontSize: 14, fontWeight: "600", marginBottom: 6, marginLeft: PAD_LEFT }}
      >
        {label}
      </Text>

      {/* Canvas + touch overlay */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ position: "relative" }}>
          <Canvas style={{ width: canvasW, height: CHART_H }}>
            {/* Grid lines */}
            {yTicks.map((v, i) => {
              const y = toY(v, minVal, maxVal);
              return (
                <React.Fragment key={i}>
                  <Line
                    p1={vec(PAD_LEFT, y)}
                    p2={vec(canvasW - PAD_RIGHT, y)}
                    color={COLORS.axis}
                    strokeWidth={0.5}
                  />
                </React.Fragment>
              );
            })}

            {/* Percentile curves */}
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
            {pathP50 && (
              <Path path={pathP50} color={COLORS.p50} style="stroke" strokeWidth={1.5} />
            )}

            {/* Child line */}
            {childPath && (
              <Path path={childPath} color={COLORS.child} style="stroke" strokeWidth={2} />
            )}

            {/* Child dots */}
            {dataPoints.map((pt, i) => {
              const x = toX(pt.month, minMonth, maxMonth, chartW);
              const y = toY(pt.value, minVal, maxVal);
              return <Circle key={i} cx={x} cy={y} r={5} color={COLORS.dot} />;
            })}

            {/* Tooltip crosshair */}
            {tooltipData && (
              <Line
                p1={vec(tooltipData.svgX, PAD_TOP)}
                p2={vec(tooltipData.svgX, CHART_H - PAD_BOTTOM)}
                color="rgba(255,255,255,0.25)"
                strokeWidth={1}
              />
            )}
          </Canvas>

          {/* Touch capture layer */}
          <View
            style={{ position: "absolute", top: 0, left: 0, width: canvasW, height: CHART_H }}
            onTouchStart={(e) => handleTouch(e.nativeEvent.locationX)}
            onTouchMove={(e) => handleTouch(e.nativeEvent.locationX)}
            onTouchEnd={() => setTooltipData(null)}
          />

          {/* Tooltip box */}
          {tooltipData && (
            <View
              style={{
                position: "absolute",
                top: PAD_TOP + 8,
                left: tooltipLeft,
                backgroundColor: "#1c1d23",
                borderRadius: 8,
                padding: 10,
                borderWidth: 1,
                borderColor: "#2c2d36",
                minWidth: 155,
                zIndex: 10,
              }}
            >
              <Text style={{ color: "#72737f", fontSize: 10, marginBottom: 4 }}>
                {tooltipData.month.toFixed(0)} meses
              </Text>
              {tooltipData.childValue != null && (
                <>
                  <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "600" }}>
                    {tooltipData.childValue.toFixed(decimals)} {unit}
                    {tooltipData.childPercentile ? `  ${tooltipData.childPercentile}` : ""}
                  </Text>
                  {tooltipData.childDate ? (
                    <Text style={{ color: "#72737f", fontSize: 9, marginBottom: 4 }}>
                      {format(parseISO(tooltipData.childDate), "dd/MM/yyyy")}
                    </Text>
                  ) : <View style={{ marginBottom: 4 }} />}
                </>
              )}
              <Text style={{ color: COLORS.p50, fontSize: 11, marginBottom: 2 }}>
                P50: {tooltipData.p50?.toFixed(decimals) ?? "—"}
              </Text>
              {percentileMode === 5 && (
                <>
                  <Text style={{ color: COLORS.p15, fontSize: 11, marginBottom: 2 }}>
                    P15: {tooltipData.p15?.toFixed(decimals) ?? "—"}
                  </Text>
                  <Text style={{ color: COLORS.p85, fontSize: 11, marginBottom: 2 }}>
                    P85: {tooltipData.p85?.toFixed(decimals) ?? "—"}
                  </Text>
                </>
              )}
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: COLORS.p3, fontSize: 11 }}>
                  P3: {tooltipData.p3?.toFixed(decimals) ?? "—"}
                </Text>
                <Text style={{ color: COLORS.p97, fontSize: 11 }}>
                  P97: {tooltipData.p97?.toFixed(decimals) ?? "—"}
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* X axis labels */}
      <View style={{ height: 18, position: "relative", marginLeft: 0 }}>
        {xTicks.map((m) => {
          const x = PAD_LEFT + ((m - minMonth) / (maxMonth - minMonth)) * chartW;
          return (
            <Text
              key={m}
              style={{
                position: "absolute",
                left: x - 12,
                color: COLORS.label,
                fontSize: 9,
                width: 28,
                textAlign: "center",
              }}
            >
              {m}m
            </Text>
          );
        })}
      </View>

      {/* Y axis labels */}
      <View style={{ position: "absolute", top: TITLE_H, left: 0, height: CHART_H }}>
        {yTicks.map((v, i) => {
          const pct = (v - minVal) / (maxVal - minVal);
          const y = CHART_H - PAD_BOTTOM - pct * (CHART_H - PAD_TOP - PAD_BOTTOM) - 6;
          return (
            <Text
              key={i}
              style={{
                position: "absolute",
                top: y,
                right: 2,
                width: PAD_LEFT - 4,
                color: COLORS.label,
                fontSize: 9,
                textAlign: "right",
              }}
            >
              {v.toFixed(metric === "weight" ? 1 : 0)}
            </Text>
          );
        })}
      </View>

      {/* Legend */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4, marginLeft: PAD_LEFT }}>
        <LegendItem color={COLORS.p50} label="P50" dashed={false} />
        {percentileMode === 5 && <LegendItem color={COLORS.p15} label="P15/P85" dashed />}
        <LegendItem color={COLORS.p3} label="P3/P97" dashed />
        <LegendItem color={COLORS.child} label="Filho(a)" dashed={false} />
      </View>

      <Text style={{ color: "#72737f", fontSize: 10, marginTop: 2, marginLeft: PAD_LEFT }}>
        {unit} · {standard} {standard === "WHO" ? "(0–60m)" : "(2–20a)"}
      </Text>
    </View>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View
        style={{
          width: 16,
          height: 2,
          backgroundColor: color,
          opacity: dashed ? 0.7 : 1,
          borderStyle: dashed ? "dashed" : "solid",
        }}
      />
      <Text style={{ color: "#a0a1aa", fontSize: 10 }}>{label}</Text>
    </View>
  );
}

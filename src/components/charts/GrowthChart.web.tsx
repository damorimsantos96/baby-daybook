import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { ageInMonths, getPercentileCurve } from "@/utils/growthCurves";
import type {
  GrowthMetric,
  GrowthStandard,
  Measurement,
  PercentileMode,
  Sex,
} from "@/types";

const PAD_LEFT = 38;
const PAD_RIGHT = 16;
const PAD_TOP = 12;
const PAD_BOTTOM = 32;
const CHART_H = 220;
const MONTH_WIDTH = 5;

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

function buildD(
  curve: ReturnType<typeof getPercentileCurve>,
  getter: (p: { p3: number; p15: number; p50: number; p85: number; p97: number }) => number,
  minMonth: number,
  maxMonth: number,
  chartW: number,
  minVal: number,
  maxVal: number
): string {
  return curve
    .map((pt, i) => {
      const x = toX(pt.month, minMonth, maxMonth, chartW);
      const y = toY(getter(pt), minVal, maxVal);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
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
}: Props) {
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
      .sort((a, b) => a.month - b.month);
  }, [measurements, birthDate, metric]);

  const curve = useMemo(
    () => getPercentileCurve(metric, sex, standard, percentileMode),
    [metric, sex, standard, percentileMode]
  );

  const { minMonth, maxMonth, canvasW } = useMemo(() => {
    const allMonths = [
      ...curve.map((p) => p.month),
      ...dataPoints.map((d) => d.month),
    ];
    if (!allMonths.length) return { minMonth: 0, maxMonth: 60, canvasW: 60 * MONTH_WIDTH };
    const [lo, hi] = range(allMonths);
    const buffered = Math.max(hi + 6, lo + 12);
    const w = (buffered - lo) * MONTH_WIDTH;
    return { minMonth: lo, maxMonth: buffered, canvasW: Math.max(w, 300) };
  }, [curve, dataPoints]);

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

  const xTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = maxMonth - minMonth > 120 ? 24 : maxMonth - minMonth > 48 ? 12 : 6;
    for (let m = minMonth; m <= maxMonth; m += step) ticks.push(m);
    return ticks;
  }, [minMonth, maxMonth]);

  const yTicks = useMemo(() => {
    const count = 4;
    const step = (maxVal - minVal) / count;
    return Array.from({ length: count + 1 }, (_, i) => minVal + i * step);
  }, [minVal, maxVal]);

  if (!curve.length) return null;

  const dP50 = buildD(curve, (p) => p.p50, minMonth, maxMonth, chartW, minVal, maxVal);
  const dP15 = buildD(curve, (p) => p.p15, minMonth, maxMonth, chartW, minVal, maxVal);
  const dP85 = buildD(curve, (p) => p.p85, minMonth, maxMonth, chartW, minVal, maxVal);
  const dP3  = buildD(curve, (p) => p.p3,  minMonth, maxMonth, chartW, minVal, maxVal);
  const dP97 = buildD(curve, (p) => p.p97, minMonth, maxMonth, chartW, minVal, maxVal);

  const dChild =
    dataPoints.length >= 2
      ? dataPoints
          .map((pt, i) => {
            const x = toX(pt.month, minMonth, maxMonth, chartW);
            const y = toY(pt.value, minVal, maxVal);
            return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(" ")
      : null;

  return (
    <View style={{ marginBottom: 24 }}>
      <Text
        style={{ color: "#ecfdf5", fontSize: 14, fontWeight: "600", marginBottom: 6, marginLeft: PAD_LEFT }}
      >
        {label}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {/* @ts-ignore — SVG is valid DOM on web */}
        <svg width={canvasW} height={CHART_H} style={{ display: "block" }}>
          {/* Grid lines */}
          {yTicks.map((v, i) => {
            const y = toY(v, minVal, maxVal);
            return (
              // @ts-ignore
              <line
                key={i}
                x1={PAD_LEFT}
                y1={y}
                x2={canvasW - PAD_RIGHT}
                y2={y}
                stroke={COLORS.axis}
                strokeWidth={0.5}
              />
            );
          })}

          {/* P3 / P97 */}
          {/* @ts-ignore */}
          <path d={dP3}  fill="none" stroke={COLORS.p3}  strokeWidth={1} strokeDasharray="4 4" />
          {/* @ts-ignore */}
          <path d={dP97} fill="none" stroke={COLORS.p97} strokeWidth={1} strokeDasharray="4 4" />

          {/* P15 / P85 (5-line mode) */}
          {percentileMode === 5 && (
            <>
              {/* @ts-ignore */}
              <path d={dP15} fill="none" stroke={COLORS.p15} strokeWidth={1} strokeDasharray="6 3" />
              {/* @ts-ignore */}
              <path d={dP85} fill="none" stroke={COLORS.p85} strokeWidth={1} strokeDasharray="6 3" />
            </>
          )}

          {/* P50 */}
          {/* @ts-ignore */}
          <path d={dP50} fill="none" stroke={COLORS.p50} strokeWidth={1.5} />

          {/* Child line */}
          {dChild && (
            // @ts-ignore
            <path d={dChild} fill="none" stroke={COLORS.child} strokeWidth={2} />
          )}

          {/* Child dots */}
          {dataPoints.map((pt, i) => {
            const x = toX(pt.month, minMonth, maxMonth, chartW);
            const y = toY(pt.value, minVal, maxVal);
            // @ts-ignore
            return <circle key={i} cx={x} cy={y} r={4} fill={COLORS.dot} />;
          })}
        </svg>
      </ScrollView>

      {/* X axis labels */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={false}>
        <View style={{ width: canvasW, flexDirection: "row", paddingLeft: PAD_LEFT }}>
          {xTicks.map((m) => {
            const pct = (m - minMonth) / (maxMonth - minMonth);
            return (
              <Text
                key={m}
                style={{
                  position: "absolute",
                  left: pct * chartW - 12,
                  color: COLORS.label,
                  fontSize: 10,
                }}
              >
                {m}m
              </Text>
            );
          })}
        </View>
      </ScrollView>

      {/* Y axis labels */}
      <View style={{ position: "absolute", top: 24, left: 0, height: CHART_H }}>
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

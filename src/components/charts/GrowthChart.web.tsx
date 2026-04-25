import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
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

function buildD(
  curve: PercentilePoint[],
  getter: (p: PercentilePoint) => number,
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

interface HoverInfo {
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
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

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

  if (!curve.length) return null;

  const dP50 = buildD(clippedCurve, (p) => p.p50, minMonth, maxMonth, chartW, minVal, maxVal);
  const dP15 = buildD(clippedCurve, (p) => p.p15, minMonth, maxMonth, chartW, minVal, maxVal);
  const dP85 = buildD(clippedCurve, (p) => p.p85, minMonth, maxMonth, chartW, minVal, maxVal);
  const dP3  = buildD(clippedCurve, (p) => p.p3,  minMonth, maxMonth, chartW, minVal, maxVal);
  const dP97 = buildD(clippedCurve, (p) => p.p97, minMonth, maxMonth, chartW, minVal, maxVal);

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

  function handleMouseMove(e: any) {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    if (svgX < PAD_LEFT || svgX > PAD_LEFT + chartW) {
      setHoverInfo(null);
      return;
    }
    const month = minMonth + ((svgX - PAD_LEFT) / chartW) * (maxMonth - minMonth);
    const clamped = Math.max(minMonth, Math.min(maxMonth, month));

    const nearest =
      dataPoints.length > 0
        ? dataPoints.reduce((a, b) =>
            Math.abs(a.month - clamped) < Math.abs(b.month - clamped) ? a : b
          )
        : null;

    const nearestMatch = nearest && Math.abs(nearest.month - clamped) <= 4 ? nearest : null;
    setHoverInfo({
      svgX,
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

  const tooltipX = hoverInfo
    ? hoverInfo.svgX > canvasW / 2
      ? hoverInfo.svgX - 168
      : hoverInfo.svgX + 12
    : 0;

  return (
    <View style={{ marginBottom: 28 }}>
      <Text
        style={{ color: "#ecfdf5", fontSize: 14, fontWeight: "600", marginBottom: 6, marginLeft: PAD_LEFT }}
      >
        {label}
      </Text>

      {/* SVG chart */}
      {/* @ts-ignore */}
      <svg
        width={canvasW}
        height={CHART_H}
        style={{ display: "block", cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
      >
        {/* Grid lines */}
        {yTicks.map((v, i) => {
          const y = toY(v, minVal, maxVal);
          // @ts-ignore
          return <line key={i} x1={PAD_LEFT} y1={y} x2={canvasW - PAD_RIGHT} y2={y} stroke={COLORS.axis} strokeWidth={0.5} />;
        })}

        {/* X axis ticks & labels inside SVG */}
        {xTicks.map((m) => {
          const x = toX(m, minMonth, maxMonth, chartW);
          return (
            <React.Fragment key={m}>
              {/* @ts-ignore */}
              <line x1={x} y1={CHART_H - PAD_BOTTOM} x2={x} y2={CHART_H - PAD_BOTTOM + 4} stroke={COLORS.axis} strokeWidth={1} />
              {/* @ts-ignore */}
              <text x={x} y={CHART_H - PAD_BOTTOM + 14} textAnchor="middle" fill={COLORS.label} fontSize={9}>{m}m</text>
            </React.Fragment>
          );
        })}

        {/* Y axis labels inside SVG */}
        {yTicks.map((v, i) => {
          const y = toY(v, minVal, maxVal);
          // @ts-ignore
          return <text key={i} x={PAD_LEFT - 4} y={y + 3} textAnchor="end" fill={COLORS.label} fontSize={9}>{v.toFixed(metric === "weight" ? 1 : 0)}</text>;
        })}

        {/* P3 / P97 */}
        {/* @ts-ignore */}
        <path d={dP3}  fill="none" stroke={COLORS.p3}  strokeWidth={1} strokeDasharray="4 4" />
        {/* @ts-ignore */}
        <path d={dP97} fill="none" stroke={COLORS.p97} strokeWidth={1} strokeDasharray="4 4" />

        {/* P15 / P85 */}
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
          return <circle key={i} cx={x} cy={y} r={5} fill={COLORS.dot} />;
        })}

        {/* Hover crosshair */}
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

        {/* Hover tooltip (foreignObject) */}
        {hoverInfo && (() => {
          const tooltipH = 70
            + (hoverInfo.childValue != null ? 36 : 0)
            + (percentileMode === 5 ? 36 : 0);
          return (
          // @ts-ignore
          <foreignObject x={tooltipX} y={PAD_TOP + 4} width={160} height={tooltipH}>
            {/* @ts-ignore */}
            <div style={{
              background: "#1c1d23",
              border: "1px solid #2c2d36",
              borderRadius: 8,
              padding: "8px 10px",
              fontFamily: "system-ui, sans-serif",
              fontSize: 11,
              lineHeight: "1.6",
              color: "#a0a1aa",
              pointerEvents: "none",
            }}>
              <div style={{ color: "#72737f", fontSize: 10, marginBottom: 3 }}>
                {hoverInfo.month.toFixed(0)} meses
              </div>
              {hoverInfo.childValue != null && (
                <div style={{ marginBottom: 3 }}>
                  <span style={{ color: "#ffffff", fontWeight: 600 }}>
                    {hoverInfo.childValue.toFixed(decimals)} {unit}
                  </span>
                  {hoverInfo.childPercentile && (
                    <span style={{ color: "#10b981", marginLeft: 6 }}>{hoverInfo.childPercentile}</span>
                  )}
                  {hoverInfo.childDate && (
                    <div style={{ color: "#72737f", fontSize: 9 }}>
                      {format(parseISO(hoverInfo.childDate), "dd/MM/yy")}
                    </div>
                  )}
                </div>
              )}
              <div style={{ color: COLORS.p50 }}>P50: {hoverInfo.p50?.toFixed(decimals) ?? "—"}</div>
              {percentileMode === 5 && (
                <>
                  <div style={{ color: COLORS.p15 }}>P15: {hoverInfo.p15?.toFixed(decimals) ?? "—"}</div>
                  <div style={{ color: COLORS.p85 }}>P85: {hoverInfo.p85?.toFixed(decimals) ?? "—"}</div>
                </>
              )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: COLORS.p3 }}>P3: {hoverInfo.p3?.toFixed(decimals) ?? "—"}</span>
                <span style={{ color: COLORS.p97 }}>P97: {hoverInfo.p97?.toFixed(decimals) ?? "—"}</span>
              </div>
            </div>
          </foreignObject>
          );
        })()}
      </svg>

      {/* Y axis labels */}
      <View style={{ position: "absolute", top: TITLE_H, left: 0, height: CHART_H }}>
        {/* rendered inside SVG now — this View intentionally empty */}
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

import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { format, parseISO } from "date-fns";
import {
  ageInMonthsPrecise,
  getP50EquivalentInfo,
  getPercentileCurve,
  getReferenceCaption,
  getReferenceRange,
} from "@/utils/growthCurves";
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
  if (maxMonth === minMonth) return PAD_LEFT + width / 2;
  return PAD_LEFT + ((month - minMonth) / (maxMonth - minMonth)) * width;
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

function buildPath(
  curve: PercentilePoint[],
  getter: (point: PercentilePoint) => number,
  minMonth: number,
  maxMonth: number,
  chartWidth: number,
  minValue: number,
  maxValue: number
): string {
  return curve
    .map((point, index) => {
      const x = toX(point.month, minMonth, maxMonth, chartWidth);
      const y = toY(getter(point), minValue, maxValue);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

interface HoverInfo {
  childDate: string | null;
  childP50Age: string | null;
  childP50Delta: string | null;
  childValue: number | null;
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
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

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

  const chartWidth = canvasWidth - PAD_LEFT - PAD_RIGHT;

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

  if (!curve.length || !referenceRange) return null;

  const dP3 = buildPath(clippedCurve, (point) => point.p3, minMonth, maxMonth, chartWidth, minValue, maxValue);
  const dP15 = buildPath(clippedCurve, (point) => point.p15, minMonth, maxMonth, chartWidth, minValue, maxValue);
  const dP50 = buildPath(clippedCurve, (point) => point.p50, minMonth, maxMonth, chartWidth, minValue, maxValue);
  const dP85 = buildPath(clippedCurve, (point) => point.p85, minMonth, maxMonth, chartWidth, minValue, maxValue);
  const dP97 = buildPath(clippedCurve, (point) => point.p97, minMonth, maxMonth, chartWidth, minValue, maxValue);

  const dChild =
    dataPoints.length >= 2
      ? dataPoints
          .map((point, index) => {
            const x = toX(point.month, minMonth, maxMonth, chartWidth);
            const y = toY(point.value, minValue, maxValue);
            return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
          })
          .join(" ")
      : null;

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = event.clientX - rect.left;
    if (svgX < PAD_LEFT || svgX > PAD_LEFT + chartWidth) {
      setHoverInfo(null);
      return;
    }

    const month = minMonth + ((svgX - PAD_LEFT) / chartWidth) * (maxMonth - minMonth);
    const clampedMonth = Math.max(minMonth, Math.min(maxMonth, month));
    const nearestPoint =
      dataPoints.length > 0
        ? dataPoints.reduce((left, right) =>
            Math.abs(left.month - clampedMonth) < Math.abs(right.month - clampedMonth)
              ? left
              : right
          )
        : null;
    const matchedPoint =
      nearestPoint && Math.abs(nearestPoint.month - clampedMonth) <= 4 ? nearestPoint : null;
    const childP50Info =
      matchedPoint ? getP50EquivalentInfo(metric, sex, matchedPoint.month, matchedPoint.value) : null;

    setHoverInfo({
      childDate: matchedPoint ? matchedPoint.date : null,
      childP50Age: childP50Info?.ageLabel ?? null,
      childP50Delta: childP50Info?.deltaLabel ?? null,
      childValue: matchedPoint ? matchedPoint.value : null,
      month: clampedMonth,
      p15: interpolate(clippedCurve, clampedMonth, (point) => point.p15),
      p3: interpolate(clippedCurve, clampedMonth, (point) => point.p3),
      p50: interpolate(clippedCurve, clampedMonth, (point) => point.p50),
      p85: interpolate(clippedCurve, clampedMonth, (point) => point.p85),
      p97: interpolate(clippedCurve, clampedMonth, (point) => point.p97),
      svgX,
    });
  }

  const tooltipX = hoverInfo
    ? hoverInfo.svgX > canvasWidth / 2
      ? hoverInfo.svgX - 176
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
        {yTicks.map((value, index) => {
          const y = toY(value, minValue, maxValue);
          // @ts-ignore
          return <line key={index} x1={PAD_LEFT} y1={y} x2={canvasWidth - PAD_RIGHT} y2={y} stroke={COLORS.axis} strokeWidth={0.5} />;
        })}

        {xTicks.map((month) => {
          const x = toX(month, minMonth, maxMonth, chartWidth);
          return (
            <React.Fragment key={month}>
              {/* @ts-ignore */}
              <line x1={x} y1={CHART_H - PAD_BOTTOM} x2={x} y2={CHART_H - PAD_BOTTOM + 4} stroke={COLORS.axis} strokeWidth={1} />
              {/* @ts-ignore */}
              <text x={x} y={CHART_H - PAD_BOTTOM + 14} textAnchor="middle" fill={COLORS.label} fontSize={9}>{month}m</text>
            </React.Fragment>
          );
        })}

        {yTicks.map((value, index) => {
          const y = toY(value, minValue, maxValue);
          // @ts-ignore
          return <text key={index} x={PAD_LEFT - 4} y={y + 3} textAnchor="end" fill={COLORS.label} fontSize={9}>{value.toFixed(metric === "weight" ? 1 : 0)}</text>;
        })}

        {/* @ts-ignore */}
        <path d={dP3} fill="none" stroke={COLORS.p3} strokeWidth={1} strokeDasharray="4 4" />
        {/* @ts-ignore */}
        <path d={dP97} fill="none" stroke={COLORS.p97} strokeWidth={1} strokeDasharray="4 4" />

        {percentileMode === 5 && (
          <>
            {/* @ts-ignore */}
            <path d={dP15} fill="none" stroke={COLORS.p15} strokeWidth={1} strokeDasharray="6 3" />
            {/* @ts-ignore */}
            <path d={dP85} fill="none" stroke={COLORS.p85} strokeWidth={1} strokeDasharray="6 3" />
          </>
        )}

        {/* @ts-ignore */}
        <path d={dP50} fill="none" stroke={COLORS.p50} strokeWidth={1.5} />

        {dChild && (
          // @ts-ignore
          <path d={dChild} fill="none" stroke={COLORS.child} strokeWidth={2} />
        )}

        {dataPoints
          .filter((point) => !point.ghost)
          .map((point, index) => {
            const x = toX(point.month, minMonth, maxMonth, chartWidth);
            const y = toY(point.value, minValue, maxValue);
            // @ts-ignore
            return <circle key={index} cx={x} cy={y} r={5} fill={COLORS.dot} />;
          })}

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

        {hoverInfo && (() => {
          const tooltipHeight =
            70 +
            (hoverInfo.childValue != null ? 24 : 0) +
            (hoverInfo.childP50Age != null ? 14 : 0) +
            (hoverInfo.childP50Delta != null ? 14 : 0) +
            (hoverInfo.childDate ? 14 : 0) +
            (percentileMode === 5 ? 36 : 0);
          return (
            // @ts-ignore
            <foreignObject x={tooltipX} y={PAD_TOP + 4} width={168} height={tooltipHeight}>
              {/* @ts-ignore */}
              <div
                style={{
                  background: "#1c1d23",
                  border: "1px solid #2c2d36",
                  borderRadius: 8,
                  color: "#a0a1aa",
                  fontFamily: "system-ui, sans-serif",
                  fontSize: 11,
                  lineHeight: "1.6",
                  padding: "8px 10px",
                  pointerEvents: "none",
                }}
              >
                <div style={{ color: "#72737f", fontSize: 10, marginBottom: 3 }}>
                  {hoverInfo.month.toFixed(0)} meses
                </div>
                {hoverInfo.childValue != null && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: "#ffffff", fontWeight: 600 }}>
                      {hoverInfo.childValue.toFixed(decimals)} {unit}
                    </span>
                    {hoverInfo.childP50Age && (
                      <div style={{ color: "#72737f", fontSize: 9, marginTop: 1 }}>
                        P50 aos {hoverInfo.childP50Age}
                      </div>
                    )}
                    {hoverInfo.childP50Delta && (
                      <div style={{ color: "#72737f", fontSize: 9, marginTop: 1 }}>
                        P50 em {hoverInfo.childP50Delta}
                      </div>
                    )}
                    {hoverInfo.childDate && (
                      <div style={{ color: "#72737f", fontSize: 9, marginTop: 1 }}>
                        {format(parseISO(hoverInfo.childDate), "dd/MM/yy")}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ color: COLORS.p50 }}>P50: {hoverInfo.p50?.toFixed(decimals) ?? "--"}</div>
                {percentileMode === 5 && (
                  <>
                    <div style={{ color: COLORS.p15 }}>P15: {hoverInfo.p15?.toFixed(decimals) ?? "--"}</div>
                    <div style={{ color: COLORS.p85 }}>P85: {hoverInfo.p85?.toFixed(decimals) ?? "--"}</div>
                  </>
                )}
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: COLORS.p3 }}>P3: {hoverInfo.p3?.toFixed(decimals) ?? "--"}</span>
                  <span style={{ color: COLORS.p97 }}>P97: {hoverInfo.p97?.toFixed(decimals) ?? "--"}</span>
                </div>
              </div>
            </foreignObject>
          );
        })()}
      </svg>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginLeft: PAD_LEFT, marginTop: 4 }}>
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

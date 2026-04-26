import { format } from "date-fns";
import {
  ageInMonthsPrecise,
  getP50EquivalentInfo,
  getReferenceRange,
  getValuePercentileNumber,
} from "@/utils/growthCurves";
import type { Child, GrowthMetric, GrowthStandard, Measurement, PercentileMode } from "@/types";

export interface ComparisonChartChildInput {
  child: Child;
  measurements: Measurement[];
}

export interface ComparisonChartPoint {
  date: string;
  month: number;
  p50Age: string | null;
  p50Delta: string | null;
  percentile: number;
  value: number;
}

export interface ComparisonChartSeries {
  childId: string;
  color: string;
  current: boolean;
  linePoints: ComparisonChartPoint[];
  name: string;
  points: ComparisonChartPoint[];
}

export interface PreparedComparisonChart {
  excludedChildren: string[];
  maxMonth: number;
  minMonth: number;
  overlapEndMonth: number;
  referenceLabel: string;
  series: ComparisonChartSeries[];
}

const SERIES_COLORS = [
  "#ffffff",
  "#60a5fa",
  "#f472b6",
  "#22d3ee",
  "#a78bfa",
  "#facc15",
  "#fb7185",
  "#38bdf8",
] as const;

function getMeasurementValue(metric: GrowthMetric, measurement: Measurement): number | null {
  if (metric === "weight") return measurement.weight_kg;
  if (metric === "height") return measurement.height_cm;
  return measurement.head_circumference_cm;
}

export function buildComparisonChartData({
  children,
  currentChildId,
  metric,
  percentileMode,
  standard,
}: {
  children: ComparisonChartChildInput[];
  currentChildId: string;
  metric: GrowthMetric;
  percentileMode: PercentileMode;
  standard: GrowthStandard;
}): PreparedComparisonChart | null {
  const referenceRange = getReferenceRange(metric, standard);
  if (!referenceRange) return null;

  const todayIso = format(new Date(), "yyyy-MM-dd");
  const seriesByChild = children.map(({ child, measurements }) => {
    const ageMonths = Math.min(
      ageInMonthsPrecise(child.birth_date, todayIso),
      referenceRange.endMonth
    );

    const points = measurements
      .map((measurement) => {
        const value = getMeasurementValue(metric, measurement);
        if (value == null) return null;

        const month = ageInMonthsPrecise(child.birth_date, measurement.date);
        if (month < referenceRange.startMonth || month > referenceRange.endMonth) return null;

        const percentile = getValuePercentileNumber(
          metric,
          child.sex,
          standard,
          month,
          value
        );
        if (percentile == null) return null;
        const p50Info = getP50EquivalentInfo(metric, child.sex, month, value);

        return {
          date: measurement.date,
          month,
          p50Age: p50Info?.ageLabel ?? null,
          p50Delta: p50Info?.deltaLabel ?? null,
          percentile,
          value,
        };
      })
      .filter((point): point is ComparisonChartPoint => point != null)
      .sort((left, right) => left.month - right.month);

    return {
      ageMonths,
      childId: child.id,
      name: child.first_name,
      points,
    };
  });

  const comparableChildren = seriesByChild.filter(
    (series) => series.points.length > 0 && series.ageMonths >= referenceRange.startMonth
  );

  if (comparableChildren.length === 0) return null;

  const overlapEndMonth = Math.min(...comparableChildren.map((series) => series.ageMonths));
  if (overlapEndMonth < referenceRange.startMonth) return null;

  const series = comparableChildren
    .map((series, index) => {
      const visiblePoints = series.points.filter(
        (point) => point.month >= referenceRange.startMonth && point.month <= overlapEndMonth
      );
      const trailingPoint = series.points.find((point) => point.month > overlapEndMonth) ?? null;
      const lastVisiblePoint = visiblePoints[visiblePoints.length - 1] ?? null;
      const linePoints =
        trailingPoint &&
        lastVisiblePoint &&
        lastVisiblePoint.month < overlapEndMonth &&
        trailingPoint.month > lastVisiblePoint.month
          ? [
              ...visiblePoints,
              {
                date: lastVisiblePoint.date,
                month: overlapEndMonth,
                p50Age: lastVisiblePoint.p50Age,
                p50Delta: lastVisiblePoint.p50Delta,
                percentile:
                  lastVisiblePoint.percentile +
                  ((trailingPoint.percentile - lastVisiblePoint.percentile) *
                    (overlapEndMonth - lastVisiblePoint.month)) /
                    (trailingPoint.month - lastVisiblePoint.month),
                value: lastVisiblePoint.value,
              },
            ]
          : visiblePoints;

      return {
        childId: series.childId,
        color:
          series.childId === currentChildId
            ? SERIES_COLORS[0]
            : SERIES_COLORS[(index % (SERIES_COLORS.length - 1)) + 1],
        current: series.childId === currentChildId,
        linePoints,
        name: series.name,
        points: visiblePoints,
      };
    })
    .filter((series) => series.points.length > 0)
    .sort((left, right) => {
      if (left.current && !right.current) return -1;
      if (!left.current && right.current) return 1;
      return left.name.localeCompare(right.name, "pt-BR");
    });

  if (series.length === 0) return null;

  return {
    excludedChildren: seriesByChild
      .filter((entry) => !series.some((seriesItem) => seriesItem.childId === entry.childId))
      .map((entry) => entry.name),
    maxMonth: overlapEndMonth,
    minMonth: referenceRange.startMonth,
    overlapEndMonth,
    referenceLabel:
      percentileMode === 5
        ? "Percentil por idade/sexo · guias P3 P15 P50 P85 P97"
        : "Percentil por idade/sexo · guias P3 P50 P97",
    series,
  };
}

export function getComparisonGuideValues(percentileMode: PercentileMode): number[] {
  return percentileMode === 5 ? [3, 15, 50, 85, 97] : [3, 50, 97];
}

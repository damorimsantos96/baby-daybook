import { addMonths, differenceInCalendarMonths, differenceInDays, parseISO } from "date-fns";
import type { GrowthMetric, GrowthStandard, PercentileMode, PercentilePoint, Sex } from "@/types";
import {
  WHO2007_HEIGHT_F,
  WHO2007_HEIGHT_M,
  WHO2007_WEIGHT_F,
  WHO2007_WEIGHT_M,
  WHO_HEAD_F,
  WHO_HEAD_M,
  WHO_HEIGHT_F,
  WHO_HEIGHT_M,
  WHO_WEIGHT_F,
  WHO_WEIGHT_M,
  type LmsRow,
} from "@/utils/growthReferences";

interface ReferenceRange {
  endMonth: number;
  label: string;
  startMonth: number;
}

const Z_SCORES = {
  p3: -1.8807936081512509,
  p15: -1.0364333894937898,
  p50: 0,
  p85: 1.0364333894937898,
  p97: 1.8807936081512509,
} as const;

const METRIC_LABELS: Record<GrowthMetric, string> = {
  head: "head circumference-for-age",
  height: "height-for-age",
  weight: "weight-for-age",
};

export function ageInMonths(birthDate: string, atDate: string): number {
  return differenceInCalendarMonths(parseISO(atDate), parseISO(birthDate));
}

export function ageInMonthsPrecise(birthDate: string, atDate: string): number {
  const birth = parseISO(birthDate);
  const target = parseISO(atDate);
  const wholeMonths = differenceInCalendarMonths(target, birth);
  const monthStart = addMonths(birth, wholeMonths);
  const nextMonthStart = addMonths(monthStart, 1);
  const daysIntoMonth = differenceInDays(target, monthStart);
  const daysInMonth = differenceInDays(nextMonthStart, monthStart);

  if (daysInMonth <= 0) return wholeMonths;

  return wholeMonths + daysIntoMonth / daysInMonth;
}

function getTable(metric: GrowthMetric, sex: Sex, standard: GrowthStandard): readonly LmsRow[] {
  if (standard === "WHO") {
    if (metric === "weight") return sex === "M" ? WHO_WEIGHT_M : WHO_WEIGHT_F;
    if (metric === "height") return sex === "M" ? WHO_HEIGHT_M : WHO_HEIGHT_F;
    if (metric === "head") return sex === "M" ? WHO_HEAD_M : WHO_HEAD_F;
    return [];
  }

  if (metric === "weight") return sex === "M" ? WHO2007_WEIGHT_M : WHO2007_WEIGHT_F;
  if (metric === "height") return sex === "M" ? WHO2007_HEIGHT_M : WHO2007_HEIGHT_F;
  return [];
}

function getMeta(metric: GrowthMetric, standard: GrowthStandard): ReferenceRange | null {
  if (standard === "WHO") {
    return { startMonth: 0, endMonth: 60, label: "0-5y" };
  }

  if (metric === "height") {
    return { startMonth: 61, endMonth: 228, label: "5-19y" };
  }

  if (metric === "weight") {
    return { startMonth: 61, endMonth: 120, label: "5-10y" };
  }

  return null;
}

function lmsValue(row: LmsRow, z: number): number {
  const [, l, m, s] = row;
  if (l === 0) return m * Math.exp(s * z);
  return m * (1 + l * s * z) ** (1 / l);
}

function lmsZ(row: LmsRow, value: number): number {
  const [, l, m, s] = row;
  if (value <= 0 || m <= 0 || s <= 0) return Number.NaN;
  if (l === 0) return Math.log(value / m) / s;
  return ((value / m) ** l - 1) / (l * s);
}

function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const absZ = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * absZ);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const erf =
    sign *
    (1 -
      (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-(absZ * absZ))));

  return 0.5 * (1 + erf);
}

function interpolateRow(table: readonly LmsRow[], month: number): LmsRow | null {
  if (!table.length) return null;

  const first = table[0];
  const last = table[table.length - 1];
  if (month < first[0] || month > last[0]) return null;

  for (const row of table) {
    if (row[0] === month) return row;
  }

  for (let index = 0; index < table.length - 1; index += 1) {
    const left = table[index];
    const right = table[index + 1];
    if (left[0] < month && month < right[0]) {
      const t = (month - left[0]) / (right[0] - left[0]);
      return [
        month,
        left[1] + (right[1] - left[1]) * t,
        left[2] + (right[2] - left[2]) * t,
        left[3] + (right[3] - left[3]) * t,
      ];
    }
  }

  return null;
}

export function supportsMetric(metric: GrowthMetric, standard: GrowthStandard): boolean {
  return getMeta(metric, standard) != null;
}

export function getReferenceRange(metric: GrowthMetric, standard: GrowthStandard): ReferenceRange | null {
  return getMeta(metric, standard);
}

export function getStandardLabel(standard: GrowthStandard): string {
  return standard === "WHO" ? "WHO 0-5y" : "WHO 5-19y";
}

export function getReferenceCaption(metric: GrowthMetric, standard: GrowthStandard): string {
  const meta = getMeta(metric, standard);
  if (!meta) return "";
  return `${METRIC_LABELS[metric]} (${meta.label})`;
}

export function getPercentileCurve(
  metric: GrowthMetric,
  sex: Sex,
  standard: GrowthStandard,
  mode: PercentileMode
): PercentilePoint[] {
  const table = getTable(metric, sex, standard);

  return table.map((row) => ({
    month: row[0],
    p3: lmsValue(row, Z_SCORES.p3),
    p15: mode === 5 ? lmsValue(row, Z_SCORES.p15) : lmsValue(row, Z_SCORES.p50),
    p50: lmsValue(row, Z_SCORES.p50),
    p85: mode === 5 ? lmsValue(row, Z_SCORES.p85) : lmsValue(row, Z_SCORES.p50),
    p97: lmsValue(row, Z_SCORES.p97),
  }));
}

export function getValuePercentile(
  metric: GrowthMetric,
  sex: Sex,
  standard: GrowthStandard,
  month: number,
  value: number
): string {
  const row = interpolateRow(getTable(metric, sex, standard), month);
  if (!row) return "";

  const percentile = normalCdf(lmsZ(row, value)) * 100;
  if (!Number.isFinite(percentile)) return "";
  if (percentile <= 3) return "<= P3";
  if (percentile >= 99.5) return "P99+";
  return `P${Math.round(percentile)}`;
}

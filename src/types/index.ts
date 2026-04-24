export type Sex = "M" | "F";

export interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Child {
  id: string;
  user_id: string;
  first_name: string;
  birth_date: string; // ISO date string "YYYY-MM-DD"
  sex: Sex;
  photo_url: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Measurement {
  id: string;
  child_id: string;
  user_id: string;
  date: string; // ISO date string "YYYY-MM-DD"
  weight_kg: number | null;
  height_cm: number | null;
  head_circumference_cm: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppVersionConfig {
  id: string;
  min_runtime_version: string;
  apk_download_url: string;
  updated_at: string;
}

export type GrowthStandard = "WHO" | "CDC";
export type GrowthMetric = "weight" | "height" | "head";
export type PercentileMode = 3 | 5; // 3 lines (P3/P50/P97) or 5 lines (P3/P15/P50/P85/P97)

export interface PercentilePoint {
  month: number;
  p3: number;
  p15: number;
  p50: number;
  p85: number;
  p97: number;
}

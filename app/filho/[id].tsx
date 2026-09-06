import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { addMonths, differenceInMonths, differenceInYears, format, parseISO } from "date-fns";
import {
  ageInMonths,
  ageInMonthsPrecise,
  formatAgeMonths,
  formatPercentileLabel,
  getObservedPercentileNumber,
  getP50EquivalentInfo,
  getProjectedValueAtPercentile,
  getProjectionRange,
} from "@/utils/growthCurves";
import { Ionicons } from "@expo/vector-icons";
import { useChild, useChildPhotoUrl, useChildren } from "@/hooks/useChildren";
import {
  useMeasurements,
  useMeasurementsForChildren,
  useUpsertMeasurement,
  useDeleteMeasurement,
} from "@/hooks/useMeasurements";
import { BottomSheetModal } from "@/components/ui/BottomSheetModal";
import { GrowthChart } from "@/components/charts/GrowthChart";
import { ComparisonGrowthChart } from "@/components/charts/ComparisonGrowthChart";
import type { GrowthMetric, GrowthStandard, Measurement, PercentileMode, Sex } from "@/types";

type DetailTab = "tabela" | "graficos" | "projecao";
type ProjectionMetric = "weight" | "height";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageLabel(birthDate: string): string {
  const birth = parseISO(birthDate);
  const now = new Date();
  const years = differenceInYears(now, birth);
  const months = differenceInMonths(now, birth) % 12;
  if (years === 0) return `${differenceInMonths(now, birth)} meses`;
  return months > 0 ? `${years} anos e ${months} meses` : `${years} anos`;
}

function fmt(val: number | null, decimals = 2): string {
  if (val == null) return "—";
  return val.toFixed(decimals);
}

// Compact age for the table: "6m" when under a year, otherwise "1a4m" / "2a".
function ageShort(birthDate: string, atDate: string): string {
  const total = Math.max(0, ageInMonths(birthDate, atDate));
  const years = Math.floor(total / 12);
  const months = total % 12;
  if (years === 0) return `${months}m`;
  return months > 0 ? `${years}a${months}m` : `${years}a`;
}

// ─── Table search ───────────────────────────────────────────────────────────────

type SearchField = "weight" | "height" | "date";

function parseSearchDate(input: string): number | null {
  const t = input.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    let year = m[3] ? Number(m[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    return new Date(year, Number(m[2]) - 1, Number(m[1])).getTime();
  }
  return null;
}

function measurementSearchValue(field: SearchField, m: Measurement): number | null {
  if (field === "weight") return m.weight_kg;
  if (field === "height") return m.height_cm;
  return parseISO(m.date).getTime();
}

// Returns the entries immediately above/below the searched value (and the exact
// match when present). Result ordered larger→smaller to match the date-desc table.
function findNeighborMeasurements(
  field: SearchField,
  search: number,
  measurements: Measurement[]
): Measurement[] {
  const withValue = measurements
    .map((m) => ({ m, v: measurementSearchValue(field, m) }))
    .filter((x): x is { m: Measurement; v: number } => x.v != null)
    .sort((a, b) => a.v - b.v);
  if (withValue.length === 0) return [];

  let below: Measurement | null = null;
  let above: Measurement | null = null;
  for (const { m, v } of withValue) {
    if (v <= search) below = m;
    if (v >= search && above == null) above = m;
  }

  const out: Measurement[] = [];
  if (above) out.push(above);
  if (below && below !== above) out.push(below);
  return out;
}

// ─── Measurement form ─────────────────────────────────────────────────────────

interface MeasForm {
  id?: string;
  date: string;
  weight: string;
  height: string;
  head: string;
  notes: string;
}

function emptyForm(date?: string): MeasForm {
  return {
    date: date ?? format(new Date(), "yyyy-MM-dd"),
    weight: "",
    height: "",
    head: "",
    notes: "",
  };
}

function fromMeasurement(m: Measurement): MeasForm {
  return {
    id: m.id,
    date: m.date,
    weight: m.weight_kg != null ? String(m.weight_kg) : "",
    height: m.height_cm != null ? String(m.height_cm) : "",
    head: m.head_circumference_cm != null ? String(m.head_circumference_cm) : "",
    notes: m.notes ?? "",
  };
}

// ─── Measurement summary card ─────────────────────────────────────────────────

interface SummaryItem {
  label: string;
  m: Measurement | null;
  value: number | null;
  metric: GrowthMetric;
  unit: string;
  decimals: number;
}

function MeasurementSummary({
  measurements,
  birthDate,
  sex,
}: {
  measurements: Measurement[];
  birthDate: string;
  sex: Sex;
}) {
  const items: SummaryItem[] = useMemo(() => {
    const sorted = [...measurements].sort((a, b) => b.date.localeCompare(a.date));
    const lw = sorted.find((m) => m.weight_kg != null) ?? null;
    const lh = sorted.find((m) => m.height_cm != null) ?? null;
    const lc = sorted.find((m) => m.head_circumference_cm != null) ?? null;
    return [
      { label: "Peso", m: lw, value: lw?.weight_kg ?? null, metric: "weight", unit: "kg", decimals: 2 },
      { label: "Altura", m: lh, value: lh?.height_cm ?? null, metric: "height", unit: "cm", decimals: 1 },
      { label: "Cabeça", m: lc, value: lc?.head_circumference_cm ?? null, metric: "head", unit: "cm", decimals: 1 },
    ];
  }, [measurements]);

  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 8 }}>
      {items.map(({ label, m, value, metric, unit, decimals }) => {
        const month = m ? ageInMonthsPrecise(birthDate, m.date) : null;
        const percentileNumber =
          month != null && value != null
            ? getObservedPercentileNumber(metric, sex, month, value)
            : null;
        const percentile =
          percentileNumber != null ? formatPercentileLabel(percentileNumber) : null;
        const p50Info =
          month != null && value != null ? getP50EquivalentInfo(metric, sex, month, value) : null;
        return (
          <View
            key={label}
            style={{ flex: 1, backgroundColor: "#1c1d23", borderRadius: 10, padding: 10 }}
          >
            <Text style={{ color: "#72737f", fontSize: 10, marginBottom: 4 }}>{label}</Text>
            {value != null ? (
              <>
                <Text style={{ color: "#ecfdf5", fontSize: 13, fontWeight: "700" }}>
                  {value.toFixed(decimals)} {unit}
                </Text>
                {percentile ? (
                  <Text style={{ color: "#10b981", fontSize: 11, marginTop: 1 }}>
                    {percentile}
                  </Text>
                ) : null}
                {p50Info ? (
                  <Text style={{ color: "#72737f", fontSize: 9, marginTop: 1 }}>
                    P50 aos {p50Info.ageLabel} ({p50Info.deltaLabel})
                  </Text>
                ) : null}
                {m ? (
                  <Text style={{ color: "#4a4b58", fontSize: 9, marginTop: 2 }}>
                    {format(parseISO(m.date), "dd/MM/yy")}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={{ color: "#4a4b58", fontSize: 14 }}>—</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Tab toggle ───────────────────────────────────────────────────────────────

interface ProjectionRow {
  dateLabel: string;
  month: number;
  value: number;
}

interface ProjectionSectionData {
  decimals: number;
  label: string;
  lastDate: string;
  lastMonth: number;
  lastPercentile: number | null;
  lastValue: number;
  rangeEndMonth: number;
  rows: ProjectionRow[];
  unit: string;
}

function getMetricValue(metric: ProjectionMetric, measurement: Measurement): number | null {
  return metric === "weight" ? measurement.weight_kg : measurement.height_cm;
}

function buildProjectionSectionData(
  metric: ProjectionMetric,
  birthDate: string,
  sex: Sex,
  measurements: Measurement[]
): ProjectionSectionData | null {
  const range = getProjectionRange(metric);
  if (!range) return null;

  const latest = [...measurements]
    .sort((left, right) => right.date.localeCompare(left.date))
    .find((measurement) => getMetricValue(metric, measurement) != null);

  if (!latest) return null;

  const lastValue = getMetricValue(metric, latest);
  if (lastValue == null) return null;

  const lastMonth = Math.max(0, Math.round(ageInMonthsPrecise(birthDate, latest.date)));
  const lastPercentile = getObservedPercentileNumber(metric, sex, lastMonth, lastValue);
  const firstProjectionMonth = Math.floor(lastMonth / 6) * 6 + 6;
  const rows: ProjectionRow[] = [];

  if (lastPercentile != null) {
    for (let month = firstProjectionMonth; month <= range.endMonth; month += 6) {
      const value = getProjectedValueAtPercentile(metric, sex, month, lastPercentile);
      if (value == null) continue;

      rows.push({
        dateLabel: format(addMonths(parseISO(birthDate), month), "MM/yyyy"),
        month,
        value,
      });
    }
  }

  return {
    decimals: metric === "weight" ? 2 : 1,
    label: metric === "weight" ? "Peso" : "Altura",
    lastDate: latest.date,
    lastMonth,
    lastPercentile,
    lastValue,
    rangeEndMonth: range.endMonth,
    rows,
    unit: metric === "weight" ? "kg" : "cm",
  };
}

function ProjectionSection({ section }: { section: ProjectionSectionData }) {
  return (
    <View style={{ backgroundColor: "#1c1d23", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
      <View style={{ padding: 14, paddingBottom: 10 }}>
        <Text style={{ color: "#ecfdf5", fontSize: 15, fontWeight: "700" }}>{section.label}</Text>
        <Text style={{ color: "#a0a1aa", fontSize: 12, marginTop: 6 }}>
          {section.lastValue.toFixed(section.decimals)} {section.unit} ·{" "}
          {section.lastPercentile != null ? formatPercentileLabel(section.lastPercentile) : "sem percentil"} ·{" "}
          {formatAgeMonths(section.lastMonth)}
        </Text>
        <Text style={{ color: "#72737f", fontSize: 11, marginTop: 3 }}>
          Ultima medicao em {format(parseISO(section.lastDate), "dd/MM/yyyy")} · projecao semestral ate{" "}
          {formatAgeMonths(section.rangeEndMonth)}
        </Text>
      </View>

      {section.lastPercentile == null ? (
        <Text style={{ color: "#72737f", fontSize: 12, paddingHorizontal: 14, paddingBottom: 14 }}>
          Ultima medicao fora da faixa de referencia disponivel para projecao.
        </Text>
      ) : section.rows.length === 0 ? (
        <Text style={{ color: "#72737f", fontSize: 12, paddingHorizontal: 14, paddingBottom: 14 }}>
          Ultima medicao ja esta no limite da referencia.
        </Text>
      ) : (
        <>
          <View style={{ borderTopColor: "#2c2d36", borderTopWidth: 1, flexDirection: "row", paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={[colHeader, { flex: 1.2 }]}>IDADE</Text>
            <Text style={[colHeader, { flex: 1 }]}>DATA</Text>
            <Text style={[colHeader, { flex: 1 }]}>PERCENTIL</Text>
            <Text style={[colHeader, { flex: 1, textAlign: "right" }]}>VALOR</Text>
          </View>
          {section.rows.map((row) => (
            <View
              key={row.month}
              style={{
                borderTopColor: "#2c2d36",
                borderTopWidth: 1,
                flexDirection: "row",
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Text style={[cell, { flex: 1.2, color: row.month === 120 ? "#ecfdf5" : "#a0a1aa" }]}>
                {formatAgeMonths(row.month)}
              </Text>
              <Text style={[cell, { flex: 1 }]}>{row.dateLabel}</Text>
              <Text style={[cell, { flex: 1 }]}>
                {section.lastPercentile != null ? formatPercentileLabel(section.lastPercentile) : "--"}
              </Text>
              <Text style={[cell, { flex: 1, textAlign: "right", color: row.month === 120 ? "#ecfdf5" : "#a0a1aa" }]}>
                {row.value.toFixed(section.decimals)} {section.unit}
              </Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function ProjectionTab({
  birthDate,
  measurements,
  sex,
}: {
  birthDate: string;
  measurements: Measurement[];
  sex: Sex;
}) {
  const sections = useMemo(
    () =>
      (["weight", "height"] as const)
        .map((metric) => buildProjectionSectionData(metric, birthDate, sex, measurements))
        .filter((section): section is ProjectionSectionData => section != null),
    [birthDate, measurements, sex]
  );

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}>
      <View
        style={{
          backgroundColor: "#1c1d23",
          borderRadius: 10,
          marginBottom: 16,
          padding: 14,
        }}
      >
        <Text style={{ color: "#a0a1aa", fontSize: 12, fontWeight: "700" }}>Projecao por percentil</Text>
        <Text style={{ color: "#72737f", fontSize: 12, marginTop: 4 }}>
          Mantem o ultimo percentil observado e estima peso/altura a cada 6 meses ate o fim da base WHO disponivel.
        </Text>
      </View>

      {sections.length === 0 ? (
        <View style={{ alignItems: "center", marginTop: 40 }}>
          <Ionicons name="analytics-outline" size={48} color="#2c2d36" />
          <Text style={{ color: "#72737f", marginTop: 12, fontSize: 14 }}>
            Adicione peso ou altura para ver projecoes
          </Text>
        </View>
      ) : (
        sections.map((section) => <ProjectionSection key={section.label} section={section} />)
      )}
    </ScrollView>
  );
}

function TopTabs({
  active,
  onChange,
}: {
  active: DetailTab;
  onChange: (t: DetailTab) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: "#1c1d23",
        borderRadius: 10,
        padding: 3,
        marginHorizontal: 16,
        marginBottom: 12,
      }}
    >
      {[
        { key: "tabela" as const, label: "Tabela" },
        { key: "graficos" as const, label: "Graficos" },
        { key: "projecao" as const, label: "Projecao" },
      ].map((t) => (
        <Pressable
          key={t.key}
          onPress={() => onChange(t.key)}
          style={{
            flex: 1,
            paddingVertical: 8,
            borderRadius: 8,
            alignItems: "center",
            backgroundColor: active === t.key ? "#2c2d36" : "transparent",
          }}
        >
          <Text
            style={{
              color: active === t.key ? "#ecfdf5" : "#72737f",
              fontWeight: active === t.key ? "700" : "400",
              fontSize: 14,
            }}
          >
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Toggle pill ──────────────────────────────────────────────────────────────

function TogglePill<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: "row", backgroundColor: "#1c1d23", borderRadius: 8, padding: 3, alignSelf: "flex-start" }}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onChange(o.key)}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
            backgroundColor: value === o.key ? "#2c2d36" : "transparent",
          }}
        >
          <Text
            style={{
              color: value === o.key ? "#10b981" : "#72737f",
              fontSize: 12,
              fontWeight: value === o.key ? "700" : "400",
            }}
          >
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Delta badge ──────────────────────────────────────────────────────────────

function DeltaBadge({ delta, unit, decimals }: { delta: number | null; unit: string; decimals: number }) {
  if (delta == null) return null;
  const positive = delta >= 0;
  const sign = positive ? "+" : "";
  return (
    <Text style={{ color: positive ? "#10b981" : "#f59e0b", fontSize: 10, marginTop: 2 }}>
      {sign}{delta.toFixed(decimals)} {unit}
    </Text>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FilhoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: child } = useChild(id);
  const { data: children = [], isLoading: childrenLoading } = useChildren();
  const { data: photoUrl } = useChildPhotoUrl(id, child?.photo_url ?? null);
  const { data: measurements = [], isLoading } = useMeasurements(id);

  const upsertMeasurement = useUpsertMeasurement(id);
  const deleteMeasurement = useDeleteMeasurement(id);

  const [activeTab, setActiveTab] = useState<DetailTab>("tabela");
  const [compareAllChildren, setCompareAllChildren] = useState(false);
  const [standard, setStandard] = useState<GrowthStandard>("WHO");
  const [pMode, setPMode] = useState<PercentileMode>(3);
  const [chartContainerWidth, setChartContainerWidth] = useState(0);
  const [searchField, setSearchField] = useState<SearchField>("weight");
  const [searchValue, setSearchValue] = useState("");
  const allChildIds = useMemo(() => children.map((item) => item.id), [children]);
  const { data: allMeasurements = [], isLoading: allMeasurementsLoading } =
    useMeasurementsForChildren(compareAllChildren ? allChildIds : []);
  const compareChartChildren = useMemo(() => {
    const byChildId = new Map<string, Measurement[]>();

    allMeasurements.forEach((measurement) => {
      const current = byChildId.get(measurement.child_id) ?? [];
      current.push(measurement);
      byChildId.set(measurement.child_id, current);
    });

    return children.map((item) => ({
      child: item,
      measurements: byChildId.get(item.id) ?? [],
    }));
  }, [allMeasurements, children]);
  const compareChartLoading = compareAllChildren && (childrenLoading || allMeasurementsLoading);
  const chartHasAnyData = compareAllChildren ? allMeasurements.length > 0 : measurements.length > 0;

  const deltaById = useMemo(() => {
    const map = new Map<string, { weight: number | null; height: number | null; head: number | null }>();
    measurements.forEach((m, idx) => {
      const rest = measurements.slice(idx + 1);
      const pw = rest.find((p) => p.weight_kg != null);
      const ph = rest.find((p) => p.height_cm != null);
      const pc = rest.find((p) => p.head_circumference_cm != null);
      map.set(m.id, {
        weight: m.weight_kg != null && pw ? m.weight_kg - pw.weight_kg! : null,
        height: m.height_cm != null && ph ? m.height_cm - ph.height_cm! : null,
        head: m.head_circumference_cm != null && pc ? m.head_circumference_cm - pc.head_circumference_cm! : null,
      });
    });
    return map;
  }, [measurements]);

  const parsedSearch = useMemo(() => {
    const raw = searchValue.trim();
    if (!raw) return null;
    if (searchField === "date") return parseSearchDate(raw);
    const n = parseFloat(raw.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }, [searchField, searchValue]);

  const visibleMeasurements = useMemo(
    () =>
      parsedSearch == null
        ? measurements
        : findNeighborMeasurements(searchField, parsedSearch, measurements),
    [measurements, parsedSearch, searchField]
  );
  const searchActive = parsedSearch != null;
  const searchSummary =
    searchField === "date"
      ? parsedSearch != null
        ? format(new Date(parsedSearch), "dd/MM/yy")
        : ""
      : `${searchValue.replace(",", ".")} ${searchField === "weight" ? "kg" : "cm"}`;
  const searchPlaceholder =
    searchField === "weight"
      ? "Buscar peso (kg)"
      : searchField === "height"
        ? "Buscar altura (cm)"
        : "Buscar data (dd/mm/aa)";

  const childAgeMonths = useMemo(
    () => (child ? differenceInMonths(new Date(), parseISO(child.birth_date)) : 0),
    [child]
  );
  const who2007Available = childAgeMonths >= 61;
  const hasWeightBeyondWho2007 = useMemo(
    () =>
      child
        ? childAgeMonths > 120 ||
          measurements.some(
            (measurement) =>
              measurement.weight_kg != null && ageInMonths(child.birth_date, measurement.date) > 120
          )
        : false,
    [child, childAgeMonths, measurements]
  );

  useEffect(() => {
    if (!who2007Available && standard === "WHO2007") setStandard("WHO");
  }, [who2007Available, standard]);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<MeasForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setForm(emptyForm());
    setSheetOpen(true);
  }

  function openEdit(m: Measurement) {
    setForm(fromMeasurement(m));
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert("Data no formato AAAA-MM-DD.");
      return;
    }
    setSaving(true);
    try {
      await upsertMeasurement.mutateAsync({
        id: form.id,
        child_id: id,
        date: form.date,
        weight_kg: form.weight ? parseFloat(form.weight.replace(",", ".")) : null,
        height_cm: form.height ? parseFloat(form.height.replace(",", ".")) : null,
        head_circumference_cm: form.head ? parseFloat(form.head.replace(",", ".")) : null,
        notes: form.notes || null,
      });
      setSheetOpen(false);
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(m: Measurement) {
    Alert.alert("Remover medição", `Remover a medição de ${format(parseISO(m.date), "dd/MM/yyyy")}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Remover", style: "destructive", onPress: () => deleteMeasurement.mutate(m.id) },
    ]);
  }

  if (!child) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#0f1014", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#10b981" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f1014" }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16, paddingBottom: 12, gap: 12 }}>
        <Pressable onPress={() => router.replace("/(tabs)/")}>
          <Ionicons name="chevron-back" size={26} color="#10b981" />
        </Pressable>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} />
        ) : (
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#2c2d36", alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="person" size={22} color="#72737f" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#ecfdf5", fontSize: 18, fontWeight: "800" }}>{child.first_name}</Text>
          <Text style={{ color: "#72737f", fontSize: 12 }}>
            {child.sex === "M" ? "Menino" : "Menina"} · {ageLabel(child.birth_date)}
          </Text>
        </View>
        <Pressable
          onPress={openAdd}
          style={{ backgroundColor: "#10b981", borderRadius: 18, width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      {measurements.length > 0 && (
        <MeasurementSummary
          measurements={measurements}
          birthDate={child.birth_date}
          sex={child.sex}
        />
      )}

      <TopTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === "tabela" ? (
        // ─── Table tab ──────────────────────────────────────────────────────
        isLoading ? (
          <ActivityIndicator color="#10b981" style={{ marginTop: 40 }} />
        ) : measurements.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="bar-chart-outline" size={48} color="#2c2d36" />
            <Text style={{ color: "#72737f", marginTop: 12, fontSize: 14 }}>
              Nenhuma medição ainda
            </Text>
            <Pressable
              onPress={openAdd}
              style={{ marginTop: 16, backgroundColor: "#10b981", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 11 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Adicionar medição</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {/* Search: peso / altura / data → mostra vizinhos imediatos */}
            <View style={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8 }}>
              <TogglePill<SearchField>
                options={[
                  { key: "weight", label: "Peso" },
                  { key: "height", label: "Altura" },
                  { key: "date", label: "Data" },
                ]}
                value={searchField}
                onChange={setSearchField}
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#1c1d23",
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  marginTop: 8,
                }}
              >
                <Ionicons name="search" size={16} color="#72737f" />
                <TextInput
                  value={searchValue}
                  onChangeText={setSearchValue}
                  placeholder={searchPlaceholder}
                  placeholderTextColor="#4a4b58"
                  keyboardType={searchField === "date" ? "default" : "decimal-pad"}
                  style={{ flex: 1, color: "#ecfdf5", fontSize: 14, paddingVertical: 10, paddingHorizontal: 8 }}
                />
                {searchValue ? (
                  <Pressable onPress={() => setSearchValue("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color="#72737f" />
                  </Pressable>
                ) : null}
              </View>
              {searchActive ? (
                <Text style={{ color: "#72737f", fontSize: 11, marginTop: 6 }}>
                  Vizinhos de {searchSummary} · {visibleMeasurements.length} de {measurements.length}
                </Text>
              ) : null}
            </View>
            <FlatList
              data={visibleMeasurements}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10 }}
              ListHeaderComponent={
                <View style={{ flexDirection: "row", paddingHorizontal: 4, marginBottom: 4 }}>
                  <Text style={[colHeader, { flex: 2 }]}>DATA</Text>
                  <Text style={[colHeader, { flex: 1 }]}>PESO</Text>
                  <Text style={[colHeader, { flex: 1 }]}>ALTURA</Text>
                  <Text style={[colHeader, { flex: 1 }]}>CABEÇA</Text>
                </View>
              }
              ListEmptyComponent={
                searchActive ? (
                  <Text style={{ color: "#72737f", fontSize: 13, textAlign: "center", marginTop: 24 }}>
                    Sem medições para essa busca
                  </Text>
                ) : null
              }
              renderItem={({ item }) => {
                const d = deltaById.get(item.id);
                return (
                  <Pressable
                    onPress={() => openEdit(item)}
                    style={{
                      backgroundColor: "#1c1d23",
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    <View style={{ flex: 2 }}>
                      <Text style={[cell, { color: "#ecfdf5" }]}>
                        {format(parseISO(item.date), "dd/MM/yy")}
                      </Text>
                      <Text style={{ color: "#72737f", fontSize: 10, marginTop: 2 }}>
                        {ageShort(child.birth_date, item.date)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={cell}>{fmt(item.weight_kg)} kg</Text>
                      <DeltaBadge delta={d?.weight ?? null} unit="kg" decimals={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={cell}>{fmt(item.height_cm, 1)} cm</Text>
                      <DeltaBadge delta={d?.height ?? null} unit="cm" decimals={1} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={cell}>{fmt(item.head_circumference_cm, 1)} cm</Text>
                      <DeltaBadge delta={d?.head ?? null} unit="cm" decimals={1} />
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        )
      ) : activeTab === "projecao" ? (
        <ProjectionTab birthDate={child.birth_date} measurements={measurements} sex={child.sex} />
      ) : (
        // ─── Charts tab ─────────────────────────────────────────────────────
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}>
          <View
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0) setChartContainerWidth(w);
            }}
          >
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              {who2007Available && (
                <TogglePill<GrowthStandard>
                  options={[
                    { key: "WHO", label: "WHO 0-5a" },
                    { key: "WHO2007", label: "WHO 5-19a" },
                  ]}
                  value={standard}
                  onChange={setStandard}
                />
              )}
              <TogglePill<string>
                options={[
                  { key: "5", label: "5 linhas" },
                  { key: "3", label: "3 linhas" },
                ]}
                value={String(pMode)}
                onChange={(v) => setPMode(Number(v) as PercentileMode)}
              />
              <TogglePill<string>
                options={[
                  { key: "child", label: "Filho atual" },
                  { key: "all", label: "Todos os filhos" },
                ]}
                value={compareAllChildren ? "all" : "child"}
                onChange={(value) => setCompareAllChildren(value === "all")}
              />
            </View>

            {compareAllChildren && (
              <View
                style={{
                  backgroundColor: "#1c1d23",
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 16,
                }}
              >
                <Text style={{ color: "#a0a1aa", fontSize: 12, fontWeight: "700" }}>
                  Todos os filhos
                </Text>
                <Text style={{ color: "#72737f", fontSize: 12, marginTop: 4 }}>
                  Compara por percentil ajustado por idade e sexo. Janela corta no menor intervalo de idade em comum entre filhos com dados.
                </Text>
              </View>
            )}

            {compareChartLoading ? (
              <ActivityIndicator color="#10b981" style={{ marginTop: 40 }} />
            ) : !chartHasAnyData ? (
              <View style={{ alignItems: "center", marginTop: 40 }}>
                <Ionicons name="analytics-outline" size={48} color="#2c2d36" />
                <Text style={{ color: "#72737f", marginTop: 12, fontSize: 14 }}>
                  Adicione medições para ver os gráficos
                </Text>
              </View>
            ) : (
              <>
                {compareAllChildren ? (
                  <ComparisonGrowthChart
                    children={compareChartChildren}
                    currentChildId={child.id}
                    metric="weight"
                    label="Peso"
                    unit="kg"
                    standard={standard}
                    percentileMode={pMode}
                    containerWidth={chartContainerWidth}
                  />
                ) : (
                  <GrowthChart
                    metric="weight"
                    label="Peso"
                    unit="kg"
                    birthDate={child.birth_date}
                    sex={child.sex}
                    measurements={measurements}
                    standard={standard}
                    percentileMode={pMode}
                    containerWidth={chartContainerWidth}
                  />
                )}
                {standard === "WHO2007" && (compareAllChildren || hasWeightBeyondWho2007) && (
                  <View
                    style={{
                      backgroundColor: "#1c1d23",
                      borderRadius: 10,
                      padding: 14,
                      marginTop: -12,
                      marginBottom: 20,
                    }}
                  >
                    <Text style={{ color: "#72737f", fontSize: 12 }}>
                      WHO 2007 publica peso-por-idade apenas de 5 a 10 anos.
                    </Text>
                  </View>
                )}
                {compareAllChildren ? (
                  <ComparisonGrowthChart
                    children={compareChartChildren}
                    currentChildId={child.id}
                    metric="height"
                    label="Altura"
                    unit="cm"
                    standard={standard}
                    percentileMode={pMode}
                    containerWidth={chartContainerWidth}
                  />
                ) : (
                  <GrowthChart
                    metric="height"
                    label="Altura"
                    unit="cm"
                    birthDate={child.birth_date}
                    sex={child.sex}
                    measurements={measurements}
                    standard={standard}
                    percentileMode={pMode}
                    containerWidth={chartContainerWidth}
                  />
                )}
                {standard === "WHO" && (compareAllChildren ? (
                  <ComparisonGrowthChart
                    children={compareChartChildren}
                    currentChildId={child.id}
                    metric="head"
                    label="Circunferência da Cabeça"
                    unit="cm"
                    standard={standard}
                    percentileMode={pMode}
                    containerWidth={chartContainerWidth}
                  />
                ) : (
                  <GrowthChart
                    metric="head"
                    label="Circunferência da Cabeça"
                    unit="cm"
                    birthDate={child.birth_date}
                    sex={child.sex}
                    measurements={measurements}
                    standard={standard}
                    percentileMode={pMode}
                    containerWidth={chartContainerWidth}
                  />
                ))}
                {standard === "WHO2007" && (
                  <View
                    style={{
                      backgroundColor: "#1c1d23",
                      borderRadius: 10,
                      padding: 14,
                      marginTop: 4,
                    }}
                  >
                    <Text style={{ color: "#72737f", fontSize: 12 }}>
                      WHO não publica curvas de circunferência cefálica para 5-19 anos.
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </ScrollView>
      )}

      {/* Measurement form sheet */}
      <BottomSheetModal visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text style={{ color: "#ecfdf5", fontSize: 17, fontWeight: "700", marginBottom: 20 }}>
          {form.id ? "Editar medição" : "Nova medição"}
        </Text>

        <Text style={labelStyle}>DATA (AAAA-MM-DD)</Text>
        <TextInput
          value={form.date}
          onChangeText={(v) => setForm((f) => ({ ...f, date: v }))}
          placeholder="2024-03-15"
          placeholderTextColor="#4a4b58"
          keyboardType="numeric"
          style={inputStyle}
        />

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>PESO (kg)</Text>
            <TextInput
              value={form.weight}
              onChangeText={(v) => setForm((f) => ({ ...f, weight: v }))}
              placeholder="7.500"
              placeholderTextColor="#4a4b58"
              keyboardType="decimal-pad"
              style={inputStyle}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={labelStyle}>ALTURA (cm)</Text>
            <TextInput
              value={form.height}
              onChangeText={(v) => setForm((f) => ({ ...f, height: v }))}
              placeholder="68.5"
              placeholderTextColor="#4a4b58"
              keyboardType="decimal-pad"
              style={inputStyle}
            />
          </View>
        </View>

        <Text style={[labelStyle, { marginTop: 12 }]}>CABEÇA (cm)</Text>
        <TextInput
          value={form.head}
          onChangeText={(v) => setForm((f) => ({ ...f, head: v }))}
          placeholder="43.0"
          placeholderTextColor="#4a4b58"
          keyboardType="decimal-pad"
          style={inputStyle}
        />

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{
            backgroundColor: "#10b981",
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
            marginTop: 20,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              {form.id ? "Salvar" : "Adicionar"}
            </Text>
          )}
        </Pressable>

        {form.id && (
          <Pressable
            onPress={() => {
              const target = measurements.find((m) => m.id === form.id);
              if (target) {
                setSheetOpen(false);
                setTimeout(() => confirmDelete(target), 300);
              }
            }}
            style={{
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <Text style={{ color: "#ef4444", fontWeight: "600", fontSize: 15 }}>Excluir medição</Text>
          </Pressable>
        )}
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const colHeader = {
  color: "#72737f",
  fontSize: 10,
  letterSpacing: 0.5,
} as const;

const cell = {
  color: "#a0a1aa",
  fontSize: 13,
} as const;

const labelStyle = {
  color: "#72737f",
  fontSize: 11,
  marginBottom: 6,
  letterSpacing: 0.5,
} as const;

const inputStyle = {
  backgroundColor: "#2c2d36",
  color: "#ecfdf5",
  borderRadius: 10,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
} as const;

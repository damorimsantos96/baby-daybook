import React, { useState } from "react";
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
import { format, parseISO, differenceInMonths, differenceInYears } from "date-fns";
import { Ionicons } from "@expo/vector-icons";
import { useChild, useChildPhotoUrl } from "@/hooks/useChildren";
import { useMeasurements, useUpsertMeasurement, useDeleteMeasurement } from "@/hooks/useMeasurements";
import { BottomSheetModal } from "@/components/ui/BottomSheetModal";
import { GrowthChart } from "@/components/charts/GrowthChart";
import type { GrowthStandard, Measurement, PercentileMode } from "@/types";

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

// ─── Tab toggle ───────────────────────────────────────────────────────────────

function TopTabs({
  active,
  onChange,
}: {
  active: "tabela" | "graficos";
  onChange: (t: "tabela" | "graficos") => void;
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
      {(["tabela", "graficos"] as const).map((t) => (
        <Pressable
          key={t}
          onPress={() => onChange(t)}
          style={{
            flex: 1,
            paddingVertical: 8,
            borderRadius: 8,
            alignItems: "center",
            backgroundColor: active === t ? "#2c2d36" : "transparent",
          }}
        >
          <Text
            style={{
              color: active === t ? "#ecfdf5" : "#72737f",
              fontWeight: active === t ? "700" : "400",
              fontSize: 14,
            }}
          >
            {t === "tabela" ? "Tabela" : "Gráficos"}
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function FilhoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: child } = useChild(id);
  const { data: photoUrl } = useChildPhotoUrl(id);
  const { data: measurements = [], isLoading } = useMeasurements(id);

  const upsertMeasurement = useUpsertMeasurement(id);
  const deleteMeasurement = useDeleteMeasurement(id);

  const [activeTab, setActiveTab] = useState<"tabela" | "graficos">("tabela");
  const [standard, setStandard] = useState<GrowthStandard>("WHO");
  const [pMode, setPMode] = useState<PercentileMode>(5);

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
        <Pressable onPress={() => router.back()}>
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
          <FlatList
            data={measurements}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            ListHeaderComponent={
              <View style={{ flexDirection: "row", paddingHorizontal: 4, marginBottom: 4 }}>
                <Text style={[colHeader, { flex: 2 }]}>DATA</Text>
                <Text style={[colHeader, { flex: 1 }]}>PESO</Text>
                <Text style={[colHeader, { flex: 1 }]}>ALTURA</Text>
                <Text style={[colHeader, { flex: 1 }]}>CABEÇA</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => openEdit(item)}
                style={{
                  backgroundColor: "#1c1d23",
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  flexDirection: "row",
                }}
              >
                <Text style={[cell, { flex: 2, color: "#ecfdf5" }]}>
                  {format(parseISO(item.date), "dd/MM/yy")}
                </Text>
                <Text style={[cell, { flex: 1 }]}>{fmt(item.weight_kg)} kg</Text>
                <Text style={[cell, { flex: 1 }]}>{fmt(item.height_cm, 1)} cm</Text>
                <Text style={[cell, { flex: 1 }]}>{fmt(item.head_circumference_cm, 1)} cm</Text>
              </Pressable>
            )}
          />
        )
      ) : (
        // ─── Charts tab ─────────────────────────────────────────────────────
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <TogglePill<GrowthStandard>
              options={[
                { key: "WHO", label: "WHO (0–60m)" },
                { key: "CDC", label: "CDC (2–20a)" },
              ]}
              value={standard}
              onChange={setStandard}
            />
            <TogglePill<string>
              options={[
                { key: "5", label: "5 linhas" },
                { key: "3", label: "3 linhas" },
              ]}
              value={String(pMode)}
              onChange={(v) => setPMode(Number(v) as PercentileMode)}
            />
          </View>

          {measurements.length === 0 ? (
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <Ionicons name="analytics-outline" size={48} color="#2c2d36" />
              <Text style={{ color: "#72737f", marginTop: 12, fontSize: 14 }}>
                Adicione medições para ver os gráficos
              </Text>
            </View>
          ) : (
            <>
              <GrowthChart
                metric="weight"
                label="Peso"
                unit="kg"
                birthDate={child.birth_date}
                sex={child.sex}
                measurements={measurements}
                standard={standard}
                percentileMode={pMode}
              />
              <GrowthChart
                metric="height"
                label="Altura / Comprimento"
                unit="cm"
                birthDate={child.birth_date}
                sex={child.sex}
                measurements={measurements}
                standard={standard}
                percentileMode={pMode}
              />
              {standard === "WHO" && (
                <GrowthChart
                  metric="head"
                  label="Circunferência da Cabeça"
                  unit="cm"
                  birthDate={child.birth_date}
                  sex={child.sex}
                  measurements={measurements}
                  standard={standard}
                  percentileMode={pMode}
                />
              )}
              {standard === "CDC" && (
                <View
                  style={{
                    backgroundColor: "#1c1d23",
                    borderRadius: 10,
                    padding: 14,
                    marginTop: 4,
                  }}
                >
                  <Text style={{ color: "#72737f", fontSize: 12 }}>
                    O CDC não publica curvas de circunferência cefálica para 2–20 anos.
                  </Text>
                </View>
              )}
            </>
          )}
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

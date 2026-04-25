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
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { format, parseISO, differenceInMonths, differenceInYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Ionicons } from "@expo/vector-icons";
import { useChildren, useUpsertChild, useDeleteChild, useChildPhotoUrl, useUploadChildPhoto } from "@/hooks/useChildren";
import { BottomSheetModal } from "@/components/ui/BottomSheetModal";
import type { Child, Sex } from "@/types";

function ageLabel(birthDate: string): string {
  const birth = parseISO(birthDate);
  const now = new Date();
  const years = differenceInYears(now, birth);
  const months = differenceInMonths(now, birth) % 12;
  if (years === 0) return `${differenceInMonths(now, birth)}m`;
  return months > 0 ? `${years}a ${months}m` : `${years}a`;
}

function ChildPhoto({ childId }: { childId: string }) {
  const { data: url } = useChildPhotoUrl(childId);
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: 56, height: 56, borderRadius: 28 }}
      />
    );
  }
  return (
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: "#2c2d36",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="person" size={28} color="#72737f" />
    </View>
  );
}

interface ChildFormState {
  id?: string;
  firstName: string;
  birthDate: string;
  sex: Sex;
  photoUri?: string;
}

const emptyForm = (): ChildFormState => ({
  firstName: "",
  birthDate: "",
  sex: "M",
});

export default function FilhosScreen() {
  const { data: children = [], isLoading, error } = useChildren();
  const upsertChild = useUpsertChild();
  const deleteChild = useDeleteChild();
  const uploadPhoto = useUploadChildPhoto();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<ChildFormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setForm(emptyForm());
    setSheetOpen(true);
  }

  function openEdit(child: Child) {
    setForm({
      id: child.id,
      firstName: child.first_name,
      birthDate: child.birth_date,
      sex: child.sex,
    });
    setSheetOpen(true);
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setForm((f) => ({ ...f, photoUri: result.assets[0].uri }));
    }
  }

  async function handleSave() {
    if (!form.firstName.trim()) {
      Alert.alert("Informe o primeiro nome.");
      return;
    }
    if (!form.birthDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert("Data de nascimento no formato AAAA-MM-DD.");
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertChild.mutateAsync({
        id: form.id,
        first_name: form.firstName.trim(),
        birth_date: form.birthDate,
        sex: form.sex,
      });
      if (form.photoUri) {
        await uploadPhoto.mutateAsync({ childId: saved.id, uri: form.photoUri });
        await upsertChild.mutateAsync({ id: saved.id, photo_url: "uploaded" });
      }
      setSheetOpen(false);
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(child: Child) {
    Alert.alert(
      "Remover filho",
      `Remover ${child.first_name} e todos os dados?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: () => deleteChild.mutate(child.id),
        },
      ]
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f1014" }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 20, paddingBottom: 8 }}>
        <Text style={{ color: "#ecfdf5", fontSize: 22, fontWeight: "800", flex: 1 }}>
          Filhos
        </Text>
        <Pressable
          onPress={openAdd}
          style={{
            backgroundColor: "#10b981",
            borderRadius: 20,
            width: 36,
            height: 36,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#10b981" style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <Ionicons name="warning-outline" size={48} color="#ef4444" />
          <Text style={{ color: "#ef4444", marginTop: 12, fontSize: 15, textAlign: "center" }}>
            Erro ao carregar filhos
          </Text>
          <Text style={{ color: "#72737f", marginTop: 6, fontSize: 12, textAlign: "center" }}>
            {(error as Error).message}
          </Text>
        </View>
      ) : children.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="people-outline" size={56} color="#2c2d36" />
          <Text style={{ color: "#72737f", marginTop: 12, fontSize: 15 }}>
            Nenhum filho cadastrado
          </Text>
          <Pressable
            onPress={openAdd}
            style={{
              marginTop: 20,
              backgroundColor: "#10b981",
              borderRadius: 10,
              paddingHorizontal: 24,
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Adicionar filho</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={children}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/filho/${item.id}`)}
              onLongPress={() =>
                Alert.alert(item.first_name, "O que deseja fazer?", [
                  { text: "Editar", onPress: () => openEdit(item) },
                  { text: "Excluir", style: "destructive", onPress: () => confirmDelete(item) },
                  { text: "Cancelar", style: "cancel" },
                ])
              }
              style={{
                backgroundColor: "#1c1d23",
                borderRadius: 14,
                padding: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
              }}
            >
              <ChildPhoto childId={item.id} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#ecfdf5", fontSize: 18, fontWeight: "700" }}>
                  {item.first_name}
                </Text>
                <Text style={{ color: "#72737f", fontSize: 13, marginTop: 2 }}>
                  {item.sex === "M" ? "Menino" : "Menina"} · {ageLabel(item.birth_date)}
                </Text>
                <Text style={{ color: "#4a4b58", fontSize: 11, marginTop: 1 }}>
                  {format(parseISO(item.birth_date), "dd/MM/yyyy")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#4a4b58" />
            </Pressable>
          )}
        />
      )}

      {/* Add/Edit Sheet */}
      <BottomSheetModal visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <Text style={{ color: "#ecfdf5", fontSize: 17, fontWeight: "700", marginBottom: 20 }}>
          {form.id ? "Editar filho" : "Novo filho"}
        </Text>

        {/* Photo picker */}
        <Pressable onPress={pickPhoto} style={{ alignSelf: "center", marginBottom: 20 }}>
          {form.photoUri ? (
            <Image
              source={{ uri: form.photoUri }}
              style={{ width: 72, height: 72, borderRadius: 36 }}
            />
          ) : (
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: "#2c2d36",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="camera" size={28} color="#72737f" />
            </View>
          )}
        </Pressable>

        <Text style={labelStyle}>PRIMEIRO NOME</Text>
        <TextInput
          value={form.firstName}
          onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))}
          placeholder="Ex: Clara"
          placeholderTextColor="#4a4b58"
          style={inputStyle}
        />

        <Text style={[labelStyle, { marginTop: 12 }]}>DATA DE NASCIMENTO (AAAA-MM-DD)</Text>
        <TextInput
          value={form.birthDate}
          onChangeText={(v) => setForm((f) => ({ ...f, birthDate: v }))}
          placeholder="2021-06-15"
          placeholderTextColor="#4a4b58"
          keyboardType="numeric"
          style={inputStyle}
        />

        <Text style={[labelStyle, { marginTop: 12 }]}>SEXO</Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
          {(["M", "F"] as Sex[]).map((s) => (
            <Pressable
              key={s}
              onPress={() => setForm((f) => ({ ...f, sex: s }))}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor: form.sex === s ? "#059669" : "#2c2d36",
              }}
            >
              <Text style={{ color: form.sex === s ? "#fff" : "#a0a1aa", fontWeight: "600" }}>
                {s === "M" ? "Menino" : "Menina"}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{
            backgroundColor: "#10b981",
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
            marginTop: 16,
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
      </BottomSheetModal>
    </SafeAreaView>
  );
}

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

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { fetchUserProfile, upsertUserProfile } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { useBiometrics } from "@/hooks/useBiometrics";

export default function ConfiguracoesScreen() {
  const session = useAuthStore((s) => s.session);
  const { enabled: bioEnabled, supported: bioSupported, toggle: toggleBio } = useBiometrics();

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUserProfile().then((p) => {
      if (p) setName(p.name);
    });
  }, []);

  async function saveName() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await upsertUserProfile(name.trim());
    } catch (e: any) {
      Alert.alert("Erro", e.message);
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    Alert.alert("Sair", "Deseja sair do aplicativo?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Sair",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0f1014" }}>
      <View style={{ padding: 20 }}>
        <Text style={{ color: "#ecfdf5", fontSize: 22, fontWeight: "800", marginBottom: 24 }}>
          Configurações
        </Text>

        {/* Profile */}
        <Text style={sectionLabel}>PERFIL</Text>
        <View style={card}>
          <Text style={fieldLabel}>Nome</Text>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={saveName}
              placeholder="Seu nome"
              placeholderTextColor="#4a4b58"
              style={[input, { flex: 1 }]}
            />
            {saving && <ActivityIndicator size="small" color="#10b981" />}
          </View>
          <Text style={fieldLabel}>E-mail</Text>
          <Text style={{ color: "#72737f", fontSize: 13 }}>
            {session?.user.email ?? ""}
          </Text>
        </View>

        {/* Biometrics */}
        {bioSupported && (
          <>
            <Text style={[sectionLabel, { marginTop: 20 }]}>SEGURANÇA</Text>
            <View style={[card, { flexDirection: "row", alignItems: "center" }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#ecfdf5", fontSize: 14 }}>Desbloqueio biométrico</Text>
                <Text style={{ color: "#72737f", fontSize: 12, marginTop: 2 }}>
                  Impressão digital ou Face ID
                </Text>
              </View>
              <Switch
                value={bioEnabled}
                onValueChange={toggleBio}
                trackColor={{ false: "#2c2d36", true: "#059669" }}
                thumbColor="#ecfdf5"
              />
            </View>
          </>
        )}

        {/* Sign out */}
        <Pressable
          onPress={signOut}
          style={{
            marginTop: 32,
            borderWidth: 1,
            borderColor: "#ef4444",
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#ef4444", fontWeight: "700", fontSize: 15 }}>Sair</Text>
        </Pressable>

        <Text style={{ color: "#4a4b58", fontSize: 11, textAlign: "center", marginTop: 24 }}>
          Baby Daybook v1.0.0
        </Text>
      </View>
    </SafeAreaView>
  );
}

const sectionLabel = {
  color: "#72737f",
  fontSize: 11,
  letterSpacing: 0.8,
  marginBottom: 8,
} as const;

const card = {
  backgroundColor: "#1c1d23",
  borderRadius: 14,
  padding: 16,
  gap: 8,
} as const;

const fieldLabel = {
  color: "#72737f",
  fontSize: 11,
  marginBottom: 2,
} as const;

const input = {
  backgroundColor: "#2c2d36",
  color: "#ecfdf5",
  borderRadius: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 14,
} as const;

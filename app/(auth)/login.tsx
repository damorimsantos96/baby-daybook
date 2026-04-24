import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useBiometrics } from "@/hooks/useBiometrics";

export default function LoginScreen() {
  const session = useAuthStore((s) => s.session);
  const { enabled: bioEnabled, authenticate } = useBiometrics();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // If session already exists, try biometric unlock first
  useEffect(() => {
    if (!session) return;
    if (bioEnabled) {
      authenticate().then((ok) => {
        if (ok) router.replace("/(tabs)/");
      });
    } else {
      router.replace("/(tabs)/");
    }
  }, [session]);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert("Preencha e-mail e senha.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      Alert.alert("Erro ao entrar", error.message);
      return;
    }
    router.replace("/(tabs)/");
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: "#0f1014", justifyContent: "center", padding: 24 }}
    >
      <Text style={{ color: "#10b981", fontSize: 28, fontWeight: "800", marginBottom: 4 }}>
        Baby Daybook
      </Text>
      <Text style={{ color: "#72737f", fontSize: 14, marginBottom: 40 }}>
        Acompanhamento de crescimento
      </Text>

      <Text style={{ color: "#a0a1aa", fontSize: 12, marginBottom: 6 }}>E-MAIL</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor="#4a4b58"
        placeholder="seu@email.com"
        style={inputStyle}
      />

      <Text style={{ color: "#a0a1aa", fontSize: 12, marginBottom: 6, marginTop: 16 }}>SENHA</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholderTextColor="#4a4b58"
        placeholder="••••••••"
        style={inputStyle}
      />

      <Pressable
        onPress={handleLogin}
        disabled={loading}
        style={{
          backgroundColor: "#10b981",
          borderRadius: 12,
          paddingVertical: 16,
          alignItems: "center",
          marginTop: 28,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Entrar</Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const inputStyle = {
  backgroundColor: "#1c1d23",
  color: "#ecfdf5",
  borderRadius: 10,
  paddingHorizontal: 14,
  paddingVertical: 13,
  fontSize: 15,
  marginBottom: 2,
};

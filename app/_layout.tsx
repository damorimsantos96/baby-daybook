import "../src/styles/global.css";

import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { useNativeVersionGate } from "@/hooks/useNativeVersionGate";
import { UpdateBanner } from "@/components/ui/UpdateBanner";
import { NativeUpdateModal } from "@/components/ui/NativeUpdateModal";
import { View } from "react-native";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
});

function AppShell() {
  const setSession = useAuthStore((s) => s.setSession);
  const update = useAppUpdate();
  const gate = useNativeVersionGate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#0f1014" }}>
      <StatusBar style="light" />
      {update.available && <UpdateBanner onApply={update.apply} />}
      <NativeUpdateModal visible={gate.blocked} apkUrl={gate.apkUrl} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0f1014" } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="filho/[id]" options={{ presentation: "card" }} />
      </Stack>
    </View>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}

import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/stores/auth";
import { Redirect } from "expo-router";

export default function TabsLayout() {
  const session = useAuthStore((s) => s.session);
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#1c1d23",
          borderTopColor: "#2c2d36",
          paddingBottom: 4,
        },
        tabBarActiveTintColor: "#10b981",
        tabBarInactiveTintColor: "#72737f",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Filhos",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="configuracoes"
        options={{
          title: "Configurações",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

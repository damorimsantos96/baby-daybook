import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  onApply: () => void;
}

export function UpdateBanner({ onApply }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: "#065f46",
        paddingTop: insets.top + 10,
        paddingBottom: 10,
        paddingHorizontal: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ color: "#d1fae5", fontSize: 13, flex: 1 }}>
        Nova versão disponível
      </Text>
      <Pressable onPress={onApply}>
        <Text style={{ color: "#6ee7b7", fontSize: 13, fontWeight: "700" }}>
          Atualizar
        </Text>
      </Pressable>
    </View>
  );
}

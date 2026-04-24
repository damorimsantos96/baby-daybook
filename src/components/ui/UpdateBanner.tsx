import React from "react";
import { Pressable, Text, View } from "react-native";

interface Props {
  onApply: () => void;
}

export function UpdateBanner({ onApply }: Props) {
  return (
    <View
      style={{
        backgroundColor: "#065f46",
        paddingHorizontal: 16,
        paddingVertical: 10,
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

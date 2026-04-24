import React from "react";
import { Linking, Modal, Pressable, Text, View } from "react-native";

interface Props {
  visible: boolean;
  apkUrl: string;
}

export function NativeUpdateModal({ visible, apkUrl }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            backgroundColor: "#1c1d23",
            borderRadius: 16,
            padding: 24,
            width: "100%",
          }}
        >
          <Text
            style={{
              color: "#ecfdf5",
              fontSize: 18,
              fontWeight: "700",
              marginBottom: 10,
            }}
          >
            Atualização necessária
          </Text>
          <Text style={{ color: "#a0a1aa", fontSize: 14, marginBottom: 24 }}>
            Esta versão do app não é mais suportada. Baixe a versão mais recente
            para continuar.
          </Text>
          <Pressable
            onPress={() => Linking.openURL(apkUrl)}
            style={{
              backgroundColor: "#10b981",
              borderRadius: 10,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              Baixar atualização
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

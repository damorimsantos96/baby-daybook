import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { getItem, setItem } from "@/lib/deviceStorage";

const BIOMETRICS_KEY = "biometrics_enabled";

export function useBiometrics() {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    (async () => {
      try {
        const LocalAuth = await import("expo-local-authentication");
        const has = await LocalAuth.hasHardwareAsync();
        const enrolled = await LocalAuth.isEnrolledAsync();
        setSupported(has && enrolled);
        const stored = await getItem(BIOMETRICS_KEY);
        setEnabled(stored === "true");
      } catch {}
    })();
  }, []);

  const toggle = useCallback(async (value: boolean) => {
    await setItem(BIOMETRICS_KEY, value ? "true" : "false");
    setEnabled(value);
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web" || !enabled) return true;
    try {
      const LocalAuth = await import("expo-local-authentication");
      const result = await LocalAuth.authenticateAsync({
        promptMessage: "Confirme sua identidade",
        fallbackLabel: "Usar senha",
      });
      return result.success;
    } catch {
      return false;
    }
  }, [enabled]);

  return { enabled, supported, toggle, authenticate };
}

import { useEffect, useState } from "react";
import { Platform } from "react-native";

interface UpdateState {
  available: boolean;
  apply: () => void;
}

export function useAppUpdate(): UpdateState {
  const [available, setAvailable] = useState(false);
  const [updater, setUpdater] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let mounted = true;
    (async () => {
      try {
        const Updates = await import("expo-updates");
        if (!Updates.isEnabled) return;
        const result = await Updates.checkForUpdateAsync();
        if (!mounted || !result.isAvailable) return;
        const download = await Updates.fetchUpdateAsync();
        if (!mounted || !download.isNew) return;
        setAvailable(true);
        setUpdater(() => () => Updates.reloadAsync());
      } catch {
        // Non-fatal: ignore update check failures
      }
    })();

    return () => { mounted = false; };
  }, []);

  return {
    available,
    apply: updater ?? (() => {}),
  };
}

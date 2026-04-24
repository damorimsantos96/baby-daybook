import { useEffect, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { fetchAppVersionConfig } from "@/lib/api";

interface GateState {
  blocked: boolean;
  apkUrl: string;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function useNativeVersionGate(): GateState {
  const [blocked, setBlocked] = useState(false);
  const [apkUrl, setApkUrl] = useState("");

  useEffect(() => {
    if (Platform.OS === "web") return;
    fetchAppVersionConfig().then((config) => {
      if (!config) return;
      const installed = Constants.expoConfig?.version ?? "1.0.0";
      if (compareVersions(installed, config.min_runtime_version) < 0) {
        setBlocked(true);
        setApkUrl(config.apk_download_url);
      }
    }).catch(() => {});
  }, []);

  return { blocked, apkUrl };
}

import { Redirect } from "expo-router";
import { useAuthStore } from "@/stores/auth";

export default function Root() {
  const session = useAuthStore((s) => s.session);
  if (session) return <Redirect href="/(tabs)/" />;
  return <Redirect href="/(auth)/login" />;
}

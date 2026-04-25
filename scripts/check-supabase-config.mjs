import { promises as dns } from "node:dns";
import { existsSync, readFileSync } from "node:fs";

function readLocalEnv() {
  if (!existsSync(".env.local")) return {};

  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        if (index === -1) return [line, ""];
        const key = line.slice(0, index);
        const value = line.slice(index + 1).replace(/^['"]|['"]$/g, "");
        return [key, value];
      })
  );
}

function readAppEnv() {
  if (!existsSync("app.json")) return {};

  const appConfig = JSON.parse(readFileSync("app.json", "utf8"));
  const extra = appConfig.expo?.extra ?? {};
  return {
    EXPO_PUBLIC_SUPABASE_URL:
      extra.supabaseUrl ??
      extra.EXPO_PUBLIC_SUPABASE_URL ??
      extra.supabase?.url,
    EXPO_PUBLIC_SUPABASE_ANON_KEY:
      extra.supabaseAnonKey ??
      extra.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
      extra.supabase?.anonKey ??
      extra.supabase?.anon_key,
  };
}

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim();
}

function normalizeSupabaseUrl(value) {
  const raw = value?.trim().replace(/\/+$/, "");
  if (!raw) throw new Error("EXPO_PUBLIC_SUPABASE_URL nao configurada.");

  if (/^[a-z0-9]{20}$/.test(raw)) return `https://${raw}.supabase.co`;
  if (/^[a-z0-9.-]+\.supabase\.co$/.test(raw)) return `https://${raw}`;
  if (/^https?:\/\//.test(raw)) {
    const parsed = new URL(raw);
    const isLocalhost = ["localhost", "127.0.0.1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !isLocalhost) {
      throw new Error("EXPO_PUBLIC_SUPABASE_URL deve usar https em producao.");
    }
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("EXPO_PUBLIC_SUPABASE_URL deve conter apenas a origem.");
    }
    return parsed.origin;
  }

  throw new Error(
    "EXPO_PUBLIC_SUPABASE_URL invalida. Use https://<project-ref>.supabase.co"
  );
}

const localEnv = readLocalEnv();
const appEnv = readAppEnv();
const supabaseUrl = normalizeSupabaseUrl(
  firstNonEmpty(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    localEnv.EXPO_PUBLIC_SUPABASE_URL,
    appEnv.EXPO_PUBLIC_SUPABASE_URL
  )
);
const supabaseAnonKey =
  firstNonEmpty(
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    localEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );
const supabaseServiceRoleKey =
  firstNonEmpty(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    localEnv.SUPABASE_SERVICE_ROLE_KEY
  );
const { host } = new URL(supabaseUrl);

if (!supabaseAnonKey) {
  throw new Error("EXPO_PUBLIC_SUPABASE_ANON_KEY nao configurada.");
}

console.log(`Supabase URL: ${supabaseUrl}`);
console.log(`Supabase host: ${host}`);

try {
  const records = await dns.lookup(host, { all: true });
  console.log(`DNS OK: ${records.map((record) => record.address).join(", ")}`);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  throw new Error(`DNS falhou para ${host}: ${message}`);
}

const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
  headers: {
    apikey: supabaseAnonKey,
  },
});

console.log(`Auth health HTTP: ${response.status}`);

if (!response.ok) {
  throw new Error(
    `Supabase Auth respondeu ${response.status}. Confira URL e anon key.`
  );
}

if (!supabaseServiceRoleKey) {
  console.log("Storage bucket check skipped: SUPABASE_SERVICE_ROLE_KEY ausente.");
} else {
  const storageResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
    },
  });

  console.log(`Storage buckets HTTP: ${storageResponse.status}`);

  if (!storageResponse.ok) {
    throw new Error(
      `Storage API respondeu ${storageResponse.status}. Confira service role key e bucket child-photos.`
    );
  }

  const buckets = await storageResponse.json();
  const hasChildPhotos = Array.isArray(buckets) &&
    buckets.some((bucket) => bucket?.id === "child-photos" || bucket?.name === "child-photos");

  if (!hasChildPhotos) {
    throw new Error("Storage bucket child-photos nao encontrado.");
  }

  console.log("Storage bucket OK: child-photos");
}

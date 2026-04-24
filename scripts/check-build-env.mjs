import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, ".env.local");
const appJsonPath = path.join(projectRoot, "app.json");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo ausente: ${path.relative(projectRoot, filePath)}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .reduce((acc, line) => {
      const [key, ...rest] = line.split("=");
      acc[key] = rest.join("=").trim();
      return acc;
    }, {});
}

function assertValue(name, value, source) {
  if (!value) {
    throw new Error(`Variavel obrigatoria ausente: ${name} (${source})`);
  }
}

const env = readEnvFile(envPath);
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
const extra = appJson?.expo?.extra ?? {};

assertValue("EXPO_PUBLIC_SUPABASE_URL", env.EXPO_PUBLIC_SUPABASE_URL, ".env.local");
assertValue("EXPO_PUBLIC_SUPABASE_ANON_KEY", env.EXPO_PUBLIC_SUPABASE_ANON_KEY, ".env.local");
assertValue("EXPO_TOKEN", env.EXPO_TOKEN, ".env.local");
assertValue("expo.extra.supabaseUrl", extra.supabaseUrl, "app.json");
assertValue("expo.extra.supabaseAnonKey", extra.supabaseAnonKey, "app.json");

console.log("Build env OK");

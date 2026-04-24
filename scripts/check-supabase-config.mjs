import dns from "node:dns/promises";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, ".env.local");

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

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
            Authorization: `Bearer ${process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ""}`,
          },
        },
        (response) => {
          let body = "";
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => {
            resolve({
              statusCode: response.statusCode ?? 0,
              body,
            });
          });
        }
      )
      .on("error", reject);
  });
}

const env = readEnvFile(envPath);
const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error("EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY sao obrigatorias em .env.local");
}

process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = anonKey;

const hostname = new URL(supabaseUrl).hostname;
const dnsResult = await dns.lookup(hostname);
const health = await getJson(`${supabaseUrl}/rest/v1/`);

if (health.statusCode < 200 || health.statusCode >= 500) {
  throw new Error(`Supabase respondeu com status inesperado: ${health.statusCode}`);
}

console.log(`Supabase DNS OK: ${hostname} -> ${dnsResult.address}`);
console.log(`Supabase HTTP OK: ${health.statusCode}`);

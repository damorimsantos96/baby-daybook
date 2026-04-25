import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const projectRoot = process.cwd();
const workbookPath = path.join(projectRoot, "medidas-iniciais.xlsx");
const scriptEnvPath = path.join(projectRoot, "scripts", ".env");

if (!fs.existsSync(scriptEnvPath)) {
  console.error("Crie scripts/.env com as credenciais service-role antes de importar.");
  process.exit(1);
}
if (!fs.existsSync(workbookPath)) {
  console.error("Arquivo medidas-iniciais.xlsx nao encontrado na raiz do projeto.");
  process.exit(1);
}

// Load env
const envContent = fs.readFileSync(scriptEnvPath, "utf-8");
const env = Object.fromEntries(
  envContent
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split("=", 2))
);
const SUPABASE_URL = env["SUPABASE_URL"]?.trim();
const SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"]?.trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente em scripts/.env");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  Prefer: "return=representation",
};

async function supabaseGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function supabaseUpsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`UPSERT ${table} → ${res.status} ${await res.text()}`);
  return res.json();
}

function excelSerialToDate(serial) {
  // Excel epoch offset; 25569 = days from 1900-01-01 to 1970-01-01 (with Excel's leap-year bug)
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().split("T")[0];
}

// Read workbook
const wb = XLSX.readFile(workbookPath);
const ws = wb.Sheets["Planilha1"];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1); // skip header

// Fetch existing children
console.log("Buscando filhos...");
const children = await supabaseGet("children?select=id,first_name,user_id");
console.log("Filhos encontrados:", children.map((c) => `${c.first_name} (${c.id})`));

const childMap = Object.fromEntries(children.map((c) => [c.first_name, { id: c.id, user_id: c.user_id }]));

// Build measurement rows
const measurements = [];
for (const row of rows) {
  const [nome, dateSerial, , peso, altura, cabeca] = row;
  if (!nome || !dateSerial) continue;

  const child = childMap[nome];
  if (!child) {
    console.warn(`WARN: filho "${nome}" nao encontrado no banco, pulando.`);
    continue;
  }

  measurements.push({
    child_id: child.id,
    user_id: child.user_id,
    date: excelSerialToDate(dateSerial),
    weight_kg: peso ?? null,
    height_cm: altura ?? null,
    head_circumference_cm: cabeca ?? null,
  });
}

console.log(`\nImportando ${measurements.length} medidas...`);

// Upsert in batches of 50
const BATCH = 50;
let inserted = 0;
for (let i = 0; i < measurements.length; i += BATCH) {
  const batch = measurements.slice(i, i + BATCH);
  const result = await supabaseUpsert("measurements", batch);
  inserted += result.length;
  console.log(`  ${inserted}/${measurements.length} inseridas`);
}

console.log("\nImportacao concluida!");
const counts = {};
for (const m of measurements) {
  const name = children.find((c) => c.id === m.child_id)?.first_name ?? m.child_id;
  counts[name] = (counts[name] ?? 0) + 1;
}
for (const [name, count] of Object.entries(counts)) {
  console.log(`  ${name}: ${count} medidas`);
}

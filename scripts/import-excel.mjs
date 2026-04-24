import fs from "node:fs";
import path from "node:path";

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

console.log("Stub de importacao pronto.");
console.log("Arquivo encontrado:", path.relative(projectRoot, workbookPath));
console.log("Proximo passo: implementar o parser da planilha e o upsert no Supabase.");

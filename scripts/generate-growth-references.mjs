import { writeFile } from "node:fs/promises";
import XLSX from "xlsx";

const SOURCES = {
  whoWeightMale: "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/tab_wfa_boys_p_0_5.xlsx?sfvrsn=a0b3ed5_7",
  whoWeightFemale: "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/tab_wfa_girls_p_0_5.xlsx?sfvrsn=666fe445_7",
  whoHeightMale0To2: "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/tab_lhfa_boys_p_0_2.xlsx?sfvrsn=308931b2_12",
  whoHeightMale2To5: "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/tab_lhfa_boys_p_2_5.xlsx?sfvrsn=d6758a88_9",
  whoHeightFemale0To2: "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/tab_lhfa_girls_p_0_2.xlsx?sfvrsn=770a5ab8_9",
  whoHeightFemale2To5: "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/length-height-for-age/tab_lhfa_girls_p_2_5.xlsx?sfvrsn=5716360d_9",
  whoHeadMale: "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/head-circumference-for-age/tab_hcfa_boys_p_0_5.xlsx?sfvrsn=d6284c4c_5",
  whoHeadFemale: "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/head-circumference-for-age/tab_hcfa_girls_p_0_5.xlsx?sfvrsn=ad755200_5",
  who2007HeightMale: "https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/height-for-age-(5-19-years)/hfa-boys-perc-who2007-exp.xlsx?sfvrsn=27f20eb1_2",
  who2007HeightFemale: "https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/height-for-age-(5-19-years)/hfa-girls-perc-who2007-exp.xlsx?sfvrsn=7a910e5d_2",
  who2007WeightMale: "https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/weight-for-age-(5-10-years)/hfa-boys-perc-who2007-exp_07eb5053-9a09-4910-aa6b-c7fb28012ce6.xlsx?sfvrsn=97ab852c_4",
  who2007WeightFemale: "https://cdn.who.int/media/docs/default-source/child-growth/growth-reference-5-19-years/weight-for-age-(5-10-years)/hfa-girls-perc-who2007-exp_6040a43e-81da-48fa-a2d4-5c856fe4fe71.xlsx?sfvrsn=5c5825c4_4",
};

function normalizeCell(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function round(value) {
  return Number(value.toFixed(5));
}

function formatNumber(value) {
  const fixed = value.toFixed(5);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

function formatTable(name, rows) {
  const body = rows.map(([month, l, m, s]) => `  [${month}, ${formatNumber(l)}, ${formatNumber(m)}, ${formatNumber(s)}],`).join("\n");
  return `export const ${name} = [\n${body}\n] as const;\n`;
}

async function loadRows(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed ${response.status} for ${url}`);
  }

  const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
  });

  const headerIndex = rows.findIndex((row) => {
    const cells = row.map(normalizeCell);
    return cells.includes("month") && cells.includes("l") && cells.includes("m") && cells.includes("s");
  });

  if (headerIndex === -1) {
    throw new Error(`Header row not found for ${url}`);
  }

  const header = rows[headerIndex].map(normalizeCell);
  const monthIndex = header.findIndex((cell) => cell === "month");
  const lIndex = header.findIndex((cell) => cell === "l");
  const mIndex = header.findIndex((cell) => cell === "m");
  const sIndex = header.findIndex((cell) => cell === "s");

  const data = [];
  for (const row of rows.slice(headerIndex + 1)) {
    const month = Number(row[monthIndex]);
    const l = Number(row[lIndex]);
    const m = Number(row[mIndex]);
    const s = Number(row[sIndex]);

    if (![month, l, m, s].every(Number.isFinite)) {
      continue;
    }

    data.push([month, round(l), round(m), round(s)]);
  }

  if (!data.length) {
    throw new Error(`No numeric rows found for ${url}`);
  }

  return data;
}

function mergeHeightTables(zeroToTwo, twoToFive) {
  return [...zeroToTwo, ...twoToFive.filter(([month]) => month > 24)];
}

async function main() {
  const [
    whoWeightMale,
    whoWeightFemale,
    whoHeightMale0To2,
    whoHeightMale2To5,
    whoHeightFemale0To2,
    whoHeightFemale2To5,
    whoHeadMale,
    whoHeadFemale,
    who2007HeightMale,
    who2007HeightFemale,
    who2007WeightMale,
    who2007WeightFemale,
  ] = await Promise.all([
    loadRows(SOURCES.whoWeightMale),
    loadRows(SOURCES.whoWeightFemale),
    loadRows(SOURCES.whoHeightMale0To2),
    loadRows(SOURCES.whoHeightMale2To5),
    loadRows(SOURCES.whoHeightFemale0To2),
    loadRows(SOURCES.whoHeightFemale2To5),
    loadRows(SOURCES.whoHeadMale),
    loadRows(SOURCES.whoHeadFemale),
    loadRows(SOURCES.who2007HeightMale),
    loadRows(SOURCES.who2007HeightFemale),
    loadRows(SOURCES.who2007WeightMale),
    loadRows(SOURCES.who2007WeightFemale),
  ]);

  const content = [
    "export type LmsRow = readonly [month: number, l: number, m: number, s: number];",
    "",
    "// Generated from official WHO spreadsheets via scripts/generate-growth-references.mjs.",
    "",
    formatTable("WHO_WEIGHT_M", whoWeightMale),
    formatTable("WHO_WEIGHT_F", whoWeightFemale),
    formatTable("WHO_HEIGHT_M", mergeHeightTables(whoHeightMale0To2, whoHeightMale2To5)),
    formatTable("WHO_HEIGHT_F", mergeHeightTables(whoHeightFemale0To2, whoHeightFemale2To5)),
    formatTable("WHO_HEAD_M", whoHeadMale),
    formatTable("WHO_HEAD_F", whoHeadFemale),
    formatTable("WHO2007_HEIGHT_M", who2007HeightMale),
    formatTable("WHO2007_HEIGHT_F", who2007HeightFemale),
    formatTable("WHO2007_WEIGHT_M", who2007WeightMale),
    formatTable("WHO2007_WEIGHT_F", who2007WeightFemale),
  ].join("\n");

  await writeFile("src/utils/growthReferences.ts", content, "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

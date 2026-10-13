import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { EN } from "../en";
import * as areas from "../en/areas";

const ROOTS = ["app/(admin)", "utils/pdf", "utils/excel", "app/(admin)/admin/cashflow"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "node_modules") out.push(...sourceFiles(p));
    } else if (/\.(tsx?|mts)$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** Every literal passed to tr("…") / translate(locale, "…") in the admin. */
function usedKeys() {
  const keys = new Map<string, string>();
  for (const file of [...new Set(ROOTS.flatMap((r) => sourceFiles(r)))]) {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const c = n.expression;
        const name = ts.isIdentifier(c) ? c.text : "";
        const arg = name === "tr" ? n.arguments[0] : name === "translate" ? n.arguments[1] : undefined;
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) keys.set(arg.text, file);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return keys;
}

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("admin English dictionary", () => {
  const used = usedKeys();

  it("has an English text for every tr(…) in the admin", () => {
    const missing = [...used].filter(([k]) => !(k in EN)).map(([k, f]) => `${f}: ${k}`);
    expect(missing).toEqual([]);
  });

  it("keeps the same {placeholders} in both languages", () => {
    const bad = Object.entries(EN).filter(([es, en]) => JSON.stringify(placeholders(es)) !== JSON.stringify(placeholders(en)));
    expect(bad).toEqual([]);
  });

  it("never translates the same text two different ways in different areas", () => {
    const seen = new Map<string, { area: string; en: string }>();
    const conflicts: string[] = [];
    for (const [area, dict] of Object.entries(areas)) {
      for (const [es, en] of Object.entries(dict as Record<string, string>)) {
        const prev = seen.get(es);
        if (prev && prev.en !== en) conflicts.push(`"${es}": ${prev.area} → "${prev.en}" vs ${area} → "${en}"`);
        else seen.set(es, { area, en });
      }
    }
    expect(conflicts).toEqual([]);
  });

  it("has no empty translations", () => {
    expect(Object.entries(EN).filter(([, en]) => !en.trim()).map(([es]) => es)).toEqual([]);
  });
});

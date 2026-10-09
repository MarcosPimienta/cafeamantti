import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(__dirname, "../../supabase/migrations");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));

describe("supabase/migrations", () => {
  it("every file is named YYYYMMDDHHMMSS_name.sql (what the Supabase CLI expects)", () => {
    expect(files.filter((f) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(f))).toEqual([]);
  });

  it("no two migrations share a version", () => {
    const versions = files.map((f) => f.slice(0, 14));
    expect(versions.filter((v, i) => versions.indexOf(v) !== i)).toEqual([]);
  });

  it("no migration is empty", () => {
    expect(files.filter((f) => fs.readFileSync(path.join(dir, f), "utf8").replace(/--.*$/gm, "").trim() === "")).toEqual([]);
  });
});

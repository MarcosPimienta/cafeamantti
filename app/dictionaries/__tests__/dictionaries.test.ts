import { describe, it, expect } from "vitest";
import { en } from "../en";
import { es } from "../es";

describe("translations", () => {
  it("Spanish and English have exactly the same keys", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it("a text is only empty when it is empty in both languages (intentional)", () => {
    const halfEmpty = Object.keys(en).filter((k) => {
      const a = (en as Record<string, string>)[k].trim();
      const b = (es as Record<string, string>)[k].trim();
      return (a === "") !== (b === "");
    });
    expect(halfEmpty).toEqual([]);
  });

  it("placeholders like {name} survive translation", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    const mismatched = Object.keys(en).filter(
      (k) => JSON.stringify(ph((en as Record<string, string>)[k])) !== JSON.stringify(ph((es as Record<string, string>)[k]))
    );
    expect(mismatched).toEqual([]);
  });
});

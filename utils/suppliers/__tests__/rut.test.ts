import { describe, it, expect } from "vitest";
import { isNaturalPerson, isRutPathOf, rutFileProblem, rutStoragePath } from "../rut";

const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("supplier RUT file", () => {
  it("accepts PDFs and photos up to 10 MB", () => {
    expect(rutFileProblem({ type: "application/pdf", size: 300_000 })).toBeNull();
    expect(rutFileProblem({ type: "image/jpeg", size: 10 * 1024 * 1024 })).toBeNull();
    expect(rutFileProblem({ type: "application/zip", size: 10 })).toMatch(/PDF o una imagen/);
    expect(rutFileProblem({ type: "application/pdf", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  });

  it("stores it in the supplier's own folder and only accepts paths from there", () => {
    const path = rutStoragePath(ID, "image/jpeg", 1760000000000);
    expect(path).toBe(`rut/${ID}/1760000000000.jpg`);
    expect(isRutPathOf(ID, path)).toBe(true);
    expect(isRutPathOf(ID, `rut/${ID}/../otro/1.pdf`)).toBe(false);
    expect(isRutPathOf(ID, `rut/9f2504e0-4f89-11d3-9a0c-0305e82c3301/1.pdf`)).toBe(false);
    expect(isRutPathOf("x", "rut/x/1.pdf")).toBe(false);
  });

  it("flags natural persons", () => {
    expect(isNaturalPerson("CC")).toBe(true);
    expect(isNaturalPerson("ce")).toBe(true);
    expect(isNaturalPerson("NIT")).toBe(false);
    expect(isNaturalPerson(null)).toBe(false);
  });
});

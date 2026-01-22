import { describe, it, expect } from "vitest";
import {
  builtinComponents,
  positionalArgMap,
  isBuiltinComponent,
  getBuiltinComponentFile,
} from "./component-registry.js";

describe("component-registry", () => {
  describe("builtinComponents", () => {
    it("should contain all standard components", () => {
      const expected = [
        "markdown",
        "confirm",
        "checklist",
        "code",
        "diff",
        "table",
        "progress",
        "mermaid",
        "chart",
        "select",
        "tree",
        "json",
        "gauge",
        "card",
        "plan-viewer",
      ];

      for (const component of expected) {
        expect(builtinComponents[component]).toBeDefined();
      }
    });

    it("should support both with and without .tsx extension", () => {
      expect(builtinComponents["confirm"]).toBe("confirm.tsx");
      expect(builtinComponents["confirm.tsx"]).toBe("confirm.tsx");
    });
  });

  describe("positionalArgMap", () => {
    it("should map confirm to prompt", () => {
      expect(positionalArgMap["confirm"]).toBe("prompt");
      expect(positionalArgMap["confirm.tsx"]).toBe("prompt");
    });

    it("should map checklist to items", () => {
      expect(positionalArgMap["checklist"]).toBe("items");
    });

    it("should map markdown to file", () => {
      expect(positionalArgMap["markdown"]).toBe("file");
    });

    it("should map progress to steps", () => {
      expect(positionalArgMap["progress"]).toBe("steps");
    });
  });

  describe("isBuiltinComponent", () => {
    it("should return true for valid components", () => {
      expect(isBuiltinComponent("confirm")).toBe(true);
      expect(isBuiltinComponent("CONFIRM")).toBe(true);
      expect(isBuiltinComponent("Confirm")).toBe(true);
    });

    it("should return false for custom components", () => {
      expect(isBuiltinComponent("my-component")).toBe(false);
      expect(isBuiltinComponent("custom.tsx")).toBe(false);
    });
  });

  describe("getBuiltinComponentFile", () => {
    it("should return file name for valid components", () => {
      expect(getBuiltinComponentFile("confirm")).toBe("confirm.tsx");
      expect(getBuiltinComponentFile("table")).toBe("table.tsx");
    });

    it("should return undefined for custom components", () => {
      expect(getBuiltinComponentFile("my-component")).toBeUndefined();
    });
  });
});

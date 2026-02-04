import { describe, expect, it } from "vitest";
import {
  type FlagSpec,
  extractComponentArgs,
  extractFlags,
} from "./arg-parser.js";

describe("arg-parser", () => {
  describe("extractFlags", () => {
    it("should extract string flags with space syntax", () => {
      const args = ["--title", "My Title", "confirm"];
      const specs: FlagSpec[] = [{ name: "title" }];
      const result = extractFlags(args, specs);

      expect(result.title).toBe("My Title");
      expect(args).toEqual(["confirm"]);
    });

    it("should extract string flags with equals syntax", () => {
      const args = ["--title=My Title", "confirm"];
      const specs: FlagSpec[] = [{ name: "title" }];
      const result = extractFlags(args, specs);

      expect(result.title).toBe("My Title");
      expect(args).toEqual(["confirm"]);
    });

    it("should extract boolean flags", () => {
      const args = ["--live", "confirm"];
      const specs: FlagSpec[] = [{ name: "live", type: "boolean" }];
      const result = extractFlags(args, specs);

      expect(result.live).toBe("true");
      expect(args).toEqual(["confirm"]);
    });

    it("should handle multiple flags", () => {
      const args = ["--title", "Test", "--format", "json", "output"];
      const specs: FlagSpec[] = [{ name: "title" }, { name: "format" }];
      const result = extractFlags(args, specs);

      expect(result.title).toBe("Test");
      expect(result.format).toBe("json");
      expect(args).toEqual(["output"]);
    });

    it("should stop at -- separator", () => {
      const args = ["--title", "Test", "--", "--flag", "value"];
      const specs: FlagSpec[] = [{ name: "title" }, { name: "flag" }];
      const result = extractFlags(args, specs);

      expect(result.title).toBe("Test");
      expect(result.flag).toBeUndefined();
      expect(args).toEqual(["--", "--flag", "value"]);
    });

    it("should return undefined for missing flags", () => {
      const args = ["confirm"];
      const specs: FlagSpec[] = [{ name: "title" }];
      const result = extractFlags(args, specs);

      expect(result.title).toBeUndefined();
      expect(args).toEqual(["confirm"]);
    });

    it("should not treat values starting with -- as flags", () => {
      const args = ["--title", "--weird-value", "confirm"];
      const specs: FlagSpec[] = [{ name: "title" }];
      const result = extractFlags(args, specs);

      // Because --weird-value starts with --, it's treated as next flag not value
      expect(result.title).toBeUndefined();
    });
  });

  describe("extractComponentArgs", () => {
    it("should extract component args with space syntax", () => {
      const args = ["confirm", "--prompt", "Are you sure?"];
      const result = extractComponentArgs(args);

      expect(result.prompt).toBe("Are you sure?");
    });

    it("should extract component args with equals syntax", () => {
      const args = ["confirm", "--prompt=Are you sure?"];
      const result = extractComponentArgs(args);

      expect(result.prompt).toBe("Are you sure?");
    });

    it("should extract multiple component args", () => {
      const args = ["table", "--data", "[1,2,3]", "--columns", "a,b,c"];
      const result = extractComponentArgs(args);

      expect(result.data).toBe("[1,2,3]");
      expect(result.columns).toBe("a,b,c");
    });

    it("should skip positional args", () => {
      const args = ["confirm", "positional", "--prompt", "Test"];
      const result = extractComponentArgs(args);

      expect(result.prompt).toBe("Test");
    });

    it("should respect startIndex parameter", () => {
      const args = ["cli", "run", "confirm", "--prompt", "Test"];
      const result = extractComponentArgs(args, 2);

      expect(result.prompt).toBe("Test");
    });

    it("should handle empty args after component", () => {
      const args = ["confirm"];
      const result = extractComponentArgs(args);

      expect(result).toEqual({});
    });
  });
});

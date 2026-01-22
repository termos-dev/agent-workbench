import { describe, expect, it } from "vitest";
import {
  getColumnWidths,
  parseTableData,
  truncateCell,
} from "./table-renderer.js";

describe("table-renderer utilities", () => {
  describe("parseTableData", () => {
    it("parses JSON string array of objects", () => {
      const input =
        '[{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]';
      const result = parseTableData(input);
      expect("data" in result).toBe(true);
      if ("data" in result) {
        expect(result.data.rows).toHaveLength(2);
        expect(result.data.columns).toEqual(["name", "age"]);
        expect(result.data.rows[0]).toEqual({ name: "Alice", age: 30 });
      }
    });

    it("parses array of objects directly", () => {
      const input = [
        { id: 1, value: "a" },
        { id: 2, value: "b" },
      ];
      const result = parseTableData(input);
      expect("data" in result).toBe(true);
      if ("data" in result) {
        expect(result.data.rows).toHaveLength(2);
        expect(result.data.columns).toEqual(["id", "value"]);
      }
    });

    it("parses single object as single row", () => {
      const input = { name: "Test", status: "ok" };
      const result = parseTableData(input);
      expect("data" in result).toBe(true);
      if ("data" in result) {
        expect(result.data.rows).toHaveLength(1);
        expect(result.data.rows[0]).toEqual({ name: "Test", status: "ok" });
      }
    });

    it("parses array of primitives with value column", () => {
      const input = [1, 2, 3];
      const result = parseTableData(input);
      expect("data" in result).toBe(true);
      if ("data" in result) {
        expect(result.data.rows).toEqual([
          { value: 1 },
          { value: 2 },
          { value: 3 },
        ]);
        expect(result.data.columns).toEqual(["value"]);
      }
    });

    it("parses {headers, rows} format", () => {
      const input = {
        headers: ["col1", "col2"],
        rows: [
          ["a", "b"],
          ["c", "d"],
        ],
      };
      const result = parseTableData(input);
      expect("data" in result).toBe(true);
      if ("data" in result) {
        expect(result.data.columns).toEqual(["col1", "col2"]);
        expect(result.data.rows).toEqual([
          { col1: "a", col2: "b" },
          { col1: "c", col2: "d" },
        ]);
      }
    });

    it("uses column override when provided", () => {
      const input = [{ a: 1, b: 2, c: 3 }];
      const result = parseTableData(input, "a, c");
      expect("data" in result).toBe(true);
      if ("data" in result) {
        expect(result.data.columns).toEqual(["a", "c"]);
      }
    });

    it("returns error for invalid JSON string", () => {
      const input = "{invalid json";
      const result = parseTableData(input);
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error.message).toContain("Expected");
      }
    });

    it("returns error for empty array", () => {
      const input: unknown[] = [];
      const result = parseTableData(input);
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error.message).toBe("No data to display");
      }
    });

    it("returns error for null input", () => {
      const input = null as unknown as string;
      const result = parseTableData(input);
      expect("error" in result).toBe(true);
    });

    it("handles mixed array with objects and primitives", () => {
      const input = [{ a: 1 }, "string", 123];
      const result = parseTableData(input);
      expect("data" in result).toBe(true);
      if ("data" in result) {
        expect(result.data.rows).toHaveLength(3);
        expect(result.data.rows[0]).toEqual({ a: 1 });
        expect(result.data.rows[1]).toEqual({ value: "string" });
        expect(result.data.rows[2]).toEqual({ value: 123 });
      }
    });
  });

  describe("getColumnWidths", () => {
    it("returns minimum width of 3", () => {
      const rows = [{ a: "x" }];
      const columns = ["a"];
      const widths = getColumnWidths(rows, columns, 50);
      expect(widths[0]).toBeGreaterThanOrEqual(3);
    });

    it("uses header length when data is shorter", () => {
      const rows = [{ longheader: "x" }];
      const columns = ["longheader"];
      const widths = getColumnWidths(rows, columns, 50);
      expect(widths[0]).toBe(10); // "longheader".length
    });

    it("uses data length when longer than header", () => {
      const rows = [{ h: "verylongvalue" }];
      const columns = ["h"];
      const widths = getColumnWidths(rows, columns, 50);
      expect(widths[0]).toBe(13); // "verylongvalue".length
    });

    it("respects maxWidth constraint", () => {
      const rows = [{ h: "a".repeat(100) }];
      const columns = ["h"];
      const widths = getColumnWidths(rows, columns, 20);
      expect(widths[0]).toBe(20);
    });

    it("handles missing column values", () => {
      const rows = [{ a: 1 }, { b: 2 }]; // second row missing 'a'
      const columns = ["a"];
      const widths = getColumnWidths(rows, columns, 50);
      expect(widths[0]).toBeGreaterThanOrEqual(1);
    });

    it("handles multiple columns", () => {
      const rows = [{ a: "short", b: "longervalue" }];
      const columns = ["a", "b"];
      const widths = getColumnWidths(rows, columns, 50);
      expect(widths).toHaveLength(2);
      expect(widths[0]).toBe(5); // "short".length
      expect(widths[1]).toBe(11); // "longervalue".length
    });
  });

  describe("truncateCell", () => {
    it("pads short strings", () => {
      expect(truncateCell("hi", 5)).toBe("hi   ");
    });

    it("returns exact length strings unchanged", () => {
      expect(truncateCell("hello", 5)).toBe("hello");
    });

    it("truncates long strings with ellipsis", () => {
      expect(truncateCell("hello world", 5)).toBe("hell…");
    });

    it("handles empty string", () => {
      expect(truncateCell("", 5)).toBe("     ");
    });

    it("handles length of 1", () => {
      expect(truncateCell("abc", 1)).toBe("…");
    });

    it("handles unicode characters", () => {
      expect(truncateCell("日本語テスト", 4)).toBe("日本語…");
    });
  });
});

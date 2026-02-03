import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock os.homedir BEFORE importing the module
vi.mock("os", () => ({
  homedir: () => "/home/testuser",
}));

// Mock fs
vi.mock("fs");

// Import after mocks are set up
import { loadMergedInstructions } from "./instructions-loader.js";

describe("instructions-loader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadMergedInstructions", () => {
    it("returns empty string when no instructions files exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loadMergedInstructions("/test/project");
      expect(result).toBe("");
    });

    it("returns user instructions when only user file exists", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === "/home/testuser/.awb/awb.md";
      });
      vi.mocked(fs.readFileSync).mockReturnValue("  User instructions  ");

      const result = loadMergedInstructions("/test/project");
      expect(result).toBe("User instructions");
    });

    it("returns project instructions when only project file exists in .awb/", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === "/test/project/.awb/awb.md";
      });
      vi.mocked(fs.readFileSync).mockReturnValue("  Project instructions  ");

      const result = loadMergedInstructions("/test/project");
      expect(result).toBe("Project instructions");
    });

    it("returns project instructions when only root awb.md exists", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === "/test/project/awb.md";
      });
      vi.mocked(fs.readFileSync).mockReturnValue("Root project instructions");

      const result = loadMergedInstructions("/test/project");
      expect(result).toBe("Root project instructions");
    });

    it("prefers .awb/awb.md over root awb.md", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return (
          p === "/test/project/.awb/awb.md" || p === "/test/project/awb.md"
        );
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (p === "/test/project/.awb/awb.md") {
          return "From .awb dir";
        }
        return "From root";
      });

      const result = loadMergedInstructions("/test/project");
      expect(result).toBe("From .awb dir");
    });

    it("merges user and project instructions with double newline", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (typeof p === "string" && p.includes(".awb/awb.md")) {
          if (p.startsWith("/home")) {
            return "User instructions";
          }
          return "Project instructions";
        }
        return "";
      });

      const result = loadMergedInstructions("/test/project");
      expect(result).toBe("User instructions\n\nProject instructions");
    });

    it("handles read errors gracefully", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const result = loadMergedInstructions("/test/project");
      expect(result).toBe("");
    });
  });
});

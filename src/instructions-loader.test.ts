import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock os.homedir BEFORE importing the module
vi.mock("os", () => ({
  homedir: () => "/home/testuser",
}));

// Mock fs
vi.mock("fs");

// Import after mocks are set up
import {
  loadMergedInstructions,
  loadTuiEditorConfig,
} from "./instructions-loader.js";

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
        return p === "/home/testuser/.termos/termos.md";
      });
      vi.mocked(fs.readFileSync).mockReturnValue("  User instructions  ");

      const result = loadMergedInstructions("/test/project");
      expect(result).toBe("User instructions");
    });

    it("returns project instructions when only project file exists in .termos/", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === "/test/project/.termos/termos.md";
      });
      vi.mocked(fs.readFileSync).mockReturnValue("  Project instructions  ");

      const result = loadMergedInstructions("/test/project");
      expect(result).toBe("Project instructions");
    });

    it("returns project instructions when only root termos.md exists", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === "/test/project/termos.md";
      });
      vi.mocked(fs.readFileSync).mockReturnValue("Root project instructions");

      const result = loadMergedInstructions("/test/project");
      expect(result).toBe("Root project instructions");
    });

    it("prefers .termos/termos.md over root termos.md", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return (
          p === "/test/project/.termos/termos.md" ||
          p === "/test/project/termos.md"
        );
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (p === "/test/project/.termos/termos.md") {
          return "From .termos dir";
        }
        return "From root";
      });

      const result = loadMergedInstructions("/test/project");
      expect(result).toBe("From .termos dir");
    });

    it("merges user and project instructions with double newline", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (typeof p === "string" && p.includes(".termos/termos.md")) {
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

  describe("loadTuiEditorConfig", () => {
    it("returns null when no instructions files exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loadTuiEditorConfig("/test/project");
      expect(result).toBeNull();
    });

    it("returns null when no TUI Editor section exists", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        "# Some other content\n\nNo editor config here."
      );

      const result = loadTuiEditorConfig("/test/project");
      expect(result).toBeNull();
    });

    it("parses TUI Editor config from project instructions", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === "/test/project/.termos/termos.md";
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`# Project Config

## TUI Editor
\`\`\`yaml
editor: nvim
command: nvim +{line} {file}
lineFormat: +{line}
\`\`\`
`);

      const result = loadTuiEditorConfig("/test/project");
      expect(result).toEqual({
        editor: "nvim",
        command: "nvim +{line} {file}",
        lineFormat: "+{line}",
      });
    });

    it("parses TUI Editor config with quoted values", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === "/test/project/.termos/termos.md";
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`## TUI Editor
\`\`\`yaml
editor: "code"
command: "code --goto {file}:{line}"
lineFormat: ":{line}"
\`\`\`
`);

      const result = loadTuiEditorConfig("/test/project");
      expect(result).toEqual({
        editor: "code",
        command: "code --goto {file}:{line}",
        lineFormat: ":{line}",
      });
    });

    it("returns null when config is incomplete", () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        return p === "/test/project/.termos/termos.md";
      });
      vi.mocked(fs.readFileSync).mockReturnValue(`## TUI Editor
\`\`\`yaml
editor: nvim
command: nvim +{line} {file}
\`\`\`
`);

      const result = loadTuiEditorConfig("/test/project");
      expect(result).toBeNull();
    });

    it("prefers project config over user config", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (typeof p === "string" && p.includes("/home")) {
          return `## TUI Editor
\`\`\`yaml
editor: userEditor
command: userCmd
lineFormat: userFormat
\`\`\`
`;
        }
        return `## TUI Editor
\`\`\`yaml
editor: projectEditor
command: projectCmd
lineFormat: projectFormat
\`\`\`
`;
      });

      const result = loadTuiEditorConfig("/test/project");
      expect(result?.editor).toBe("projectEditor");
    });

    it("falls back to user config if project has no editor config", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (typeof p === "string" && p.includes("/home")) {
          return `## TUI Editor
\`\`\`yaml
editor: userEditor
command: userCmd
lineFormat: userFormat
\`\`\`
`;
        }
        return "# Project config without editor";
      });

      const result = loadTuiEditorConfig("/test/project");
      expect(result?.editor).toBe("userEditor");
    });
  });
});

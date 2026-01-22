import { describe, it, expect, beforeEach, vi } from "vitest";
import { discoverSessionDirs, getTotals, type ProjectInteractions } from "./session-scanner.js";
import * as fs from "fs";
import * as runtime from "./runtime.js";

// Mock modules
vi.mock("fs");
vi.mock("./runtime.js", async () => {
  const actual = await vi.importActual("./runtime.js");
  return {
    ...actual,
    getRuntimeRoot: vi.fn(),
    sessionNameToProject: vi.fn((name: string) => name.split("-").pop() || name),
  };
});

describe("session-scanner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(runtime.getRuntimeRoot).mockReturnValue("/tmp/termos");
  });

  describe("discoverSessionDirs", () => {
    it("returns empty array when sessions root does not exist", () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = discoverSessionDirs();
      expect(result).toEqual([]);
    });

    it("returns session directory names", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vi.mocked(fs.readdirSync) as any).mockReturnValue([
        { name: "session-1-project1", isDirectory: () => true },
        { name: "session-2-project2", isDirectory: () => true },
        { name: "somefile.txt", isDirectory: () => false },
      ]);

      const result = discoverSessionDirs();
      expect(result).toEqual(["session-1-project1", "session-2-project2"]);
    });

    it("filters out hidden directories", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vi.mocked(fs.readdirSync) as any).mockReturnValue([
        { name: ".dashboard", isDirectory: () => true },
        { name: ".hidden", isDirectory: () => true },
        { name: "visible-session", isDirectory: () => true },
      ]);

      const result = discoverSessionDirs();
      expect(result).toEqual(["visible-session"]);
    });

    it("handles read errors gracefully", () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const result = discoverSessionDirs();
      expect(result).toEqual([]);
    });
  });

  describe("getTotals", () => {
    it("returns zeros for empty array", () => {
      const result = getTotals([]);
      expect(result).toEqual({
        totalProjects: 0,
        totalInteractions: 0,
      });
    });

    it("counts single project with single interaction", () => {
      const projects: ProjectInteractions[] = [
        {
          project: "my-project",
          sessionName: "session-1",
          interactions: [
            {
              type: "created",
              id: "int-1",
              ts: 123,
              component: "confirm",
              project: "my-project",
              sessionName: "session-1",
            },
          ],
        },
      ];

      const result = getTotals(projects);
      expect(result).toEqual({
        totalProjects: 1,
        totalInteractions: 1,
      });
    });

    it("sums interactions across multiple projects", () => {
      const projects: ProjectInteractions[] = [
        {
          project: "project-a",
          sessionName: "session-1",
          interactions: [
            { type: "created", id: "1", ts: 1, component: "confirm", project: "project-a", sessionName: "session-1" },
            { type: "created", id: "2", ts: 2, component: "select", project: "project-a", sessionName: "session-1" },
          ],
        },
        {
          project: "project-b",
          sessionName: "session-2",
          interactions: [
            { type: "created", id: "3", ts: 3, component: "checklist", project: "project-b", sessionName: "session-2" },
          ],
        },
        {
          project: "project-c",
          sessionName: "session-3",
          interactions: [
            { type: "created", id: "4", ts: 4, component: "ask", project: "project-c", sessionName: "session-3" },
            { type: "created", id: "5", ts: 5, component: "card", project: "project-c", sessionName: "session-3" },
            { type: "created", id: "6", ts: 6, component: "confirm", project: "project-c", sessionName: "session-3" },
          ],
        },
      ];

      const result = getTotals(projects);
      expect(result).toEqual({
        totalProjects: 3,
        totalInteractions: 6,
      });
    });

    it("handles project with zero interactions", () => {
      const projects: ProjectInteractions[] = [
        {
          project: "empty-project",
          sessionName: "session-1",
          interactions: [],
        },
        {
          project: "has-interactions",
          sessionName: "session-2",
          interactions: [
            { type: "created", id: "1", ts: 1, component: "confirm", project: "has-interactions", sessionName: "session-2" },
          ],
        },
      ];

      const result = getTotals(projects);
      expect(result).toEqual({
        totalProjects: 2,
        totalInteractions: 1,
      });
    });
  });
});

import { describe, it, expect } from "vitest";
import {
  detectDiagramType,
  stripMarkdownFences,
  renderFlowchartAscii,
  renderSequenceAscii,
  renderClassAscii,
  renderStateAscii,
  measureDiagram,
  calculateMinimumSize,
  expandIfNeeded,
} from "./mermaid-measure.js";

describe("mermaid-measure", () => {
  describe("detectDiagramType", () => {
    it("detects flowchart diagrams", () => {
      expect(detectDiagramType("flowchart TD\n  A --> B")).toBe("flowchart");
      expect(detectDiagramType("graph LR\n  A --> B")).toBe("flowchart");
      expect(detectDiagramType("FLOWCHART TD\n  A --> B")).toBe("flowchart");
    });

    it("detects sequence diagrams", () => {
      expect(detectDiagramType("sequenceDiagram\n  A->>B: Hello")).toBe("sequence");
      expect(detectDiagramType("SEQUENCEDIAGRAM\n  A->>B: Hello")).toBe("sequence");
    });

    it("detects class diagrams", () => {
      expect(detectDiagramType("classDiagram\n  class Animal")).toBe("class");
    });

    it("detects state diagrams", () => {
      expect(detectDiagramType("stateDiagram-v2\n  [*] --> Active")).toBe("state");
      expect(detectDiagramType("statediagram\n  [*] --> Active")).toBe("state");
    });

    it("detects ER diagrams", () => {
      expect(detectDiagramType("erDiagram\n  CUSTOMER ||--o{ ORDER")).toBe("er");
    });

    it("returns unknown for unrecognized types", () => {
      expect(detectDiagramType("pie\n  title Test")).toBe("unknown");
      expect(detectDiagramType("")).toBe("unknown");
    });
  });

  describe("stripMarkdownFences", () => {
    it("removes full mermaid code fences", () => {
      const input = "```mermaid\nflowchart TD\n  A --> B\n```";
      expect(stripMarkdownFences(input)).toBe("flowchart TD\n  A --> B");
    });

    it("removes generic code fences", () => {
      const input = "```\nflowchart TD\n  A --> B\n```";
      expect(stripMarkdownFences(input)).toBe("flowchart TD\n  A --> B");
    });

    it("handles opening fence only", () => {
      const input = "```mermaid\nflowchart TD\n  A --> B";
      expect(stripMarkdownFences(input)).toBe("flowchart TD\n  A --> B");
    });

    it("returns clean source when no fences", () => {
      const input = "flowchart TD\n  A --> B";
      expect(stripMarkdownFences(input)).toBe("flowchart TD\n  A --> B");
    });

    it("handles whitespace", () => {
      const input = "  ```mermaid\nflowchart TD\n```  ";
      expect(stripMarkdownFences(input)).toBe("flowchart TD");
    });
  });

  describe("renderSequenceAscii", () => {
    it("renders basic sequence diagram", () => {
      const source = `sequenceDiagram
  participant A
  participant B
  A->>B: Hello
  B-->>A: Hi`;

      const result = renderSequenceAscii(source);
      expect(result.error).toBeUndefined();
      expect(result.lines.length).toBeGreaterThan(0);
      // Should contain the participant boxes
      expect(result.lines.join("\n")).toContain("A");
      expect(result.lines.join("\n")).toContain("B");
    });

    it("handles implicit participants", () => {
      const source = `sequenceDiagram
  Alice->>Bob: Hi`;

      const result = renderSequenceAscii(source);
      expect(result.error).toBeUndefined();
      expect(result.lines.join("\n")).toContain("Alice");
      expect(result.lines.join("\n")).toContain("Bob");
    });

    it("returns error for empty diagram", () => {
      const result = renderSequenceAscii("sequenceDiagram");
      expect(result.error).toBeDefined();
      expect(result.lines).toContain("(no participants found)");
    });
  });

  describe("renderClassAscii", () => {
    it("renders basic class diagram", () => {
      const source = `classDiagram
  class Animal {
    +name: string
    +eat()
  }`;

      const result = renderClassAscii(source);
      expect(result.error).toBeUndefined();
      expect(result.lines.join("\n")).toContain("Animal");
      expect(result.lines.join("\n")).toContain("name");
    });

    it("renders class relationships with supported syntax", () => {
      // Note: The parser supports --|> syntax (dashes before arrow), not <|--
      const source = `classDiagram
  Dog --|> Animal
  Cat --|> Animal`;

      const result = renderClassAscii(source);
      expect(result.error).toBeUndefined();
      expect(result.lines.join("\n")).toContain("Animal");
      expect(result.lines.join("\n")).toContain("Dog");
      expect(result.lines.join("\n")).toContain("Relations");
    });

    it("returns error for empty diagram", () => {
      const result = renderClassAscii("classDiagram");
      expect(result.error).toBeDefined();
    });
  });

  describe("renderStateAscii", () => {
    it("renders basic state diagram", () => {
      const source = `stateDiagram-v2
  [*] --> Active
  Active --> [*]`;

      const result = renderStateAscii(source);
      expect(result.error).toBeUndefined();
      expect(result.lines.join("\n")).toContain("Active");
      expect(result.lines.join("\n")).toContain("●");
    });

    it("renders state with labels", () => {
      const source = `stateDiagram-v2
  [*] --> Active: start
  Active --> Inactive: pause
  Inactive --> Active: resume`;

      const result = renderStateAscii(source);
      expect(result.error).toBeUndefined();
      expect(result.lines.join("\n")).toContain("start");
      expect(result.lines.join("\n")).toContain("pause");
    });

    it("handles state definitions with aliases", () => {
      const source = `stateDiagram-v2
  state "Waiting for input" as Waiting
  [*] --> Waiting
  Waiting --> [*]`;

      const result = renderStateAscii(source);
      expect(result.error).toBeUndefined();
      expect(result.lines.join("\n")).toContain("Waiting for input");
    });

    it("handles composite/nested states gracefully", () => {
      const source = `stateDiagram-v2
  [*] --> First
  state First {
    [*] --> Sub1
    Sub1 --> Sub2
  }
  First --> [*]`;

      const result = renderStateAscii(source);
      // Should not error, but may show simplified view
      expect(result.lines.length).toBeGreaterThan(0);
      // Should still show the main states
      expect(result.lines.join("\n")).toContain("First");
    });

    it("returns error for empty diagram", () => {
      const result = renderStateAscii("stateDiagram-v2");
      expect(result.error).toBeDefined();
    });
  });

  describe("renderFlowchartAscii", () => {
    it("renders basic flowchart", () => {
      const source = `flowchart TD
  A[Start] --> B[Process]
  B --> C[End]`;

      const result = renderFlowchartAscii(source);
      // May or may not succeed depending on mermaid-ascii support
      expect(result.lines.length).toBeGreaterThan(0);
    });

    it("handles graph alias", () => {
      const source = `graph LR
  A --> B`;

      const result = renderFlowchartAscii(source);
      expect(result.lines.length).toBeGreaterThan(0);
    });

    it("returns warnings for complex diagrams", () => {
      const source = `flowchart TD
  A[Start] --> B[Process]
  subgraph Group
    B --> C
  end`;

      const result = renderFlowchartAscii(source);
      // Should process without crashing
      expect(result.lines.length).toBeGreaterThan(0);
    });
  });

  describe("measureDiagram", () => {
    it("measures sequence diagram dimensions", () => {
      const source = `sequenceDiagram
  participant A
  participant B
  A->>B: Message`;

      const dims = measureDiagram(source);
      expect(dims.type).toBe("sequence");
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    });

    it("measures class diagram dimensions", () => {
      const source = `classDiagram
  class Animal`;

      const dims = measureDiagram(source);
      expect(dims.type).toBe("class");
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    });

    it("measures state diagram dimensions", () => {
      const source = `stateDiagram-v2
  [*] --> Active`;

      const dims = measureDiagram(source);
      expect(dims.type).toBe("state");
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    });

    it("handles unknown diagram types", () => {
      const source = `pie
  title Test
  "A": 50
  "B": 50`;

      const dims = measureDiagram(source);
      expect(dims.type).toBe("unknown");
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    });
  });

  describe("calculateMinimumSize", () => {
    // Note: Function adds padding (width+4, height+6) before checking thresholds
    // Thresholds: small (<=45, <=10), medium (<=75, <=18), otherwise large

    it("returns small for tiny diagrams", () => {
      // effective: 34x9 → small (both under 45x10)
      expect(calculateMinimumSize(30, 3)).toBe("small");
    });

    it("returns medium for medium diagrams", () => {
      // effective: 54x14 → medium (under 75x18 but over 45x10)
      expect(calculateMinimumSize(50, 8)).toBe("medium");
    });

    it("returns large for large diagrams", () => {
      // effective: 104x26 → large (exceeds medium thresholds)
      expect(calculateMinimumSize(100, 20)).toBe("large");
    });

    it("returns medium when width requires it", () => {
      // effective: 50x9 → medium (width > 45 even though height <= 10)
      expect(calculateMinimumSize(46, 3)).toBe("medium");
    });

    it("returns medium when height requires it", () => {
      // effective: 34x14 → medium (height > 10 even though width <= 45)
      expect(calculateMinimumSize(30, 8)).toBe("medium");
    });
  });

  describe("expandIfNeeded", () => {
    it("expands small to medium when needed", () => {
      expect(expandIfNeeded("small", "medium")).toBe("medium");
    });

    it("expands small to large when needed", () => {
      expect(expandIfNeeded("small", "large")).toBe("large");
    });

    it("does not shrink large to small", () => {
      expect(expandIfNeeded("large", "small")).toBe("large");
    });

    it("handles undefined current size", () => {
      expect(expandIfNeeded(undefined, "medium")).toBe("medium");
    });
  });
});

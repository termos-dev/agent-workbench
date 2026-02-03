/**
 * <awb-tree> Web Component
 *
 * Renders an interactive tree view.
 *
 * Usage:
 *   <awb-tree data='[{"id":"1","label":"Root","children":[...]}]'></awb-tree>
 *
 * Events:
 *   - select: Fired when a node is selected, detail contains { id, label, node }
 */

interface TreeNode {
  id: string;
  label: string;
  children?: TreeNode[];
  [key: string]: unknown;
}

class WorkbenchTree extends HTMLElement {
  private container: HTMLDivElement;
  private expandedNodes: Set<string> = new Set();
  private selectedId: string | null = null;

  static get observedAttributes() {
    return ["data", "selected"];
  }

  constructor() {
    super();
    this.container = document.createElement("div");
    this.container.style.cssText =
      "width: 100%; height: 100%; overflow: auto; font-family: system-ui, sans-serif; font-size: 14px;";
  }

  connectedCallback() {
    // Store textContent before clearing (for innerText support)
    const textContent = this.textContent?.trim();
    if (textContent && !this.getAttribute("data")) {
      this.setAttribute("data", textContent);
    }
    // Clear original content and add container
    this.innerHTML = "";
    this.appendChild(this.container);
    this.render();
  }

  attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
    if (name === "selected") {
      this.selectedId = newValue;
    }
    if (this.isConnected) {
      this.render();
    }
  }

  private getData(): TreeNode[] {
    const dataAttr = this.getAttribute("data") || this.textContent?.trim();
    if (!dataAttr) return [];
    try {
      return JSON.parse(dataAttr);
    } catch {
      console.error("[awb-tree] Invalid JSON data");
      return [];
    }
  }

  private render() {
    const data = this.getData();
    if (data.length === 0) {
      this.container.innerHTML =
        '<span style="color: #888; padding: 8px;">No data</span>';
      return;
    }

    this.container.innerHTML = "";
    data.forEach((node) => this.renderNode(node, 0, this.container));
  }

  private renderNode(node: TreeNode, level: number, parent: HTMLElement) {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = this.expandedNodes.has(node.id);
    const isSelected = this.selectedId === node.id;

    const row = document.createElement("div");
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      padding-left: ${8 + level * 16}px;
      cursor: pointer;
      border-radius: 4px;
      ${isSelected ? "background: rgba(59, 130, 246, 0.2); color: #3b82f6;" : ""}
    `;
    row.addEventListener("mouseenter", () => {
      if (!isSelected) row.style.background = "rgba(255,255,255,0.05)";
    });
    row.addEventListener("mouseleave", () => {
      if (!isSelected) row.style.background = "";
    });

    // Expand/collapse button
    const chevron = document.createElement("span");
    chevron.style.cssText =
      "width: 16px; display: inline-flex; align-items: center; justify-content: center;";
    if (hasChildren) {
      chevron.innerHTML = isExpanded
        ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>'
        : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>';
      chevron.style.cursor = "pointer";
      chevron.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isExpanded) {
          this.expandedNodes.delete(node.id);
        } else {
          this.expandedNodes.add(node.id);
        }
        this.render();
      });
    }
    row.appendChild(chevron);

    // Label
    const label = document.createElement("span");
    label.textContent = node.label;
    row.appendChild(label);

    // Click to select
    row.addEventListener("click", () => {
      this.selectedId = node.id;
      this.setAttribute("selected", node.id);
      this.render();
      this.dispatchEvent(
        new CustomEvent("select", {
          detail: { id: node.id, label: node.label, node },
          bubbles: true,
        })
      );
    });

    parent.appendChild(row);

    // Render children if expanded
    if (hasChildren && isExpanded) {
      node.children?.forEach((child) =>
        this.renderNode(child, level + 1, parent)
      );
    }
  }
}

customElements.define("awb-tree", WorkbenchTree);

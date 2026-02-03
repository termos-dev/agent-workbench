/**
 * <awb-json> Web Component
 *
 * Renders JSON data as an expandable tree.
 *
 * Usage:
 *   <awb-json data='{"name":"John","items":[1,2,3]}'></awb-json>
 */

class WorkbenchJson extends HTMLElement {
  private container: HTMLDivElement;
  private expandedPaths: Set<string> = new Set();

  static get observedAttributes() {
    return ["data"];
  }

  constructor() {
    super();
    this.container = document.createElement("div");
    this.container.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: auto;
      padding: 12px;
      font-family: 'SF Mono', monospace;
      font-size: 13px;
      line-height: 1.5;
      color: #c9d1d9;
    `;
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

  attributeChangedCallback() {
    if (this.isConnected) {
      this.render();
    }
  }

  private getData(): unknown {
    const dataAttr = this.getAttribute("data") || this.textContent?.trim();
    if (!dataAttr) return null;
    try {
      return JSON.parse(dataAttr);
    } catch {
      console.error("[awb-json] Invalid JSON data");
      return null;
    }
  }

  private render() {
    const data = this.getData();
    if (data === null) {
      this.container.innerHTML = '<span style="color: #888;">No data</span>';
      return;
    }

    this.container.innerHTML = "";
    this.renderValue(data, "", this.container, 0);
  }

  private renderValue(
    value: unknown,
    path: string,
    parent: HTMLElement,
    indent: number
  ) {
    if (value === null) {
      this.appendPrimitive(parent, "null", "#ff7b72");
    } else if (typeof value === "boolean") {
      this.appendPrimitive(parent, String(value), "#ff7b72");
    } else if (typeof value === "number") {
      this.appendPrimitive(parent, String(value), "#79c0ff");
    } else if (typeof value === "string") {
      this.appendPrimitive(parent, `"${value}"`, "#a5d6ff");
    } else if (Array.isArray(value)) {
      this.renderArray(value, path, parent, indent);
    } else if (typeof value === "object") {
      this.renderObject(value as Record<string, unknown>, path, parent, indent);
    }
  }

  private appendPrimitive(parent: HTMLElement, text: string, color: string) {
    const span = document.createElement("span");
    span.style.color = color;
    span.textContent = text;
    parent.appendChild(span);
  }

  private renderArray(
    arr: unknown[],
    path: string,
    parent: HTMLElement,
    indent: number
  ) {
    if (arr.length === 0) {
      parent.appendChild(document.createTextNode("[]"));
      return;
    }

    const isExpanded = this.expandedPaths.has(path) || indent < 2;
    const toggle = this.createToggle(isExpanded, path);
    parent.appendChild(toggle);

    const bracket = document.createElement("span");
    bracket.textContent = "[";
    parent.appendChild(bracket);

    if (!isExpanded) {
      const preview = document.createElement("span");
      preview.style.color = "#888";
      preview.textContent = `${arr.length} items`;
      parent.appendChild(preview);
      parent.appendChild(document.createTextNode("]"));
      return;
    }

    const content = document.createElement("div");
    content.style.marginLeft = "16px";

    arr.forEach((item, i) => {
      const row = document.createElement("div");
      this.renderValue(item, `${path}[${i}]`, row, indent + 1);
      if (i < arr.length - 1) row.appendChild(document.createTextNode(","));
      content.appendChild(row);
    });

    parent.appendChild(content);

    const closeBracket = document.createElement("div");
    closeBracket.textContent = "]";
    parent.appendChild(closeBracket);
  }

  private renderObject(
    obj: Record<string, unknown>,
    path: string,
    parent: HTMLElement,
    indent: number
  ) {
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      parent.appendChild(document.createTextNode("{}"));
      return;
    }

    const isExpanded = this.expandedPaths.has(path) || indent < 2;
    const toggle = this.createToggle(isExpanded, path);
    parent.appendChild(toggle);

    const bracket = document.createElement("span");
    bracket.textContent = "{";
    parent.appendChild(bracket);

    if (!isExpanded) {
      const preview = document.createElement("span");
      preview.style.color = "#888";
      preview.textContent = `${keys.length} keys`;
      parent.appendChild(preview);
      parent.appendChild(document.createTextNode("}"));
      return;
    }

    const content = document.createElement("div");
    content.style.marginLeft = "16px";

    keys.forEach((key, i) => {
      const row = document.createElement("div");
      const keySpan = document.createElement("span");
      keySpan.style.color = "#7ee787";
      keySpan.textContent = `"${key}"`;
      row.appendChild(keySpan);
      row.appendChild(document.createTextNode(": "));
      this.renderValue(obj[key], `${path}.${key}`, row, indent + 1);
      if (i < keys.length - 1) row.appendChild(document.createTextNode(","));
      content.appendChild(row);
    });

    parent.appendChild(content);

    const closeBracket = document.createElement("div");
    closeBracket.textContent = "}";
    parent.appendChild(closeBracket);
  }

  private createToggle(isExpanded: boolean, path: string): HTMLSpanElement {
    const toggle = document.createElement("span");
    toggle.style.cssText =
      "cursor: pointer; color: #888; margin-right: 4px; user-select: none;";
    toggle.textContent = isExpanded ? "▼" : "▶";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isExpanded) {
        this.expandedPaths.delete(path);
      } else {
        this.expandedPaths.add(path);
      }
      this.render();
    });
    return toggle;
  }
}

customElements.define("awb-json", WorkbenchJson);

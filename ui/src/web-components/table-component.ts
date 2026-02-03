/**
 * <awb-table> Web Component
 *
 * Renders an interactive data table.
 *
 * Usage:
 *   <awb-table
 *     data='[{"name":"John","age":30},{"name":"Jane","age":25}]'
 *     columns='["name","age"]'>
 *   </awb-table>
 *
 * Events:
 *   - row-click: Fired when a row is clicked, detail contains the row data
 */

class WorkbenchTable extends HTMLElement {
  private container: HTMLDivElement;
  private selectedIndex: number | null = null;

  static get observedAttributes() {
    return ["data", "columns"];
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

  attributeChangedCallback() {
    if (this.isConnected) {
      this.render();
    }
  }

  private getData(): Record<string, unknown>[] {
    const dataAttr = this.getAttribute("data") || this.textContent?.trim();
    if (!dataAttr) return [];
    try {
      return JSON.parse(dataAttr);
    } catch {
      console.error("[awb-table] Invalid JSON data");
      return [];
    }
  }

  private getColumns(): string[] | null {
    const columnsAttr = this.getAttribute("columns");
    if (!columnsAttr) return null;
    try {
      return JSON.parse(columnsAttr);
    } catch {
      console.error("[awb-table] Invalid columns JSON");
      return null;
    }
  }

  private render() {
    const data = this.getData();
    if (data.length === 0) {
      this.container.innerHTML =
        '<span style="color: #888; padding: 8px;">No data</span>';
      return;
    }

    const columns = this.getColumns() || Object.keys(data[0] || {});

    const table = document.createElement("table");
    table.style.cssText = "width: 100%; border-collapse: collapse;";

    // Header
    const thead = document.createElement("thead");
    thead.style.cssText = "position: sticky; top: 0; background: #1a1a2e;";
    const headerRow = document.createElement("tr");
    columns.forEach((col) => {
      const th = document.createElement("th");
      th.textContent = col;
      th.style.cssText =
        "padding: 8px 12px; text-align: left; font-weight: 500; border-bottom: 1px solid #333;";
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement("tbody");
    data.forEach((row, index) => {
      const tr = document.createElement("tr");
      const isSelected = this.selectedIndex === index;
      tr.style.cssText = `
        cursor: pointer;
        ${isSelected ? "background: rgba(59, 130, 246, 0.2);" : ""}
      `;
      tr.addEventListener("mouseenter", () => {
        if (!isSelected) tr.style.background = "rgba(255,255,255,0.05)";
      });
      tr.addEventListener("mouseleave", () => {
        if (!isSelected) tr.style.background = "";
      });
      tr.addEventListener("click", () => {
        this.selectedIndex = index;
        this.render();
        this.dispatchEvent(
          new CustomEvent("row-click", {
            detail: row,
            bubbles: true,
          })
        );
      });

      columns.forEach((col) => {
        const td = document.createElement("td");
        td.textContent = String(row[col] ?? "");
        td.style.cssText = "padding: 8px 12px; border-bottom: 1px solid #222;";
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    this.container.innerHTML = "";
    this.container.appendChild(table);
  }
}

customElements.define("awb-table", WorkbenchTable);

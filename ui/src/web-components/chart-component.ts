/**
 * <awb-chart> Web Component
 *
 * Renders simple bar/line charts.
 *
 * Usage:
 *   <awb-chart
 *     type="bar"
 *     data='[{"label":"Jan","value":10},{"label":"Feb","value":20}]'>
 *   </awb-chart>
 */

interface ChartDataPoint {
  label?: string;
  value: number;
}

class WorkbenchChart extends HTMLElement {
  private container: HTMLDivElement;

  static get observedAttributes() {
    return ["type", "data"];
  }

  constructor() {
    super();
    this.container = document.createElement("div");
    this.container.style.cssText =
      "width: 100%; height: 100%; padding: 16px; font-family: system-ui, sans-serif;";
  }

  connectedCallback() {
    this.appendChild(this.container);
    this.render();
  }

  attributeChangedCallback() {
    if (this.isConnected) {
      this.render();
    }
  }

  private getData(): ChartDataPoint[] {
    const dataAttr = this.getAttribute("data");
    if (!dataAttr) return [];
    try {
      const parsed = JSON.parse(dataAttr);
      return parsed.map((item: unknown, i: number) => {
        if (typeof item === "number")
          return { label: `Item ${i + 1}`, value: item };
        if (typeof item === "object" && item) {
          return {
            label: (item as ChartDataPoint).label || `Item ${i + 1}`,
            value: (item as ChartDataPoint).value || 0,
          };
        }
        return { label: `Item ${i + 1}`, value: 0 };
      });
    } catch {
      console.error("[awb-chart] Invalid JSON data");
      return [];
    }
  }

  private render() {
    const type = this.getAttribute("type") || "bar";
    const data = this.getData();

    if (data.length === 0) {
      this.container.innerHTML = '<span style="color: #888;">No data</span>';
      return;
    }

    const maxValue = Math.max(...data.map((d) => d.value));

    if (type === "bar") {
      this.renderBarChart(data, maxValue);
    } else if (type === "line") {
      this.renderLineChart(data, maxValue);
    } else {
      this.renderBarChart(data, maxValue);
    }
  }

  private renderBarChart(data: ChartDataPoint[], maxValue: number) {
    const html = data
      .map((item) => {
        const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
        return `
          <div style="margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
              <span style="color: #a0a0a0;">${item.label}</span>
              <span style="color: #fff;">${item.value}</span>
            </div>
            <div style="height: 8px; background: #333; border-radius: 4px; overflow: hidden;">
              <div style="height: 100%; width: ${percentage}%; background: linear-gradient(90deg, #3b82f6, #60a5fa); transition: width 0.3s;"></div>
            </div>
          </div>
        `;
      })
      .join("");

    this.container.innerHTML = html;
  }

  private renderLineChart(data: ChartDataPoint[], maxValue: number) {
    const width = 400;
    const height = 200;
    const padding = 40;

    const points = data.map((d, i) => {
      const x = padding + (i / (data.length - 1 || 1)) * (width - padding * 2);
      const y =
        height - padding - (d.value / maxValue) * (height - padding * 2);
      return { x, y, ...d };
    });

    const pathD = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");

    const svg = `
      <svg viewBox="0 0 ${width} ${height}" style="width: 100%; max-height: 300px;">
        <!-- Grid lines -->
        ${[0, 0.25, 0.5, 0.75, 1]
          .map((ratio) => {
            const y = height - padding - ratio * (height - padding * 2);
            return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="#333" stroke-dasharray="4"/>`;
          })
          .join("")}

        <!-- Line -->
        <path d="${pathD}" fill="none" stroke="#3b82f6" stroke-width="2"/>

        <!-- Points -->
        ${points.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#3b82f6"/>`).join("")}

        <!-- Labels -->
        ${points
          .map(
            (p) =>
              `<text x="${p.x}" y="${height - 10}" text-anchor="middle" fill="#888" font-size="10">${p.label}</text>`
          )
          .join("")}
      </svg>
    `;

    this.container.innerHTML = svg;
  }
}

customElements.define("awb-chart", WorkbenchChart);

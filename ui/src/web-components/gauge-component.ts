/**
 * <awb-gauge> Web Component
 *
 * Renders a circular gauge/progress indicator.
 *
 * Usage:
 *   <awb-gauge value="75" min="0" max="100" label="CPU Usage"></awb-gauge>
 */

class WorkbenchGauge extends HTMLElement {
  private container: HTMLDivElement;

  static get observedAttributes() {
    return ["value", "min", "max", "label"];
  }

  constructor() {
    super();
    this.container = document.createElement("div");
    this.container.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 16px;
      font-family: system-ui, sans-serif;
    `;
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

  private render() {
    const value = Number.parseFloat(this.getAttribute("value") || "0");
    const min = Number.parseFloat(this.getAttribute("min") || "0");
    const max = Number.parseFloat(this.getAttribute("max") || "100");
    const label = this.getAttribute("label") || "";

    const percentage = Math.max(
      0,
      Math.min(100, ((value - min) / (max - min)) * 100)
    );
    const color = this.getColor(percentage);

    // SVG gauge
    const size = 120;
    const strokeWidth = 10;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    const svg = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <!-- Background circle -->
        <circle
          cx="${size / 2}"
          cy="${size / 2}"
          r="${radius}"
          fill="none"
          stroke="#333"
          stroke-width="${strokeWidth}"
        />
        <!-- Progress arc -->
        <circle
          cx="${size / 2}"
          cy="${size / 2}"
          r="${radius}"
          fill="none"
          stroke="${color}"
          stroke-width="${strokeWidth}"
          stroke-linecap="round"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${offset}"
          transform="rotate(-90 ${size / 2} ${size / 2})"
          style="transition: stroke-dashoffset 0.5s ease-in-out;"
        />
        <!-- Value text -->
        <text
          x="${size / 2}"
          y="${size / 2}"
          text-anchor="middle"
          dominant-baseline="middle"
          fill="#fff"
          font-size="24"
          font-weight="600"
        >${Math.round(value)}</text>
      </svg>
    `;

    this.container.innerHTML = `
      ${svg}
      ${label ? `<div style="margin-top: 12px; color: #888; font-size: 14px;">${label}</div>` : ""}
      <div style="color: #666; font-size: 12px; margin-top: 4px;">${min} - ${max}</div>
    `;
  }

  private getColor(percentage: number): string {
    if (percentage >= 80) return "#22c55e"; // green
    if (percentage >= 60) return "#eab308"; // yellow
    if (percentage >= 40) return "#f97316"; // orange
    return "#ef4444"; // red
  }
}

customElements.define("awb-gauge", WorkbenchGauge);

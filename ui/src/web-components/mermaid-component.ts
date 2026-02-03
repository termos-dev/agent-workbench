/**
 * <awb-mermaid> Web Component
 *
 * Renders mermaid diagrams.
 *
 * Usage:
 *   <awb-mermaid code="graph TD; A-->B"></awb-mermaid>
 *   <awb-mermaid theme="dark">flowchart LR; A-->B</awb-mermaid>
 */

import mermaid from "mermaid";

let mermaidInitialized = false;

function initMermaid(theme = "default") {
  mermaid.initialize({
    startOnLoad: false,
    theme: theme === "dark" ? "dark" : "default",
    securityLevel: "loose",
    fontFamily: "inherit",
  });
  mermaidInitialized = true;
}

class WorkbenchMermaid extends HTMLElement {
  private container: HTMLDivElement;
  private instanceId: string;

  static get observedAttributes() {
    return ["code", "theme"];
  }

  constructor() {
    super();
    // Use truly unique ID to avoid mermaid cache conflicts
    this.instanceId = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.container = document.createElement("div");
    this.container.style.cssText =
      "width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;";
  }

  connectedCallback() {
    // Store textContent before clearing (for innerText support)
    const textContent = this.textContent?.trim();
    if (textContent && !this.getAttribute("code")) {
      this.setAttribute("code", textContent);
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

  private async render() {
    const code = this.getAttribute("code") || "";
    const theme = this.getAttribute("theme") || "default";

    if (!code) {
      this.container.innerHTML =
        '<span style="color: #888; font-size: 14px;">No diagram code provided</span>';
      return;
    }

    // Initialize mermaid with current theme
    if (!mermaidInitialized) {
      initMermaid(theme);
    }

    try {
      // Generate unique ID for each render to avoid cache conflicts
      const renderId = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const { svg } = await mermaid.render(renderId, code);
      this.container.innerHTML = svg;

      // Make SVG responsive
      const svgEl = this.container.querySelector("svg");
      if (svgEl) {
        svgEl.style.maxWidth = "100%";
        svgEl.style.height = "auto";
      }
    } catch (err) {
      console.error("[awb-mermaid] Render error:", err);
      this.container.innerHTML = `<pre style="color: #ef4444; font-size: 12px; white-space: pre-wrap;">Error: ${err}</pre>`;
    }
  }
}

customElements.define("awb-mermaid", WorkbenchMermaid);

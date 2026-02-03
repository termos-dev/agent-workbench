/**
 * <awb-markdown> Web Component
 *
 * Renders markdown content.
 *
 * Usage:
 *   <awb-markdown content="# Hello\n\nThis is **bold**"></awb-markdown>
 *   <awb-markdown># Hello</awb-markdown>
 */

class WorkbenchMarkdown extends HTMLElement {
  private container: HTMLDivElement;

  static get observedAttributes() {
    return ["content"];
  }

  constructor() {
    super();
    this.container = document.createElement("div");
    this.container.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: auto;
      padding: 16px;
      font-family: system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #c9d1d9;
    `;
  }

  connectedCallback() {
    // Store textContent before clearing (for innerText support)
    const textContent = this.textContent?.trim();
    if (textContent && !this.getAttribute("content")) {
      this.setAttribute("content", textContent);
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

  private render() {
    const content = this.getAttribute("content") || "";

    if (!content) {
      this.container.innerHTML = '<span style="color: #888;">No content</span>';
      return;
    }

    this.container.innerHTML = this.parseMarkdown(content);
  }

  private parseMarkdown(md: string): string {
    let html = this.escapeHtml(md);

    // Headers
    html = html.replace(
      /^### (.+)$/gm,
      '<h3 style="font-size: 16px; font-weight: 600; margin: 16px 0 8px;">$1</h3>'
    );
    html = html.replace(
      /^## (.+)$/gm,
      '<h2 style="font-size: 18px; font-weight: 600; margin: 20px 0 10px;">$1</h2>'
    );
    html = html.replace(
      /^# (.+)$/gm,
      '<h1 style="font-size: 22px; font-weight: 600; margin: 24px 0 12px;">$1</h1>'
    );

    // Bold and italic
    html = html.replace(
      /\*\*(.+?)\*\*/g,
      '<strong style="font-weight: 600;">$1</strong>'
    );
    html = html.replace(
      /\*(.+?)\*/g,
      '<em style="font-style: italic;">$1</em>'
    );

    // Inline code
    html = html.replace(
      /`([^`]+)`/g,
      '<code style="background: #21262d; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px;">$1</code>'
    );

    // Code blocks
    html = html.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      '<pre style="background: #0d1117; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 13px; margin: 12px 0;">$2</pre>'
    );

    // Links
    html = html.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" style="color: #58a6ff; text-decoration: none;" target="_blank">$1</a>'
    );

    // Lists
    html = html.replace(
      /^- (.+)$/gm,
      '<li style="margin-left: 20px; margin-bottom: 4px;">$1</li>'
    );
    html = html.replace(
      /^(\d+)\. (.+)$/gm,
      '<li style="margin-left: 20px; margin-bottom: 4px;">$2</li>'
    );

    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p style="margin: 12px 0;">');
    html = `<p style="margin: 12px 0;">${html}</p>`;

    // Line breaks
    html = html.replace(/\n/g, "<br>");

    return html;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
}

customElements.define("awb-markdown", WorkbenchMarkdown);

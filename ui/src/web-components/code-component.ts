/**
 * <awb-code> Web Component
 *
 * Renders syntax-highlighted code.
 *
 * Usage:
 *   <awb-code language="typescript">const x = 1;</awb-code>
 *   <awb-code code="console.log('hi')" language="javascript"></awb-code>
 */

class WorkbenchCode extends HTMLElement {
  private container: HTMLPreElement;

  static get observedAttributes() {
    return ["code", "language", "highlight"];
  }

  constructor() {
    super();
    this.container = document.createElement("pre");
    this.container.style.cssText = `
      width: 100%;
      min-height: 50px;
      overflow: auto;
      margin: 0;
      padding: 12px;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace;
      font-size: 13px;
      line-height: 1.5;
      background: #0d1117;
      color: #c9d1d9;
      border-radius: 6px;
      border: 1px solid #30363d;
      white-space: pre-wrap;
      word-break: break-all;
      box-sizing: border-box;
    `;
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

  private render() {
    const code = this.getAttribute("code") || "";
    const language = this.getAttribute("language") || "text";
    const highlightLine = this.getAttribute("highlight");

    if (!code) {
      this.container.innerHTML =
        '<span style="color: #888;">No code provided</span>';
      return;
    }

    // Simple syntax highlighting
    let highlighted = this.escapeHtml(code);

    // Basic keyword highlighting for common languages
    if (["javascript", "typescript", "js", "ts"].includes(language)) {
      highlighted = this.highlightJS(highlighted);
    } else if (["python", "py"].includes(language)) {
      highlighted = this.highlightPython(highlighted);
    }

    // Line numbers and highlighting
    const lines = highlighted.split("\n");
    const highlightLineNum = highlightLine
      ? Number.parseInt(highlightLine, 10)
      : null;

    const numberedLines = lines.map((line, i) => {
      const lineNum = i + 1;
      const isHighlighted = highlightLineNum === lineNum;
      const bgStyle = isHighlighted
        ? "background: rgba(59, 130, 246, 0.2);"
        : "";
      return `<div style="display: flex; ${bgStyle}">
        <span style="color: #484f58; width: 40px; text-align: right; padding-right: 12px; user-select: none;">${lineNum}</span>
        <span style="flex: 1;">${line || " "}</span>
      </div>`;
    });

    this.container.innerHTML = numberedLines.join("");
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private highlightJS(code: string): string {
    const keywords =
      /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this|null|undefined|true|false)\b/g;
    const strings = /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g;
    const comments = /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm;
    const numbers = /\b(\d+\.?\d*)\b/g;

    return code
      .replace(comments, '<span style="color: #8b949e;">$1</span>')
      .replace(strings, '<span style="color: #a5d6ff;">$&</span>')
      .replace(keywords, '<span style="color: #ff7b72;">$1</span>')
      .replace(numbers, '<span style="color: #79c0ff;">$1</span>');
  }

  private highlightPython(code: string): string {
    const keywords =
      /\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|raise|with|pass|None|True|False|and|or|not|in|is)\b/g;
    const strings = /(["']{3}[\s\S]*?["']{3}|["'])(?:(?!\1)[^\\]|\\.)*\1/g;
    const comments = /(#.*$)/gm;
    const numbers = /\b(\d+\.?\d*)\b/g;

    return code
      .replace(comments, '<span style="color: #8b949e;">$1</span>')
      .replace(strings, '<span style="color: #a5d6ff;">$&</span>')
      .replace(keywords, '<span style="color: #ff7b72;">$1</span>')
      .replace(numbers, '<span style="color: #79c0ff;">$1</span>');
  }
}

customElements.define("awb-code", WorkbenchCode);

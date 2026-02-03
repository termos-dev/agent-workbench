/**
 * Workbench Web Components
 *
 * Standalone web components that can be used in any HTML page.
 * Claude generates HTML that uses these components directly.
 *
 * Usage:
 *   <script src="/components.js"></script>
 *   <awb-mermaid code="graph TD; A-->B"></awb-mermaid>
 *   <awb-tree data='[{"id":"1","label":"Item"}]'></awb-tree>
 */

import "./mermaid-component";
import "./tree-component";
import "./table-component";
import "./code-component";
import "./chart-component";
import "./markdown-component";
import "./json-component";
import "./gauge-component";

// Export version for debugging
(
  window as unknown as { AWB_COMPONENTS_VERSION: string }
).AWB_COMPONENTS_VERSION = "1.0.0";

console.log("[awb] Web components loaded v1.0.0");

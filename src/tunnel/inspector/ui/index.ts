import { inspectorStyles } from "./styles.js";
import { renderInspectorScripts } from "./scripts.js";
import { renderHeader } from "./components/header.js";
import { renderSidebar } from "./components/sidebar.js";
import { renderDetailView } from "./components/detail-view.js";

export * from "./styles.js";
export * from "./scripts.js";
export * from "./components/header.js";
export * from "./components/sidebar.js";
export * from "./components/detail-view.js";

export type RenderUiOptions = {
  port: number;
  publicUrl?: string;
};

export function renderInspectorHtml(options: RenderUiOptions): string {
  const { port, publicUrl = "Initializing..." } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Explita Inspector • Local Traffic Stream</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
${inspectorStyles}
  </style>
</head>
<body>
${renderHeader({ port, publicUrl })}

  <div class="main-layout">
${renderSidebar()}
${renderDetailView()}
  </div>

  <script>
${renderInspectorScripts({ port })}
  </script>
</body>
</html>
`;
}

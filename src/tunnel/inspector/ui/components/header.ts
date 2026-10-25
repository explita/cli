import { PRODUCT_NAME } from "@explita/infra-protocol";

export type HeaderOptions = {
  port: number;
  publicUrl: string;
};

export function renderHeader(options: HeaderOptions): string {
  const { port, publicUrl } = options;
  return `
  <header class="app-header">
    <div class="brand-wrap">
      <div class="brand">
        <div class="brand-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </div>
        <span class="brand-title">${PRODUCT_NAME.tunnel}</span>
        <span class="brand-tag">Inspector</span>
      </div>
    </div>

    <div class="meta-bar">
      <div class="meta-item meta-listening" title="Local server target">
        <span class="live-pulse"></span>
        <span class="meta-label">Local:</span>
        <span class="meta-val">:${port}</span>
      </div>
      <div class="meta-item meta-public" title="Public tunnel URL">
        <span class="meta-label">Public:</span>
        <a href="${publicUrl}" target="_blank" rel="noopener noreferrer" class="meta-val meta-link" id="meta-public-url">${publicUrl}</a>
        <button type="button" class="btn-icon" id="copy-public-btn" onclick="copyPublicUrl()" title="Copy public URL">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
      <button type="button" class="btn btn-clear" onclick="clearRequests()" title="Clear recorded requests">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        <span>Clear</span>
      </button>
    </div>
  </header>
  `;
}

export function renderDetailView(): string {
  return `
    <main class="detail-view" id="detail-view-container">
      <div class="empty-state" id="empty-state-view">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
          <polyline points="13 2 13 9 20 9"></polyline>
        </svg>
        <p>No traffic recorded yet.<br>Send requests or webhooks to your public tunnel URL to inspect them live.</p>
      </div>

      <div id="active-detail-view" class="active-detail-view" style="display: none;">
        <div class="detail-header">
          <div class="detail-headline">
            <button type="button" class="btn-icon mobile-back-btn" onclick="backToList()" title="Back to request list">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            <span class="method-badge" id="d-method">GET</span>
            <span class="status-pill" id="d-status">200 OK</span>
            <span class="req-duration" id="d-duration">12ms</span>
            <span class="detail-url" id="d-url">/</span>
          </div>

          <div class="detail-actions">
            <button type="button" class="btn btn-copy" id="copy-curl-btn" onclick="copyAsCurl()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy cURL</span>
            </button>
            <button type="button" class="btn btn-primary btn-replay" id="replay-btn" onclick="replayActiveRequest()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>⚡ Replay</span>
            </button>
          </div>
        </div>

        <nav class="tabs-bar">
          <button type="button" class="tab-btn active" id="tab-btn-req" onclick="selectTab('request')">Request</button>
          <button type="button" class="tab-btn" id="tab-btn-res" onclick="selectTab('response')">Response</button>
        </nav>

        <div class="tab-content" id="tab-panel-req">
          <div class="section-title">Headers</div>
          <div class="table-responsive">
            <table class="key-val-table" id="req-headers-table"></table>
          </div>

          <div class="section-title" id="query-title" style="display: none;">Query Parameters</div>
          <div class="table-responsive" id="query-table-wrap" style="display: none;">
            <table class="key-val-table" id="query-params-table"></table>
          </div>

          <div class="section-title">Payload Body</div>
          <div id="req-image-preview" style="display: none;"></div>
          <pre class="code-box" id="req-body-box">(empty)</pre>
        </div>

        <div class="tab-content" id="tab-panel-res" style="display: none;">
          <div class="section-title">Response Headers</div>
          <div class="table-responsive">
            <table class="key-val-table" id="res-headers-table"></table>
          </div>

          <div class="section-title">Response Body</div>
          <div id="res-image-preview" style="display: none;"></div>
          <pre class="code-box" id="res-body-box">(empty)</pre>
        </div>
      </div>
    </main>
  `;
}

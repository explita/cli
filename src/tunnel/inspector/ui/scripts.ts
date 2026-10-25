export type ScriptOptions = {
  port: number;
};

export function renderInspectorScripts(options: ScriptOptions): string {
  const { port } = options;

  return `
    let requests = [];
    let selectedId = null;
    let activeTab = 'request';
    let filterQuery = '';

    async function fetchRequests() {
      try {
        const res = await fetch('/api/requests');
        if (res.ok) {
          requests = await res.json();
          renderList();
          if (!selectedId && requests.length > 0) {
            selectRequest(requests[0].id);
          } else if (selectedId) {
            const current = requests.find(r => r.id === selectedId);
            if (current) renderDetails(current);
          }
        }
      } catch (err) {
        console.error('Fetch error:', err);
      }
    }

    function renderList() {
      const container = document.getElementById('req-list-container');
      const filtered = requests.filter(r => {
        if (!filterQuery) return true;
        const q = filterQuery.toLowerCase();
        return r.method.toLowerCase().includes(q) || r.path.toLowerCase().includes(q);
      });

      if (filtered.length === 0) {
        container.innerHTML = '<li style="padding: 24px 16px; text-align: center; color: var(--text-dim); font-size: 0.85rem;">No matching requests</li>';
        return;
      }

      container.innerHTML = filtered.map(r => {
        const isActive = r.id === selectedId;
        const statusClass = r.status ? (r.status >= 500 ? 'status-5xx' : r.status >= 400 ? 'status-4xx' : r.status >= 300 ? 'status-3xx' : 'status-2xx') : '';
        const statusText = r.status ? String(r.status) : '...';
        const durText = r.duration != null ? r.duration + 'ms' : '';
        const replayBadge = r.isReplay ? '<span class="replay-tag">REPLAY</span>' : '';

        return \`
          <li class="req-item \${isActive ? 'active' : ''}" onclick="selectRequest('\${r.id}')">
            <div class="req-left">
              <span class="method-badge method-\${r.method}">\${r.method}</span>
              <span class="req-path" title="\${escapeHtml(r.path)}">\${escapeHtml(r.path)}</span>
            </div>
            <div class="req-right">
              \${replayBadge}
              <span class="status-pill \${statusClass}">\${statusText}</span>
              <span class="req-duration">\${durText}</span>
            </div>
          </li>
        \`;
      }).join('');
    }

    function selectRequest(id) {
      selectedId = id;
      renderList();
      const req = requests.find(r => r.id === id);
      if (req) {
        renderDetails(req);
        const layout = document.querySelector('.main-layout');
        if (layout) layout.classList.add('detail-open');
      }
    }

    function backToList() {
      const layout = document.querySelector('.main-layout');
      if (layout) layout.classList.remove('detail-open');
    }

    function copyPublicUrl() {
      const urlElem = document.getElementById('meta-public-url');
      if (!urlElem) return;
      const url = urlElem.textContent?.trim() || '';
      if (!url || url === 'Initializing...' || url === 'Connecting...') return;
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('copy-public-btn');
        if (!btn) return;
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        setTimeout(() => { btn.innerHTML = origHtml; }, 1800);
      });
    }

    function renderDetails(r) {
      document.getElementById('empty-state-view').style.display = 'none';
      const detailContainer = document.getElementById('active-detail-view');
      detailContainer.style.display = 'flex';

      const methodBadge = document.getElementById('d-method');
      methodBadge.textContent = r.method;
      methodBadge.className = 'method-badge method-' + r.method;

      const statusPill = document.getElementById('d-status');
      const statusClass = r.status ? (r.status >= 500 ? 'status-5xx' : r.status >= 400 ? 'status-4xx' : r.status >= 300 ? 'status-3xx' : 'status-2xx') : '';
      statusPill.className = 'status-pill ' + statusClass;
      statusPill.textContent = r.status ? r.status + ' ' + (r.error ? '(' + r.error + ')' : '') : 'Pending...';

      document.getElementById('d-duration').textContent = r.duration != null ? r.duration + 'ms' : '';
      document.getElementById('d-url').textContent = r.path;

      // Headers table
      const reqHeadersTable = document.getElementById('req-headers-table');
      reqHeadersTable.innerHTML = Object.entries(r.headers || {}).map(([k, v]) => \`
        <tr>
          <td class="key-col">\${escapeHtml(k)}</td>
          <td class="val-col">\${escapeHtml(v)}</td>
        </tr>
      \`).join('') || '<tr><td colspan="2" style="color: var(--text-dim);">(none)</td></tr>';

      // Query params
      const qIdx = r.path.indexOf('?');
      const queryTable = document.getElementById('query-params-table');
      const queryWrap = document.getElementById('query-table-wrap');
      const queryTitle = document.getElementById('query-title');
      if (qIdx !== -1) {
        queryTitle.style.display = 'block';
        if (queryWrap) queryWrap.style.display = 'block';
        queryTable.style.display = 'table';
        const searchParams = new URLSearchParams(r.path.slice(qIdx + 1));
        queryTable.innerHTML = Array.from(searchParams.entries()).map(([k, v]) => \`
          <tr>
            <td class="key-col">\${escapeHtml(k)}</td>
            <td class="val-col">\${escapeHtml(v)}</td>
          </tr>
        \`).join('') || '<tr><td colspan="2" style="color: var(--text-dim);">(none)</td></tr>';
      } else {
        queryTitle.style.display = 'none';
        if (queryWrap) queryWrap.style.display = 'none';
        queryTable.style.display = 'none';
      }

      // Render Image Preview if content-type is image/*
      function renderImagePreview(previewId, boxId, headers, body, isBinary) {
        const preview = document.getElementById(previewId);
        const box = document.getElementById(boxId);
        const ctypeEntry = Object.entries(headers || {}).find(([k]) => k.toLowerCase() === 'content-type');
        const ctype = ctypeEntry ? ctypeEntry[1].toLowerCase() : '';

        if (ctype.includes('image/') && body) {
          preview.style.display = 'block';
          const cleanMime = ctype.split(';')[0].trim();
          let src = '';
          if (cleanMime.includes('svg')) {
            src = isBinary
              ? 'data:image/svg+xml;base64,' + body
              : 'data:image/svg+xml;utf8,' + encodeURIComponent(body);
          } else {
            src = 'data:' + cleanMime + ';base64,' + body;
          }

          const approxBytes = isBinary ? Math.round(body.length * 0.75) : new Blob([body]).size;
          const formattedSize = approxBytes > 1024 ? (approxBytes / 1024).toFixed(1) + ' KB' : approxBytes + ' B';

          preview.innerHTML = \`
            <div class="image-preview-card">
              <div class="image-preview-checkerboard">
                <img src="\${src}" alt="Image Preview" class="image-preview-img" onerror="this.parentElement.innerHTML='<span style=\\\\'color:var(--text-dim);font-size:0.82rem;\\\\'>Unable to decode image preview</span>'" />
              </div>
              <div class="image-preview-footer">
                <span><strong>Format:</strong> \${escapeHtml(cleanMime)}</span>
                <span><strong>Size:</strong> \${formattedSize}</span>
              </div>
            </div>
          \`;
          if (isBinary) {
            box.textContent = '[Binary Image Data: ' + cleanMime + ' (' + formattedSize + ')]';
          }
        } else {
          preview.style.display = 'none';
          preview.innerHTML = '';
        }
      }

      // Request body
      const reqBodyBox = document.getElementById('req-body-box');
      if (r.body) {
        try {
          const parsed = JSON.parse(r.body);
          reqBodyBox.textContent = JSON.stringify(parsed, null, 2);
        } catch {
          reqBodyBox.textContent = r.body;
        }
      } else {
        reqBodyBox.textContent = '(empty payload)';
      }
      renderImagePreview('req-image-preview', 'req-body-box', r.headers, r.body, r.isBinary);

      // Response headers
      const resHeadersTable = document.getElementById('res-headers-table');
      resHeadersTable.innerHTML = Object.entries(r.responseHeaders || {}).map(([k, v]) => \`
        <tr>
          <td class="key-col">\${escapeHtml(k)}</td>
          <td class="val-col">\${escapeHtml(v)}</td>
        </tr>
      \`).join('') || '<tr><td colspan="2" style="color: var(--text-dim);">(none)</td></tr>';

      // Response body
      const resBodyBox = document.getElementById('res-body-box');
      if (r.responseBody) {
        try {
          const parsed = JSON.parse(r.responseBody);
          resBodyBox.textContent = JSON.stringify(parsed, null, 2);
        } catch {
          resBodyBox.textContent = r.responseBody;
        }
      } else if (r.error) {
        resBodyBox.textContent = 'Error: ' + r.error;
      } else {
        resBodyBox.textContent = '(empty response)';
      }
      renderImagePreview('res-image-preview', 'res-body-box', r.responseHeaders, r.responseBody, r.isResponseBinary);
    }

    function selectTab(tab) {
      activeTab = tab;
      document.getElementById('tab-btn-req').classList.toggle('active', tab === 'request');
      document.getElementById('tab-btn-res').classList.toggle('active', tab === 'response');
      document.getElementById('tab-panel-req').style.display = tab === 'request' ? 'block' : 'none';
      document.getElementById('tab-panel-res').style.display = tab === 'response' ? 'block' : 'none';
    }

    function filterRequests(val) {
      filterQuery = val;
      renderList();
    }

    async function replayActiveRequest() {
      if (!selectedId) return;
      const btn = document.getElementById('replay-btn');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span>Replaying...</span>';
      try {
        const res = await fetch(\`/api/requests/\${selectedId}/replay\`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          await fetchRequests();
          if (data.recordedId) {
            selectRequest(data.recordedId);
          }
        }
      } catch (err) {
        alert('Replay failed: ' + err.message);
      } finally {
        btn.innerHTML = originalText;
      }
    }

    function copyAsCurl() {
      const r = requests.find(item => item.id === selectedId);
      if (!r) return;
      const headers = Object.entries(r.headers || {})
        .filter(([k]) => !['host', 'content-length'].includes(k.toLowerCase()))
        .map(([k, v]) => \`-H "\${k}: \${v}"\`)
        .join(' ');
      const bodyPart = r.body ? \`--data '\${r.body.replace(/'/g, "'\\\\''")}'\` : '';
      const cmd = \`curl -i -X \${r.method} "http://localhost:${port}\${r.path}" \${headers} \${bodyPart}\`.trim();
      navigator.clipboard.writeText(cmd).then(() => {
        const btn = document.getElementById('copy-curl-btn');
        const span = btn.querySelector('span');
        const orig = span.textContent;
        span.textContent = 'Copied!';
        setTimeout(() => span.textContent = orig, 1800);
      });
    }

    async function clearRequests() {
      await fetch('/api/clear', { method: 'POST' });
      requests = [];
      selectedId = null;
      renderList();
      backToList();
      document.getElementById('active-detail-view').style.display = 'none';
      document.getElementById('empty-state-view').style.display = 'flex';
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Connect to live SSE stream
    function initEventSource() {
      const es = new EventSource('/api/events');
      es.onmessage = () => {
        fetchRequests();
      };
      es.onerror = () => {
        es.close();
        setTimeout(initEventSource, 3000);
      };
    }

    fetchRequests();
    initEventSource();
  `;
}

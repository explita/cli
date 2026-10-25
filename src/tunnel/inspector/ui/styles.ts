export const inspectorStyles = `
    :root {
      --bg: #090d16;
      --surface: #0f172a;
      --surface-hover: #1e293b;
      --surface-active: #334155;
      --border: rgba(255, 255, 255, 0.08);
      --border-focus: #38bdf8;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --accent: #38bdf8;
      --accent-glow: rgba(56, 189, 248, 0.15);
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    header, .app-header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
      flex-wrap: wrap;
      min-height: 56px;
    }

    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      font-size: 1.1rem;
      letter-spacing: -0.02em;
    }

    .brand-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      flex-shrink: 0;
    }

    .brand-title {
      white-space: nowrap;
    }

    .brand-tag {
      font-size: 0.68rem;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.25);
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }

    .meta-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.82rem;
      color: var(--text-muted);
      flex-wrap: wrap;
      margin-left: auto;
    }

    .meta-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: var(--radius-sm);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.04);
      max-width: 100%;
    }

    .meta-label {
      font-size: 0.75rem;
      color: var(--text-dim);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .meta-val {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text);
      font-weight: 500;
      font-size: 0.82rem;
    }

    .meta-link {
      color: var(--accent);
      text-decoration: none;
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: inline-block;
      vertical-align: middle;
      transition: color 0.15s ease;
    }

    .meta-link:hover {
      text-decoration: underline;
      color: #7dd3fc;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 11px;
      border-radius: var(--radius-sm);
      font-size: 0.8rem;
      font-weight: 600;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none;
      white-space: nowrap;
      user-select: none;
    }

    .btn-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.15s ease;
      padding: 0;
      flex-shrink: 0;
    }

    .btn-icon:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }

    .mobile-back-btn {
      display: none;
      margin-right: 2px;
    }

    .main-layout {
      flex: 1;
      display: grid;
      grid-template-columns: 380px 1fr;
      overflow: hidden;
      position: relative;
    }

    .active-detail-view {
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-width: 0;
    }

    .table-responsive {
      width: 100%;
      overflow-x: auto;
      margin-bottom: 24px;
      -webkit-overflow-scrolling: touch;
    }

    .table-responsive .key-val-table {
      margin-bottom: 0;
    }

    @media (max-width: 900px) {
      header, .app-header {
        padding: 8px 12px;
        gap: 8px;
      }

      .brand {
        font-size: 1rem;
      }

      .meta-bar {
        width: 100%;
        margin-left: 0;
        justify-content: flex-start;
        gap: 6px;
      }

      .meta-link {
        max-width: 180px;
      }

      .main-layout {
        grid-template-columns: 1fr;
      }

      .main-layout.detail-open .sidebar {
        display: none;
      }

      .main-layout.detail-open .detail-view {
        display: flex;
      }

      .main-layout:not(.detail-open) .detail-view {
        display: none;
      }

      .mobile-back-btn {
        display: inline-flex;
      }

      .detail-header {
        padding: 10px 14px;
        gap: 10px;
      }

      .tabs-bar {
        padding: 0 14px;
        gap: 16px;
      }

      .tab-content {
        padding: 16px 14px;
      }
    }

    @media (max-width: 600px) {
      .detail-header {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
      }

      .detail-headline {
        min-width: 0;
        width: 100%;
      }

      .detail-actions {
        width: 100%;
        justify-content: flex-end;
        gap: 8px;
      }

      .detail-actions .btn {
        flex: 1;
        justify-content: center;
      }

      .key-col {
        width: 130px;
        font-size: 0.76rem;
      }

      .val-col {
        font-size: 0.76rem;
      }
    }

    @media (max-width: 480px) {
      .brand-title {
        font-size: 0.95rem;
      }

      .brand-tag {
        display: none;
      }

      .meta-listening {
        display: none;
      }

      .meta-link {
        max-width: 150px;
      }

      .detail-headline {
        flex-wrap: wrap;
      }

      .detail-url {
        width: 100%;
        margin-top: 2px;
      }

      .key-val-table tr {
        display: flex;
        flex-direction: column;
        padding: 6px 0;
      }

      .key-val-table td {
        padding: 2px 4px;
      }

      .key-col {
        width: 100%;
      }

      .code-box {
        padding: 10px 12px;
        font-size: 0.76rem;
      }
    }

    .sidebar {
      background: var(--surface);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .search-input {
      width: 100%;
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 6px 12px;
      color: #fff;
      font-size: 0.82rem;
      font-family: inherit;
      outline: none;
      transition: border 0.15s ease;
    }

    .search-input:focus {
      border-color: var(--accent);
    }

    .req-list {
      flex: 1;
      overflow-y: auto;
      list-style: none;
    }

    .req-item {
      padding: 11px 16px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      transition: background 0.1s ease;
    }

    .req-item:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    .req-item.active {
      background: rgba(56, 189, 248, 0.08);
      border-left: 3px solid var(--accent);
    }

    .req-left {
      display: flex;
      align-items: center;
      gap: 10px;
      overflow: hidden;
      flex: 1;
    }

    .method-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.68rem;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
      flex-shrink: 0;
    }

    .method-GET { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
    .method-POST { background: rgba(16, 185, 129, 0.15); color: #10b981; }
    .method-PUT { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
    .method-DELETE { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
    .method-PATCH { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
    .method-HEAD, .method-OPTIONS { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }

    .req-path {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #e2e8f0;
    }

    .req-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .status-pill {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 4px;
    }

    .status-2xx { color: #10b981; }
    .status-3xx { color: #38bdf8; }
    .status-4xx { color: #f59e0b; }
    .status-5xx { color: #ef4444; }

    .req-duration {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      color: var(--text-dim);
    }

    .replay-tag {
      font-size: 0.65rem;
      font-weight: 600;
      color: #a855f7;
      background: rgba(168, 85, 247, 0.12);
      border-radius: 3px;
      padding: 1px 4px;
    }

    .detail-view {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg);
    }

    .detail-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      background: var(--surface);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .detail-headline {
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
      flex: 1;
      min-width: 200px;
    }

    .detail-url {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
      font-weight: 600;
      color: #fff;
      word-break: break-all;
    }

    .detail-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .tabs-bar {
      display: flex;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0 24px;
      gap: 20px;
      flex-shrink: 0;
    }

    .tab-btn {
      padding: 12px 4px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .tab-btn:hover {
      color: #fff;
    }

    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    .tab-content {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    .section-title {
      font-family: 'Outfit', sans-serif;
      font-size: 0.82rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-dim);
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .key-val-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
    }

    .key-val-table tr {
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }

    .key-val-table td {
      padding: 8px 12px;
      vertical-align: top;
    }

    .key-col {
      width: 220px;
      color: var(--accent);
      font-weight: 600;
    }

    .val-col {
      color: #cbd5e1;
      word-break: break-all;
    }

    .code-box {
      background: #020617;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.82rem;
      color: #e2e8f0;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }

    .image-preview-card {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
      background: #020617;
      margin-bottom: 16px;
    }

    .image-preview-checkerboard {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      min-height: 160px;
      max-height: 380px;
      background-color: #0b0f19;
      background-image:
        linear-gradient(45deg, #141c2e 25%, transparent 25%),
        linear-gradient(-45deg, #141c2e 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #141c2e 75%),
        linear-gradient(-45deg, transparent 75%, #141c2e 75%);
      background-size: 16px 16px;
      background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
      overflow: hidden;
    }

    .image-preview-img {
      max-width: 100%;
      max-height: 340px;
      object-fit: contain;
      border-radius: 4px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    }

    .image-preview-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      background: rgba(15, 23, 42, 0.8);
      border-top: 1px solid var(--border);
      font-size: 0.78rem;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
    }

    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: var(--text-dim);
      padding: 40px;
      text-align: center;
    }

    .live-pulse {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 10px #10b981;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.3); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }
`;

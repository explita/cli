export function renderSidebar(): string {
  return `
    <aside class="sidebar">
      <div class="sidebar-header">
        <input type="text" id="search-box" class="search-input" placeholder="Filter requests by path or method..." oninput="filterRequests(this.value)">
      </div>
      <ul class="req-list" id="req-list-container">
        <!-- Rendered via JS -->
      </ul>
    </aside>
  `;
}

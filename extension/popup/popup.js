/**
 * Popup 弹窗逻辑
 */
(async function () {
  'use strict';

  // ===== DOM 元素 =====
  const hostnameEl = document.getElementById('hostname');
  const statusBadge = document.getElementById('statusBadge');
  const removedCountEl = document.getElementById('removedCount');
  const cachedCountEl = document.getElementById('cachedCount');
  const totalBlockedEl = document.getElementById('totalBlocked');
  const blacklistContent = document.getElementById('blacklistContent');
  const allStatsContent = document.getElementById('allStatsContent');
  const btnRescan = document.getElementById('btnRescan');
  const btnToggleDomain = document.getElementById('btnToggleDomain');
  const btnClearDomain = document.getElementById('btnClearDomain');
  const btnClearAll = document.getElementById('btnClearAll');

  let currentHostname = '';
  let isEnabled = false;

  // ===== 初始化 =====
  async function init() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || !tab.url) return;

    const url = new URL(tab.url);
    currentHostname = url.hostname;
    hostnameEl.textContent = currentHostname;

    // 检查是否已禁用（默认启用）
    const result = await chrome.storage.local.get(
      `disabled_${currentHostname}`,
    );
    isEnabled = !result[`disabled_${currentHostname}`];
    updateEnableUI();

    // 获取当前页面的统计数据
    loadPageStats(tab.id);
    loadBlacklist(currentHostname);
    loadAllStats();
  }

  // ===== 加载当前页面统计 =====
  async function loadPageStats(tabId) {
    try {
      // 从 content script 获取实时数据
      const response = await chrome.tabs.sendMessage(tabId, {
        action: 'getStats',
      });
      removedCountEl.textContent = response.pageStats?.removed || '0';
      cachedCountEl.textContent = response.pageStats?.cached || '0';
    } catch (e) {
      // content script 可能未加载
      removedCountEl.textContent = '—';
      cachedCountEl.textContent = '—';
    }

    // 从 storage 获取历史累计
    const stats = await StorageManager.getStats();
    const domainStats = stats[currentHostname];
    totalBlockedEl.textContent = domainStats
      ? String(domainStats.totalHits)
      : '0';
  }

  // ===== 加载黑名单选择器列表 =====
  async function loadBlacklist(hostname) {
    const data = await StorageManager.getBlacklist(hostname);
    const entries = Object.entries(data.selectors);

    if (entries.length === 0) {
      blacklistContent.innerHTML =
        '<p class="empty-hint">暂无缓存数据，浏览网页后自动积累</p>';
      return;
    }

    // 按命中次数排序
    entries.sort((a, b) => b[1].count - a[1].count);

    blacklistContent.innerHTML = entries
      .slice(0, 50) // 最多显示50条
      .map(
        ([selector, info]) => `
        <div class="selector-item">
          <span class="selector-text" title="${escapeHtml(selector)}">${escapeHtml(selector)}</span>
          <span class="selector-count">×${info.count}</span>
        </div>
      `,
      )
      .join('');
  }

  // ===== 加载全部域名统计 =====
  async function loadAllStats() {
    const stats = await StorageManager.getStats();
    const domains = Object.entries(stats);

    if (domains.length === 0) {
      allStatsContent.innerHTML = '<p class="empty-hint">暂无统计数据</p>';
      return;
    }

    domains.sort((a, b) => b[1].totalHits - a[1].totalHits);

    allStatsContent.innerHTML = domains
      .slice(0, 30)
      .map(
        ([domain, info]) => `
        <div class="domain-stat-item">
          <span class="domain-name" title="${escapeHtml(domain)}">${escapeHtml(domain)}</span>
          <span class="domain-hits">${info.totalHits} 次拦截</span>
        </div>
      `,
      )
      .join('');
  }

  // ===== 更新启用/禁用 UI =====
  function updateEnableUI() {
    if (isEnabled) {
      statusBadge.textContent = '运行中';
      statusBadge.className = 'badge badge-active';
      btnToggleDomain.textContent = '⏸️ 在此网站禁用';
      document.querySelector('.popup-container').classList.remove('paused');
    } else {
      statusBadge.textContent = '未启动';
      statusBadge.className = 'badge badge-paused';
      btnToggleDomain.textContent = '▶️ 在此网站启用';
      document.querySelector('.popup-container').classList.add('paused');
    }
  }

  // ===== 重新扫描 =====
  btnRescan.addEventListener('click', async () => {
    btnRescan.textContent = '⏳ 扫描中...';
    btnRescan.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'rescan',
      });
      removedCountEl.textContent = response.removed || '0';
    } catch (e) {
      removedCountEl.textContent = '错误';
    }

    btnRescan.textContent = '🔄 重新扫描';
    btnRescan.disabled = false;

    // 刷新数据
    loadPageStats(
      (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id,
    );
    loadBlacklist(currentHostname);
    loadAllStats();
  });

  // ===== 启用/禁用此网站 =====
  btnToggleDomain.addEventListener('click', async () => {
    isEnabled = !isEnabled;
    if (isEnabled) {
      await chrome.storage.local.remove(`disabled_${currentHostname}`);
    } else {
      await chrome.storage.local.set({
        [`disabled_${currentHostname}`]: true,
      });
    }
    updateEnableUI();

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    chrome.tabs.sendMessage(tab.id, {
      action: isEnabled ? 'enable' : 'disable',
    });

    if (tab.id) {
      chrome.tabs.reload(tab.id);
    }
    window.close();
  });

  // ===== 清空当前域名缓存 =====
  btnClearDomain.addEventListener('click', async () => {
    if (!confirm(`确定要清空 ${currentHostname} 的所有黑名单缓存吗？`)) return;

    await StorageManager.removeBlacklist(currentHostname);
    blacklistContent.innerHTML = '<p class="empty-hint">缓存已清空</p>';
    totalBlockedEl.textContent = '0';
    loadAllStats();
  });

  // ===== 清空全部缓存 =====
  btnClearAll.addEventListener('click', async () => {
    if (!confirm('确定要清空所有网站的广告拦截缓存吗？此操作不可恢复。'))
      return;

    await StorageManager.clearAll();
    blacklistContent.innerHTML = '<p class="empty-hint">缓存已清空</p>';
    allStatsContent.innerHTML = '<p class="empty-hint">暂无统计数据</p>';
    totalBlockedEl.textContent = '0';
  });

  // ===== HTML 转义 =====
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===== 启动 =====
  init();
})();

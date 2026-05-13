/**
 * Background Service Worker
 * 负责：右键菜单、图标角标更新、跨页面通信
 */

// ===== 安装/更新时初始化 =====
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[广告拦截助手] 插件已安装/更新');

  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'report-ad',
    title: '手动标记为广告并拦截',
    contexts: ['link', 'image', 'video', 'frame'],
  });

  chrome.contextMenus.create({
    id: 'toggle-domain',
    title: '在此网站启用/禁用拦截',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: 'clear-domain-cache',
    title: '清空此网站的黑名单缓存',
    contexts: ['page'],
  });
});

// ===== 右键菜单点击处理 =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'contextMenuReport') {
    handleManualReport(message, sender);
    sendResponse({ success: true });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  const url = new URL(tab.url);
  const hostname = url.hostname;

  switch (info.menuItemId) {
    case 'report-ad':
      // 手动标记广告
      await handleManualReportFromContext(info, tab);
      break;

    case 'toggle-domain':
      // 暂停/恢复拦截
      await toggleDomain(hostname, tab);
      break;

    case 'clear-domain-cache':
      // 清空缓存
      await StorageManager.removeBlacklist(hostname);
      chrome.action.setBadgeText({ tabId: tab.id, text: '' });
      chrome.tabs.reload(tab.id);
      break;
  }
});

/**
 * 处理手动标记广告
 */
async function handleManualReportFromContext(info, tab) {
  try {
    const hostname = new URL(tab.url).hostname;

    // 构建选择器
    let selector = '';
    if (info.linkUrl) {
      // 用户右键了一个链接
      selector = `a[href="${info.linkUrl}"]`;
    }

    if (selector) {
      await StorageManager.addSelector(hostname, selector);
    }

    // 通知 content script 重新扫描
    chrome.tabs.sendMessage(tab.id, { action: 'rescan' });

    // 更新角标
    const stats = await StorageManager.getStats();
    const domainStats = stats[hostname];
    if (domainStats) {
      chrome.action.setBadgeText({
        tabId: tab.id,
        text: String(domainStats.totalHits),
      });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    }
  } catch (e) {
    console.error('[广告拦截助手] 手动标记失败:', e);
  }
}

async function handleManualReport(message, sender) {
  // 来自 content script 的标记请求
  const hostname = new URL(sender.tab.url).hostname;
  if (message.selector) {
    await StorageManager.addSelector(hostname, message.selector);
  }
}

/**
 * 启用/禁用对某域名的拦截
 */
async function toggleDomain(hostname, tab) {
  const key = `disabled_${hostname}`;
  const result = await chrome.storage.local.get(key);
  const disabled = !result[key]; // toggle

  if (disabled) {
    await chrome.storage.local.set({ [key]: true });
  } else {
    await chrome.storage.local.remove(key);
  }

  chrome.action.setBadgeText({
    tabId: tab.id,
    text: disabled ? 'OFF' : '',
  });
  chrome.action.setBadgeBackgroundColor({
    color: disabled ? '#FF5722' : '#4CAF50',
  });

  chrome.tabs.sendMessage(tab.id, {
    action: disabled ? 'disable' : 'enable',
  });

  chrome.tabs.reload(tab.id);
}

// ===== 监听标签页更新，更新角标 =====
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    tab.url &&
    tab.url.startsWith('http')
  ) {
    try {
      const hostname = new URL(tab.url).hostname;

      // 检查是否已禁用（默认启用）
      const result = await chrome.storage.local.get(`disabled_${hostname}`);
      if (result[`disabled_${hostname}`]) {
        chrome.action.setBadgeText({ tabId, text: 'OFF' });
        chrome.action.setBadgeBackgroundColor({ color: '#FF5722' });
        return;
      }

      // 显示缓存的拦截数量
      const stats = await StorageManager.getStats();
      const domainStats = stats[hostname];
      if (domainStats && domainStats.totalHits > 0) {
        chrome.action.setBadgeText({
          tabId,
          text: String(domainStats.totalHits),
        });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
      } else {
        chrome.action.setBadgeText({ tabId, text: '' });
      }
    } catch (e) {
      // 忽略无效 URL
    }
  }
});

// ===== 定期清理低置信度缓存（可选优化） =====
// 每24小时清理一次 count=1 且超过7天未更新的选择器
setInterval(
  async () => {
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith('blacklist_')) continue;

      let modified = false;
      const data = value;
      for (const [selector, info] of Object.entries(data.selectors || {})) {
        if (info.count <= 1 && now - info.lastSeen > SEVEN_DAYS) {
          delete data.selectors[selector];
          modified = true;
        }
      }

      if (modified) {
        data.lastUpdated = now;
        await chrome.storage.local.set({ [key]: data });
      }
    }
  },
  24 * 60 * 60 * 1000,
);

console.log('[广告拦截助手] Background Service Worker 已启动');

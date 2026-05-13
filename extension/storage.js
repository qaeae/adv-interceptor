/**
 * 存储管理模块
 * 负责本地黑名单缓存的读写操作
 */

const StorageManager = {
  /**
   * 获取当前域名的黑名单选择器
   * @param {string} hostname - 域名
   * @returns {Promise<object>} { selectors: { [selector]: { count, lastSeen } }, patterns: string[] }
   */
  async getBlacklist(hostname) {
    const key = `blacklist_${hostname}`;
    const result = await chrome.storage.local.get(key);
    return result[key] || { selectors: {}, patterns: [], lastUpdated: 0 };
  },

  /**
   * 更新黑名单：添加或更新一个选择器的命中计数
   * @param {string} hostname - 域名
   * @param {string} selector - CSS 选择器
   */
  async addSelector(hostname, selector) {
    const key = `blacklist_${hostname}`;
    const data = await this.getBlacklist(hostname);

    if (data.selectors[selector]) {
      data.selectors[selector].count += 1;
      data.selectors[selector].lastSeen = Date.now();
    } else {
      data.selectors[selector] = { count: 1, lastSeen: Date.now() };
    }

    data.lastUpdated = Date.now();
    await chrome.storage.local.set({ [key]: data });
  },

  /**
   * 批量添加选择器
   */
  async addSelectors(hostname, selectorList) {
    const key = `blacklist_${hostname}`;
    const data = await this.getBlacklist(hostname);

    for (const selector of selectorList) {
      if (data.selectors[selector]) {
        data.selectors[selector].count += 1;
        data.selectors[selector].lastSeen = Date.now();
      } else {
        data.selectors[selector] = { count: 1, lastSeen: Date.now() };
      }
    }

    data.lastUpdated = Date.now();
    await chrome.storage.local.set({ [key]: data });
  },

  /**
   * 获取指定域名中置信度高的选择器（count >= threshold）
   */
  async getHighConfidenceSelectors(hostname, threshold = 2) {
    const data = await this.getBlacklist(hostname);
    return Object.entries(data.selectors)
      .filter(([, info]) => info.count >= threshold)
      .map(([selector]) => selector);
  },

  /**
   * 获取所有已缓存的域名列表
   */
  async getCachedDomains() {
    const all = await chrome.storage.local.get(null);
    return Object.keys(all)
      .filter((k) => k.startsWith('blacklist_'))
      .map((k) => k.replace('blacklist_', ''));
  },

  /**
   * 获取所有黑名单统计信息（给 popup 展示）
   */
  async getStats() {
    const all = await chrome.storage.local.get(null);
    const stats = {};
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith('blacklist_')) {
        const domain = key.replace('blacklist_', '');
        const selectorCount = Object.keys(value.selectors || {}).length;
        const totalHits = Object.values(value.selectors || {}).reduce(
          (sum, info) => sum + (info.count || 0),
          0,
        );
        stats[domain] = {
          selectorCount,
          totalHits,
          lastUpdated: value.lastUpdated,
        };
      }
    }
    return stats;
  },

  /**
   * 删除指定域名的黑名单
   */
  async removeBlacklist(hostname) {
    await chrome.storage.local.remove(`blacklist_${hostname}`);
  },

  /**
   * 清空所有黑名单
   */
  async clearAll() {
    const all = await chrome.storage.local.get(null);
    const keys = Object.keys(all).filter((k) => k.startsWith('blacklist_'));
    if (keys.length > 0) {
      await chrome.storage.local.remove(keys);
    }
  },

  /**
   * 添加自定义域匹配模式
   */
  async addPattern(hostname, pattern) {
    const key = `blacklist_${hostname}`;
    const data = await this.getBlacklist(hostname);
    if (!data.patterns.includes(pattern)) {
      data.patterns.push(pattern);
      data.lastUpdated = Date.now();
      await chrome.storage.local.set({ [key]: data });
    }
  },
};

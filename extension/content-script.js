/**
 * Content Script — 核心执行逻辑
 * 负责：页面加载时检测广告 + SPA路由变化时重新检测 + 移除广告元素
 */

(function () {
  'use strict';

  try {
    console.log('[广告拦截助手] 内容脚本已加载');

    const hostname = window.location.hostname;
    const DEBOUNCE_MS = 300;
    let removeTimer = null;
    let processedCount = 0;
    let pageStats = { detected: 0, removed: 0, cached: 0 };
    let isPaused = false; // 默认启用，用户可手动禁用

    /**
     * 检查文本是否为纯广告描述（如"广告"、"赞助"等标签文字）
     * 这类文本不应阻止元素被识别为广告容器
     * @param {string} text - 文本内容
     * @returns {boolean}
     */
    function isAdOnlyText(text) {
      const trimmed = text.trim();
      if (!trimmed) return true; // 空白 → 无害

      // 广告关键词列表（中/英）
      const AD_KEYWORDS = [
        '广告',
        '赞助',
        '推广',
        '促销',
        '推荐',
        'AD',
        '活动',
        'Ad',
        'ad',
        'sponsored',
        'Sponsored',
        'SPONSORED',
        'advertisement',
        'Advertisement',
        'promoted',
        'Promoted',
        'promo',
        'Promo',
      ];

      // 短文本且全由广告关键词组成 → 广告标签
      if (trimmed.length <= 30) {
        const hasAdWord = AD_KEYWORDS.some((kw) => trimmed.includes(kw));
        if (hasAdWord) return true;
      }

      return false;
    }

    /**
     * 判断兄弟节点是否为"纯渲染"元素（不处理数据，仅布局/展示）
     * @param {HTMLElement} sibling - 兄弟元素
     * @returns {boolean}
     */
    function isPureSibling(sibling) {
      const tag = sibling.tagName;
      // 语义化标签 → 有实际功能
      const FUNCTIONAL_TAGS = new Set([
        'BUTTON',
        'INPUT',
        'SELECT',
        'TEXTAREA',
        'FORM',
        'NAV',
        'HEADER',
        'FOOTER',
        'MAIN',
        'ARTICLE',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
        'TABLE',
        'VIDEO',
        'AUDIO',
        'CANVAS',
        'IFRAME',
      ]);
      if (FUNCTIONAL_TAGS.has(tag)) return false;

      // 广告相关 id/class → 视作纯渲染，跳过属性检查
      const cls = (sibling.className || '').toString().toLowerCase();
      const id = (sibling.id || '').toLowerCase();
      const isAdRelated =
        cls.includes('ad-') ||
        cls.includes('_ad') ||
        cls.includes('advert') ||
        cls.includes('adv') ||
        cls.includes('sponsor') ||
        cls.includes('promo') ||
        cls.includes('banner') ||
        cls.includes('guanggao') ||
        cls.includes('advertising') ||
        id.includes('ad-') ||
        id.includes('_ad') ||
        id.includes('adv') ||
        id.includes('google_ads') ||
        id.includes('taboola');

      if (!isAdRelated) {
        if (sibling.id && sibling.id.trim()) return false;
        if (sibling.hasAttribute('role')) return false;
      }

      // 有可见文本 → 可能是数据（广告标签文字除外）
      const text = (sibling.textContent || '').trim();
      if (text && !isAdOnlyText(text)) return false;

      // 递归检查子节点：允许嵌套容器/图片/链接，但不能有数据
      return hasOnlyDecorativeChildren(sibling);
    }

    /**
     * 检查元素是否仅包含装饰性子节点（无数据内容）
     */
    function hasOnlyDecorativeChildren(el) {
      const children = Array.from(el.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.textContent.trim() && !isAdOnlyText(child.textContent))
            return false;
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;

        const cTag = child.tagName;
        // 允许的纯展示元素
        if (['IMG', 'PICTURE', 'SVG', 'BR', 'HR'].includes(cTag)) continue;
        // A/SPAN/DIV/LI 递归检查
        if (['A', 'SPAN', 'DIV', 'LI', 'UL', 'OL'].includes(cTag)) {
          if (!hasOnlyDecorativeChildren(child)) return false;
          continue;
        }
        // 其他元素视为有功能
        return false;
      }
      return true;
    }

    /**
     * 检查元素是否为空壳（无子元素或仅含空白文本）
     */
    function isEmptyShell(el) {
      const children = Array.from(el.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent.trim())
          return false;
        if (child.nodeType === Node.COMMENT_NODE) continue;
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName;
          // 不可见元素 + 广告脚本 → 跳过
          if (
            tag === 'BR' ||
            tag === 'HR' ||
            tag === 'SCRIPT' ||
            tag === 'STYLE'
          )
            continue;
          // 递归：空容器也视为空
          if (['DIV', 'SPAN', 'P', 'LI'].includes(tag) && isEmptyShell(child))
            continue;
          return false;
        }
      }
      return true;
    }

    /**
     * 检查容器内是否混有功能性/有用内容（不应随广告一起被移除）
     * 移除广告元素后，如果仅剩广告标签文字 → 无有用信息 → 不是混合容器
     */
    function hasFunctionalContent(container, adElementSet) {
      // 容器自身是明确广告浮层/弹窗 → 直接视为无有用内容，整体删除
      const containerCls = (container.className || '').toString().toLowerCase();
      if (
        containerCls.includes('popup') ||
        containerCls.includes('modal-ad') ||
        containerCls.includes('overlay-ad') ||
        containerCls.includes('floating-ad') ||
        containerCls.includes('banner-ad') ||
        containerCls.includes('ad-pop') ||
        containerCls.includes('ad-float')
      ) {
        return false;
      }

      // 不含 A：广告链接也是 <a>，需单独判断
      const FUNCTIONAL_TAGS = new Set([
        'BUTTON',
        'INPUT',
        'SELECT',
        'TEXTAREA',
        'FORM',
        'NAV',
        'HEADER',
        'FOOTER',
        'MAIN',
        'ARTICLE',
      ]);
      let hasUsefulContent = false;

      const children = Array.from(container.children);
      for (const child of children) {
        if (adElementSet.has(child)) continue;

        // 功能性标签 → 有用
        if (FUNCTIONAL_TAGS.has(child.tagName)) {
          hasUsefulContent = true;
          break;
        }

        // <a> 标签特殊处理：站内链接 → 有用；外部链接 → 广告，跳过
        if (child.tagName === 'A') {
          const href = (child.getAttribute('href') || '').trim();
          if (
            !href ||
            href.startsWith('/') ||
            href.startsWith('#') ||
            href.startsWith('?') ||
            href.startsWith('javascript:')
          ) {
            hasUsefulContent = true;
            break;
          }
          // 外部链接 → 广告链接，继续检查其他子元素
        }

        // 检查文本内容：是否为非广告的有意义文本
        const text = (child.textContent || '').trim();
        if (text && !isAdOnlyText(text)) {
          hasUsefulContent = true;
          break;
        }

        // 包含非广告图片（无外部/中转链接的 img）→ 有用内容
        const imgs = child.querySelectorAll('img');
        for (const img of imgs) {
          const parentLink = img.closest('a[href]');
          if (!parentLink) {
            hasUsefulContent = true;
            break;
          }
          const href = (parentLink.getAttribute('href') || '').trim();
          // 中转跳转（/jump_to/xxx）→ 广告图片，跳过
          if (RulesEngine._isRedirectToExternal(href)) continue;
          if (
            href.startsWith('/') ||
            href.startsWith('#') ||
            href.startsWith('?')
          ) {
            hasUsefulContent = true;
            break;
          }
        }
        if (hasUsefulContent) break;
      }

      return hasUsefulContent;
    }

    /**
     * 仅移除容器内的广告子元素，保留容器和功能性元素
     */
    function removeAdChildrenOnly(
      container,
      adElementSet,
      removedSet,
      removed,
    ) {
      // 递归收集所有在 adElementSet 中的后代元素（从深层到浅层）
      const toRemove = [];
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_ELEMENT,
        null,
        false,
      );
      const nodes = [];
      let node;
      while ((node = walker.nextNode())) {
        if (
          node !== container &&
          adElementSet.has(node) &&
          !removedSet.has(node)
        ) {
          nodes.push(node);
        }
      }
      // 反向遍历（深层优先），防止移除父节点后子节点丢失
      for (let i = nodes.length - 1; i >= 0; i--) {
        const child = nodes[i];
        try {
          if (child.parentNode) {
            const tag = child.tagName;
            const cls =
              typeof child.className === 'string'
                ? child.className.substring(0, 60)
                : '';
            removed.push({ tag, cls });
            removedSet.add(child);
            child.remove();
            processedCount++;
          }
        } catch (e) {
          /* ignore */
        }
      }
    }

    /**
     * 清理混合容器中的广告文字标签（如"广告"、"赞助"等描述文字）
     * 保留容器和功能性元素，仅移除广告文本节点及其纯装饰父元素
     */
    function cleanAdTextFromContainer(container) {
      const toRemove = [];
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null,
        false,
      );
      let textNode;
      while ((textNode = walker.nextNode())) {
        if (
          !textNode.parentElement ||
          !document.contains(textNode.parentElement)
        )
          continue;
        const text = textNode.textContent.trim();
        if (!text) continue;
        if (isAdOnlyText(text)) {
          const parent = textNode.parentElement;
          if (
            parent &&
            parent.childNodes.length === 1 &&
            parent.tagName !== 'A' &&
            parent.tagName !== 'BUTTON' &&
            !parent.id &&
            !parent.hasAttribute('role')
          ) {
            toRemove.push(parent);
          } else {
            toRemove.push(textNode);
          }
        }
      }
      for (const node of toRemove) {
        try {
          if (node.parentNode) node.remove();
          processedCount++;
        } catch (e) {
          /* ignore */
        }
      }
      return toRemove.length;
    }

    /**
     * 横向扩展：检查同级兄弟节点，找到整个广告块的共同父容器
     * 1. 检查兄弟节点是否都是纯渲染 → 找到共同父元素
     * 2. 如果父元素也是纯容器 → 返回父元素作为移除目标
     * @param {HTMLElement} el - 已识别的广告元素
     * @param {WeakSet} adElementSet - 所有已识别广告元素的集合
     * @returns {HTMLElement} - 应移除的目标元素
     */
    function expandToAdBlock(el, adElementSet) {
      const parent = el.parentElement;
      if (
        !parent ||
        parent === document.body ||
        parent === document.documentElement
      ) {
        return el;
      }

      const siblings = Array.from(parent.children);
      if (siblings.length <= 1) return el; // 没有兄弟，无需横向扩展

      // 统计纯渲染兄弟的数量
      let pureCount = 0;
      const pureSiblings = [];

      for (const sib of siblings) {
        if (sib === el) {
          pureCount++;
          pureSiblings.push(sib);
          continue;
        }
        // 兄弟已被识别为广告 → 算作纯渲染
        if (adElementSet && adElementSet.has(sib)) {
          pureCount++;
          pureSiblings.push(sib);
          continue;
        }
        // 兄弟是纯渲染（无数据、仅布局）
        if (isPureSibling(sib)) {
          pureCount++;
          pureSiblings.push(sib);
        }
      }

      // 如果大部分兄弟都是纯渲染 → 整个父容器大概率是广告容器
      const ratio = pureCount / siblings.length;
      if (ratio >= 0.5 && pureCount >= 2) {
        // 标记所有纯渲染兄弟为广告（用于后续统一移除）
        if (adElementSet) {
          for (const sib of pureSiblings) {
            adElementSet.add(sib);
          }
        }
        // 返回父容器：后续由 findRemovalTarget 继续向上收缩
        return parent;
      }

      return el;
    }

    /**
     * 向上收缩：找到应该被移除的最顶层"纯容器"父元素
     * 每一层都先尝试横向扩展，再纵向收缩 — 消除广告容器残留
     * @param {HTMLElement} el - 已识别为广告的元素
     * @param {WeakSet} adElementSet - 所有已识别广告元素的集合
     * @returns {HTMLElement} - 应该被移除的最顶层元素
     */
    function findRemovalTarget(el, adElementSet) {
      const MAX_LEVELS = 8;
      let target = el;
      let current = el;
      console.log(`[诊断] findRemovalTarget 起点: <${el.tagName}>`);

      for (let i = 0; i < MAX_LEVELS; i++) {
        const parent = current.parentElement;
        if (
          !parent ||
          parent === document.body ||
          parent === document.documentElement
        )
          break;

        const isPure = isPureContainer(parent, current);
        console.log(
          `[诊断]   层级${i}: parent=<${parent.tagName}${parent.className ? '.' + parent.className : ''}> isPure=${isPure}`,
        );

        if (isPure) {
          target = parent;
          current = parent;
        } else {
          const expanded = expandToAdBlock(current, adElementSet);
          if (expanded !== current && expanded !== target) {
            console.log(
              `[诊断]   横向扩展: ${current.tagName} → ${expanded.tagName}`,
            );
            target = expanded;
            current = expanded;
          } else {
            console.log(`[诊断]   停止: isPure=false, 横向扩展失败`);
            break;
          }
        }
      }

      console.log(
        `[诊断] 最终 target: <${target.tagName}${target.className ? '.' + target.className : ''}>`,
      );
      return target;
    }

    /**
     * 判断一个元素是否为"纯渲染容器"（无实际功能，仅用于布局/包裹）
     * @param {HTMLElement} container - 待判断的容器
     * @param {HTMLElement} excludeChild - 要被排除的子元素（即广告本身）
     * @returns {boolean}
     */
    function isPureContainer(container, excludeChild) {
      const tag = container.tagName;

      // 语义化 / 交互元素 → 不是纯容器，停止向上
      // 注意：A 不在列表中，因为广告链接的外壳就是 <a>，应被收缩移除
      const SEMANTIC_TAGS = new Set([
        'BUTTON',
        'INPUT',
        'SELECT',
        'TEXTAREA',
        'FORM',
        'NAV',
        'HEADER',
        'FOOTER',
        'MAIN',
        'ARTICLE',
        'ASIDE',
        'SECTION',
        'DETAILS',
        'SUMMARY',
        'FIGURE',
        'FIGCAPTION',
        'TABLE',
        'THEAD',
        'TBODY',
        'TFOOT',
        'TR',
        'TH',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
        'UL',
        'OL',
        'DL',
        'VIDEO',
        'AUDIO',
        'CANVAS',
      ]);
      if (SEMANTIC_TAGS.has(tag)) return false;

      // 容器自身的 class/id 是否带广告标识
      const containerCls = (container.className || '').toString().toLowerCase();
      const containerId = (container.id || '').toLowerCase();
      const isAdRelated =
        containerCls.includes('ad-') ||
        containerCls.includes('_ad') ||
        containerCls.includes('advert') ||
        containerCls.includes('adv') ||
        containerCls.includes('sponsor') ||
        containerCls.includes('promo') ||
        containerCls.includes('banner') ||
        containerCls.includes('guanggao') ||
        containerCls.includes('advertising') ||
        containerId.includes('ad-') ||
        containerId.includes('_ad') ||
        containerId.includes('adv') ||
        containerId.includes('google_ads') ||
        containerId.includes('taboola');

      // 有 id → 可能被 CSS/JS 引用，不是纯容器（除非 id 本身就是广告标识）
      if (container.id && container.id.trim() && !isAdRelated) return false;

      // 有 role 属性 → 有语义意义（广告容器除外）
      if (container.hasAttribute('role') && !isAdRelated) return false;

      // 有 aria-* 属性 → 无障碍语义（广告容器除外）
      if (!isAdRelated) {
        const attrs = container.attributes;
        for (const attr of attrs) {
          if (attr.name.startsWith('aria-')) return false;
        }
      }

      // 检查：排除广告子元素后，容器是否还有"有意义"的内容
      const children = Array.from(container.childNodes);
      for (const child of children) {
        if (child === excludeChild) continue;

        // 文本节点：非广告标签文字 → 有意义
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.textContent.trim() && !isAdOnlyText(child.textContent))
            return false;
        }

        // 元素节点
        if (child.nodeType === Node.ELEMENT_NODE) {
          const childTag = child.tagName;
          // 不可见/无布局影响元素 → 忽略
          if (
            childTag === 'BR' ||
            childTag === 'SCRIPT' ||
            childTag === 'STYLE'
          )
            continue;
          // 如果还有其他有意义的元素子节点 → 容器有实际内容
          return false;
        }

        // 注释节点 → 忽略
        if (child.nodeType === Node.COMMENT_NODE) continue;
      }

      // 排除广告后，容器只剩空白 → 是纯容器
      return true;
    }

    /**
     * 核心函数：扫描并移除广告
     */
    async function scanAndRemove() {
      // 暂停状态下跳过
      if (isPaused) return 0;

      // 1. 先用缓存的高置信度选择器快速拦截
      const cachedSelectors = await StorageManager.getHighConfidenceSelectors(
        hostname,
        1,
      );
      let adElements = [];

      if (cachedSelectors.length > 0) {
        const cachedResults = RulesEngine.applyCachedSelectors(cachedSelectors);
        adElements = adElements.concat(cachedResults);
        pageStats.cached = cachedResults.length;
      }

      // 2. 再用通用规则进行深度扫描
      const detected = RulesEngine.detectAdElements();
      pageStats.detected = detected.length;

      console.log(
        `[广告拦截助手] 扫描完成 — 缓存命中: ${pageStats.cached}, 新检测: ${pageStats.detected}`,
      );

      // 诊断：列出所有检测到的元素
      if (detected.length > 0) {
        const samples = detected
          .slice(0, 10)
          .map(
            (d) =>
              `<${d.element.tagName}> selector="${d.selector?.substring(0, 40)}" priority=${d.priority}`,
          );
        console.log(`[诊断] 检测元素样本:`, samples);
      }

      for (const item of detected) {
        if (!adElements.includes(item.element)) {
          adElements.push(item.element);
        }
      }

      // 3. 横向扩展 + 向上收缩后移除广告容器
      const removedSet = new WeakSet();
      const removed = [];

      // 构建 adElementSet 供横向扩展时识别兄弟广告
      const adElementSet = new WeakSet();
      for (const el of adElements) {
        adElementSet.add(el);
      }

      for (const el of adElements) {
        try {
          // 横向扩展 + 纵向收缩：找到整个广告块的最顶层纯容器
          const target = findRemovalTarget(el, adElementSet);
          if (!target || !target.parentNode) {
            console.log(
              `[诊断] 跳过: target=${target && target.tagName} parentNode=${target && !!target.parentNode}`,
            );
            continue;
          }
          if (removedSet.has(target)) continue;

          // 检查 target 内是否混有功能性元素
          const hasFunc = hasFunctionalContent(target, adElementSet);
          console.log(
            `[诊断] target=<${target.tagName}${target.className ? '.' + target.className : ''}> hasFunctional=${hasFunc} el=<${el.tagName}>`,
          );

          if (hasFunc) {
            // 混合容器：清理广告文字 + 移除广告子元素
            cleanAdTextFromContainer(target);
            removeAdChildrenOnly(target, adElementSet, removedSet, removed);
            // 清理后如果容器变空壳 → 直接删除
            if (isEmptyShell(target) && !removedSet.has(target)) {
              removed.push({
                tag: target.tagName,
                cls: (target.className || '').substring(0, 60),
              });
              removedSet.add(target);
              target.remove();
              processedCount++;
            }
            continue;
          }

          const parent = target.parentElement;

          const tag = target.tagName;
          const cls =
            typeof target.className === 'string'
              ? target.className.substring(0, 60)
              : '';
          removed.push({ tag, cls });
          removedSet.add(target);

          target.remove();
          processedCount++;

          // 清理父容器中残留的广告文字标签
          if (parent && document.contains(parent)) {
            cleanAdTextFromContainer(parent);
            // 清理后如果父容器变空壳 → 一并删除
            if (isEmptyShell(parent) && !removedSet.has(parent)) {
              removed.push({
                tag: parent.tagName,
                cls: (parent.className || '').substring(0, 60),
              });
              removedSet.add(parent);
              parent.remove();
              processedCount++;
            }
          }
        } catch (e) {
          // 元素可能已被移除
        }
      }

      pageStats.removed = removed.length;

      // 4. 将新检测到的选择器保存到黑名单缓存
      if (detected.length > 0) {
        const newSelectors = RulesEngine.extractSelectorsFromResults(detected);
        if (newSelectors.length > 0) {
          await StorageManager.addSelectors(hostname, newSelectors);
        }
      }

      // 5. 打印拦截统计（开发调试用，可注释掉）
      if (processedCount > 0) {
        console.log(
          `[广告拦截助手] ${hostname} — 本次移除 ${removed.length} 个广告 ` +
            `(缓存命中: ${pageStats.cached}, 新检测: ${pageStats.detected}, 累计: ${processedCount})`,
        );
      }

      return adElements.length;
    }

    /**
     * 带防抖的扫描（避免短时间内重复执行）
     */
    function debouncedScan() {
      clearTimeout(removeTimer);
      removeTimer = setTimeout(scanAndRemove, DEBOUNCE_MS);
    }

    /**
     * 监听 DOM 变化（处理延迟加载的广告）
     */
    function observeDOM() {
      const observer = new MutationObserver((mutations) => {
        // 只关注新增节点
        let hasNewNodes = false;
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            hasNewNodes = true;
            break;
          }
        }
        if (hasNewNodes) {
          debouncedScan();
        }
      });

      // 等 body 出现后再开始监听
      const startObserving = () => {
        if (document.body) {
          observer.observe(document.body, {
            childList: true,
            subtree: true,
          });
          // 初始扫描
          scanAndRemove();
        } else {
          requestAnimationFrame(startObserving);
        }
      };
      startObserving();
    }

    /**
     * SPA 路由变化监听
     * 拦截 history.pushState / replaceState，监听 popstate / hashchange
     */
    function interceptSPARouting() {
      // 包装 history.pushState
      const originalPushState = history.pushState;
      history.pushState = function (...args) {
        originalPushState.apply(this, args);
        onRouteChange('pushState');
      };

      // 包装 history.replaceState
      const originalReplaceState = history.replaceState;
      history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        onRouteChange('replaceState');
      };

      // 监听 popstate（浏览器前进/后退）
      window.addEventListener('popstate', () => onRouteChange('popstate'));

      // 监听 hashchange
      window.addEventListener('hashchange', () => onRouteChange('hashchange'));
    }

    /**
     * 路由变化时的处理
     */
    let lastUrl = window.location.href;
    function onRouteChange(source) {
      const currentUrl = window.location.href;
      if (currentUrl === lastUrl) return;
      lastUrl = currentUrl;

      console.log(`[广告拦截助手] 路由变化 (${source}): ${currentUrl}`);

      // 等待新内容渲染后扫描（给SPA框架一点时间）
      setTimeout(() => {
        scanAndRemove();
      }, 500);

      // 再等更长时间做二次扫描（有些广告加载较慢）
      setTimeout(() => {
        scanAndRemove();
      }, 2000);
    }

    /**
     * 监听来自 popup 的消息
     */
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'getStats':
          sendResponse({
            hostname,
            processedCount,
            pageStats,
          });
          break;

        case 'rescan':
          scanAndRemove().then((count) => {
            sendResponse({ removed: count });
          });
          return true; // 保持消息通道开启

        case 'showRemoved':
          // 高亮显示已移除的区域（用于调试）
          sendResponse({ hostname, processedCount });
          break;

        case 'disable':
          isPaused = true;
          chrome.storage.local.set({ [`disabled_${hostname}`]: true });
          console.log(`[广告拦截助手] ${hostname} — 已禁用`);
          sendResponse({ enabled: false });
          break;

        case 'enable':
          isPaused = false;
          chrome.storage.local.remove(`disabled_${hostname}`);
          console.log(`[广告拦截助手] ${hostname} — 已启用`);
          scanAndRemove();
          sendResponse({ enabled: true });
          break;

        default:
          sendResponse({ error: 'Unknown action' });
      }
    });

    /**
     * 拦截外部跳转：阻止通过链接或重定向离开当前站点
     * 所有指向站外的链接点击将被拦截，用户停留在当前页面
     */
    function interceptExternalRedirects() {
      const origin =
        RulesEngine._siteOrigin || window.location.origin.toLowerCase();

      // 拦截 <a> 标签点击（捕获阶段，优先处理）
      document.addEventListener(
        'click',
        (e) => {
          const link = e.target.closest('a[href]');
          if (!link) return;

          const href = (link.getAttribute('href') || '').trim();
          if (!href) return;

          // 站内中转跳转（/jump?url=外部地址）→ 拦截
          if (RulesEngine._isRedirectToExternal(href)) {
            e.preventDefault();
            e.stopPropagation();
            console.log(
              `[广告拦截助手] 已拦截中转跳转: ${href.substring(0, 100)}`,
            );
            return;
          }

          // 站内跳转放行
          if (href.startsWith('/')) return;
          if (href.startsWith('#')) return;
          if (href.startsWith('?')) return;
          if (href.startsWith('javascript:')) return;
          if (href.toLowerCase().startsWith(origin)) return;

          // 解析完整 URL
          try {
            const url = new URL(href, window.location.origin);
            if (url.origin.toLowerCase() === origin) return;
          } catch (e) {
            return;
          }

          // 外部跳转 → 拦截
          e.preventDefault();
          e.stopPropagation();
          console.log(
            `[广告拦截助手] 已拦截外部跳转: ${href.substring(0, 100)}`,
          );
        },
        true, // 捕获阶段
      );
    }

    /**
     * 启动
     */
    async function init() {
      RulesEngine.initSite();

      // 检查用户是否手动禁用了此网站（默认启用）
      const result = await chrome.storage.local.get(`disabled_${hostname}`);
      if (result[`disabled_${hostname}`]) {
        isPaused = true;
        console.log(`[广告拦截助手] 已禁用 — ${hostname}`);
        return;
      }

      console.log(`[广告拦截助手] 已启动 — ${hostname}`);
      interceptSPARouting();
      interceptExternalRedirects();
      observeDOM();
    }

    // 当 DOM 准备好后启动
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } catch (e) {
    console.error('[广告拦截助手] 脚本异常崩溃:', e);
  }
})();

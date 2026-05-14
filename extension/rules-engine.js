/**
 * 规则引擎模块
 * 负责：广告检测规则定义 + 选择器提取 + SPA路由监听
 */

const RulesEngine = {
  /**
   * 通用广告检测规则（第一道防线）
   * 按优先级从高到低排列
   */
  GENERIC_RULES: [
    // ===== 最高置信度：data 属性明确标识 =====
    { selector: '[data-ad]', type: 'data', priority: 100 },
    { selector: '[data-advertisement]', type: 'data', priority: 100 },
    { selector: '[data-ad-client]', type: 'data', priority: 100 },
    { selector: '[data-google-query-id]', type: 'data', priority: 100 },
    { selector: '[data-ad-slot]', type: 'data', priority: 100 },
    { selector: '[data-native_ad]', type: 'data', priority: 100 },
    // ===== class 广告关键词 → 需外链验证 =====
    { selector: '[class*="ad-"]', type: 'class-ext', priority: 85 },
    { selector: '[class*="-ad-"]', type: 'class-ext', priority: 85 },
    { selector: '[class*="_ad"]', type: 'class-ext', priority: 85 },
    { selector: '[class*="_ad_"]', type: 'class-ext', priority: 85 },
    { selector: '[class~="ad"]', type: 'class-ext', priority: 80 },
    { selector: '[class~="ads"]', type: 'class-ext', priority: 80 },
    { selector: '[class*="advert"]', type: 'class-ext', priority: 85 },
    { selector: '[class*="sponsored"]', type: 'class-ext', priority: 85 },
    { selector: '[class*="promoted"]', type: 'class-ext', priority: 80 },
    // ===== 中文广告 class → 需外链验证 =====
    { selector: '[class*="guanggao"]', type: 'class-ext', priority: 80 },
    { selector: '[class~="gg"]', type: 'class-ext', priority: 55 },
    { selector: '[class*="advertising"]', type: 'class-ext', priority: 80 },
    { selector: '[aria-label*="广告"]', type: 'aria', priority: 90 },
    { selector: '[aria-label*="赞助"]', type: 'aria', priority: 90 },
    { selector: '[aria-label*="推广"]', type: 'aria', priority: 90 },
    { selector: '[aria-label*="Ad"]', type: 'aria', priority: 85 },
    // ===== 广告 iframe =====
    { selector: 'iframe[src*="doubleclick"]', type: 'iframe', priority: 100 },
    {
      selector: 'iframe[src*="googlesyndication"]',
      type: 'iframe',
      priority: 100,
    },
    { selector: 'iframe[src*="ad."]', type: 'iframe', priority: 90 },
    { selector: 'iframe[id*="google_ads"]', type: 'iframe', priority: 100 },
    { selector: 'iframe[src*="ads."]', type: 'iframe', priority: 90 },
    { selector: 'iframe[src*="/ad/"]', type: 'iframe', priority: 85 },
    { selector: 'iframe[src*="taboola"]', type: 'iframe', priority: 90 },
    // ===== 广告链接 =====
    { selector: 'a[href*="doubleclick.net"]', type: 'href', priority: 100 },
    {
      selector: 'a[href*="googleadservices.com"]',
      type: 'href',
      priority: 100,
    },
    {
      selector: 'a[href*="googlesyndication.com"]',
      type: 'href',
      priority: 100,
    },
    { selector: 'a[href*="ad."]', type: 'href', priority: 85 },
    { selector: 'a[href*="/ad/"]', type: 'href', priority: 80 },
    { selector: 'a[href*="sponsor"]', type: 'href', priority: 85 },
    // ===== Google AdSense =====
    { selector: '[id*="google_ads"]', type: 'id', priority: 95 },
    { selector: '[class*="adsbygoogle"]', type: 'class', priority: 100 },
    { selector: 'ins.adsbygoogle', type: 'class', priority: 100 },
    // ===== 内容推荐广告平台 =====
    { selector: '[class*="taboola"]', type: 'class', priority: 85 },
    { selector: '[id*="taboola"]', type: 'id', priority: 85 },
    { selector: '[class*="outbrain"]', type: 'class', priority: 85 },
    { selector: '[class*="mgid"]', type: 'class', priority: 80 },
    // ===== 中置信度（class 关键词 + 外链验证） =====
    { selector: '[class*="banner-ad"]', type: 'class-ext', priority: 75 },
    { selector: '[class*="-banner"]', type: 'class-ext', priority: 45 },
    { selector: '[class*="promo"]', type: 'class-ext', priority: 60 },
    { selector: '[class*="commercial"]', type: 'class-ext', priority: 65 },
    { selector: '[class*="marketing"]', type: 'class-ext', priority: 60 },
    { selector: '[id*="banner"]', type: 'class-ext', priority: 50 },
    { selector: '[id*="promo"]', type: 'class-ext', priority: 55 },
    // ===== 含 adv/ad 关键词 + 内部有外部链接 = 广告容器 =====
    { selector: '[class*="adv"]', type: 'ad-class-link', priority: 70 },
    { selector: '[class*="-adv-"]', type: 'ad-class-link', priority: 75 },
    { selector: '[class*="_adv"]', type: 'ad-class-link', priority: 75 },
    { selector: '[class*="_adv_"]', type: 'ad-class-link', priority: 75 },
    // ===== 站内中转跳转标识（jump_to / redirect / goto 等） =====
    { selector: '[class*="jump_to"]', type: 'ad-class-link', priority: 70 },
    { selector: '[class*="jump-to"]', type: 'ad-class-link', priority: 70 },
    { selector: '[class*="redirect"]', type: 'ad-class-link', priority: 65 },
    { selector: '[class*="go_to"]', type: 'ad-class-link', priority: 65 },
    { selector: '[class*="go-to"]', type: 'ad-class-link', priority: 65 },
    { selector: '[class*="goto"]', type: 'ad-class-link', priority: 65 },
    { selector: '[class*="track_link"]', type: 'ad-class-link', priority: 65 },
    { selector: '[class*="track-link"]', type: 'ad-class-link', priority: 65 },
    { selector: '[class*="click_track"]', type: 'ad-class-link', priority: 65 },
    // ===== 追踪型 data 属性（data-jump / data-redirect 等） =====
    { selector: '[data-jump]', type: 'data-link', priority: 75 },
    { selector: '[data-redirect]', type: 'data-link', priority: 75 },
    { selector: '[data-goto]', type: 'data-link', priority: 70 },
    { selector: '[data-track]', type: 'data-link', priority: 65 },
    { selector: '[data-click]', type: 'data-link', priority: 60 },
    // ===== 弹窗/浮层广告（有外部/中转链接才判定为广告） =====
    { selector: '[class*="popup"]', type: 'ad-class-link', priority: 65 },
    { selector: '[class*="modal-ad"]', type: 'ad-class-link', priority: 75 },
    { selector: '[class*="overlay-ad"]', type: 'ad-class-link', priority: 75 },
    { selector: '[class*="floating-ad"]', type: 'ad-class-link', priority: 75 },
    { selector: '[class*="modal"]', type: 'ad-class-link', priority: 50 },
    { selector: '[class*="overlay"]', type: 'ad-class-link', priority: 50 },
    { selector: '[class*="dialog"]', type: 'ad-class-link', priority: 45 },
    // ===== 广告脚本（JuicyAds / 内联广告脚本等） =====
    { selector: 'script[data-cfasync]', type: 'data', priority: 90 },
    { selector: 'script[src*="juicyads"]', type: 'data', priority: 95 },
    { selector: 'script[src*="ad."]', type: 'data', priority: 85 },
    { selector: 'script[src*="/ad/"]', type: 'data', priority: 80 },
    // ===== 可点击元素 → 站外跳转 = 广告（仅检测 <a> 内的 img/文字） =====
    { selector: 'a[href] img', type: 'clickable-external', priority: 75 },
    { selector: 'a[href] span', type: 'clickable-external', priority: 60 },
    { selector: 'a[href] div', type: 'clickable-external', priority: 55 },
    // ===== 新窗口/赞助链接（常见广告模式） =====
    { selector: 'a[target="_blank"]', type: 'href', priority: 50 },
    { selector: 'a[rel*="nofollow"]', type: 'href', priority: 50 },
    { selector: 'a[rel*="sponsored"]', type: 'href', priority: 70 },
    // ===== 外部 iframe/embed（保留：跨域 iframe 基本是广告） =====
    { selector: 'iframe[src]', type: 'external-src', priority: 85 },
    { selector: 'embed[src]', type: 'external-src', priority: 80 },
  ],

  /**
   * 结构白名单：元素自身或其祖先命中这些选择器则跳过（防误杀导航/页脚等）
   */
  ANCESTOR_WHITELIST: [
    'nav',
    'header',
    'footer',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
  ],

  /**
   * 元素级白名单：仅当元素自身匹配时跳过（不检查祖先）
   */
  SELF_WHITELIST: ['a[href^="javascript:"]', 'a[href^="#"]'],

  /**
   * 扫描页面，找出所有疑似广告的元素
   * @returns {Array<{element: HTMLElement, selector: string, priority: number, ruleType: string}>}
   */
  detectAdElements() {
    const results = [];
    const seen = new WeakSet();

    for (const rule of this.GENERIC_RULES) {
      try {
        const elements = document.querySelectorAll(rule.selector);
        if (elements.length > 0) {
          console.log(
            `[诊断] 规则 ${rule.selector} (type=${rule.type}) 匹配 ${elements.length} 个元素`,
          );
        }
        for (const el of elements) {
          if (seen.has(el)) continue;
          if (this.isWhitelisted(el)) continue;
          if (!this.isVisible(el)) continue;

          // 对于链接类规则，进一步验证是否真的是广告链接
          if (rule.type === 'href' && !this.isAdLink(el)) continue;
          // 对于外部 src 规则，验证是否指向外部域（iframe/embed）
          if (rule.type === 'external-src' && !this.isExternalSrc(el)) continue;
          // 对于可点击元素规则，验证父级 <a> 是否跳往站外
          if (rule.type === 'clickable-external' && !this.isExternalLink(el))
            continue;
          // 对于 adv/ad class 规则，验证元素内部是否包含外部链接
          if (rule.type === 'ad-class-link' && !this.containsExternalLink(el))
            continue;
          // 对于 data-link 规则，验证 data 属性值是否指向外部
          if (rule.type === 'data-link' && !this.hasExternalDataLink(el))
            continue;
          // 对于 class-ext 规则：class 含广告关键词 → 验证外链/中转跳转
          if (rule.type === 'class-ext' && !this._hasAnyExternalLink(el))
            continue;

          seen.add(el);
          results.push({
            element: el,
            selector: this.extractSelector(el),
            priority: rule.priority,
            ruleType: rule.type,
          });
        }
      } catch (e) {
        // 忽略无效选择器
      }
    }

    // ===== 额外扫描：绝对定位图片 + 外部链接 = 浮层广告 =====
    this._scanAbsoluteAds(results, seen);

    // 按优先级排序
    results.sort((a, b) => b.priority - a.priority);
    console.log(`[广告拦截助手] 检测到 ${results.length} 个疑似广告元素`);
    return results;
  },

  /**
   * 扫描绝对定位（position:absolute/fixed）图片元素
   * 这类元素浮于内容之上，含外部链接时几乎必为广告
   */
  _scanAbsoluteAds(results, seen) {
    const imgs = document.querySelectorAll('img');
    for (const img of imgs) {
      if (seen.has(img)) continue;
      if (this.isWhitelisted(img)) continue;

      const style = window.getComputedStyle(img);
      if (style.position !== 'absolute' && style.position !== 'fixed') continue;
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      // 检查图片自身或其父级是否有外部/中转链接
      const link = img.closest('a[href]');
      if (link) {
        const href = (link.getAttribute('href') || '').trim();
        if (
          this._isRedirectToExternal(href) ||
          this.isExternalLink_strict(href)
        ) {
          seen.add(img);
          results.push({
            element: img,
            selector: this.extractSelector(img),
            priority: 70,
            ruleType: 'absolute-ad',
          });
        }
      }
    }
  },

  /**
   * 严格判断 href 是否站外（不检查 closest，直接判断 URL）
   */
  isExternalLink_strict(href) {
    if (!href) return false;
    const origin = this._siteOrigin || window.location.origin.toLowerCase();
    if (
      href.startsWith('/') ||
      href.startsWith('#') ||
      href.startsWith('?') ||
      href.startsWith('javascript:')
    )
      return false;
    if (href.toLowerCase().startsWith(origin)) return false;
    try {
      const url = new URL(href, window.location.origin);
      return url.origin.toLowerCase() !== origin;
    } catch (e) {
      return false;
    }
  },

  /**
   * 判断元素是否在白名单中
   * - 结构白名单：检查祖先（导航栏、页脚等不应删）
   * - 元素级白名单：仅检查元素自身
   */
  isWhitelisted(el) {
    // 检查结构白名单（祖先命中则跳过）
    for (const selector of this.ANCESTOR_WHITELIST) {
      try {
        if (el.closest(selector)) return true;
      } catch (e) {
        /* ignore */
      }
    }
    // 检查元素自身（仅匹配自身）
    for (const selector of this.SELF_WHITELIST) {
      try {
        if (el.matches(selector)) return true;
      } catch (e) {
        /* ignore */
      }
    }
    return false;
  },

  /**
   * 判断元素是否可见
   */
  isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;
    // IMG/PICTURE 可能未加载完成所以 rect 为 0×0，跳过尺寸检查
    if (el.tagName === 'IMG' || el.tagName === 'PICTURE') return true;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  },

  /**
   * 判断一个链接是否是广告链接（而非普通链接）
   */
  isAdLink(el) {
    if (el.tagName !== 'A') return false;
    const href = (el.href || '').toLowerCase();
    const hostname = window.location.hostname;

    // 站内中转跳转（/jump?url=外部地址）→ 视为广告链接
    if (this._isRedirectToExternal(href)) return true;

    // 检查是否指向已知广告域
    const adDomains = [
      'doubleclick.net',
      'googleadservices.com',
      'googlesyndication.com',
      '/ad/',
      '/ads/',
      'sponsor',
      'promoted',
      'clicktrack',
      'tracking.',
      'affiliate.',
      'partner.',
    ];
    if (adDomains.some((d) => href.includes(d))) return true;

    // 检查链接文本是否是广告语
    const text = (el.textContent || '').trim();
    const adKeywords = [
      '广告',
      '推广',
      '赞助',
      'AD',
      'advertisement',
      'sponsored',
      'Ad',
    ];
    if (adKeywords.some((k) => text.includes(k))) return true;

    // 检查最近父元素是否有广告特征
    const parent = el.closest(
      '[class*="ad"], [class*="advert"], [class*="sponsor"], [id*="ad"]',
    );
    if (parent) return true;

    return false;
  },

  /**
   * 判断元素是否在广告上下文中（对中低置信度规则的二次验证）
   */
  isInAdContext(el) {
    let current = el;
    for (let i = 0; i < 5; i++) {
      if (
        !current ||
        current === document.body ||
        current === document.documentElement
      )
        break;
      const cls = (current.className || '').toString().toLowerCase();
      const id = (current.id || '').toLowerCase();
      const tag = current.tagName;

      // 明确的广告标识
      if (
        cls.includes('ad-') ||
        cls.includes('_ad') ||
        cls.includes('advert') ||
        cls.includes('sponsor') ||
        cls.includes('promo') ||
        cls.includes('commercial') ||
        cls.includes('guanggao') ||
        cls.includes('ads') ||
        cls.includes('marketing') ||
        id.includes('ad-') ||
        id.includes('_ad') ||
        id.includes('sponsor') ||
        id.includes('google_ads')
      ) {
        return true;
      }

      // ASIDE 标签通常是侧边栏广告
      if (tag === 'ASIDE') return true;

      // 检查是否有 data-ad 等属性
      if (
        current.hasAttribute('data-ad') ||
        current.hasAttribute('data-ad-client') ||
        current.hasAttribute('data-ad-slot')
      ) {
        return true;
      }

      current = current.parentElement;
    }
    return false;
  },

  /**
   * 知名 CDN / 合法第三方域名白名单
   * 这些域名的外部资源不视为广告
   */
  CDN_WHITELIST: [
    'cdn.jsdelivr.net',
    'cdnjs.cloudflare.com',
    'unpkg.com',
    'cdn.bootcdn.net',
    'cdn.bootcss.com',
    'staticfile.org',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'ajax.googleapis.com',
    'apis.google.com',
    'cdn.jsdelivr.net',
    'cdn.jsdelivr.net',
    'gravatar.com',
    'i.imgur.com',
    'githubusercontent.com',
    'github.io',
    'twimg.com',
    'fbcdn.net',
    'instagram.com',
    'bootstrapcdn.com',
    'cloudflare.com',
    'gstatic.com',
    'googleapis.com',
  ],

  /**
   * 站内 Origin（页面加载时记录，作为判断"站内跳转"的基准）
   */
  _siteOrigin: '',

  /**
   * 初始化：记录当前站点的 origin（由 content-script 在 init 时调用）
   */
  initSite() {
    this._siteOrigin = window.location.origin.toLowerCase();
  },

  /**
   * 判断元素的 src 是否指向外部域名（仅用于 iframe/embed）
   */
  isExternalSrc(el) {
    const src = el.getAttribute('src') || el.src || '';
    if (!src || src.startsWith('data:') || src.startsWith('blob:'))
      return false;

    let srcHostname;
    try {
      const url = new URL(src, window.location.origin);
      srcHostname = url.hostname.toLowerCase();
    } catch (e) {
      return false;
    }

    const pageHostname = window.location.hostname.toLowerCase();
    if (srcHostname === pageHostname) return false;

    const pageRoot = this._getRootDomain(pageHostname);
    const srcRoot = this._getRootDomain(srcHostname);
    if (pageRoot && srcRoot && pageRoot === srcRoot) return false;

    if (this.CDN_WHITELIST.some((d) => srcHostname.includes(d))) return false;

    return true;
  },

  /**
   * 判断 href 是否为站内中转跳转（如 /jump?url=外部地址）
   * 这类链接先到本站中转，再重定向到外部广告页
   */
  _REDIRECT_PATTERNS: [
    '/jump',
    '/redirect',
    '/go',
    '/out',
    '/link',
    '/click',
    '/track',
    '/visit',
    '/goto',
    '/leave',
    '/away',
    '/exit',
    '/bounce',
    '/refer',
    '/forward',
  ],

  /**
   * 检查 URL 是否是通过站内中转跳往站外的广告链接
   */
  _isRedirectToExternal(href) {
    const lower = href.toLowerCase();
    const origin = this._siteOrigin || window.location.origin.toLowerCase();

    // 检查路径中是否包含中转关键词
    const hasRedirectPath = this._REDIRECT_PATTERNS.some((p) =>
      lower.includes(p),
    );
    if (!hasRedirectPath) return false;

    // 尝试从 URL 参数或路径中提取目标地址
    try {
      const url = new URL(href, window.location.origin);
      // 搜索所有参数值，查找外部 URL
      for (const [_, value] of url.searchParams) {
        if (value.startsWith('http://') || value.startsWith('https://')) {
          try {
            const target = new URL(value);
            if (target.origin.toLowerCase() !== origin) return true;
          } catch (e) {
            /* ignore */
          }
        }
      }
      // 也检查路径中是否嵌入了完整 URL（如 /go/https://external.com）
      const path = url.pathname.toLowerCase();
      const httpIdx = path.indexOf('http://');
      const httpsIdx = path.indexOf('https://');
      const idx = httpIdx >= 0 ? httpIdx : httpsIdx;
      if (idx >= 0) {
        try {
          const embedded = new URL(path.substring(idx));
          if (embedded.origin.toLowerCase() !== origin) return true;
        } catch (e) {
          /* ignore */
        }
      }
    } catch (e) {
      /* ignore */
    }

    // 有中转路径但无法提取目标 → 保守处理：视为可疑
    return true;
  },

  /**
   * 判断可点击元素（<a> 内的 img/span/div）是否跳往站外
   * 包含站内中转跳转检测（如 /jump?url=外部地址）
   */
  isExternalLink(el) {
    const link = el.closest('a[href]');
    if (!link) return false;

    const href = (link.getAttribute('href') || '').trim();
    if (!href) return false;

    const origin = this._siteOrigin || window.location.origin.toLowerCase();

    // 站内中转跳转
    const isRedirect = this._isRedirectToExternal(href);
    console.log(
      `[诊断] isExternalLink: href="${href}" redirect=${isRedirect} origin=${origin}`,
    );

    if (isRedirect) return true;

    // 站内跳转放行
    if (href.startsWith('/')) return false;
    if (href.startsWith('#')) return false;
    if (href.startsWith('?')) return false;
    if (href.startsWith('javascript:')) return false;
    if (href.toLowerCase().startsWith(origin)) return false;

    // 解析完整 URL 确认站外
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin.toLowerCase() === origin) return false;
    } catch (e) {
      return false;
    }

    return true;
  },

  /**
   * 判断元素内部是否包含指向站外的 <a> 链接
   * 用于 adv/ad 等 class 关键词元素：class 像广告 + 内部有外部链接 = 确认为广告
   * @param {HTMLElement} el - 待检查的元素
   * @returns {boolean}
   */
  containsExternalLink(el) {
    const links = el.querySelectorAll('a[href]');
    const origin = this._siteOrigin || window.location.origin.toLowerCase();

    for (const link of links) {
      const href = (link.getAttribute('href') || '').trim();
      if (!href) continue;
      // 站内中转跳转 → 视为外部链接
      if (this._isRedirectToExternal(href)) return true;
      // 站内跳转 → 跳过
      if (href.startsWith('/')) continue;
      if (href.startsWith('#')) continue;
      if (href.startsWith('?')) continue;
      if (href.startsWith('javascript:')) continue;
      if (href.toLowerCase().startsWith(origin)) continue;

      try {
        const url = new URL(href, window.location.origin);
        if (url.origin.toLowerCase() === origin) continue;
      } catch (e) {
        continue;
      }

      // 找到外部链接！
      return true;
    }

    return false;
  },

  /**
   * 检查元素的 data-* 属性是否包含外部链接
   * 用于 data-jump / data-redirect 等追踪属性
   */
  hasExternalDataLink(el) {
    const origin = this._siteOrigin || window.location.origin.toLowerCase();
    const attrs = el.attributes;
    for (const attr of attrs) {
      if (!attr.name.startsWith('data-')) continue;
      const value = attr.value || '';
      // 检查属性值中是否包含外部 URL
      if (value.startsWith('http://') || value.startsWith('https://')) {
        try {
          const url = new URL(value);
          if (url.origin.toLowerCase() !== origin) return true;
        } catch (e) {
          /* ignore */
        }
      }
    }
    // 也检查 onclick 属性
    const onclick = el.getAttribute('onclick') || '';
    if (onclick) {
      const urlMatch = onclick.match(/https?:\/\/[^\s"')]+/g);
      if (urlMatch) {
        for (const u of urlMatch) {
          try {
            const url = new URL(u);
            if (url.origin.toLowerCase() !== origin) return true;
          } catch (e) {
            /* ignore */
          }
        }
      }
    }
    return false;
  },

  /**
   * class-ext 验证：元素自身或其内部是否有外部/中转链接
   */
  _hasAnyExternalLink(el) {
    // 元素自身是 <a> → 用 isAdLink
    if (el.tagName === 'A') return this.isAdLink(el);
    // 元素在 <a> 内 → 用 isExternalLink
    if (el.closest('a[href]')) return this.isExternalLink(el);
    // 容器内搜索外部链接
    return this.containsExternalLink(el);
  },

  /**
   * 提取根域名（如 www.example.com → example.com）
   */
  _getRootDomain(hostname) {
    const parts = hostname.split('.');
    if (parts.length <= 2) return hostname;
    // 处理 .com.cn, .co.uk 等双后缀
    const twoPartTlds = [
      'com.cn',
      'net.cn',
      'org.cn',
      'gov.cn',
      'co.uk',
      'org.uk',
      'ac.uk',
      'co.jp',
      'or.jp',
      'com.au',
      'net.au',
      'com.br',
      'com.tw',
    ];
    const lastTwo = parts.slice(-2).join('.');
    if (twoPartTlds.includes(lastTwo) && parts.length > 2) {
      return parts.slice(-3).join('.');
    }
    return parts.slice(-2).join('.');
  },

  /**
   * 提取元素的高质量 CSS 选择器
   * 生成稳定、可复用的选择器路径，用于跨页面加载识别同一广告
   */
  extractSelector(el) {
    // 策略1: ID（最优先）
    if (el.id && !/^\d/.test(el.id) && el.id.length < 50) {
      const sel = `#${CSS.escape(el.id)}`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }

    // 策略2: 有意义的 class 组合
    const meaningfulClasses = this._getMeaningfulClasses(el);
    if (meaningfulClasses.length > 0) {
      const classSel = meaningfulClasses
        .map((c) => `.${CSS.escape(c)}`)
        .join('');
      try {
        if (document.querySelectorAll(classSel).length <= 3) {
          return classSel;
        }
      } catch (e) {
        /* ignore */
      }
    }

    // 策略3: 构建唯一路径（向上最多追溯4层）
    const path = this._buildUniquePath(el, 4);
    if (path) return path;

    // 策略4: 回退 — 使用 tag + 属性
    return this._buildAttrSelector(el);
  },

  /**
   * 获取有意义的 class 列表（过滤掉动态生成的随机 class）
   */
  _getMeaningfulClasses(el) {
    const cls = typeof el.className === 'string' ? el.className : '';
    return cls.split(/\s+/).filter((c) => {
      if (!c || c.length < 2 || c.length > 40) return false;
      // 过滤纯数字或随机字符串
      if (/^[a-z]{1}$/.test(c)) return false; // 单字母
      if (/^[0-9_-]+$/.test(c)) return false; // 纯数字/下划线
      if (/([a-z])\1{4,}/.test(c)) return false; // 重复字母
      // 保留包含有意义关键词的 class
      return true;
    });
  },

  /**
   * 通过向上追溯构建唯一CSS路径
   */
  _buildUniquePath(el, maxDepth) {
    const parts = [];
    let current = el;
    let depth = 0;

    while (
      current &&
      current !== document.body &&
      current !== document.documentElement &&
      depth < maxDepth
    ) {
      let part = current.tagName.toLowerCase();

      // 优先使用有意义的 class
      const cls = this._getMeaningfulClasses(current);
      if (cls.length > 0) {
        part +=
          '.' +
          cls
            .slice(0, 2)
            .map((c) => CSS.escape(c))
            .join('.');
      } else if (current.id) {
        part = `#${CSS.escape(current.id)}`;
        parts.unshift(part);
        break; // ID 是唯一的，不需要继续向上
      } else {
        // 使用 nth-child
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (c) => c.tagName === current.tagName,
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            part += `:nth-child(${index})`;
          }
        }
      }

      parts.unshift(part);
      current = current.parentElement;
      depth++;
    }

    const path = parts.join(' > ');
    try {
      const matches = document.querySelectorAll(path);
      if (matches.length <= 3) return path;
    } catch (e) {
      /* ignore */
    }

    // 如果仍然不唯一，添加元素自身的 tag 来精确
    const specificPath = path + ' > ' + el.tagName.toLowerCase();
    try {
      document.querySelectorAll(specificPath);
      return specificPath;
    } catch (e) {
      return path;
    }
  },

  /**
   * 基于属性构建选择器（回退方案）
   */
  _buildAttrSelector(el) {
    const tag = el.tagName.toLowerCase();
    const attrs = [];

    if (el.getAttribute('data-ad')) attrs.push('[data-ad]');
    if (el.getAttribute('data-ad-client'))
      attrs.push(`[data-ad-client="${el.getAttribute('data-ad-client')}"]`);
    if (el.getAttribute('aria-label')) {
      const label = el.getAttribute('aria-label').substring(0, 20);
      attrs.push(`[aria-label*="${CSS.escape(label)}"]`);
    }

    if (attrs.length > 0) {
      return tag + attrs.join('');
    }

    // 最后回退
    const cls = this._getMeaningfulClasses(el);
    if (cls.length > 0) {
      return tag + '.' + cls.map((c) => CSS.escape(c)).join('.');
    }

    return tag;
  },

  /**
   * 使用缓存的黑名单选择器查找广告
   * @param {string[]} cachedSelectors - 从存储中读取的高置信度选择器
   * @returns {HTMLElement[]}
   */
  applyCachedSelectors(cachedSelectors) {
    const elements = [];
    for (const sel of cachedSelectors) {
      try {
        const matches = document.querySelectorAll(sel);
        for (const el of matches) {
          if (this.isWhitelisted(el)) continue;
          if (!this.isVisible(el)) continue;
          elements.push(el);
        }
      } catch (e) {
        // 选择器失效，静默跳过
      }
    }
    return elements;
  },

  /**
   * 从检测到的广告元素中提取所有选择器并去重
   */
  extractSelectorsFromResults(results) {
    const selectorSet = new Set();
    for (const item of results) {
      if (item.selector) selectorSet.add(item.selector);
    }
    return Array.from(selectorSet);
  },
};

import os
import re

src_path = r"C:/Users/cenji/.gemini/antigravity/brain/d9cd188a-1e93-4583-b7a9-ef1dbc5164fc/.user_uploaded/uploaded_media_1792663326125.html"
dst_path = r"f:/zuomian\code/antitest/vocab.html"

with open(src_path, "r", encoding="utf-8") as f:
    html = f.read()

# 1. Update Title
html = html.replace(
    "<title>高中英语课本查词系统 (iPhone 专用版)</title>",
    "<title>高中英语课本查词系统 (人教版7册 · 词根衍生 · 批量检测)</title>"
)

# 2. Add responsive desktop CSS before </style>
desktop_css = """
    /* === Responsive Desktop Dual-Panel & Navigation Layout === */
    @media (min-width: 900px) {
      .header-wrap {
        max-width: 1200px !important;
      }
      .app-container {
        max-width: 1200px !important;
      }
      .app-layout-grid {
        display: grid !important;
        grid-template-columns: minmax(0, 1.25fr) minmax(380px, 0.95fr) !important;
        gap: 1.5rem !important;
        align-items: start !important;
      }
      .desktop-only-panel {
        display: block !important;
      }
      .desktop-header-tabs {
        display: flex !important;
      }
      .mobile-tab-nav {
        display: none !important;
      }
      body {
        padding-bottom: 2.5rem !important;
      }
      #lookupBookFilterBar {
        scrollbar-width: thin;
      }
    }
    @media (max-width: 899px) {
      .desktop-only-panel {
        display: none !important;
      }
      .desktop-header-tabs {
        display: none !important;
      }
    }
    .card-selected {
      border-color: #007AFF !important;
      background-color: rgba(239, 246, 255, 0.85) !important;
      box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.28) !important;
    }
"""
html = html.replace("</style>", desktop_css + "\n  </style>", 1)

# 3. Update <header>
old_header_re = r'<header class="sticky top-0 z-30 ios-blur border-b border-black/5 px-4 pt-3 pb-2\.5">.*?</header>'
new_header = """<header class="sticky top-0 z-30 ios-blur border-b border-black/5 px-4 pt-3 pb-2.5">
    <div class="header-wrap max-w-md mx-auto flex items-center justify-between gap-3">
      <div class="flex items-center gap-2.5">
        <a href="./index.html" class="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/60 px-2.5 py-1.5 rounded-full transition-colors shrink-0" title="返回网站首页">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
          <span>首页</span>
        </a>
        <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" width="20" height="20">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
          </svg>
        </div>
        <div>
          <h1 class="text-[17px] font-bold tracking-tight text-gray-900 leading-tight flex items-center gap-1.5">
            <span>高中英语课本查词</span>
            <span class="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60 hidden sm:inline-block">人教版 7 册</span>
          </h1>
          <p id="headerStats" class="text-[11px] text-gray-500 font-medium">已内置 7 册课本 · 2,625 词条</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <!-- Desktop Header Tabs -->
        <div class="desktop-header-tabs items-center gap-1 bg-gray-100/90 p-1 rounded-xl text-xs font-semibold">
          <button type="button" onclick="switchTab('lookup')" class="desktop-nav-tab px-3 py-1 rounded-lg text-blue-600 bg-white shadow-xs" data-tab="lookup">🔍 智能查词</button>
          <button type="button" onclick="switchTab('browse')" class="desktop-nav-tab px-3 py-1 rounded-lg text-gray-600 hover:text-gray-900" data-tab="browse">📚 课本浏览</button>
          <button type="button" onclick="switchTab('import')" class="desktop-nav-tab px-3 py-1 rounded-lg text-gray-600 hover:text-gray-900" data-tab="import">⚙️ 词库管理</button>
        </div>
        <button id="quickImportBtn" type="button" class="ios-btn-active flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-200/80 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" width="14" height="14">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span>导入CSV</span>
        </button>
      </div>
    </div>
  </header>"""

html = re.sub(old_header_re, new_header, html, flags=re.DOTALL)

# 4. Wrap <main> with desktop dual columns
main_start_old = '<main class="max-w-md mx-auto px-4 pt-3 pb-8">'
main_start_new = """<main class="app-container max-w-md mx-auto px-4 pt-3 pb-8">
  <div class="app-layout-grid">
    <!-- Left Column: Search / Browse / Import -->
    <div class="app-left-column space-y-4 min-w-0">"""

html = html.replace(main_start_old, main_start_new, 1)

main_end_old = '</main>'
main_end_new = """    </div>
    <!-- Right Column: Desktop Pinned Detail Panel -->
    <div class="desktop-only-panel sticky top-20">
      <div id="desktopDetailPanel" class="ios-card p-5 bg-white shadow-sm border border-gray-100 rounded-2xl max-h-[calc(100vh-6.5rem)] overflow-y-auto">
        <div id="desktopDetailPlaceholder" class="py-16 px-6 text-center text-gray-400">
          <div class="text-4xl mb-3">📖</div>
          <div class="text-sm font-bold text-gray-700">点击左侧单词查看详情</div>
          <div class="text-xs text-gray-400 mt-2 max-w-xs mx-auto leading-relaxed">
            实时查看对应课本出处、所有变形词（时态/复数/比较级）、同根词家族族谱、一词多义与多音频朗读。
          </div>
        </div>
        <div id="desktopDetailContent" class="space-y-4 hidden">
          <!-- Word header -->
          <div class="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h2 id="desktopWordTitle" class="text-2xl font-bold text-gray-900 tracking-tight break-words">word</h2>
                <span id="desktopWordPos" class="text-xs font-semibold italic text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">n.</span>
              </div>
              <div id="desktopWordBadges" class="flex items-center flex-wrap gap-1.5 mt-1.5"></div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button id="desktopSpeakBtn" type="button" class="ios-btn-active px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 text-xs font-semibold flex items-center gap-1">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"/></svg>
                <span>发音</span>
              </button>
            </div>
          </div>
          <!-- Word Body -->
          <div id="desktopBodyContent" class="space-y-3.5"></div>
        </div>
      </div>
    </div>
  </div>
</main>"""

html = html.replace(main_end_old, main_end_new, 1)

# 5. Mark mobile-tab-nav
html = html.replace('<nav class="fixed bottom-0 inset-x-0 z-40 ios-tab-blur"', '<nav class="mobile-tab-nav fixed bottom-0 inset-x-0 z-40 ios-tab-blur"', 1)

# 6. Replace huge BUILTIN_VOCAB line
vocab_decl_re = r'const BUILTIN_VOCAB\s*=\s*\[.*?\];\s*'
decoupled_vocab_decl = """// Decoupled Static Baseline Vocabulary (Loaded from ./data/vocab.json + Local Cached)
    let BUILTIN_VOCAB = [];
    const DATA_VOCAB_URL = './data/vocab.json';
    const STORAGE_KEY_BASELINE_CACHE = 'pep_vocab_baseline_cache_v1';
    const STORAGE_KEY_BASELINE_VERSION = 'pep_vocab_baseline_ver_v1';
"""
html = re.sub(vocab_decl_re, decoupled_vocab_decl, html, count=1)

# 7. Add async data fetching logic
fetch_func = """
    async function fetchBaselineVocab(isForeground) {
      try {
        const res = await fetch(DATA_VOCAB_URL);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        if (data && Array.isArray(data.words) && data.words.length > 0) {
          BUILTIN_VOCAB = data.words;
          try {
            localStorage.setItem(STORAGE_KEY_BASELINE_CACHE, JSON.stringify(data.words));
            if (data.version) localStorage.setItem(STORAGE_KEY_BASELINE_VERSION, data.version);
          } catch (e) {}

          const hasCustom = localStorage.getItem(STORAGE_KEY_CUSTOM_VOCAB);
          if (!hasCustom) {
            vocabList = BUILTIN_VOCAB.map(e => ({ ...e }));
            indexAllEntries(vocabList);
            renderBookFilterBarAndSelects();
            if (isForeground) {
              showToast(`课本词库加载完成 (${vocabList.length} 词)`);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch baseline vocab.json:', err);
        if (isForeground && vocabList.length === 0) {
          document.getElementById('headerStats').textContent = '词库加载失败，请检查网络后刷新';
          showToast('词库网络加载失败');
        }
      }
    }
"""
html = html.replace("const STORAGE_KEY_HISTORY = 'pep_iphone_vocab_history_v1';", "const STORAGE_KEY_HISTORY = 'pep_iphone_vocab_history_v1';\n" + fetch_func, 1)

# 8. Refactor openWordDetailCard to generateWordDetailData and openWordDetailCard
old_open_detail_re = r'function openWordDetailCard\(entry\) \{.*?(?=function closeWordDetailCard)'
new_detail_logic = """function generateWordDetailData(entry) {
      if (!entry) return null;
      const coreWord = extractCoreBaseWord(entry);
      const isBold = entry.f === '黑体';
      const isExtended = entry.inCsv === false || entry.b === '拓展同根词库';
      const isProper = Boolean(entry.n && entry.n.includes('专有名词'));

      let badgesHtml = '';
      if (isExtended) {
        badgesHtml += `<span class="inline-flex items-center text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md">✨ 课外同根拓展词</span>`;
      } else {
        badgesHtml += isBold
          ? `<span class="inline-flex items-center text-[11px] font-semibold bg-gray-900 text-white px-2 py-0.5 rounded-md">黑体 · 重点词</span>`
          : `<span class="inline-flex items-center text-[11px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">白体 · 认读词</span>`;
      }
      if (isProper) {
        badgesHtml += `<span class="inline-flex items-center text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md">△ 专有名词</span>`;
      }
      if (coreWord && coreWord !== normalizeWordStr(entry.w)) {
        badgesHtml += `<span class="inline-flex items-center text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md">核心词干: ${escapeHtml(coreWord)}</span>`;
      }

      const normW = normalizeWordStr(entry.w);
      const allOccurrences = vocabList.filter(e => normalizeWordStr(e.w) === normW || (e._headLower && e._headLower === (entry._headLower || normW)));

      const textbookSenses = parsePolysemySenses(entry);
      const extraPolysemy = CORE_POLYSEMY_EXTRAS[coreWord] || CORE_POLYSEMY_EXTRAS[normW] || [];
      const inflections = generateWordInflections(entry, coreWord);
      const familyData = findCognatesAndPhrases(entry, coreWord);

      const inCsvCognateCount = familyData.cognates.filter(c => c.inCsv).length;
      const extCognateCount = familyData.cognates.length - inCsvCognateCount;

      let bodyHtml = '';

      // SECTION A: 课本定位与收录情况
      bodyHtml += `
        <div class="ios-card p-3.5 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-[#007AFF]"></span>
              📍 课本 CSV 收录情况（${allOccurrences.length > 0 ? `共 ${allOccurrences.length} 处` : '未单独收录于 CSV，以下为完整拓展卡片'}）
            </span>
          </div>
          ${allOccurrences.length > 0 ? `
            <div class="space-y-1.5">
              ${allOccurrences.map(occ => `
                <div class="bg-blue-50/60 border border-blue-100 rounded-xl p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div class="text-xs font-bold text-blue-950">${escapeHtml(getShortBookName(occ.b))} · ${escapeHtml(formatUnitLabel(occ.u))}</div>
                    <div class="text-[11px] text-gray-600 mt-0.5">${escapeHtml(occ.p ? '[' + occ.p + '] ' : '')}${escapeHtml(occ.m)}</div>
                  </div>
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded ${occ.f === '黑体' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-200'} shrink-0">${escapeHtml(occ.f || '白体')}</span>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="bg-emerald-50/60 border border-emerald-100 rounded-xl p-2.5 text-xs text-emerald-900">
              该词（<strong>${escapeHtml(entry.w)}</strong>）属于课外拓展/变形词，虽未单独列于 CSV 词表中，已为您完整生成其<strong>所有不同形式</strong>与<strong>全部同根词家族</strong>。
            </div>
          `}
        </div>
      `;

      // SECTION B: 不同形式 (所有词形变化，不限于 CSV)
      if (inflections.length > 0) {
        bodyHtml += `
          <div class="ios-card p-3.5 space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-blue-500"></span>
                🔄 所有不同形式（全形态词形变化：${escapeHtml(coreWord)}）
              </span>
              <span class="text-[10px] text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">含非CSV全变形 · 点击发音</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              ${inflections.map(inf => `
                <button type="button" data-speak-word="${escapeHtml(inf.val.split('/')[0].replace(/\\([^)]*\\)/g, '').trim())}" class="speak-btn ios-btn-active text-left bg-purple-50/60 border border-purple-100 rounded-xl p-2.5">
                  <div class="flex items-center justify-between gap-1">
                    <span class="text-[10px] font-medium text-purple-700">${escapeHtml(inf.label)}</span>
                    ${inf.inCsv ? `<span class="text-[10px] bg-blue-50 text-blue-600 px-1 rounded">课本词</span>` : ''}
                  </div>
                  <div class="text-sm font-bold text-purple-900 mt-0.5 break-words">${escapeHtml(inf.val)}</div>
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }

      // SECTION C: 所有同根词与派生词 (完整词族，包含 CSV 内外全部同根词!)
      bodyHtml += `
        <div class="ios-card p-3.5 space-y-2.5">
          <div class="flex items-center justify-between flex-wrap gap-1">
            <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-[#34C759]"></span>
              🌱 所有同根词与派生词（共 ${familyData.cognates.length} 个）
            </span>
            ${familyData.rootGroupTitle ? `<span class="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md">${escapeHtml(familyData.rootGroupTitle)}</span>` : ''}
          </div>
          <div class="text-[11px] text-gray-500">
            已列出全部同根词（其中课本 CSV 收录 <strong>${inCsvCognateCount}</strong> 个，课外拓展同根词 <strong>${extCognateCount}</strong> 个）。点击任意词条可切换查看其卡片：
          </div>
          ${familyData.cognates.length > 0 ? `
            <div class="space-y-1.5">
              ${familyData.cognates.map(cog => `
                <button
                  type="button"
                  data-open-word="${escapeHtml(cog.w)}"
                  data-open-book="${escapeHtml(cog.b)}"
                  data-open-pos="${escapeHtml(cog.p || '')}"
                  data-open-mean="${escapeHtml(cog.m || '')}"
                  data-open-incsv="${cog.inCsv ? '1' : '0'}"
                  class="modal-jump-word-btn ios-btn-active w-full text-left ${cog.inCsv ? 'bg-gray-50/90 border-gray-200/80' : 'bg-emerald-50/60 border-emerald-200'} hover:bg-blue-50 border rounded-xl p-2.5 flex items-center justify-between gap-2"
                >
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="font-bold text-sm ${cog.inCsv ? 'text-[#007AFF]' : 'text-emerald-900'}">${escapeHtml(cog.w)}</span>
                      ${cog.p ? `<span class="text-[11px] italic text-gray-500">${escapeHtml(cog.p)}</span>` : ''}
                      ${cog.inCsv && cog.f === '黑体' ? `<span class="text-[10px] bg-gray-900 text-white px-1.5 py-0.2 rounded">黑体</span>` : ''}
                    </div>
                    <div class="text-xs text-gray-600 mt-0.5 break-words">${escapeHtml(cog.m)}</div>
                  </div>
                  ${cog.inCsv ? `
                    <span class="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded-lg shrink-0">
                      📘 ${escapeHtml(getShortBookName(cog.b))} · ${escapeHtml(formatShortUnitBadge(cog.u))} ›
                    </span>
                  ` : `
                    <span class="text-[10px] font-semibold text-emerald-700 bg-white border border-emerald-200 px-2 py-1 rounded-lg shrink-0">
                      ✨ 拓展同根词 ›
                    </span>
                  `}
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;

      // SECTION D: 一词多义 & 熟词生义解析
      bodyHtml += `
        <div class="ios-card p-3.5 space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-[#34C759]"></span>
              📖 一词多义与词性详解
            </span>
            <span class="text-[11px] text-gray-400">共 ${textbookSenses.length + extraPolysemy.length} 个义项维度</span>
          </div>
          <div class="space-y-1.5">
            ${textbookSenses.map(s => `
              <div class="bg-gray-50/90 border border-gray-100 rounded-xl p-2.5 flex items-start gap-2">
                <span class="w-5 h-5 rounded-full bg-blue-50 text-blue-700 text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">${s.index}</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-[11px] font-semibold italic text-blue-600">${escapeHtml(s.pos)}</span>
                    <span class="text-sm font-bold text-gray-900">${escapeHtml(s.meaning)}</span>
                  </div>
                </div>
              </div>
            `).join('')}
            ${extraPolysemy.length > 0 ? `
              <div class="pt-1">
                <div class="text-[11px] font-semibold text-emerald-700 mb-1.5">✨ 高考常见一词多义 / 熟词生义拓展（${escapeHtml(coreWord)}）：</div>
                <div class="space-y-1.5">
                  ${extraPolysemy.map(ep => `
                    <div class="bg-emerald-50/60 border border-emerald-100 rounded-xl p-2.5">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        <span class="text-[11px] font-bold italic text-emerald-700 bg-white px-1.5 py-0.2 rounded border border-emerald-200">${escapeHtml(ep.pos)}</span>
                        <span class="text-xs font-bold text-gray-900">${escapeHtml(ep.mean)}</span>
                      </div>
                      ${ep.ex ? `<div class="text-[11px] text-gray-500 mt-1">例: ${escapeHtml(ep.ex)}</div>` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;

      // SECTION E: 课本关联短语 / 词组
      if (familyData.phrases.length > 0) {
        bodyHtml += `
          <div class="ios-card p-3.5 space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-[#007AFF]"></span>
                🔗 课本关联短语 / 搭配（${familyData.phrases.length} 个）
              </span>
            </div>
            <div class="space-y-1.5">
              ${familyData.phrases.map(phr => `
                <button type="button" data-open-word="${escapeHtml(phr.w)}" data-open-book="${escapeHtml(phr.b)}" data-open-incsv="1" class="modal-jump-word-btn ios-btn-active w-full text-left bg-blue-50/40 border border-blue-100 rounded-xl p-2.5 flex items-center justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="font-bold text-sm text-gray-900">${escapeHtml(phr.w)}</div>
                    <div class="text-xs text-gray-600 mt-0.5">${escapeHtml(phr.m)}</div>
                  </div>
                  <span class="text-[10px] font-semibold text-blue-700 bg-white border border-blue-200 px-2 py-1 rounded-lg shrink-0">
                    ${escapeHtml(getShortBookName(phr.b))} · ${escapeHtml(formatShortUnitBadge(phr.u))} ›
                  </span>
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }

      return {
        word: entry.w,
        pos: entry.p || '',
        badgesHtml,
        bodyHtml
      };
    }

    function openWordDetailCard(entry) {
      if (!entry) return;
      const data = generateWordDetailData(entry);
      if (!data) return;

      // 1. Update Mobile Modal
      const modal = document.getElementById('wordDetailModal');
      const titleEl = document.getElementById('modalWordTitle');
      const posEl = document.getElementById('modalWordPos');
      const badgesEl = document.getElementById('modalWordBadges');
      const bodyEl = document.getElementById('modalBodyContent');
      const speakBtn = document.getElementById('modalSpeakBtn');

      if (titleEl) titleEl.textContent = data.word;
      if (posEl) {
        if (data.pos) {
          posEl.textContent = data.pos;
          posEl.classList.remove('hidden');
        } else {
          posEl.classList.add('hidden');
        }
      }
      if (badgesEl) badgesEl.innerHTML = data.badgesHtml;
      if (bodyEl) {
        bodyEl.innerHTML = data.bodyHtml;
        bodyEl.scrollTop = 0;
      }
      if (speakBtn) speakBtn.onclick = () => speakWord(entry.w);

      // 2. Update Desktop Side Panel
      const dtPlaceholder = document.getElementById('desktopDetailPlaceholder');
      const dtContent = document.getElementById('desktopDetailContent');
      const dtTitle = document.getElementById('desktopWordTitle');
      const dtPos = document.getElementById('desktopWordPos');
      const dtBadges = document.getElementById('desktopWordBadges');
      const dtBody = document.getElementById('desktopBodyContent');
      const dtSpeak = document.getElementById('desktopSpeakBtn');

      if (dtPlaceholder && dtContent) {
        dtPlaceholder.classList.add('hidden');
        dtContent.classList.remove('hidden');
        if (dtTitle) dtTitle.textContent = data.word;
        if (dtPos) {
          if (data.pos) {
            dtPos.textContent = data.pos;
            dtPos.classList.remove('hidden');
          } else {
            dtPos.classList.add('hidden');
          }
        }
        if (dtBadges) dtBadges.innerHTML = data.badgesHtml;
        if (dtBody) dtBody.innerHTML = data.bodyHtml;
        if (dtSpeak) dtSpeak.onclick = () => speakWord(entry.w);
      }

      // 3. View Mode: On mobile show modal, on desktop keep modal closed
      if (window.innerWidth < 900) {
        if (modal) modal.classList.remove('hidden');
      } else {
        if (modal) modal.classList.add('hidden');
      }
    }
"""
html = re.sub(old_open_detail_re, new_detail_logic, html, flags=re.DOTALL)

# 9. Update switchTab to sync desktop-nav-tab
old_switch_tab_re = r'function switchTab\(tabName\) \{.*?(?=function readCsvFileSmart)'
new_switch_tab = """function switchTab(tabName) {
      const views = {
        lookup: document.getElementById('viewLookup'),
        browse: document.getElementById('viewBrowse'),
        import: document.getElementById('viewImport')
      };
      Object.keys(views).forEach(k => {
        if (k === tabName) views[k].classList.remove('hidden');
        else views[k].classList.add('hidden');
      });

      document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        const isTarget = btn.getAttribute('data-tab') === tabName;
        btn.classList.toggle('text-[#007AFF]', isTarget);
        btn.classList.toggle('text-gray-400', !isTarget);
      });

      document.querySelectorAll('.desktop-nav-tab').forEach(btn => {
        const isTarget = btn.getAttribute('data-tab') === tabName;
        btn.classList.toggle('text-blue-600', isTarget);
        btn.classList.toggle('bg-white', isTarget);
        btn.classList.toggle('shadow-xs', isTarget);
        btn.classList.toggle('text-gray-600', !isTarget);
      });

      if (tabName === 'browse') {
        renderBrowseList();
      }
    }
"""
html = re.sub(old_switch_tab_re, new_switch_tab, html, flags=re.DOTALL)

# 10. Update initApp start for cached & async data loading
old_init_start = """    function initApp() {
      // Load saved vocab or built-in 7 books
      let loadedCustom = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_VOCAB);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) loadedCustom = parsed;
        }
      } catch (e) {}

      vocabList = loadedCustom ? loadedCustom : BUILTIN_VOCAB.map(e => ({ ...e }));
      indexAllEntries(vocabList);"""

new_init_start = """    async function initApp() {
      // 1. Load user custom vocab or cached baseline
      let loadedCustom = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_VOCAB);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) loadedCustom = parsed;
        }
      } catch (e) {}

      let cachedBaseline = null;
      try {
        const rawCache = localStorage.getItem(STORAGE_KEY_BASELINE_CACHE);
        if (rawCache) {
          const parsedCache = JSON.parse(rawCache);
          if (Array.isArray(parsedCache) && parsedCache.length > 0) cachedBaseline = parsedCache;
        }
      } catch (e) {}

      if (cachedBaseline) {
        BUILTIN_VOCAB = cachedBaseline;
      }

      if (loadedCustom) {
        vocabList = loadedCustom;
        indexAllEntries(vocabList);
      } else if (cachedBaseline) {
        vocabList = cachedBaseline.map(e => ({ ...e }));
        indexAllEntries(vocabList);
      } else {
        document.getElementById('headerStats').textContent = '正在加载词库数据...';
      }"""

html = html.replace(old_init_start, new_init_start, 1)

# 11. Add card-selected highlight in delegated click handler
old_word_card_click = """        // Click on a Word Card in Lookup Results -> Open Word Detail Card
        const wordCard = e.target.closest('article[data-card-idx]');
        if (wordCard) {
          const idx = Number(wordCard.getAttribute('data-card-idx'));
          if (currentDisplayedEntries[idx]) {
            openWordDetailCard(currentDisplayedEntries[idx]);
          }
          return;
        }

        // Click on a Browse Card Item -> Open Word Detail Card
        const browseCard = e.target.closest('.browse-card-item');
        if (browseCard) {
          const bw = browseCard.getAttribute('data-browse-word');
          const bb = browseCard.getAttribute('data-browse-book');
          const found = vocabList.find(item => item.w === bw && item.b === bb) ||
                        vocabList.find(item => item.w === bw);
          if (found) {
            openWordDetailCard(found);
          }
          return;
        }"""

new_word_card_click = """        // Click on a Word Card in Lookup Results -> Open Word Detail Card
        const wordCard = e.target.closest('article[data-card-idx]');
        if (wordCard) {
          const idx = Number(wordCard.getAttribute('data-card-idx'));
          if (currentDisplayedEntries[idx]) {
            document.querySelectorAll('.word-card-clickable').forEach(c => c.classList.remove('card-selected'));
            wordCard.classList.add('card-selected');
            openWordDetailCard(currentDisplayedEntries[idx]);
          }
          return;
        }

        // Click on a Browse Card Item -> Open Word Detail Card
        const browseCard = e.target.closest('.browse-card-item');
        if (browseCard) {
          const bw = browseCard.getAttribute('data-browse-word');
          const bb = browseCard.getAttribute('data-browse-book');
          const found = vocabList.find(item => item.w === bw && item.b === bb) ||
                        vocabList.find(item => item.w === bw);
          if (found) {
            document.querySelectorAll('.browse-card-item').forEach(c => c.classList.remove('card-selected'));
            browseCard.classList.add('card-selected');
            openWordDetailCard(found);
          }
          return;
        }"""

html = html.replace(old_word_card_click, new_word_card_click, 1)

# 12. Update resetDefaultDbBtn and trigger fetchBaselineVocab at end of initApp
old_reset_btn = """      // Reset default 7 books button
      document.getElementById('resetDefaultDbBtn').addEventListener('click', () => {
        vocabList = BUILTIN_VOCAB.map(e => ({ ...e }));
        indexAllEntries(vocabList);
        selectedBookScope = 'ALL';
        try {
          localStorage.removeItem(STORAGE_KEY_CUSTOM_VOCAB);
        } catch (e) {}
        renderBookFilterBarAndSelects();
        renderBrowseList();
        showToast('已恢复默认 7 册人教版词库 (2,625 词)');
      });
    }"""

new_reset_btn = """      // Reset default 7 books button
      document.getElementById('resetDefaultDbBtn').addEventListener('click', async () => {
        try {
          localStorage.removeItem(STORAGE_KEY_CUSTOM_VOCAB);
        } catch (e) {}

        if (BUILTIN_VOCAB.length === 0) {
          showToast('正在重新获取官方词库...');
          await fetchBaselineVocab(true);
        } else {
          vocabList = BUILTIN_VOCAB.map(e => ({ ...e }));
          indexAllEntries(vocabList);
        }
        selectedBookScope = 'ALL';
        renderBookFilterBarAndSelects();
        renderBrowseList();
        showToast(`已恢复默认 7 册人教版词库 (${vocabList.length} 词)`);
      });

      // Background / Foreground fetch fresh baseline vocab
      await fetchBaselineVocab(Boolean(!loadedCustom && !cachedBaseline));
    }"""

html = html.replace(old_reset_btn, new_reset_btn, 1)

with open(dst_path, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Generated {dst_path} successfully. Total length: {len(html)} bytes.")

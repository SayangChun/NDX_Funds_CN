const els = {};
const state = {
  funds: [],
  apiMeta: null,
  loading: false,
  loadingSince: 0,
  refreshTimer: null
};

const dom = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html" && false) { /* 禁止：使用 text/children */ }
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return node;
};

const uniqueSorted = (items) => [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));

const tagClass = (tag) => {
  if (tag === "低申购费") return "tag tag-good";
  if (tag === "LOF") return "tag tag-warn";
  if (tag === "暂停申购" || tag === "实时不可用") return "tag tag-danger";
  return "tag tag-info";
};

const parseRate = (v) => {
  if (v == null || v === "" || v === "--") return NaN;
  const n = parseFloat(String(v).replace("%", ""));
  return Number.isFinite(n) ? n : NaN;
};

const formatPercent = (v) => {
  const n = parseRate(v);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "--";
};

const scoreFund = (fund) => {
  const openScore = (fund.subscribeStatus || "").includes("开放") ? 30 : 0;
  const buyScore = fund.isBuy ? 15 : 0;
  const returnScore = parseRate(fund.oneYear) / 3;
  const lofPenalty = (fund.type || "").includes("LOF") ? -4 : 0;
  const stalePenalty = fund.subscribeStatus === "实时不可用" ? -100 : 0;
  return openScore + buyScore + (Number.isFinite(returnScore) ? returnScore : 0) + lofPenalty + stalePenalty;
};

const resetSelect = (select, firstLabel) => {
  select.replaceChildren();
  select.appendChild(dom("option", { value: "all", text: firstLabel }));
};

const populateSelect = (select, values) => {
  for (const value of values) {
    select.appendChild(dom("option", { value, text: value }));
  }
};

const renderStats = () => {
  const live = state.funds.filter((f) => f.subscribeStatus !== "实时不可用");
  els.totalFunds.textContent = state.funds.length;
  els.totalFamilies.textContent = uniqueSorted(state.funds.map((f) => f.base)).length;
  els.openCount.textContent = state.funds.filter((f) =>
    (f.subscribeStatus || "").includes("开放") || f.isBuy
  ).length;
  const rates = live
    .map((f) => parseRate(f.buyRate))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  els.lowestFee.textContent = rates.length ? `${rates[0].toFixed(2)}%` : "--";
};

const renderShareMix = () => {
  const counts = state.funds.reduce((acc, fund) => {
    const k = fund.share || "?";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const max = Math.max(1, ...Object.values(counts));
  els.shareMix.replaceChildren(...Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([share, count]) => {
      const width = `${Math.max(8, Math.round((count / max) * 100))}%`;
      return dom("div", { class: "share-bar" }, [
        dom("span", { class: "share-bar-label", text: `${share}类` }),
        dom("span", { class: "share-bar-track" }, [
          dom("span", { class: "share-bar-fill", style: `width: ${width}` })
        ]),
        dom("span", { class: "share-bar-count", text: String(count) })
      ]);
    }));
};

const relativeTime = (iso) => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "--";
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
};

const renderMeta = () => {
  if (!state.apiMeta) return;
  els.sourceBoxTitle.textContent = state.apiMeta.fromFallback ? "本地种子清单（实时不可用）" : "实时公开接口";
  const { discoveredCodes, funds, failed, source } = state.apiMeta;
  els.sourceBoxText.textContent = state.apiMeta.fromFallback
    ? `发现 ${discoveredCodes} 个种子代码，仅展示 ${funds.length} 只基础信息；规模/净值/申购状态等待接口恢复后刷新。`
    : `来自 ${source}；发现 ${discoveredCodes} 个候选代码，成功收录 ${funds.length} 只，接口失败 ${failed} 只。`;
  els.updatedAt.dateTime = state.apiMeta.updatedAt;
  els.updatedAt.textContent = `更新于 ${state.apiMeta.updatedAt} (${relativeTime(state.apiMeta.updatedAt)})`;
  if (state.apiMeta.warning) {
    els.warningBanner.replaceChildren(dom("span", { class: "warning-icon", text: "!" }), dom("span", { text: state.apiMeta.warning }));
    els.warningBanner.hidden = false;
  } else {
    els.warningBanner.hidden = true;
  }
  els.refreshBtn.disabled = false;
  els.refreshBtn.textContent = "刷新数据";
};

const getFilteredFunds = () => {
  const keyword = els.search.value.trim().toLowerCase();
  const manager = els.manager.value;
  const share = els.share.value;
  const type = els.type.value;
  const sortKey = els.sort.value;

  const filtered = state.funds.filter((fund) => {
    const haystack = `${fund.code} ${fund.name} ${fund.manager} ${fund.type} ${fund.indexName}`.toLowerCase();
    return (!keyword || haystack.includes(keyword))
      && (manager === "all" || fund.manager === manager)
      && (share === "all" || fund.share === share)
      && (type === "all" || fund.type === type);
  });

  const cmpCode = (a, b) => a.code.localeCompare(b.code);
  if (sortKey === "fee") {
    const totalRate = (f) => (parseRate(f.mgmtFee) || 0) + (parseRate(f.custodyFee) || 0);
    return filtered.sort((a, b) => (totalRate(a) || Infinity) - (totalRate(b) || Infinity) || cmpCode(a, b));
  }
  if (sortKey === "size") {
    return filtered.sort((a, b) => (parseRate(b.fundSize) || -Infinity) - (parseRate(a.fundSize) || -Infinity) || cmpCode(a, b));
  }
  if (sortKey === "oneYear") {
    return filtered.sort((a, b) => (parseRate(b.oneYear) || -Infinity) - (parseRate(a.oneYear) || -Infinity) || cmpCode(a, b));
  }
  if (sortKey === "company") {
    return filtered.sort((a, b) => (a.manager || "").localeCompare(b.manager || "", "zh-CN") || cmpCode(a, b));
  }
  if (sortKey === "code") {
    return filtered.sort(cmpCode);
  }
  return filtered.sort((a, b) => scoreFund(b) - scoreFund(a) || cmpCode(a, b));
};

const setCell = (fragment, selector, text) => {
  const cell = fragment.querySelector(selector);
  cell.textContent = text == null || text === "" ? "--" : String(text);
};

const renderDetail = (fund) => {
  const grid = dom("div", { class: "detail-grid" });
  const buyRateNum = parseRate(fund.buyRate);
  const buyRateDisplay = Number.isFinite(buyRateNum) && buyRateNum === 0 ? "免申购费" : (fund.buyRate || "--");
  const cards = [
    ["主基金", dom("strong", { text: fund.base || "--" })],
    ["跟踪标的", dom("strong", { text: `${fund.indexName} (${fund.indexCode})` })],
    ["净值与日期", dom("p", { text: `单位净值 ${fund.nav}，累计净值 ${fund.accumulatedNav}，日期 ${fund.navDate || "--"}` })],
    ["申购规则", dom("p", { text: `最低申购 ${fund.minBuy} 元；天天基金限额 ${fund.maxBuy} 元；基金公司App限额 ${fund.appLimit && fund.appLimit !== "--" ? fund.appLimit + " 元" : fund.appLimit}；原申购费 ${fund.sourceRate || "--"}，当前费用 ${buyRateDisplay}；持有免赎 ${fund.freeRedeemDays || "--"} 天` })],
    ["运作费用", dom("p", { text: `管理费 ${fund.mgmtFee}；托管费 ${fund.custodyFee}；基金规模 ${fund.fundSize} 亿；跟踪误差 ${fund.trackingError}` })],
    ["阶段涨幅", dom("p", { text: `近1月 ${formatPercent(fund.oneMonth)}；近3月 ${formatPercent(fund.threeMonth)}；近1年 ${formatPercent(fund.oneYear)}；今年 ${formatPercent(fund.thisYear)}` })],
    ["基金资料", dom("p", { text: `成立日 ${fund.establishDate}；风险等级 ${fund.riskLevel}；管理人 ${fund.manager}` })],
    ["销售状态", dom("p", { text: `申购：${fund.subscribeStatus}；赎回：${fund.redeemStatus}；公开接口购买标记：${fund.isBuy ? "可买" : "不可买/未开放"}` })],
    ["准确性说明", dom("p", { text: fund.note || "--" })]
  ];
  for (const [label, content] of cards) {
    grid.appendChild(dom("div", { class: "detail-card" }, [
      dom("span", { text: label }),
      content
    ]));
  }
  return grid;
};

const renderRow = (fund, index) => {
  const fragment = els.template.content.cloneNode(true);
  const row = fragment.querySelector(".fund-row");
  const detail = fragment.querySelector(".detail-row");

  const rank = fragment.querySelector(".rank-cell");
  rank.appendChild(dom("span", { class: "rank-badge", text: String(index + 1) }));

  setCell(fragment, ".code-cell", fund.code);
  setCell(fragment, ".name-cell", fund.name);
  setCell(fragment, ".manager-cell", fund.manager);
  setCell(fragment, ".share-cell", fund.share);
  setCell(fragment, ".type-cell", fund.type);

  const feeCell = fragment.querySelector(".fee-cell");
  const rateNum = parseRate(fund.buyRate);
  const isZero = Number.isFinite(rateNum) && rateNum === 0;
  const rateDisplay = isZero ? "免申购费" : (fund.buyRate || "--");
  feeCell.replaceChildren(
    dom("span", { text: rateDisplay }),
    !isZero && fund.sourceRate && fund.sourceRate !== fund.buyRate
      ? dom("div", { class: "muted", text: `原费率 ${fund.sourceRate}` })
      : null
  );

  setCell(fragment, ".mgmt-cell", fund.mgmtFee);
  setCell(fragment, ".custody-cell", fund.custodyFee);
  setCell(fragment, ".size-cell", fund.fundSize);

  const statusCell = fragment.querySelector(".status-cell");
  const isOpen = (fund.subscribeStatus || "").includes("开放");
  const statusClass = fund.subscribeStatus === "实时不可用"
    ? "status-bad"
    : isOpen ? "status-open" : "status-check";
  statusCell.replaceChildren(
    dom("span", { class: statusClass, text: fund.subscribeStatus || "--" }),
    fund.navDate ? dom("div", { class: "muted", text: fund.navDate }) : null
  );

  setCell(fragment, ".redeem-days-cell", fund.freeRedeemDays);
  setCell(fragment, ".limit-cell", fund.maxBuy && fund.maxBuy !== "--" ? `${fund.maxBuy} 元/日` : "未公布");
  setCell(fragment, ".app-limit-cell", fund.appLimit && fund.appLimit !== "--" ? `${fund.appLimit} 元/日` : "未公布");

  const tagsCell = fragment.querySelector(".tags-cell");
  tagsCell.replaceChildren(
    dom("div", { class: "tag-list" },
      (fund.tags || []).map((tag) => dom("span", { class: tagClass(tag), text: tag }))
    )
  );

  const detailTd = detail.querySelector("td");
  detailTd.replaceChildren(renderDetail(fund));

  const toggle = (e) => {
    if (e && e.type === "click" && e.target.closest("a, button")) return;
    if (e) e.preventDefault();
    const expanded = row.getAttribute("aria-expanded") === "true";
    const next = expanded ? "false" : "true";
    row.setAttribute("aria-expanded", next);
    detail.classList.toggle("is-open", !expanded);
  };
  row.addEventListener("click", toggle);
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") toggle(e);
  });

  return fragment;
};

const renderRows = () => {
  const visibleFunds = getFilteredFunds();
  els.visibleCount.textContent = visibleFunds.length;
  els.table.replaceChildren();

  if (!visibleFunds.length) {
    const row = dom("tr", {}, [
      dom("td", { colspan: 15, class: "empty-state", text: "没有符合当前筛选条件的基金份额" })
    ]);
    els.table.appendChild(row);
    return;
  }

  const frag = document.createDocumentFragment();
  visibleFunds.forEach((fund, index) => frag.appendChild(renderRow(fund, index)));
  els.table.appendChild(frag);
};

const renderLoading = (message) => {
  els.table.replaceChildren(
    dom("tr", {}, [
      dom("td", { colspan: 15, class: "empty-state loading-state" }, [
        dom("span", { class: "spinner", "aria-hidden": "true" }),
        dom("span", { text: message })
      ])
    ])
  );
  els.visibleCount.textContent = "0";
};

const renderError = (message) => {
  els.table.replaceChildren(
    dom("tr", {}, [
      dom("td", { colspan: 15, class: "empty-state" }, [
        dom("div", { class: "error-title", text: "实时数据加载失败" }),
        dom("div", { class: "error-detail", text: message })
      ])
    ])
  );
  els.visibleCount.textContent = "0";
};

const hydrateFilters = () => {
  resetSelect(els.manager, "全部公司");
  resetSelect(els.share, "全部份额");
  resetSelect(els.type, "全部类型");
  populateSelect(els.manager, uniqueSorted(state.funds.map((f) => f.manager)));
  populateSelect(els.share, uniqueSorted(state.funds.map((f) => f.share)));
  populateSelect(els.type, uniqueSorted(state.funds.map((f) => f.type)));
};

const captureEls = () => {
  for (const [k, sel] of Object.entries({
    totalFunds: "#totalFunds",
    totalFamilies: "#totalFamilies",
    openCount: "#openCount",
    lowestFee: "#lowestFee",
    visibleCount: "#visibleCount",
    table: "#fundTable",
    template: "#fundRowTemplate",
    search: "#searchInput",
    manager: "#managerFilter",
    share: "#shareFilter",
    type: "#typeFilter",
    sort: "#sortSelect",
    shareMix: "#shareMix",
    updatedAt: "#updatedAt",
    sourceBoxTitle: ".source-box strong",
    sourceBoxText: ".source-box p",
    refreshBtn: "#refreshBtn",
    warningBanner: "#warningBanner"
  })) {
    els[k] = document.querySelector(sel);
  }
};

const loadFunds = async ({ force } = {}) => {
  if (state.loading && !force) return;
  state.loading = true;
  state.loadingSince = Date.now();
  els.refreshBtn.disabled = true;
  els.refreshBtn.textContent = "刷新中...";
  renderLoading("正在从公开接口获取数据，预计 5-20 秒...");
  try {
    const url = force ? `/api/funds?ts=${Date.now()}` : "/api/funds";
    const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    state.funds = Array.isArray(payload.funds) ? payload.funds : [];
    state.apiMeta = payload;
    hydrateFilters();
    renderMeta();
    renderStats();
    renderShareMix();
    renderRows();
  } catch (error) {
    renderError(error.message);
  } finally {
    state.loading = false;
    els.refreshBtn.disabled = false;
    els.refreshBtn.textContent = "刷新数据";
  }
};

const scheduleRefresh = () => {
  if (state.refreshTimer) clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(async () => {
    await loadFunds({ force: true });
    scheduleRefresh();
  }, 5 * 60 * 1000);
};

const init = () => {
  captureEls();
  els.search.addEventListener("input", renderRows);
  for (const control of [els.manager, els.share, els.type, els.sort]) {
    control.addEventListener("change", renderRows);
  }
  els.refreshBtn.addEventListener("click", async () => {
    await loadFunds({ force: true });
    scheduleRefresh();
  });
  setInterval(() => {
    if (state.apiMeta?.updatedAt) {
      els.updatedAt.textContent = `更新于 ${state.apiMeta.updatedAt} (${relativeTime(state.apiMeta.updatedAt)})`;
    }
  }, 30000);
  loadFunds();
  scheduleRefresh();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

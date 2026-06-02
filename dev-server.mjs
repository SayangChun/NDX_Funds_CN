import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const CACHE_MS = Number(process.env.CACHE_MS || 5 * 60 * 1000);
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 8000);
const FETCH_RETRIES = Number(process.env.FETCH_RETRIES || 2);
const DISCOVERY_CACHE_MS = Number(process.env.DISCOVERY_CACHE_MS || 60 * 60 * 1000);
const STATIC_CACHE_SECONDS = Number(process.env.STATIC_CACHE_SECONDS || 3600);

const SEED_CODES = [
  "000834", "006479", "008971", "012752", "012870", "014978", "015299",
  "015300", "016055", "016057", "016452", "016453", "016532", "016533",
  "018043", "018044", "018966", "018967", "019172", "019173", "019441",
  "019442", "019524", "019525", "019547", "019548", "019736", "019737",
  "021000", "021773", "021778", "021838", "022525", "022664", "023422",
  "024237", "040046", "160213", "161130", "270042", "539001"
];

const FALLBACK_META = {
  "000834": { name: "大成纳斯达克100ETF联接(QDII)A", manager: "大成基金管理有限公司", type: "ETF联接", share: "A" },
  "006479": { name: "广发纳指100ETF联接(QDII)人民币C", manager: "广发基金管理有限公司", type: "ETF联接", share: "C" },
  "008971": { name: "大成纳斯达克100ETF联接(QDII)C", manager: "大成基金管理有限公司", type: "ETF联接", share: "C" },
  "012752": { name: "建信纳斯达克100指数(QDII)C人民币", manager: "建信基金管理有限责任公司", type: "指数基金", share: "C" },
  "012870": { name: "易方达纳斯达克100ETF联接(QDII-LOF)C人民币", manager: "易方达基金管理有限公司", type: "LOF联接场外", share: "C" },
  "014978": { name: "华安纳斯达克100ETF联接(QDII)C", manager: "华安基金管理有限公司", type: "ETF联接", share: "C" },
  "015299": { name: "华夏纳斯达克100ETF发起式联接(QDII)A", manager: "华夏基金管理有限公司", type: "ETF联接", share: "A" },
  "015300": { name: "华夏纳斯达克100ETF发起式联接(QDII)C", manager: "华夏基金管理有限公司", type: "ETF联接", share: "C" },
  "016055": { name: "博时纳斯达克100ETF发起式联接(QDII)A人民币", manager: "博时基金管理有限公司", type: "ETF联接", share: "A" },
  "016057": { name: "博时纳斯达克100ETF发起式联接(QDII)C人民币", manager: "博时基金管理有限公司", type: "ETF联接", share: "C" },
  "016452": { name: "南方纳斯达克100指数发起(QDII)A", manager: "南方基金管理股份有限公司", type: "指数发起式", share: "A" },
  "016453": { name: "南方纳斯达克100指数发起(QDII)C", manager: "南方基金管理股份有限公司", type: "指数发起式", share: "C" },
  "016532": { name: "嘉实纳斯达克100ETF发起联接(QDII)A人民币", manager: "嘉实基金管理有限公司", type: "ETF联接", share: "A" },
  "016533": { name: "嘉实纳斯达克100ETF发起联接(QDII)C人民币", manager: "嘉实基金管理有限公司", type: "ETF联接", share: "C" },
  "018043": { name: "天弘纳斯达克100指数发起(QDII)A", manager: "天弘基金管理有限公司", type: "指数发起式", share: "A" },
  "018044": { name: "天弘纳斯达克100指数发起(QDII)C", manager: "天弘基金管理有限公司", type: "指数发起式", share: "C" },
  "018966": { name: "汇添富纳斯达克100ETF发起式联接(QDII)人民币A", manager: "汇添富基金管理股份有限公司", type: "ETF联接", share: "A" },
  "018967": { name: "汇添富纳斯达克100ETF发起式联接(QDII)人民币C", manager: "汇添富基金管理股份有限公司", type: "ETF联接", share: "C" },
  "019172": { name: "摩根纳斯达克100指数(QDII)人民币A", manager: "摩根基金管理(中国)有限公司", type: "指数基金", share: "A" },
  "019173": { name: "摩根纳斯达克100指数(QDII)人民币C", manager: "摩根基金管理(中国)有限公司", type: "指数基金", share: "C" },
  "019441": { name: "万家纳斯达克100指数发起式(QDII)A", manager: "万家基金管理有限公司", type: "指数发起式", share: "A" },
  "019442": { name: "万家纳斯达克100指数发起式(QDII)C", manager: "万家基金管理有限公司", type: "指数发起式", share: "C" },
  "019524": { name: "华泰柏瑞纳斯达克100ETF发起式联接(QDII)A", manager: "华泰柏瑞基金管理有限公司", type: "ETF联接", share: "A" },
  "019525": { name: "华泰柏瑞纳斯达克100ETF发起式联接(QDII)C", manager: "华泰柏瑞基金管理有限公司", type: "ETF联接", share: "C" },
  "019547": { name: "招商纳斯达克100ETF发起式联接(QDII)A", manager: "招商基金管理有限公司", type: "ETF联接", share: "A" },
  "019548": { name: "招商纳斯达克100ETF发起式联接(QDII)C", manager: "招商基金管理有限公司", type: "ETF联接", share: "C" },
  "019736": { name: "宝盈纳斯达克100指数发起(QDII)A人民币", manager: "宝盈基金管理有限公司", type: "指数发起式", share: "A" },
  "019737": { name: "宝盈纳斯达克100指数发起(QDII)C人民币", manager: "宝盈基金管理有限公司", type: "指数发起式", share: "C" },
  "021000": { name: "南方纳斯达克100指数发起(QDII)I", manager: "南方基金管理股份有限公司", type: "指数发起式", share: "I" },
  "021773": { name: "汇添富纳斯达克100ETF发起式联接(QDII)人民币E", manager: "汇添富基金管理股份有限公司", type: "ETF联接", share: "E" },
  "021778": { name: "广发纳指100ETF联接(QDII)人民币F", manager: "广发基金管理有限公司", type: "ETF联接", share: "F" },
  "021838": { name: "嘉实纳斯达克100ETF发起联接(QDII)I人民币", manager: "嘉实基金管理有限公司", type: "ETF联接", share: "I" },
  "022525": { name: "天弘纳斯达克100指数发起(QDII)D", manager: "天弘基金管理有限公司", type: "指数发起式", share: "D" },
  "022664": { name: "华泰柏瑞纳斯达克100ETF发起式联接(QDII)I", manager: "华泰柏瑞基金管理有限公司", type: "ETF联接", share: "I" },
  "023422": { name: "建信纳斯达克100指数(QDII)D人民币", manager: "建信基金管理有限责任公司", type: "指数基金", share: "D" },
  "024237": { name: "博时纳斯达克100ETF发起式联接(QDII)I人民币", manager: "博时基金管理有限公司", type: "ETF联接", share: "I" },
  "040046": { name: "华安纳斯达克100ETF联接(QDII)A", manager: "华安基金管理有限公司", type: "ETF联接", share: "A" },
  "160213": { name: "国泰纳斯达克100指数(QDII)", manager: "国泰基金管理有限公司", type: "LOF场外", share: "A" },
  "161130": { name: "易方达纳斯达克100ETF联接(QDII-LOF)A人民币", manager: "易方达基金管理有限公司", type: "LOF联接场外", share: "A" },
  "270042": { name: "广发纳指100ETF联接(QDII)人民币A", manager: "广发基金管理有限公司", type: "ETF联接", share: "A" },
  "539001": { name: "建信纳斯达克100指数(QDII)A人民币", manager: "建信基金管理有限责任公司", type: "指数基金", share: "A" }
};

const SHARE_RE = /(?:人民币)?([A-Z])(?:人民币)?$/i;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};
const STATIC_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY"
};
const SEARCH_KEYWORDS = [
  "纳斯达克100", "纳指100", "NASDAQ100", "纳斯达克100指数", "纳指100指数",
  "纳指ETF联接", "纳斯达克ETF联接", "纳指100ETF", "纳斯达克100QDII", "纳指QDII",
  "嘉实纳斯达克100", "天弘纳斯达克100", "摩根纳斯达克100", "博时纳斯达克100",
  "南方纳斯达克100", "汇添富纳斯达克100", "万家纳斯达克100", "华泰柏瑞纳斯达克100",
  "招商纳斯达克100", "宝盈纳斯达克100", "华夏纳斯达克100", "华安纳斯达克100",
  "大成纳斯达克100", "国泰纳斯达克100", "广发纳指100", "建信纳斯达克100",
  "易方达纳斯达克100"
];

let cache = null;
let loading = null;
let discoveryCache = null;
let discoveryLoading = null;
const etagCache = new Map();

const log = (level, message, meta = {}) => {
  const entry = { ts: new Date().toISOString(), level, message, ...meta };
  console.log(JSON.stringify(entry));
};

const apiUrl = (path, params) => {
  const url = new URL(path);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeStr = (v, fallback = "--") => (v == null || v === "" ? fallback : String(v));
const safeRate = (v) => {
  if (v == null || v === "") return "--";
  const s = String(v);
  return s.includes("%") ? s : `${s}%`;
};

const fetchWithTimeout = async (url, options = {}) => {
  const { timeout = REQUEST_TIMEOUT_MS, retries = FETCH_RETRIES, label = "request" } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "user-agent": "nasdaq100-funds-cn/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } catch (error) {
    const retryable = error.name === "AbortError" || ["ECONNRESET", "EAI_AGAIN", "ENOTFOUND", "UND_ERR_SOCKET"].includes(error.code);
    if (retries > 0 && retryable) {
      const backoff = Math.min(2000, 500 * (FETCH_RETRIES - retries + 1));
      log("warn", `${label} failed, retrying`, { error: error.message, backoff });
      await sleep(backoff);
      return fetchWithTimeout(url, { timeout: Math.min(timeout * 1.2, 15000), retries: retries - 1, label });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const fetchText = (url, options) => fetchWithTimeout(url, options);
const fetchJson = async (url, options) => JSON.parse(await fetchText(url, options));

const parseJsonp = (text, callbackName) => {
  if (callbackName) {
    const start = text.indexOf(callbackName + "(");
    if (start !== -1) {
      const end = text.lastIndexOf(")");
      if (end > start) return JSON.parse(text.slice(start + callbackName.length + 1, end));
    }
  }
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  if (start === -1 || end <= start) throw new Error("JSONP response is malformed");
  return JSON.parse(text.slice(start + 1, end));
};

const discoverCodes = async () => {
  if (discoveryCache && Date.now() - discoveryCache.createdAt < DISCOVERY_CACHE_MS) {
    return discoveryCache.codes;
  }
  if (discoveryLoading) return discoveryLoading;

  discoveryLoading = (async () => {
    const callbackName = "jQuery" + Math.floor(Math.random() * 1e10);
    const discovered = new Set(SEED_CODES);
    let errors = 0;

    await Promise.allSettled(SEARCH_KEYWORDS.map(async (keyword) => {
      const url = apiUrl("https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx", {
        callback: callbackName,
        type: "mix",
        key: keyword,
        m: "1"
      });
      try {
        const text = await fetchText(url, { label: `discover:${keyword}` });
        const payload = parseJsonp(text, callbackName);
        (payload.Datas || []).forEach((item) => {
          if (item?.CODE) discovered.add(String(item.CODE).padStart(6, "0"));
        });
      } catch (error) {
        errors += 1;
        log("warn", "discover keyword failed", { keyword, error: error.message });
      }
    }));

    const codes = [...discovered].sort();
    discoveryCache = { createdAt: Date.now(), codes, errors };
    log("info", "discoverCodes complete", { count: codes.length, errors });
    return codes;
  })();

  try {
    return await discoveryLoading;
  } finally {
    discoveryLoading = null;
  }
};

const getPeriodMap = async (code) => {
  const url = apiUrl("https://fundmobapi.eastmoney.com/FundMNewApi/FundMNPeriodIncrease", {
    FCODE: code,
    deviceid: "Wap",
    plat: "Wap",
    product: "EFund",
    version: "2.0.0"
  });
  const payload = await fetchJson(url, { label: `period:${code}` });
  return Object.fromEntries((payload.Datas || []).map((item) => [item.title, item.syl || ""]));
};

const getBasic = async (code, attempt = 1) => {
  const url = apiUrl("https://fundmobapi.eastmoney.com/FundMNewApi/FundMNNBasicInformation", {
    FCODE: code,
    deviceid: "Wap",
    plat: "Wap",
    product: "EFund",
    version: "2.0.0"
  });
  const payload = await fetchJson(url, { label: `basic:${code}#${attempt}` });
  if (!payload.Datas?.FCODE && attempt < 3) {
    await sleep(300 * attempt);
    return getBasic(code, attempt + 1);
  }
  return payload.Datas || {};
};

const getDetailInfo = async (code) => {
  const url = apiUrl("https://fundmobapi.eastmoney.com/FundMNewApi/FundMNDetailInformation", {
    FCODE: code,
    deviceid: "Wap",
    plat: "Wap",
    product: "EFund",
    version: "2.0.0"
  });
  try {
    const payload = await fetchJson(url, { label: `detail:${code}` });
    return payload.Datas || {};
  } catch (error) {
    log("warn", "detail fetch failed", { code, error: error.message });
    return {};
  }
};

const getFeeData = async (code) => {
  const url = apiUrl("https://api.fund.eastmoney.com/f10/FundFeeInfo", {
    fundcode: code, callback: "jQuery" + Math.floor(Math.random() * 1e10)
  });
  try {
    const text = await fetchText(url, { label: `fee:${code}` });
    let payload;
    try { payload = parseJsonp(text, ""); } catch { payload = JSON.parse(text); }
    const ds = payload.Data || payload.Datas || payload || {};
    const redeemFee = ds.RedeemFee || ds.REDEEM_FEE || ds.REDEEM || [];
    if (Array.isArray(redeemFee)) {
      const free = redeemFee.find((t) => {
        const rate = t.RATE ?? t.Rate ?? t.rate ?? t.FEE ?? t.fee ?? "";
        const num = Number.parseFloat(rate);
        return (Number.isFinite(num) && num === 0) || /0[:：]?00/.test(String(rate));
      });
      if (free) return String(free.MINDAY ?? free.MIN_DAY ?? free.MIN_DAYS ?? free.DAY ?? free.DAYS ?? free.day ?? free.MinDay ?? "");
    }
    const flat = ds.FREEDEEMDAY ?? ds.FREEREDEEMDAYS ?? ds.MINHOLDDAYS ?? ds.MIN_FREE_HOLD ?? ds.REDEEM_FREE_DAYS ?? ds.FREEREDEEM ?? null;
    if (flat != null) return String(flat);
    return null;
  } catch (error) {
    log("warn", "fee data fetch failed", { code, error: error.message });
    return null;
  }
};

const inferShare = (name) => {
  const match = name.match(SHARE_RE);
  if (match) return match[1].toUpperCase();
  return "A";
};

const inferType = (name, code) => {
  if (name.includes("LOF")) return name.includes("联接") ? "LOF联接场外" : "LOF场外";
  if (/^(160|161)/.test(code)) return name.includes("联接") ? "LOF联接场外" : "LOF场外";
  if (name.includes("ETF") && name.includes("联接")) return "ETF联接";
  if (name.includes("发起")) return "指数发起式";
  return "指数基金";
};

const normalizeFund = async (code) => {
  let basic = {};
  let detail = {};
  try {
    [basic, detail] = await Promise.all([getBasic(code), getDetailInfo(code)]);
  } catch (error) {
    log("warn", "parallel fetch failed, fallback to basic", { code, error: error.message });
    basic = await getBasic(code);
  }
  if (!basic?.FCODE) return { excluded: true, code, reason: "empty-basic" };

  const name = basic.SHORTNAME || basic.FNAME || "";
  const indexName = basic.INDEXNAME || "";
  const isNasdaq100 =
    /纳斯达克100|纳指100|NASDAQ\s*100/i.test(name) ||
    /纳斯达克100|纳指100|NASDAQ\s*100/i.test(indexName) ||
    basic.INDEXCODE === "NDX100";
  const isUsdShare = /(美元现汇|美元现钞|USD)/i.test(name);
  const isWrongIndex =
    /综合|生物|科技市值|精选|主动/i.test(name) && !/纳斯达克100|纳指100/i.test(name);
  const isExcluded = isUsdShare || isWrongIndex;
  const isExchangeTradedOnly =
    basic.SGZT === "场内交易" ||
    (/^(159|513|588|56)/.test(code) && !/联接|LOF/i.test(name));

  if (!isNasdaq100 || isExcluded || isExchangeTradedOnly) {
    return {
      excluded: true,
      code,
      reason: isExchangeTradedOnly
        ? "exchange-traded-only"
        : isUsdShare
          ? "usd-share"
          : isWrongIndex
            ? "excluded-name"
            : "not-nasdaq-100",
      name,
      indexName,
      indexCode: basic.INDEXCODE || ""
    };
  }

  let periods = {};
  let feeData = null;
  const [periodsResult, feeResult] = await Promise.allSettled([getPeriodMap(code), getFeeData(code)]);
  if (periodsResult.status === "fulfilled") {
    periods = periodsResult.value;
  } else {
    log("warn", "period fetch failed", { code, error: periodsResult.reason?.message });
  }
  if (feeResult.status === "fulfilled") {
    feeData = feeResult.value;
  }

  const share = inferShare(name);
  const type = inferType(name, code);
  const tags = [`${share}类`];
  if (type.includes("LOF")) tags.push("LOF");
  if (safeRate(basic.RATE) === "0.00%" || safeRate(basic.RATE) === "0.10%") tags.push("低申购费");
  if ((basic.SGZT ?? "").includes("暂停")) tags.push("暂停申购");

  const mgmtFee = safeRate(detail.MGREXP ?? basic.HRGRT);
  const custodyFee = safeRate(detail.TRUSTEXP ?? basic.HSGRT);
  const rawSize = Number.parseFloat(basic.FUNDSCALE ?? basic.ENDNAV);
  const fundSize = Number.isFinite(rawSize) ? (rawSize / 1e8).toFixed(2) : "--";
  const trackingError = safeStr(basic.TRKERROR);

  const findFreeRedeemDays = (obj, depth = 0) => {
    if (!obj || typeof obj !== "object" || depth > 3) return null;
    const names = [
      "FREEREDEEMDAY", "FREEREDEEMDAYS", "FREE_REDEEM_DAYS", "FREEDEEMDAY",
      "MINHOLDDAYS", "MIN_HOLD_DAYS", "FREE_REDEEM_DAY", "MINFREDEEMDAYS",
      "MINFREEHOLD", "MIN_FREE_HOLD", "HOLD_FREE_DAYS", "REDEEM_FREE_DAYS",
      "REDEEMFREE", "FREEREDEEM", "LOCK_PERIOD", "FREEZE_DAY",
      "MIN_REDEEM_FREE_DAYS", "REDEEM_FREE_PERIOD", "MIN_REDEEM_FREE",
      "MINSHFREE", "SHFREEDAY"
    ];
    for (const key of Object.keys(obj)) {
      const upper = key.toUpperCase();
      const flat = upper.replace(/_/g, "");
      if (names.some((n) => n === upper || n.replace(/_/g, "") === flat)) {
        const v = obj[key];
        if (v != null) return v;
      }
    }
    for (const key of Object.keys(obj)) {
      const child = obj[key];
      if (child && typeof child === "object") {
        const result = findFreeRedeemDays(child, depth + 1);
        if (result != null) return result;
      }
    }
    return null;
  };
  const freeRedeemDays = safeStr(findFreeRedeemDays(detail) ?? findFreeRedeemDays(basic) ?? feeData ?? findFreeRedeemDays(periods));

  const subscribeOpen = (basic.SGZT ?? "").includes("开放");
  const channels = subscribeOpen ? ["开放申购", "公开销售接口"] : ["暂停/限制", "公开销售接口"];

  return {
    code: basic.FCODE,
    name,
    manager: safeStr(basic.JJGS),
    share,
    type,
    base: name.replace(/(?:人民币)?[A-Z](?:人民币)?$/i, "").replace(/\s+$/, ""),
    indexName: safeStr(indexName),
    indexCode: safeStr(basic.INDEXCODE),
    nav: safeStr(basic.DWJZ),
    accumulatedNav: safeStr(basic.LJJZ),
    dailyReturn: basic.RZDF ?? "",
    navDate: safeStr(basic.SSBCFDAY || basic.FSRQ),
    subscribeStatus: safeStr(basic.SGZT),
    redeemStatus: safeStr(basic.SHZT),
    sourceRate: safeRate(basic.SOURCERATE),
    buyRate: safeRate(basic.RATE),
    minBuy: safeStr(basic.MINSG),
    maxBuy: safeStr(basic.MAXSG),
    riskLevel: safeStr(basic.RISKLEVEL),
    establishDate: safeStr(basic.ESTABDATE),
    isBuy: basic.BUY === true,
    isSales: basic.ISSALES === "1",
    mgmtFee,
    custodyFee,
    fundSize,
    trackingError,
    oneMonth: periods.Y || "",
    threeMonth: periods["3Y"] || "",
    sixMonth: periods["6Y"] || "",
    oneYear: periods["1N"] || "",
    thisYear: periods.JN || "",
    sinceLaunch: periods.LN || "",
    freeRedeemDays,
    tags,
    channels,
    note:
      "实时字段来自天天基金/东方财富公开接口；基金规模、管理费、托管费、跟踪误差通过 FundMNNBasicInformation 接口实时获取。支付宝和基金公司App是否可买没有稳定公开接口，本页不伪造平台实时上架状态。"
  };
};

const buildFallbackFund = (code) => {
  const meta = FALLBACK_META[code];
  if (!meta) return null;
  return {
    code,
    name: meta.name,
    manager: meta.manager,
    share: meta.share,
    type: meta.type,
    base: meta.name.replace(/(?:人民币)?[A-Z](?:人民币)?$/i, "").replace(/\s+$/, ""),
    indexName: "纳斯达克100",
    indexCode: "NDX100",
    nav: "--",
    accumulatedNav: "--",
    dailyReturn: "",
    navDate: "",
    subscribeStatus: "实时不可用",
    redeemStatus: "--",
    freeRedeemDays: "--",
    sourceRate: "--",
    buyRate: "--",
    minBuy: "--",
    maxBuy: "--",
    riskLevel: "--",
    establishDate: "--",
    isBuy: false,
    isSales: false,
    mgmtFee: "--",
    custodyFee: "--",
    fundSize: "--",
    trackingError: "--",
    oneMonth: "",
    threeMonth: "",
    sixMonth: "",
    oneYear: "",
    thisYear: "",
    sinceLaunch: "",
    tags: [`${meta.share}类`, "实时不可用"],
    channels: ["公开销售接口", "实时状态不可用"],
    note: "实时接口当前不可用，仅展示代码、名称、基金公司、类型与份额。点击“刷新”重试。"
  };
};

const buildFallbackPayload = (reason) => ({
  updatedAt: new Date().toISOString(),
  cacheSeconds: Math.round(CACHE_MS / 1000),
  source: "static-seed-fallback",
  fromCache: false,
  fromFallback: true,
  discoveredCodes: SEED_CODES.length,
  failed: SEED_CODES.length,
  funds: SEED_CODES.map(buildFallbackFund).filter(Boolean),
  warning: [
    `实时接口不可用：${reason}`,
    "已切换到本地种子清单（41 个 2026-06 验证过的场外人民币份额）。",
    "规模、净值、申购状态、限额等字段在实时数据恢复前显示为 “--”。"
  ].join("；"),
  error: reason
});

const loadRealtimeFunds = async () => {
  const now = Date.now();
  if (cache && now - cache.createdAt < CACHE_MS) {
    return { ...cache.payload, fromCache: true };
  }
  if (loading) {
    try {
      return await loading;
    } catch (error) {
      if (cache) return { ...cache.payload, fromCache: true, warning: `刷新失败：${error.message}` };
      throw error;
    }
  }

  loading = (async () => {
    let codes = SEED_CODES;
    let discoveryErrors = 0;
    try {
      const result = await discoverCodes();
      codes = result;
      discoveryErrors = discoveryCache?.errors || 0;
    } catch (error) {
      log("error", "discoverCodes failed, use seed only", { error: error.message });
    }

    const settled = [];
    const concurrency = 6;
    for (let i = 0; i < codes.length; i += concurrency) {
      const batch = codes.slice(i, i + concurrency);
      settled.push(...(await Promise.allSettled(batch.map((code) => normalizeFund(code)))));
      if (i + concurrency < codes.length) await sleep(180);
    }
    const funds = settled
      .filter((item) => item.status === "fulfilled" && item.value && !item.value.excluded)
      .map((item) => item.value)
      .sort((a, b) => a.code.localeCompare(b.code));
    const failed = settled.filter((item) => item.status === "rejected").length;
    const excludedCount = settled.filter((item) => item.status === "fulfilled" && item.value?.excluded).length;

    if (funds.length === 0) {
      throw new Error("所有候选基金均未通过纳指100口径校验或接口全部失败");
    }

    const payload = {
      updatedAt: new Date().toISOString(),
      cacheSeconds: Math.round(CACHE_MS / 1000),
      source: "fundmobapi.eastmoney.com + fundsuggest.eastmoney.com",
      fromCache: false,
      fromFallback: false,
      discoveredCodes: codes.length,
      failed: failed + excludedCount,
      discoveryErrors,
      funds,
      warnings: [
        "基金代码、简称、净值、涨跌、申购状态、限额、费率折扣、成立日、指数名称来自公开接口实时返回。",
        "基金规模、管理费、托管费、跟踪误差通过 FundMNNBasicInformation 接口实时获取。",
        "支付宝和基金公司App销售状态没有稳定公开接口；页面仅展示公开销售接口状态，不把平台上架状态伪装为实时数据。"
      ]
    };

    cache = { createdAt: Date.now(), payload };
    log("info", "fund cache refreshed", { total: funds.length, failed, excluded: excludedCount });
    return payload;
  })();

  try {
    return await loading;
  } catch (error) {
    log("error", "loadRealtimeFunds failed", { error: error.message });
    if (cache) {
      log("warn", "serving stale cache", { age: Math.round((Date.now() - cache.createdAt) / 1000) });
      return { ...cache.payload, fromCache: true, warning: `刷新失败，已返回 ${Math.round((Date.now() - cache.createdAt) / 1000)}s 前的缓存：${error.message}` };
    }
    return buildFallbackPayload(error.message);
  } finally {
    loading = null;
  }
};

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(body);
};

const sendJson = (res, status, payload) => {
  send(res, status, JSON.stringify(payload), { "content-type": "application/json; charset=utf-8" });
};

const buildEtag = (statResult) => {
  const size = statResult.size;
  const mtime = Math.floor(statResult.mtimeMs);
  return `W/"${size.toString(16)}-${mtime.toString(16)}"`;
};

const serveStatic = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(__dirname, pathname));

  if (!filePath.startsWith(normalize(__dirname))) {
    send(res, 403, "Forbidden", { "content-type": "text/plain; charset=utf-8" });
    return;
  }

  try {
    const [body, info] = await Promise.all([readFile(filePath), stat(filePath)]);
    const etag = etagCache.get(filePath) || buildEtag(info);
    etagCache.set(filePath, etag);
    const headers = {
      ...STATIC_HEADERS,
      "content-type": MIME[extname(filePath)] || "application/octet-stream",
      "cache-control": `public, max-age=${STATIC_CACHE_SECONDS}`,
      etag
    };
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
    } else {
      log("error", "static serve failed", { path: pathname, error: error.message });
      send(res, 500, "Internal Server Error", { "content-type": "text/plain; charset=utf-8" });
    }
  }
};

const handler = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/funds") {
      const payload = await loadRealtimeFunds();
      sendJson(res, 200, payload);
      return;
    }
    if (url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        cacheAge: cache ? Math.round((Date.now() - cache.createdAt) / 1000) : null,
        discoveryAge: discoveryCache ? Math.round((Date.now() - discoveryCache.createdAt) / 1000) : null
      });
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    log("error", "request failed", { path: req.url, error: error.message });
    sendJson(res, 500, { error: error.message });
  }
};

createServer(handler).listen(PORT, () => {
  log("info", "server started", { port: PORT, url: `http://localhost:${PORT}` });
});

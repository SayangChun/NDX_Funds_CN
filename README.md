# 纳斯达克 100 场外被动基金排行

Node.js 静态站点 + 实时抓取东方财富 / 天天基金公开接口，展示人民币场外纳斯达克 100 被动份额排行。

## 特性

- **实时数据**：通过 `fundmobapi.eastmoney.com` 和 `fundsuggest.eastmoney.com` 抓取代码、简称、净值、规模、费率、申购状态、限额等字段
- **稳定降级**：所有接口失败时自动回退到 41 个已验证的种子份额（2026-06 交叉核对），并显示降级提示
- **可缓存**：静态资源 304 / ETag；实时数据 5 分钟服务端缓存；刷新失败时返回旧数据并标注
- **安全**：移除 `innerHTML` 拼接避免 XSS；fetch 全链路超时 + 指数退避重试
- **响应式**：桌面端表格，移动端自动转卡片视图

## 收录口径

仅收录**人民币场外**纳斯达克 100 被动份额（A/C/I/D/E/F 类）。不收录：
- 场内 ETF（含 159xxx / 513xxx）
- 主动 QDII、纳斯达克综指、生物科技、科技市值加权等
- 美元现汇 / 美元现钞份额
- 综合 / 精选等主题包装产品

## 启动

要求 Node.js ≥ 18.17。

```bash
# 安装（无第三方依赖，纯标准库）
npm start
# 或开发模式（文件变更自动重启）
npm run dev
# 或 Windows 一键启动
start.bat
```

默认监听 `http://localhost:4173`。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `4173` | HTTP 端口 |
| `CACHE_MS` | `300000` | 实时数据服务端缓存（毫秒） |
| `REQUEST_TIMEOUT_MS` | `8000` | 单次外部请求超时（毫秒） |
| `FETCH_RETRIES` | `2` | 失败重试次数 |
| `DISCOVERY_CACHE_MS` | `3600000` | 代码发现缓存（毫秒） |
| `STATIC_CACHE_SECONDS` | `3600` | 静态资源浏览器缓存（秒） |

## API

### `GET /api/funds`

返回 JSON：

```jsonc
{
  "updatedAt": "2026-06-01T12:00:00.000Z",
  "cacheSeconds": 300,
  "source": "fundmobapi.eastmoney.com + fundsuggest.eastmoney.com",
  "fromCache": false,    // true 表示命中服务端缓存
  "fromFallback": false, // true 表示实时不可用，已回退到种子数据
  "discoveredCodes": 41,
  "failed": 0,
  "funds": [ /* ... */ ],
  "warnings": [ /* ... */ ],
  "warning": "...",      // 仅在部分失败 / 命中降级时存在
  "error": "..."         // 仅在完全失败时存在
}
```

### `GET /api/health`

健康检查，返回缓存年龄。

## 数据来源

- 实时字段：天天基金 / 东方财富公开接口
- 种子清单（41 个 2026-06 验证份额）来源：
  - [QDII Fund 纳指 100 场外基金整理（2025-07）](https://qdiifund.com/2025/07/21/nasdaq-qdii-fund/)
  - [钱攒攒 纳指 100 场外基金实时数据](https://www.etf-666.com/passive)
  - [FEIXIA QDII 申购额度看板](https://feixia.org/)

> ⚠️ 本页面不构成任何投资建议；支付宝 / 基金公司 App 销售状态没有稳定公开接口，页面不会伪造平台上架信息。

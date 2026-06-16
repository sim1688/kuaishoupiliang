# 快手后端接入说明

## 已搭好的本地后端

启动：

```powershell
& 'C:\Users\sim\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' server.js
```

访问：

```text
http://127.0.0.1:4189
```

## 需要配置

复制 `.env.example` 为 `.env`，填入：

```text
KUAISHOU_APP_ID=
KUAISHOU_SECRET=
KUAISHOU_ACCESS_TOKEN=
KUAISHOU_REFRESH_TOKEN=
KUAISHOU_ADVERTISER_ID=
```

## 已有接口

```text
GET  /api/health
GET  /api/auth/status
POST /api/auth/exchange
POST /api/auth/refresh
GET  /api/accounts
POST /api/preview
POST /api/strategy/save
POST /api/campaigns/create
POST /api/kuaishou/proxy
```

`/api/campaigns/create` 当前是 `dry_run`，等字段映射确认后再打开真实创建。

## 快手文档入口

用户提供的 DSP 文档：

```text
https://developers.e.kuaishou.com/docs?docType=DSP&documentId=2539&menuId=3765
```

当前代码已按官方 OAuth Token 接口预留：

```text
/rest/openapi/oauth2/authorize/access_token
/rest/openapi/oauth2/authorize/refresh_token
```

## 下一步字段映射

需要从快手文档确认这些真实接口路径和请求字段：

- 广告账户列表
- 推广产品/小程序/小游戏列表
- 定向包列表
- 素材列表
- 文案库列表
- 转化追踪目标
- 广告组/计划创建
- 创意创建
- 素材绑定
- 提交审核
- 异步任务状态与失败原因

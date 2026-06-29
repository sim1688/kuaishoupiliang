# 快手程序化创建后台

## 本地启动

```powershell
& 'C:\nodejs\node.exe' server.js
```

访问：

```text
http://127.0.0.1:4189
```

OAuth 回调：

```text
http://127.0.0.1:8000/ksAuthCallback
```

## 环境变量

`.env` 需要包含：

```text
KUAISHOU_APP_ID=
KUAISHOU_SECRET=
KUAISHOU_AUTH_USER_ID=
KUAISHOU_ACCESS_TOKEN=
KUAISHOU_REFRESH_TOKEN=
KUAISHOU_ADVERTISER_ID=
```

## 通用接口

```text
GET  /api/health
GET  /api/auth/status
GET  /api/auth/authorize-url
POST /api/auth/exchange
POST /api/auth/refresh
GET  /api/accounts
POST /api/preview
POST /api/strategy/save
POST /api/campaigns/create
POST /api/kuaishou/proxy
```

`/api/campaigns/create` 目前默认仍是 `dry_run`。页面里的素材只有名称，没有快手 `photo_id`，所以不能直接真实创建创意；传 `dryRun:false` 时后台会校验素材 ID，避免误创建半成品。

## 快手创建流程接口

已接入并封装在 `backend/kuaishouAdsService.js`：

```text
POST /api/kuaishou/campaign/list
POST /api/kuaishou/unit/list
POST /api/kuaishou/creative/list

POST /api/kuaishou/campaign/snapshot
POST /api/kuaishou/campaign/clone-plan
POST /api/kuaishou/campaign/clone
POST /api/kuaishou/campaign/test-create-flow

POST /api/kuaishou/campaign/create
POST /api/kuaishou/unit/create
POST /api/kuaishou/creative/create

POST /api/kuaishou/campaign/status
POST /api/kuaishou/unit/status
POST /api/kuaishou/creative/status
```

## 已学习到的创建链路

1. 查询源计划：`/rest/openapi/gw/dsp/campaign/list`
2. 查询广告组：`/rest/openapi/gw/dsp/unit/list`
3. 查询创意：`/rest/openapi/gw/dsp/creative/list`
4. 创建计划：`/rest/openapi/gw/dsp/campaign/create`
5. 创建广告组：`/rest/openapi/gw/dsp/unit/create`
6. 创建创意：`/rest/openapi/gw/dsp/creative/create`
7. 暂停计划：`/rest/openapi/v1/campaign/update/status`
8. 暂停广告组：`/rest/openapi/v1/unit/update/status`
9. 暂停创意：`/rest/openapi/v1/creative/update/status`

复制计划时，后台会先生成可创建 payload，再按计划、广告组、创意顺序创建。默认 `put_status=2`，也就是暂停状态。

`/api/kuaishou/campaign/test-create-flow` 用于最小真实创建联调：从一个源计划学习字段创建 1 个计划，并默认全部暂停。页面里的“广告创意数量”按广告组落地；“每条广告创意素材数”按该广告组下的普通创意数量落地。例如广告创意数量 `1`、每条素材数 `3` 时，后台会创建 1 个广告组，并在这个广告组下创建 3 条普通创意，每条创意绑定 1 个 `photo_id`。这和快手后台把同广告组创意聚合展示为“1 条带 3 个素材”的口径一致。

## 重要限制

创意复制不携带查询接口返回的 `image_token`，因为平台会报 `image_token不正确`。后台会让快手使用视频首帧。

部分原生视频/KOL 视频会被快手拒绝复用，常见错误是 `原生视频库视频必须是广告主有效视频`。这是平台校验限制，不是本地字段映射遗漏。

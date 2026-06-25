const http = require("http");
const fs = require("fs");
const path = require("path");
const { config } = require("./backend/config");
const {
  exchangeAccessToken,
  refreshAccessToken,
  kuaishouRequest,
  getTokenStatus
} = require("./backend/kuaishouClient");
const {
  listCampaigns,
  listUnits,
  listCreatives,
  getCampaignSnapshot,
  buildClonePlan,
  cloneCampaign,
  testCreateCampaignFlow,
  createCampaign,
  createUnit,
  createCreative,
  updateCampaignStatus,
  updateUnitStatus,
  updateCreativeStatus,
  createFromProgram
} = require("./backend/kuaishouAdsService");
const { uploadAdVideo } = require("./backend/kuaishouMaterialService");

const root = __dirname;
const BUILD_VERSION = "20260624-grouped-creative-assets";
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,access-token"
};
const jsonHeaders = { "content-type": "application/json; charset=utf-8", ...corsHeaders };
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, body) {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(body));
}

function firstDefined() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = arguments[index];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function writeDebugFile(name, data) {
  const dir = path.join(root, "data");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2), "utf8");
}

function replaceAllText(value, search, replacement) {
  return String(value).split(search).join(replacement);
}

function escapeHtml(value) {
  return String(value)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;");
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON body");
    error.status = 400;
    throw error;
  }
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function parseContentDisposition(value) {
  const result = {};
  String(value || "").split(";").forEach((part) => {
    const trimmed = part.trim();
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    result[key] = trimmed.slice(index + 1).trim().replace(/^"|"$/g, "");
  });
  return result;
}

async function readMultipartBody(req) {
  const contentType = req.headers["content-type"] || "";
  const match = contentType.match(/boundary=([^;]+)/i);
  if (!match) {
    const error = new Error("Missing multipart boundary");
    error.status = 400;
    throw error;
  }
  const boundary = `--${match[1]}`;
  const raw = await readRawBody(req);
  const rawText = raw.toString("binary");
  const parts = rawText.split(boundary).slice(1, -1);
  const fields = {};
  const files = [];
  parts.forEach((part) => {
    let bodyText = part;
    if (bodyText.slice(0, 2) === "\r\n") bodyText = bodyText.slice(2);
    const separator = bodyText.indexOf("\r\n\r\n");
    if (separator === -1) return;
    const headerText = bodyText.slice(0, separator);
    let contentText = bodyText.slice(separator + 4);
    if (contentText.slice(-2) === "\r\n") contentText = contentText.slice(0, -2);
    const headers = {};
    headerText.split("\r\n").forEach((line) => {
      const index = line.indexOf(":");
      if (index === -1) return;
      headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
    });
    const disposition = parseContentDisposition(headers["content-disposition"]);
    if (!disposition.name) return;
    const buffer = Buffer.from(contentText, "binary");
    if (disposition.filename) {
      files.push({
        fieldName: disposition.name,
        fileName: disposition.filename,
        contentType: headers["content-type"] || "application/octet-stream",
        buffer
      });
      return;
    }
    fields[disposition.name] = buffer.toString("utf8");
  });
  return { fields, files };
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const target = path.resolve(root, `.${pathname}`);
  if (!target.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, { "content-type": mime[ext] || "application/octet-stream" });
  fs.createReadStream(target).pipe(res);
}

function buildPreviewRows(payload) {
  const accounts = payload.accounts || [];
  const assets = Array.isArray(payload.assignedAssets) ? payload.assignedAssets : (payload.assets || []);
  const copies = payload.copies || [];
  const groupAssignments = Array.isArray(payload.creativeGroupAssignments) ? payload.creativeGroupAssignments : [];
  const allAssets = Array.isArray(payload.assets) ? payload.assets : [];
  const groupRule = payload.groupRule || "开荒之旅_[日期][序号]";
  const creativeRule = payload.creativeRule || "<账户备注><素材名>";
  const date = replaceAllText(payload.startDate || new Date().toISOString().slice(0, 10), "-", "");
  const groupedAssets = [];
  if (groupAssignments.length && allAssets.length) {
    groupAssignments.forEach((ids, groupIndex) => {
      const groupAssets = (ids || [])
        .map((id) => allAssets.find((asset) => asset.id === id))
        .filter(Boolean)
        .map((asset) => Object.assign({ groupIndex }, asset));
      if (groupAssets.length) groupedAssets.push(groupAssets);
    });
  } else {
    const buckets = {};
    assets.forEach((asset) => {
      const key = asset.groupIndex != null ? Number(asset.groupIndex) : 0;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(asset);
    });
    Object.keys(buckets).sort((a, b) => Number(a) - Number(b)).forEach((key) => groupedAssets.push(buckets[key]));
  }
  const rows = [];
  accounts.forEach((account) => {
    groupedAssets.forEach((groupAssets) => {
      const asset = groupAssets[0] || {};
      const sequence = String(rows.length + 1).padStart(3, "0");
      const groupNo = asset.groupIndex != null ? String(Number(asset.groupIndex) + 1).padStart(2, "0") : "";
      rows.push({
        index: rows.length + 1,
        accountId: account.id,
        accountName: account.name,
        adGroupName: groupRule.replace("[日期]", date).replace("[序号]", sequence).replace("[创意组]", groupNo),
        creativeName: creativeRule
          .replace("<账户备注>", account.remark || "")
          .replace("<素材名>", asset.name || ""),
        assetName: groupAssets.map((item) => item.name || "").filter(Boolean).join("、"),
        assetFileName: groupAssets.map((item) => item.fileName || item.name || "").filter(Boolean).join("、"),
        assetPath: groupAssets.map((item) => item.relativePath || "").filter(Boolean).join("、"),
        assetGroup: groupNo,
        creativeCount: groupAssets.length,
        creativeAssets: groupAssets,
        copy: copies[rows.length % Math.max(copies.length, 1)] || ""
      });
    });
  });
  return rows;
}

function normalizeAdvertiserAccounts(result) {
  const details = result && result.data && Array.isArray(result.data.details) ? result.data.details : [];
  return details
    .map((item, index) => ({
      id: String(item.advertiser_id || ""),
      name: item.advertiser_name || `广告账户${index + 1}`,
      remark: item.product_name || item.corporation_name || item.advertiser_name || "",
      productName: item.product_name || "",
      corporationName: item.corporation_name || "",
      agentId: item.agent_id || null,
      userId: item.user_id || null,
      authStatus: item.auth_status || null,
      frozenStatus: item.frozen_status || null,
      checked: index < 3
    }))
    .filter((item) => item.id);
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "kuaishou-batch-backend", version: BUILD_VERSION });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/status") {
    sendJson(res, 200, getTokenStatus());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/authorize-url") {
    const scope = [
      "ad_query",
      "ad_manage",
      "report_service",
      "account_service",
      "public_dmp_service",
      "public_agent_service",
      "public_account_service"
    ];
    const authorizeUrl = new URL("https://developers.e.kuaishou.com/tools/authorize");
    authorizeUrl.searchParams.set("app_id", config.kuaishou.appId);
    authorizeUrl.searchParams.set("scope", JSON.stringify(scope));
    authorizeUrl.searchParams.set("redirect_uri", `http://127.0.0.1:${config.authCallbackPort}/ksAuthCallback`);
    authorizeUrl.searchParams.set("state", "abcd");
    authorizeUrl.searchParams.set("oauth_type", "advertiser");
    sendJson(res, 200, { url: authorizeUrl.toString() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/exchange") {
    const body = await readBody(req);
    const result = await exchangeAccessToken(body.auth_code || body.authCode);
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/refresh") {
    const result = await refreshAccessToken();
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/accounts") {
    if (config.kuaishou.authUserId) {
      const result = await kuaishouRequest("/rest/openapi/gw/uc/v1/advertisers", {
        method: "POST",
        body: { advertiser_id: Number(config.kuaishou.authUserId) }
      });
      const accounts = normalizeAdvertiserAccounts(result);
      sendJson(res, 200, {
        data: accounts,
        count: accounts.length,
        source: "kuaishou",
        rawCode: result.code
      });
      return;
    }

    sendJson(res, 200, {
      data: [
        { id: "112939731", name: "游霄-开荒之旅-w", remark: "游霄A" },
        { id: "112939730", name: "游霄-开荒之旅-w", remark: "游霄B" },
        { id: "112939732", name: "游霄-开荒之旅-w", remark: "游霄C" }
      ],
      source: "mock"
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/preview") {
    const body = await readBody(req);
    const rows = buildPreviewRows(body);
    sendJson(res, 200, { data: rows, count: rows.length });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/strategy/save") {
    const body = await readBody(req);
    const dir = path.join(root, "data");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    const file = path.join(dir, `strategy-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(body, null, 2), "utf8");
    sendJson(res, 200, { ok: true, file: path.relative(root, file) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/campaigns/create") {
    const body = await readBody(req);
    const rows = buildPreviewRows(body);
    const result = await createFromProgram(Object.assign({}, body, { rows }), {
      dryRun: body.dryRun !== false
    });
    sendJson(res, 200, {
      ok: true,
      mode: result.mode,
      message: result.message,
      count: rows.length,
      data: rows,
      result
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/campaign/snapshot") {
    const body = await readBody(req);
    const snapshot = await getCampaignSnapshot(body.advertiser_id || body.advertiserId, body.campaign_id || body.campaignId);
    sendJson(res, 200, { ok: true, data: snapshot });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/campaign/list") {
    const body = await readBody(req);
    const result = await listCampaigns(body);
    sendJson(res, 200, { ok: true, data: result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/unit/list") {
    const body = await readBody(req);
    const result = await listUnits(body);
    sendJson(res, 200, { ok: true, data: result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/creative/list") {
    const body = await readBody(req);
    const result = await listCreatives(body);
    sendJson(res, 200, { ok: true, data: result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/campaign/clone-plan") {
    const body = await readBody(req);
    const snapshot = body.snapshot || await getCampaignSnapshot(body.advertiser_id || body.advertiserId, body.campaign_id || body.campaignId);
    const plan = buildClonePlan(snapshot, {
      advertiserId: body.target_advertiser_id || body.targetAdvertiserId || body.advertiser_id || body.advertiserId,
      campaignName: body.campaign_name || body.campaignName,
      nameSuffix: body.name_suffix || body.nameSuffix,
      startDate: body.start_date || body.startDate,
      putStatus: body.put_status || body.putStatus || 2,
      unitName: body.unit_name || body.unitName,
      creativeName: body.creative_name || body.creativeName,
      unitNameRule: body.unit_name_rule || body.unitNameRule || body.group_rule || body.groupRule,
      creativeNameRule: body.creative_name_rule || body.creativeNameRule || body.creative_rule || body.creativeRule,
      roiRatio: body.roi_ratio || body.roiRatio || body.roi,
      dayBudget: body.day_budget || body.dayBudget,
      miniAppIdPlatform: firstDefined(
        body.mini_app_id_platform,
        body.miniAppIdPlatform,
        body.mini_app_id,
        body.miniAppId,
        body.promotionTarget && body.promotionTarget.appId
      ),
      miniAppType: firstDefined(
        body.mini_app_type,
        body.miniAppType,
        body.promotionTarget && body.promotionTarget.miniAppType,
        body.promotionTarget && body.promotionTarget.type === "miniProgram" ? 1 : undefined
      ),
      includeImageToken: Boolean(body.include_image_token || body.includeImageToken)
    });
    sendJson(res, 200, { ok: true, data: plan });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/campaign/clone") {
    const body = await readBody(req);
    const result = await cloneCampaign(body.advertiser_id || body.advertiserId, body.campaign_id || body.campaignId, {
      advertiserId: body.target_advertiser_id || body.targetAdvertiserId || body.advertiser_id || body.advertiserId,
      campaignName: body.campaign_name || body.campaignName,
      nameSuffix: body.name_suffix || body.nameSuffix,
      startDate: body.start_date || body.startDate,
      putStatus: body.put_status || body.putStatus || 2,
      unitName: body.unit_name || body.unitName,
      creativeName: body.creative_name || body.creativeName,
      unitNameRule: body.unit_name_rule || body.unitNameRule || body.group_rule || body.groupRule,
      creativeNameRule: body.creative_name_rule || body.creativeNameRule || body.creative_rule || body.creativeRule,
      roiRatio: body.roi_ratio || body.roiRatio || body.roi,
      dayBudget: body.day_budget || body.dayBudget,
      miniAppIdPlatform: firstDefined(
        body.mini_app_id_platform,
        body.miniAppIdPlatform,
        body.mini_app_id,
        body.miniAppId,
        body.promotionTarget && body.promotionTarget.appId
      ),
      miniAppType: firstDefined(
        body.mini_app_type,
        body.miniAppType,
        body.promotionTarget && body.promotionTarget.miniAppType,
        body.promotionTarget && body.promotionTarget.type === "miniProgram" ? 1 : undefined
      ),
      includeImageToken: Boolean(body.include_image_token || body.includeImageToken),
      saveFiles: body.save_files !== false && body.saveFiles !== false
    });
    sendJson(res, 200, { ok: true, data: result.summary, result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/campaign/test-create-flow") {
    const body = await readBody(req);
    const createOptions = {
      campaignName: firstDefined(body.campaign_name, body.campaignName),
      nameSuffix: firstDefined(body.name_suffix, body.nameSuffix),
      startDate: firstDefined(body.start_date, body.startDate),
      putStatus: firstDefined(body.put_status, body.putStatus, 2),
      unitName: firstDefined(body.unit_name, body.unitName),
      creativeName: firstDefined(body.creative_name, body.creativeName),
      unitNameRule: firstDefined(body.unit_name_rule, body.unitNameRule, body.group_rule, body.groupRule),
      creativeNameRule: firstDefined(body.creative_name_rule, body.creativeNameRule, body.creative_rule, body.creativeRule),
      roiRatio: firstDefined(body.roi_ratio, body.roiRatio, body.roi),
      dayBudget: firstDefined(body.day_budget, body.dayBudget),
      photoId: firstDefined(body.photo_id, body.photoId),
      photoIds: firstDefined(body.photo_ids, body.photoIds),
      creativeAssets: firstDefined(body.creative_assets, body.creativeAssets),
      promotionTargetType: firstDefined(body.promotion_target_type, body.promotionTargetType, body.promotionTarget && body.promotionTarget.type),
      miniAppIdPlatform: firstDefined(
        body.mini_app_id_platform,
        body.miniAppIdPlatform,
        body.mini_app_id,
        body.miniAppId,
        body.promotionTarget && body.promotionTarget.appId
      ),
      miniAppType: firstDefined(body.mini_app_type, body.miniAppType, body.promotionTarget && body.promotionTarget.miniAppType),
      maxUnits: firstDefined(body.max_units, body.maxUnits, 1),
      maxCreativeAttempts: firstDefined(body.max_creative_attempts, body.maxCreativeAttempts, 40),
      saveFiles: body.save_files !== false && body.saveFiles !== false
    };
    if (!createOptions.miniAppType && createOptions.promotionTargetType) {
      createOptions.miniAppType = createOptions.promotionTargetType === "miniProgram" ? 1 : 2;
    }
    const required = ["campaignName", "unitName", "creativeName", "unitNameRule", "creativeNameRule", "roiRatio", "miniAppIdPlatform"];
    const missing = required.filter((key) => createOptions[key] === undefined || createOptions[key] === null || createOptions[key] === "");
    if (missing.length) {
      sendJson(res, 400, {
        ok: false,
        error: `真实创建缺少页面配置：${missing.join(", ")}`,
        version: BUILD_VERSION,
        received: body
      });
      return;
    }
    writeDebugFile(`test_create_request_${Date.now()}.json`, {
      version: BUILD_VERSION,
      received: body,
      options: createOptions
    });
    const result = await testCreateCampaignFlow(
      firstDefined(body.advertiser_id, body.advertiserId),
      firstDefined(body.source_campaign_id, body.sourceCampaignId, body.campaign_id, body.campaignId),
      createOptions
    );
    sendJson(res, 200, { ok: result.ok, version: BUILD_VERSION, data: result.summary, result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/material/video/upload") {
    const body = await readMultipartBody(req);
    const file = body.files[0];
    if (!file) {
      sendJson(res, 400, { ok: false, error: "缺少上传文件" });
      return;
    }
    const result = await uploadAdVideo(body.fields.advertiser_id || body.fields.advertiserId, {
      fileName: body.fields.file_name || body.fields.fileName || file.fileName,
      extension: path.extname(body.fields.file_name || body.fields.fileName || file.fileName).toLowerCase(),
      contentType: file.contentType,
      buffer: file.buffer
    });
    const uploadDir = path.join(root, "data");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
    fs.writeFileSync(
      path.join(uploadDir, `upload_${Date.now()}_${String(body.fields.asset_id || "asset").replace(/[^a-zA-Z0-9_-]/g, "_")}.json`),
      JSON.stringify({
        advertiser_id: body.fields.advertiser_id || body.fields.advertiserId,
        asset_id: body.fields.asset_id || body.fields.assetId || "",
        file_name: body.fields.file_name || body.fields.fileName || file.fileName,
        photo_id: result.photo_id,
        response: result.result
      }, null, 2),
      "utf8"
    );
    sendJson(res, 200, {
      ok: true,
      asset_id: body.fields.asset_id || body.fields.assetId || "",
      file_name: body.fields.file_name || body.fields.fileName || file.fileName,
      data: result
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/campaign/create") {
    const body = await readBody(req);
    const result = await createCampaign(body.payload || body);
    sendJson(res, 200, { ok: true, data: result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/unit/create") {
    const body = await readBody(req);
    const result = await createUnit(body.payload || body);
    sendJson(res, 200, { ok: true, data: result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/creative/create") {
    const body = await readBody(req);
    const result = await createCreative(body.payload || body);
    sendJson(res, 200, { ok: true, data: result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/campaign/status") {
    const body = await readBody(req);
    const result = await updateCampaignStatus(
      body.advertiser_id || body.advertiserId,
      body.campaign_ids || body.campaignIds || body.campaign_id || body.campaignId,
      body.put_status || body.putStatus
    );
    sendJson(res, 200, { ok: true, data: result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/unit/status") {
    const body = await readBody(req);
    const result = await updateUnitStatus(
      body.advertiser_id || body.advertiserId,
      body.unit_ids || body.unitIds || body.unit_id || body.unitId,
      body.put_status || body.putStatus
    );
    sendJson(res, 200, { ok: true, data: result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/kuaishou/creative/status") {
    const body = await readBody(req);
    const result = await updateCreativeStatus(
      body.advertiser_id || body.advertiserId,
      body.creative_ids || body.creativeIds || body.creative_id || body.creativeId,
      body.put_status || body.putStatus
    );
    sendJson(res, 200, { ok: true, data: result });
    return;
  }

  if (url.pathname === "/api/kuaishou/proxy") {
    const body = req.method === "GET" ? {} : await readBody(req);
    const result = await kuaishouRequest(body.path || url.searchParams.get("path"), {
      method: body.method || "GET",
      body: body.body,
      query: body.query
    });
    sendJson(res, 200, result);
    return;
  }

  sendJson(res, 404, { error: "API not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders);
      res.end();
      return;
    }
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
    } else {
      serveStatic(req, res);
    }
  } catch (error) {
    sendJson(res, error.status || 500, {
      error: error.message,
      detail: error.body || null
    });
  }
});

server.listen(config.port, "127.0.0.1", () => {
  console.log(`Kuaishou batch tool: http://127.0.0.1:${config.port}`);
});

const callbackServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/ksAuthCallback") {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  try {
    const authCode = url.searchParams.get("auth_code") || url.searchParams.get("authCode") || url.searchParams.get("code");
    if (!authCode) {
      res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
      res.end("<h2>快手授权回调缺少 auth_code</h2><p>请重新打开授权链接完成授权。</p>");
      return;
    }
    const result = await exchangeAccessToken(authCode);
    const data = result && (result.data || result);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`
      <h2>快手授权成功</h2>
      <p>access_token 和 refresh_token 已保存到本地 .env。</p>
      <p>广告主 ID：${data && (data.advertiser_id || data.advertiserId) ? data.advertiser_id || data.advertiserId : "未返回"}</p>
      <p><a href="http://127.0.0.1:${config.port}/">返回批量创编工具</a></p>
    `);
  } catch (error) {
    res.writeHead(error.status || 500, { "content-type": "text/html; charset=utf-8" });
    res.end(`<h2>快手授权失败</h2><pre>${escapeHtml(error.message)}\n${escapeHtml(JSON.stringify(error.body || {}, null, 2))}</pre>`);
  }
});

callbackServer.listen(config.authCallbackPort, "127.0.0.1", () => {
  console.log(`Kuaishou auth callback: http://127.0.0.1:${config.authCallbackPort}/ksAuthCallback`);
});

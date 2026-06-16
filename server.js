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

const root = __dirname;
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
  const assets = payload.assets || [];
  const copies = payload.copies || [];
  const groupRule = payload.groupRule || "开荒之旅_[日期][序号]";
  const creativeRule = payload.creativeRule || "<账户备注><素材名>";
  const date = (payload.startDate || new Date().toISOString().slice(0, 10)).replaceAll("-", "");
  const rows = [];
  accounts.forEach((account) => {
    assets.forEach((asset) => {
      const sequence = String(rows.length + 1).padStart(3, "0");
      rows.push({
        index: rows.length + 1,
        accountId: account.id,
        accountName: account.name,
        adGroupName: groupRule.replace("[日期]", date).replace("[序号]", sequence),
        creativeName: creativeRule
          .replace("<账户备注>", account.remark || "")
          .replace("<素材名>", asset.name || ""),
        assetName: asset.name,
        copy: copies[rows.length % Math.max(copies.length, 1)] || ""
      });
    });
  });
  return rows;
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "kuaishou-batch-backend" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/status") {
    sendJson(res, 200, getTokenStatus());
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
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `strategy-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(body, null, 2), "utf8");
    sendJson(res, 200, { ok: true, file: path.relative(root, file) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/campaigns/create") {
    const body = await readBody(req);
    const rows = buildPreviewRows(body);
    sendJson(res, 200, {
      ok: true,
      mode: "dry_run",
      message: "真实创建接口待按快手文档字段映射后启用",
      count: rows.length,
      data: rows
    });
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

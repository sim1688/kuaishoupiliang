const fs = require("fs");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const { config } = require("./config");

const tokenState = {
  accessToken: config.kuaishou.accessToken,
  refreshToken: config.kuaishou.refreshToken,
  expiresAt: 0
};

async function requestJson(url, options = {}) {
  const method = options.method || "GET";
  const headers = Object.assign({ "content-type": "application/json" }, options.headers || {});
  const requestBody = options.body || null;
  const parsed = new URL(url);
  const transport = parsed.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers: Object.assign({}, headers, requestBody ? { "content-length": Buffer.byteLength(requestBody) } : {})
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let body = null;
          try {
            body = text ? JSON.parse(text) : null;
          } catch (error) {
            body = { raw: text };
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`Kuaishou API ${res.statusCode}`);
            error.status = res.statusCode;
            error.body = body;
            reject(error);
            return;
          }
          resolve(body);
        });
      }
    );
    req.setTimeout(15000, () => {
      req.destroy(new Error("Kuaishou API request timeout"));
    });
    req.on("error", reject);
    if (requestBody) req.write(requestBody);
    req.end();
  });
}

function buildMultipartBody(fields, files) {
  const boundary = `----codex-kuaishou-${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const chunks = [];
  Object.keys(fields || {}).forEach((key) => {
    const value = fields[key];
    if (value === undefined || value === null) return;
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
    chunks.push(Buffer.from(String(value)));
    chunks.push(Buffer.from("\r\n"));
  });
  (files || []).forEach((file) => {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\n`));
    chunks.push(Buffer.from(`Content-Type: ${file.contentType || "application/octet-stream"}\r\n\r\n`));
    chunks.push(file.buffer);
    chunks.push(Buffer.from("\r\n"));
  });
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    boundary,
    body: Buffer.concat(chunks)
  };
}

async function requestMultipart(url, options = {}) {
  const method = options.method || "POST";
  const multipart = buildMultipartBody(options.fields || {}, options.files || []);
  const headers = Object.assign({}, options.headers || {}, {
    "content-type": `multipart/form-data; boundary=${multipart.boundary}`,
    "content-length": multipart.body.length
  });
  const parsed = new URL(url);
  const transport = parsed.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let body = null;
          try {
            body = text ? JSON.parse(text) : null;
          } catch (error) {
            body = { raw: text };
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`Kuaishou API ${res.statusCode}`);
            error.status = res.statusCode;
            error.body = body;
            reject(error);
            return;
          }
          resolve(body);
        });
      }
    );
    req.setTimeout(options.timeoutMs || 120000, () => {
      req.destroy(new Error("Kuaishou API multipart request timeout"));
    });
    req.on("error", reject);
    req.write(multipart.body);
    req.end();
  });
}

function hasOAuthConfig() {
  return Boolean(config.kuaishou.appId && config.kuaishou.secret);
}

async function exchangeAccessToken(authCode) {
  if (!hasOAuthConfig()) {
    throw new Error("Missing KUAISHOU_APP_ID or KUAISHOU_SECRET");
  }
  const url = `${config.kuaishou.baseUrl}/rest/openapi/oauth2/authorize/access_token`;
  const body = await requestJson(url, {
    method: "POST",
    body: JSON.stringify({
      app_id: config.kuaishou.appId,
      secret: config.kuaishou.secret,
      auth_code: authCode
    })
  });
  assertKuaishouSuccess(body);
  applyTokenResponse(body);
  persistTokenResponse(body);
  return body;
}

async function refreshAccessToken() {
  if (!hasOAuthConfig()) {
    throw new Error("Missing KUAISHOU_APP_ID or KUAISHOU_SECRET");
  }
  if (!tokenState.refreshToken) {
    throw new Error("Missing KUAISHOU_REFRESH_TOKEN");
  }
  const url = `${config.kuaishou.baseUrl}/rest/openapi/oauth2/authorize/refresh_token`;
  const body = await requestJson(url, {
    method: "POST",
    body: JSON.stringify({
      app_id: config.kuaishou.appId,
      secret: config.kuaishou.secret,
      refresh_token: tokenState.refreshToken
    })
  });
  assertKuaishouSuccess(body);
  applyTokenResponse(body);
  persistTokenResponse(body);
  return body;
}

function assertKuaishouSuccess(body) {
  if (!body || body.code === undefined || body.code === 0) return;
  const error = new Error(body.message || `Kuaishou API business error ${body.code}`);
  error.status = 502;
  error.body = body;
  throw error;
}

function applyTokenResponse(body) {
  const data = body && (body.data || body);
  if (!data) return;
  tokenState.accessToken = data.access_token || tokenState.accessToken;
  tokenState.refreshToken = data.refresh_token || tokenState.refreshToken;
  if (data.user_id || data.userId) {
    config.kuaishou.authUserId = String(data.user_id || data.userId);
  }
  const expiresIn = Number(data.expires_in || data.expires || 0);
  if (expiresIn > 0) tokenState.expiresAt = Date.now() + expiresIn * 1000;
}

function persistTokenResponse(body) {
  const data = body && (body.data || body);
  if (!data) return;
  const updates = {};
  if (data.access_token) updates.KUAISHOU_ACCESS_TOKEN = data.access_token;
  if (data.refresh_token) updates.KUAISHOU_REFRESH_TOKEN = data.refresh_token;
  if (data.user_id || data.userId) {
    updates.KUAISHOU_AUTH_USER_ID = String(data.user_id || data.userId);
  }
  if (data.advertiser_id || data.advertiserId) {
    updates.KUAISHOU_ADVERTISER_ID = String(data.advertiser_id || data.advertiserId);
  }
  if (Object.keys(updates).length) writeEnvValues(updates);
}

function writeEnvValues(updates) {
  let lines = [];
  if (fs.existsSync(config.envFile)) {
    lines = fs.readFileSync(config.envFile, "utf8").split(/\r?\n/);
  }
  const seen = {};
  lines = lines.map((line) => {
    const index = line.indexOf("=");
    if (index === -1 || line.trim().startsWith("#")) return line;
    const key = line.slice(0, index).trim();
    if (!Object.prototype.hasOwnProperty.call(updates, key)) return line;
    seen[key] = true;
    return `${key}=${updates[key]}`;
  });
  Object.keys(updates).forEach((key) => {
    if (!seen[key]) lines.push(`${key}=${updates[key]}`);
  });
  fs.writeFileSync(config.envFile, lines.join("\n").replace(/\n*$/, "\n"), "utf8");
}

async function getAccessToken() {
  if (!tokenState.accessToken) {
    throw new Error("Missing KUAISHOU_ACCESS_TOKEN. Exchange an auth code first.");
  }
  if (tokenState.refreshToken && tokenState.expiresAt && Date.now() > tokenState.expiresAt - 120000) {
    await refreshAccessToken();
  }
  return tokenState.accessToken;
}

async function kuaishouRequest(path, { method = "GET", body, query } = {}) {
  const token = await getAccessToken();
  const url = new URL(path, config.kuaishou.baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    }
  }
  const headers = { "Access-Token": token };
  return requestJson(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
}

async function kuaishouMultipartRequest(path, { fields, files, query, timeoutMs } = {}) {
  const token = await getAccessToken();
  const url = new URL(path, config.kuaishou.baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    }
  }
  const headers = { "Access-Token": token };
  return requestMultipart(url.toString(), {
    method: "POST",
    headers,
    fields,
    files,
    timeoutMs
  });
}

function getTokenStatus() {
  return {
    hasAppId: Boolean(config.kuaishou.appId),
    hasSecret: Boolean(config.kuaishou.secret),
    hasAccessToken: Boolean(tokenState.accessToken),
    hasRefreshToken: Boolean(tokenState.refreshToken),
    advertiserId: config.kuaishou.advertiserId || null,
    expiresAt: tokenState.expiresAt || null
  };
}

module.exports = {
  exchangeAccessToken,
  refreshAccessToken,
  kuaishouRequest,
  kuaishouMultipartRequest,
  getTokenStatus
};

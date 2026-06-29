const fs = require("fs");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const { AsyncLocalStorage } = require("async_hooks");
const { config } = require("./config");

const tokenState = {
  clientManaged: false,
  accessToken: config.kuaishou.accessToken,
  refreshToken: config.kuaishou.refreshToken,
  authUserId: config.kuaishou.authUserId,
  advertiserId: config.kuaishou.advertiserId,
  expiresAt: Number(config.kuaishou.expiresAt || 0),
  refreshTokenExpiresAt: Number(config.kuaishou.refreshTokenExpiresAt || 0),
  invalidReason: "",
  dirty: false,
  refreshPromise: null
};
const authStore = new AsyncLocalStorage();

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

function optionalNumber(value) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function createKuaishouAuthContext(input = {}) {
  return {
    clientManaged: input.clientManaged !== false,
    accessToken: input.accessToken || "",
    refreshToken: input.refreshToken || "",
    authUserId: input.authUserId || "",
    advertiserId: input.advertiserId || "",
    expiresAt: optionalNumber(input.expiresAt),
    refreshTokenExpiresAt: optionalNumber(input.refreshTokenExpiresAt),
    invalidReason: "",
    dirty: false,
    refreshPromise: null
  };
}

function getActiveAuthContext() {
  return authStore.getStore() || tokenState;
}

function withKuaishouAuth(authContext, task) {
  return authStore.run(authContext || tokenState, task);
}

function shouldPersistAuth(state) {
  return state === tokenState && !state.clientManaged;
}

function markAuthDirty(state) {
  if (state && state.clientManaged) state.dirty = true;
}

function serializeKuaishouAuth(state = getActiveAuthContext()) {
  return {
    accessToken: state.accessToken || "",
    refreshToken: state.refreshToken || "",
    authUserId: state.authUserId || "",
    advertiserId: state.advertiserId || "",
    expiresAt: state.expiresAt || null,
    refreshTokenExpiresAt: state.refreshTokenExpiresAt || null
  };
}

function takeKuaishouAuthResponse() {
  const state = getActiveAuthContext();
  if (!state || !state.clientManaged || !state.dirty) return null;
  state.dirty = false;
  return serializeKuaishouAuth(state);
}

async function exchangeAccessToken(authCode) {
  const state = getActiveAuthContext();
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
  applyTokenResponse(body, state);
  if (shouldPersistAuth(state)) persistTokenResponse(body, state);
  return body;
}

async function doRefreshAccessToken() {
  const state = getActiveAuthContext();
  if (!hasOAuthConfig()) {
    throw new Error("Missing KUAISHOU_APP_ID or KUAISHOU_SECRET");
  }
  if (!state.refreshToken) {
    throw new Error("Missing KUAISHOU_REFRESH_TOKEN");
  }
  const url = `${config.kuaishou.baseUrl}/rest/openapi/oauth2/authorize/refresh_token`;
  const body = await requestJson(url, {
    method: "POST",
    body: JSON.stringify({
      app_id: config.kuaishou.appId,
      secret: config.kuaishou.secret,
      refresh_token: state.refreshToken
    })
  });
  assertKuaishouSuccess(body);
  applyTokenResponse(body, state);
  if (shouldPersistAuth(state)) persistTokenResponse(body, state);
  return body;
}

async function refreshAccessToken() {
  const state = getActiveAuthContext();
  if (!state.refreshPromise) {
    state.refreshPromise = doRefreshAccessToken()
      .catch((error) => {
        state.invalidReason = error.message;
        throw error;
      })
      .finally(() => {
        state.refreshPromise = null;
      });
  }
  return state.refreshPromise;
}

function assertKuaishouSuccess(body) {
  if (!body || body.code === undefined || body.code === 0) return;
  const error = new Error(body.message || `Kuaishou API business error ${body.code}`);
  error.status = 502;
  error.body = body;
  throw error;
}

function isAccessTokenError(error) {
  const body = error && error.body;
  const code = body && body.code;
  const message = String((body && body.message) || error.message || "").toLowerCase();
  return code === 402004 || message.includes("access token");
}

function applyTokenResponse(body, state = getActiveAuthContext()) {
  const data = body && (body.data || body);
  if (!data) return;
  state.accessToken = data.access_token || state.accessToken;
  state.refreshToken = data.refresh_token || state.refreshToken;
  state.invalidReason = "";
  if (data.user_id || data.userId) {
    state.authUserId = String(data.user_id || data.userId);
    if (state === tokenState) config.kuaishou.authUserId = state.authUserId;
  }
  if (data.advertiser_id || data.advertiserId) {
    state.advertiserId = String(data.advertiser_id || data.advertiserId);
    if (state === tokenState) config.kuaishou.advertiserId = state.advertiserId;
  }
  const expiresIn = Number(data.access_token_expires_in || data.expires_in || data.expires || 0);
  if (expiresIn > 0) state.expiresAt = Date.now() + expiresIn * 1000;
  const refreshTokenExpiresIn = Number(data.refresh_token_expires_in || 0);
  if (refreshTokenExpiresIn > 0) state.refreshTokenExpiresAt = Date.now() + refreshTokenExpiresIn * 1000;
  markAuthDirty(state);
}

function persistTokenResponse(body, state = getActiveAuthContext()) {
  const data = body && (body.data || body);
  if (!data) return;
  const updates = {};
  if (data.access_token) updates.KUAISHOU_ACCESS_TOKEN = data.access_token;
  if (data.refresh_token) updates.KUAISHOU_REFRESH_TOKEN = data.refresh_token;
  if (state.expiresAt) updates.KUAISHOU_TOKEN_EXPIRES_AT = String(state.expiresAt);
  if (state.refreshTokenExpiresAt) updates.KUAISHOU_REFRESH_TOKEN_EXPIRES_AT = String(state.refreshTokenExpiresAt);
  if (state.authUserId) updates.KUAISHOU_AUTH_USER_ID = String(state.authUserId);
  if (state.advertiserId) updates.KUAISHOU_ADVERTISER_ID = String(state.advertiserId);
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

async function getAccessToken(state = getActiveAuthContext()) {
  if (!state.accessToken) {
    throw new Error("Missing KUAISHOU_ACCESS_TOKEN. Exchange an auth code first.");
  }
  if (state.refreshToken && state.expiresAt && Date.now() > state.expiresAt - 120000) {
    try {
      await refreshAccessToken();
    } catch (error) {
      state.invalidReason = error.message;
      throw error;
    }
  }
  return state.accessToken;
}

async function refreshAndRetry(request, state = getActiveAuthContext()) {
  if (!state.refreshToken) throw new Error("Missing KUAISHOU_REFRESH_TOKEN");
  try {
    await refreshAccessToken();
    return request(state.accessToken);
  } catch (refreshError) {
    state.invalidReason = refreshError.message;
    throw refreshError;
  }
}

async function kuaishouRequest(path, { method = "GET", body, query } = {}) {
  const state = getActiveAuthContext();
  const url = new URL(path, config.kuaishou.baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    }
  }
  const run = (token) => requestJson(url.toString(), {
    method,
    headers: { "Access-Token": token },
    body: body ? JSON.stringify(body) : undefined
  }).then((result) => {
    assertKuaishouSuccess(result);
    state.invalidReason = "";
    return result;
  });
  try {
    return await run(await getAccessToken(state));
  } catch (error) {
    if (isAccessTokenError(error) && state.refreshToken) {
      return refreshAndRetry(run, state);
    }
    throw error;
  }
}

async function kuaishouMultipartRequest(path, { fields, files, query, timeoutMs } = {}) {
  const state = getActiveAuthContext();
  const url = new URL(path, config.kuaishou.baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    }
  }
  const run = (token) => requestMultipart(url.toString(), {
    method: "POST",
    headers: { "Access-Token": token },
    fields,
    files,
    timeoutMs
  }).then((result) => {
    assertKuaishouSuccess(result);
    state.invalidReason = "";
    return result;
  });
  try {
    return await run(await getAccessToken(state));
  } catch (error) {
    if (isAccessTokenError(error) && state.refreshToken) {
      return refreshAndRetry(run, state);
    }
    throw error;
  }
}

function getTokenStatus(state = getActiveAuthContext()) {
  return {
    hasAppId: Boolean(config.kuaishou.appId),
    hasSecret: Boolean(config.kuaishou.secret),
    hasAccessToken: Boolean(state.accessToken),
    hasRefreshToken: Boolean(state.refreshToken),
    authUserId: state.authUserId || "",
    advertiserId: state.advertiserId || null,
    expiresAt: state.expiresAt || null,
    refreshTokenExpiresAt: state.refreshTokenExpiresAt || null,
    invalidReason: state.invalidReason || ""
  };
}

function markTokenInvalid(reason) {
  const state = getActiveAuthContext();
  state.invalidReason = reason || "token invalid";
}

module.exports = {
  createKuaishouAuthContext,
  exchangeAccessToken,
  refreshAccessToken,
  kuaishouRequest,
  kuaishouMultipartRequest,
  getTokenStatus,
  markTokenInvalid,
  serializeKuaishouAuth,
  takeKuaishouAuthResponse,
  withKuaishouAuth
};

const { config } = require("./config");

const tokenState = {
  accessToken: config.kuaishou.accessToken,
  refreshToken: config.kuaishou.refreshToken,
  expiresAt: 0
};

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`Kuaishou API ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
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
  applyTokenResponse(body);
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
  applyTokenResponse(body);
  return body;
}

function applyTokenResponse(body) {
  const data = body && (body.data || body);
  if (!data) return;
  tokenState.accessToken = data.access_token || tokenState.accessToken;
  tokenState.refreshToken = data.refresh_token || tokenState.refreshToken;
  const expiresIn = Number(data.expires_in || data.expires || 0);
  if (expiresIn > 0) tokenState.expiresAt = Date.now() + expiresIn * 1000;
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
  getTokenStatus
};

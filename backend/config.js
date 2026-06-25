const fs = require("fs");
const path = require("path");

function loadEnv(file = path.join(__dirname, "..", ".env")) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const envFile = path.join(__dirname, "..", ".env");

loadEnv(envFile);

const config = {
  envFile,
  port: Number(process.env.PORT || 4189),
  authCallbackPort: Number(process.env.KUAISHOU_AUTH_CALLBACK_PORT || 8000),
  kuaishou: {
    baseUrl: process.env.KUAISHOU_API_BASE || "https://ad.e.kuaishou.com",
    appId: process.env.KUAISHOU_APP_ID || "",
    secret: process.env.KUAISHOU_SECRET || "",
    authUserId: process.env.KUAISHOU_AUTH_USER_ID || "",
    accessToken: process.env.KUAISHOU_ACCESS_TOKEN || "",
    refreshToken: process.env.KUAISHOU_REFRESH_TOKEN || "",
    advertiserId: process.env.KUAISHOU_ADVERTISER_ID || ""
  }
};

module.exports = { config };

const API_BASE = "http://127.0.0.1:4189";

let accounts = [
  { id: "112939731", name: "游霄-开荒之旅-w", remark: "游霄A", checked: true },
  { id: "112939730", name: "游霄-开荒之旅-w", remark: "游霄B", checked: true },
  { id: "112939732", name: "游霄-开荒之旅-w", remark: "游霄C", checked: true },
  { id: "110998691", name: "无敌作战-LZZ", remark: "无敌作战", checked: false },
  { id: "110964231", name: "吞食山海-LZZ", remark: "吞食山海", checked: false },
  { id: "82540931", name: "暴走大作战", remark: "暴走大作战", checked: false }
];

const DEFAULT_CREATIVE_GROUP_COUNT = 16;
const DEFAULT_ASSETS_PER_GROUP = 15;
const SUPPORTED_ASSET_EXTENSIONS = [".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".jpg", ".jpeg", ".png", ".webp"];

let assets = [];
let materialFolderName = "";
let materialSelectionMode = "random";
let creativeGroupCount = DEFAULT_CREATIVE_GROUP_COUNT;
let assetsPerGroup = DEFAULT_ASSETS_PER_GROUP;
let creativeGroupAssignments = createEmptyAssignments(creativeGroupCount);
const materialFileStore = new Map();

let accountPickerOpen = false;
let accountSearchText = "";
let currentEditorPage = "basic";
let targetingConfig = {
  mode: "none",
  packageName: "不限定向",
  include: "",
  exclude: "",
  paid: "",
  region: "",
  age: "不限",
  gender: "不限",
  platform: "不限",
  brand: "",
  network: "不限"
};
let promotionTargetConfig = {
  type: "miniGame",
  appId: "ks690739594015559335"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function replaceAllText(value, search, replacement) {
  return String(value).split(search).join(replacement);
}

function checkedGoalValue() {
  const checked = $('input[name="goal"]:checked');
  return checked ? checked.value : "推广小程序";
}

function truncateName(value, maxLength = 100) {
  return String(value || "").slice(0, maxLength);
}

function currentDateToken() {
  return replaceAllText($("#startDate").value || new Date().toISOString().slice(0, 10), "-", "");
}

function applyNameTokens(rule, context = {}) {
  const account = context.account || {};
  const asset = context.asset || {};
  const date = context.date || currentDateToken();
  const sequence = context.sequence || "001";
  const groupNo = context.groupNo || "01";
  const time = context.time || new Date().toTimeString().slice(0, 8).replace(/:/g, "");
  const replacements = {
    "[日期]": date,
    "[序号]": sequence,
    "[创意组]": groupNo,
    "[时间]": time,
    "[账户ID]": account.id || "",
    "[账户备注]": account.remark || "",
    "[素材名]": asset.name || "",
    "[小程序名称]": $("#productName") ? $("#productName").value : "",
    "[快手ID]": account.userId || account.kwaiId || "",
    "<账户备注>": account.remark || "",
    "<素材名>": asset.name || "",
    "<账户ID>": account.id || "",
    "<小程序名称>": $("#productName") ? $("#productName").value : "",
    "<快手ID>": account.userId || account.kwaiId || ""
  };
  return Object.keys(replacements).reduce((value, token) => replaceAllText(value, token, replacements[token]), String(rule || ""));
}

function buildConfiguredNames(account, asset, rowIndex = 1) {
  const sequence = String(rowIndex).padStart(3, "0");
  const groupNo = String(asset && asset.groupIndex != null ? Number(asset.groupIndex) + 1 : 1).padStart(2, "0");
  const context = { account, asset, sequence, groupNo };
  const groupRule = $("#groupRule").value || "开荒之旅_[日期][序号]";
  const creativeRule = $("#creativeRule").value || "<账户备注><素材名>";
  const groupName = truncateName(applyNameTokens(groupRule, context));
  const creativeName = truncateName(applyNameTokens(creativeRule, context)) || groupName;
  return {
    campaignName: groupName,
    unitName: groupName,
    creativeName
  };
}

function createEmptyAssignments(count) {
  return Array.from({ length: count }, () => []);
}

function normalizeCreativeGroupCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return DEFAULT_CREATIVE_GROUP_COUNT;
  return Math.max(1, Math.min(200, Math.floor(count)));
}

function normalizeAssetsPerGroup(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return DEFAULT_ASSETS_PER_GROUP;
  return Math.max(1, Math.min(200, Math.floor(count)));
}

function syncCreativeGroupCountInput() {
  const input = $("#creativeGroupCountInput");
  if (input) input.value = creativeGroupCount;
}

function syncAssetsPerGroupInput() {
  const input = $("#assetsPerGroupInput");
  if (input) input.value = assetsPerGroup;
}

function setAssetsPerGroup(value, options = {}) {
  const nextCount = normalizeAssetsPerGroup(value);
  const previousCount = assetsPerGroup;
  assetsPerGroup = nextCount;
  creativeGroupAssignments = creativeGroupAssignments.map((ids) => {
    if (ids.length > nextCount) return ids.slice(0, nextCount);
    if (options.randomize && assets.length && nextCount > previousCount) {
      const current = {};
      ids.forEach((id) => {
        current[id] = true;
      });
      const additions = sampleAssetIds(assets.filter((asset) => !current[asset.id]), nextCount - ids.length);
      return ids.concat(additions);
    }
    return ids;
  });
  syncAssetsPerGroupInput();
  renderAssets();
  updatePreview(false);
  if (options.showMessage) showToast(`每组素材数已调整为 ${assetsPerGroup} 个`);
}

function setCreativeGroupCount(value, options = {}) {
  const nextCount = normalizeCreativeGroupCount(value);
  const previousCount = creativeGroupCount;
  creativeGroupCount = nextCount;
  if (nextCount > previousCount) {
    const additions = Array.from({ length: nextCount - previousCount }, () =>
      options.randomize && assets.length ? sampleAssetIds(assets, assetsPerGroup) : []
    );
    creativeGroupAssignments = creativeGroupAssignments.concat(additions);
  } else if (nextCount < previousCount) {
    creativeGroupAssignments = creativeGroupAssignments.slice(0, nextCount);
  }
  syncCreativeGroupCountInput();
  renderAssets();
  updatePreview(false);
  if (options.showMessage) showToast(`创意组数量已调整为 ${creativeGroupCount} 个`);
}

function init() {
  $("#startDate").value = new Date().toISOString().slice(0, 10);
  renderAccounts();
  renderAssets();
  renderTargetingSummary();
  renderPromotionTargetSummary();
  bindEvents();
  updatePreview(false);
  loadAuthStatus();
  loadAccounts();
}

async function loadAccounts() {
  try {
    const body = await apiFetch("/api/accounts");
    if (Array.isArray(body.data) && body.data.length) {
      accounts = body.data.map((account, index) => ({
        id: String(account.id),
        name: account.name || `广告账户${index + 1}`,
        remark: account.remark || account.productName || account.name || "",
        checked: Boolean(account.checked)
      }));
      renderAccounts();
      updatePreview(false);
      showToast(`已加载快手广告账户：${accounts.length} 个`);
    }
  } catch (error) {
    showToast(`快手账户加载失败，继续使用本地示例：${error.message}`);
  }
}

function bindEvents() {
  ["strategyName", "productName", "groupRule", "creativeRule", "budget", "startDate", "roi", "cta", "reason", "copyText"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => updatePreview(false));
    document.getElementById(id).addEventListener("change", () => updatePreview(false));
  });

  $$('input[name="goal"]').forEach((radio) => radio.addEventListener("change", () => updatePreview(false)));
  bindAccountPickerEvents();
  $$("[data-editor]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      openEditor(button.dataset.editor);
    });
  });
  $$("[data-editor-tab]").forEach((button) => {
    button.addEventListener("click", () => setEditorPage(button.dataset.editorTab));
  });
  $("#editorCancel").addEventListener("click", closeEditor);
  $("#editorSave").addEventListener("click", saveEditor);
  $("#editorBatchAdd").addEventListener("click", () => $("#folderInput").click());
  $("#folderPickBtn").addEventListener("click", () => $("#folderInput").click());
  $("#folderInput").addEventListener("change", handleFolderSelect);
  $("#clearAssetsBtn").addEventListener("click", clearAssets);
  $("#randomAssignBtn").addEventListener("click", randomAssignAssets);
  $("#uploadMaterialsBtn").addEventListener("click", uploadSelectedMaterials);
  $("#creativeGroupCountInput").addEventListener("change", (event) => {
    setCreativeGroupCount(event.target.value, {
      randomize: materialSelectionMode === "random",
      showMessage: true
    });
  });
  $("#creativeGroupCountInput").addEventListener("input", (event) => {
    const value = event.target.value.replace(/[^\d]/g, "");
    event.target.value = value;
    if (value) {
      setCreativeGroupCount(value, {
        randomize: materialSelectionMode === "random",
        showMessage: false
      });
    }
  });
  $("#assetsPerGroupInput").addEventListener("change", (event) => {
    setAssetsPerGroup(event.target.value, {
      randomize: materialSelectionMode === "random",
      showMessage: true
    });
  });
  $("#assetsPerGroupInput").addEventListener("input", (event) => {
    const value = event.target.value.replace(/[^\d]/g, "");
    event.target.value = value;
    if (value) {
      setAssetsPerGroup(value, {
        randomize: materialSelectionMode === "random",
        showMessage: false
      });
    }
  });
  $$('input[name="folderPickMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      materialSelectionMode = radio.value;
      renderAssets();
      updatePreview(false);
    });
  });
  $("#editorAddCopy").addEventListener("click", addLibraryCopy);
  $("#autoGroupBtn").addEventListener("click", autoGroupAssets);
  $("#shuffleBtn").addEventListener("click", shuffleCopy);
  $("#previewBtn").addEventListener("click", previewWithBackend);
  $("#saveBtn").addEventListener("click", saveStrategy);
  $("#realCreateBtn").addEventListener("click", realCreateTestFromPage);
  $("#exportBtn").addEventListener("click", submitWithBackend);
  $("#authorizeBtn").addEventListener("click", openAuthorizeUrl);
  $("#refreshAuthBtn").addEventListener("click", refreshAuthToken);
  $("#editorGroupRule").addEventListener("input", () => syncEditorNameRule("editorGroupRule"));
  $("#editorGroupNameRule").addEventListener("input", () => syncEditorNameRule("editorGroupNameRule"));
  $$('input[name="promotionTargetType"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      updatePromotionTargetOptions();
    });
  });
  $$('input[name="targetingPackageMode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      $$('input[name="targetingPackageMode"]').forEach((item) => {
        const card = item.closest(".option-card");
        if (card) card.classList.toggle("active", item.checked);
      });
      renderTargetingPreview();
    });
  });
  ["editorTargetingPackage", "editorTargetingInclude", "editorTargetingExclude", "editorTargetingPaid", "editorTargetingRegion", "editorTargetingAge", "editorTargetingGender", "editorTargetingPlatform", "editorTargetingBrand", "editorTargetingNetwork"].forEach((id) => {
    const field = document.getElementById(id);
    if (field) {
      field.addEventListener("input", renderTargetingPreview);
      field.addEventListener("change", renderTargetingPreview);
    }
  });
  $$("#ctaCloud button").forEach((button) => button.addEventListener("click", () => selectCloudValue("#ctaCloud", button, "#cta")));
  $$("#reasonCloud button").forEach((button) => button.addEventListener("click", () => selectCloudValue("#reasonCloud", button, "#reason")));
}

function renderAuthStatus(status, error) {
  const text = $("#authStatusText");
  const entry = $("#authEntry");
  if (!text || !entry) return;
  entry.classList.remove("ok", "warn", "error");
  if (error) {
    text.textContent = `授权异常：${error.message}`;
    entry.classList.add("error");
    return;
  }
  if (!status || !status.hasAppId || !status.hasSecret) {
    text.textContent = "未配置应用";
    entry.classList.add("error");
    return;
  }
  if (status.hasAccessToken && status.hasRefreshToken) {
    text.textContent = "已授权";
    entry.classList.add("ok");
    return;
  }
  if (status.hasRefreshToken) {
    text.textContent = "可刷新授权";
    entry.classList.add("warn");
    return;
  }
  text.textContent = "未授权";
  entry.classList.add("warn");
}

async function loadAuthStatus() {
  try {
    const status = await apiFetch("/api/auth/status");
    renderAuthStatus(status, null);
  } catch (error) {
    renderAuthStatus(null, error);
  }
}

async function openAuthorizeUrl() {
  const button = $("#authorizeBtn");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "打开中";
  try {
    const body = await apiFetch("/api/auth/authorize-url");
    if (!body.url) throw new Error("后端未返回授权链接");
    window.open(body.url, "_blank", "noopener,noreferrer");
    showToast("已打开快手授权页，授权完成后回到本页刷新状态");
  } catch (error) {
    showToast(`打开授权失败：${error.message}`);
    renderAuthStatus(null, error);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function refreshAuthToken() {
  const button = $("#refreshAuthBtn");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "刷新中";
  try {
    await apiFetch("/api/auth/refresh", { method: "POST", body: JSON.stringify({}) });
    await loadAuthStatus();
    await loadAccounts();
    showToast("授权刷新成功");
  } catch (error) {
    showToast(`授权刷新失败：${error.message}`);
    renderAuthStatus(null, error);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function bindAccountPickerEvents() {
  const selector = document.querySelector(".user-selector");
  if (!selector) return;
  const selectorContent = selector.querySelector(".selector-content");
  const suffixButton = selector.querySelector(".selector-suffix-btn");
  [selectorContent, suffixButton].forEach((target) => {
    if (!target) return;
    target.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setAccountPickerOpen(!accountPickerOpen);
    });
  });
  document.addEventListener("click", (event) => {
    if (accountPickerOpen && !selector.contains(event.target)) setAccountPickerOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setAccountPickerOpen(false);
  });
}

function setAccountPickerOpen(open) {
  accountPickerOpen = Boolean(open);
  const list = $("#accountList");
  if (!list) return;
  list.classList.toggle("open", accountPickerOpen);
  if (accountPickerOpen) {
    const search = $("#accountSearch");
    if (search) search.focus();
  }
}

function summaryValue(value) {
  return value && value !== "不限" ? value : "";
}

function targetingModeLabel(mode) {
  if (mode === "account") return "分账户配置";
  if (mode === "unified") return "统一配置";
  return "不限定向";
}

function readTargetingEditor() {
  const checked = $('input[name="targetingPackageMode"]:checked');
  return {
    mode: checked ? checked.value : "none",
    packageName: $("#editorTargetingPackage").value || "不限定向",
    include: $("#editorTargetingInclude").value.trim(),
    exclude: $("#editorTargetingExclude").value.trim(),
    paid: $("#editorTargetingPaid").value.trim(),
    region: $("#editorTargetingRegion").value.trim(),
    age: $("#editorTargetingAge").value,
    gender: $("#editorTargetingGender").value,
    platform: $("#editorTargetingPlatform").value,
    brand: $("#editorTargetingBrand").value.trim(),
    network: $("#editorTargetingNetwork").value
  };
}

function fillTargetingEditor() {
  $$('input[name="targetingPackageMode"]').forEach((radio) => {
    radio.checked = radio.value === targetingConfig.mode;
    const card = radio.closest(".option-card");
    if (card) card.classList.toggle("active", radio.checked);
  });
  $("#editorTargetingPackage").value = targetingConfig.packageName || "不限定向";
  $("#editorTargetingInclude").value = targetingConfig.include || "";
  $("#editorTargetingExclude").value = targetingConfig.exclude || "";
  $("#editorTargetingPaid").value = targetingConfig.paid || "";
  $("#editorTargetingRegion").value = targetingConfig.region || "";
  $("#editorTargetingAge").value = targetingConfig.age || "不限";
  $("#editorTargetingGender").value = targetingConfig.gender || "不限";
  $("#editorTargetingPlatform").value = targetingConfig.platform || "不限";
  $("#editorTargetingBrand").value = targetingConfig.brand || "";
  $("#editorTargetingNetwork").value = targetingConfig.network || "不限";
  renderTargetingPreview();
}

function renderTargetingSummary() {
  const title = $("#targetingTitle");
  if (title) title.textContent = `已选定向包：${targetingModeLabel(targetingConfig.mode)}`;
  const values = {
    targetingPackageSummary: targetingConfig.packageName || "不限定向",
    targetingIncludeSummary: targetingConfig.include,
    targetingExcludeSummary: targetingConfig.exclude,
    targetingPaidSummary: targetingConfig.paid,
    targetingRegionSummary: summaryValue(targetingConfig.region),
    targetingAgeSummary: summaryValue(targetingConfig.age),
    targetingGenderSummary: summaryValue(targetingConfig.gender),
    targetingPlatformSummary: summaryValue(targetingConfig.platform),
    targetingBrandSummary: targetingConfig.brand,
    targetingNetworkSummary: summaryValue(targetingConfig.network)
  };
  Object.keys(values).forEach((id) => {
    const node = document.getElementById(id);
    if (node) node.textContent = values[id] || "";
  });
}

function renderTargetingPreview() {
  const preview = $("#targetingPreview");
  if (!preview) return;
  const config = currentEditorPage === "targeting" ? readTargetingEditor() : targetingConfig;
  const rows = [
    ["配置方式", targetingModeLabel(config.mode)],
    ["定向包", config.packageName || "不限定向"],
    ["定向人群包", config.include || "未选择"],
    ["排除人群包", config.exclude || "未选择"],
    ["付费人群包", config.paid || "未选择"],
    ["区域", config.region || "不限"],
    ["年龄", config.age || "不限"],
    ["性别", config.gender || "不限"],
    ["平台", config.platform || "不限"],
    ["手机品牌", config.brand || "不限"],
    ["网络环境", config.network || "不限"]
  ];
  preview.innerHTML = rows.map((row) => `
    <span>${escapeHtml(row[0])}</span>
    <strong>${escapeHtml(row[1])}</strong>
  `).join("");
}

function promotionTargetLabel(type) {
  return type === "miniProgram" ? "小程序" : "小游戏";
}

function promotionMiniAppType(type) {
  return type === "miniProgram" ? 1 : 2;
}

function readPromotionTargetEditor() {
  const checked = $('input[name="promotionTargetType"]:checked');
  return {
    type: checked ? checked.value : "miniGame",
    appId: $("#editorPromotionAppId") ? $("#editorPromotionAppId").value.trim() : ""
  };
}

function updatePromotionTargetOptions() {
  const checked = $('input[name="promotionTargetType"]:checked');
  const type = checked ? checked.value : promotionTargetConfig.type;
  $$('input[name="promotionTargetType"]').forEach((radio) => {
    const option = radio.closest(".promotion-target-option");
    if (option) option.classList.toggle("active", radio.checked);
  });
  const label = $("#editorPromotionAppIdLabel");
  const input = $("#editorPromotionAppId");
  const targetLabel = promotionTargetLabel(type);
  if (label) label.textContent = `${targetLabel}APPID`;
  if (input) input.placeholder = `请输入${targetLabel} APPID`;
}

function fillPromotionTargetEditor() {
  $$('input[name="promotionTargetType"]').forEach((radio) => {
    radio.checked = radio.value === promotionTargetConfig.type;
  });
  const input = $("#editorPromotionAppId");
  if (input) input.value = promotionTargetConfig.appId || "";
  updatePromotionTargetOptions();
}

function renderPromotionTargetSummary(config) {
  const summary = $("#promotionTargetSummary");
  if (!summary) return;
  const nextConfig = config || promotionTargetConfig;
  summary.textContent = `${promotionTargetLabel(nextConfig.type)} ${nextConfig.appId || "未填写 APPID"}`;
}

function renderAccounts() {
  $("#accountList").innerHTML = `
    <div class="account-popover-head">
      <input id="accountSearch" class="account-search-input" placeholder="搜索账号 ID / 名称 / 备注" value="${escapeHtml(accountSearchText)}" />
      <button class="account-close-btn" id="accountPickerClose" type="button">关闭</button>
    </div>
    <div class="account-popover-actions">
      <span id="accountPickerStats"></span>
      <button id="accountSelectVisible" type="button">全选当前</button>
      <button id="accountClearVisible" type="button">清空当前</button>
    </div>
    <div class="account-popover-body">
      ${accounts
        .map(
          (account, index) => `
            <label class="account-line" data-account-row>
              <input type="checkbox" data-account="${index}" ${account.checked ? "checked" : ""} />
              <span>${escapeHtml(account.id)}　${escapeHtml(account.name)}(${escapeHtml(account.remark)})</span>
            </label>
          `
        )
        .join("")}
    </div>
  `;

  $$("[data-account]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      accounts[Number(checkbox.dataset.account)].checked = checkbox.checked;
      updatePreview(false);
      updateAccountPickerStats();
    });
  });
  $("#accountSearch").addEventListener("input", (event) => {
    accountSearchText = event.target.value.trim();
    filterAccountRows();
  });
  $("#accountPickerClose").addEventListener("click", () => setAccountPickerOpen(false));
  $("#accountSelectVisible").addEventListener("click", () => setVisibleAccountsChecked(true));
  $("#accountClearVisible").addEventListener("click", () => setVisibleAccountsChecked(false));
  filterAccountRows();
  setAccountPickerOpen(accountPickerOpen);
}

function filterAccountRows() {
  const search = accountSearchText.toLowerCase();
  $$("[data-account-row]").forEach((row) => {
    row.style.display = row.textContent.toLowerCase().indexOf(search) === -1 ? "none" : "";
  });
  updateAccountPickerStats();
}

function updateAccountPickerStats() {
  const stat = $("#accountPickerStats");
  if (!stat) return;
  const visible = $$("[data-account-row]").filter((row) => row.style.display !== "none").length;
  stat.textContent = `已选 ${getSelectedAccounts().length} / 当前 ${visible} / 全部 ${accounts.length}`;
}

function setVisibleAccountsChecked(checked) {
  $$("[data-account-row]").forEach((row) => {
    if (row.style.display === "none") return;
    const checkbox = row.querySelector("[data-account]");
    if (!checkbox) return;
    checkbox.checked = checked;
    accounts[Number(checkbox.dataset.account)].checked = checked;
  });
  updatePreview(false);
  updateAccountPickerStats();
}

function normalizeMaterialFile(file) {
  const relativePath = file.webkitRelativePath || file.name;
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!SUPPORTED_ASSET_EXTENSIONS.includes(extension)) return null;
  return {
    id: `${relativePath}:${file.size}:${file.lastModified}`,
    name: file.name.replace(/\.[^.]+$/, ""),
    fileName: file.name,
    relativePath,
    folder: relativePath.indexOf("/") > -1 ? relativePath.split("/")[0] : materialFolderName,
    type: file.type || ([".jpg", ".jpeg", ".png", ".webp"].includes(extension) ? "image" : "video"),
    extension,
    size: formatFileSize(file.size),
    bytes: file.size,
    lastModified: file.lastModified
  };
}

function handleFolderSelect(event) {
  const files = Array.from(event.target.files || []);
  const nextAssets = files.map(normalizeMaterialFile).filter(Boolean);
  const seen = {};
  materialFileStore.clear();
  assets = nextAssets.filter((asset) => {
    if (seen[asset.id]) return false;
    seen[asset.id] = true;
    const file = files.find((item) => (item.webkitRelativePath || item.name) === asset.relativePath && item.size === asset.bytes);
    if (file) materialFileStore.set(asset.id, file);
    return true;
  });
  materialFolderName = assets[0] && assets[0].folder ? assets[0].folder : "";
  randomAssignAssets(false);
  renderAssets();
  updatePreview(false);
  showToast(assets.length ? `已读取本地素材：${assets.length} 个` : "文件夹里没有支持的视频或图片素材");
  event.target.value = "";
}

function clearAssets() {
  assets = [];
  materialFolderName = "";
  materialFileStore.clear();
  creativeGroupAssignments = createEmptyAssignments(creativeGroupCount);
  renderAssets();
  updatePreview(false);
  showToast("已清空本地素材");
}

function formatFileSize(bytes) {
  if (!bytes) return "0B";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function sampleAssetIds(sourceAssets, limit) {
  const pool = sourceAssets.map((asset) => asset.id);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(limit, pool.length));
}

function randomAssignAssets(showMessage = true) {
  creativeGroupAssignments = Array.from({ length: creativeGroupCount }, () => sampleAssetIds(assets, assetsPerGroup));
  materialSelectionMode = "random";
  const randomRadio = $('input[name="folderPickMode"][value="random"]');
  if (randomRadio) randomRadio.checked = true;
  renderAssets();
  updatePreview(false);
  if (showMessage) showToast(assets.length ? "已随机分配本地素材" : "请先选择本地素材文件夹");
}

function getAssignedAssetsForGroup(groupIndex) {
  const assignedIds = creativeGroupAssignments[groupIndex] || [];
  return assignedIds.map((id) => assets.find((asset) => asset.id === id)).filter(Boolean);
}

function getEffectiveAssets() {
  const result = [];
  creativeGroupAssignments.forEach((ids, groupIndex) => {
    getAssignedAssetsForGroup(groupIndex).forEach((asset) => {
      result.push(Object.assign({ groupIndex }, asset));
    });
  });
  return result;
}

function uniqueAssets(items) {
  const seen = {};
  return items.filter((asset) => {
    if (!asset || seen[asset.id]) return false;
    seen[asset.id] = true;
    return true;
  });
}

function getUploadTargetAssets() {
  return uniqueAssets(getEffectiveAssets())
    .map((asset) => assets.find((item) => item.id === asset.id) || asset)
    .filter((asset) => !asset.photo_id && !asset.photoId);
}

function isVideoAsset(asset) {
  return String(asset.extension || "").toLowerCase() === ".mp4";
}

function assetUploadLabel(asset) {
  if (asset.photo_id || asset.photoId) return "已上传";
  if (asset.upload_status === "uploading") return "上传中";
  if (asset.upload_status === "error") return "上传失败";
  return "未上传";
}

function assetUploadClass(asset) {
  if (asset.photo_id || asset.photoId) return "uploaded";
  if (asset.upload_status === "uploading") return "uploading";
  if (asset.upload_status === "error") return "error";
  return "pending";
}

function setUploadNotice(message, type = "") {
  const notice = $("#uploadNotice");
  if (!notice) return;
  notice.textContent = message || "";
  notice.className = `upload-notice ${type}`.trim();
}

function findPhotoId(value) {
  if (!value || typeof value !== "object") return "";
  if (value.photo_id || value.photoId) return value.photo_id || value.photoId;
  const keys = Object.keys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const child = value[keys[index]];
    if (child && typeof child === "object") {
      const found = findPhotoId(child);
      if (found) return found;
    }
  }
  return "";
}

async function uploadSelectedMaterials() {
  const account = pickRealCreateAccount();
  if (!account || !account.id) {
    showToast("请先选择一个媒体账号");
    return;
  }
  const button = $("#uploadMaterialsBtn");
  const originalText = button.textContent;
  const targets = getUploadTargetAssets();
  if (!targets.length) {
    showToast("当前已分配素材都已上传或暂无可上传素材");
    setUploadNotice("当前已分配素材都已上传或暂无可上传素材", "success");
    return;
  }
  const unsupported = targets.filter((asset) => !isVideoAsset(asset));
  if (unsupported.length) {
    showToast("当前快手上传链路只支持 mp4，其他格式暂不能用于真实创建");
    setUploadNotice(`有 ${unsupported.length} 个素材不是 mp4，暂不能上传到当前快手视频创意链路`, "error");
    return;
  }
  button.disabled = true;
  setUploadNotice(`准备上传 ${targets.length} 个素材到快手...`, "uploading");
  try {
    for (let index = 0; index < targets.length; index += 1) {
      const asset = targets[index];
      const file = materialFileStore.get(asset.id);
      if (!file) throw new Error(`找不到本地文件：${asset.fileName}`);
      button.textContent = `上传中 ${index + 1}/${targets.length}`;
      asset.upload_status = "uploading";
      asset.upload_error = "";
      setUploadNotice(`正在上传 ${index + 1}/${targets.length}：${asset.fileName}`, "uploading");
      renderAssets();
      const form = new FormData();
      form.append("advertiser_id", account.id);
      form.append("asset_id", asset.id);
      form.append("file_name", asset.fileName);
      form.append("file", file, asset.fileName);
      const body = await apiFetch("/api/kuaishou/material/video/upload", {
        method: "POST",
        body: form,
        skipJsonContentType: true
      });
      const photoId = findPhotoId(body);
      if (!photoId) throw new Error("上传接口未返回 photo_id，请检查快手返回结构");
      asset.photo_id = String(photoId);
      asset.photoId = String(photoId);
      asset.upload_status = "uploaded";
      asset.upload_response = body.data && body.data.result;
      setUploadNotice(`已上传 ${index + 1}/${targets.length}：${asset.fileName}`, "success");
      renderAssets();
      updatePreview(false);
    }
    showToast(`已上传 ${targets.length} 个素材到快手`);
    setUploadNotice(`上传完成：${targets.length} 个素材已拿到 photo_id`, "success");
  } catch (error) {
    const uploadingAsset = targets.find((asset) => asset.upload_status === "uploading");
    if (uploadingAsset) {
      uploadingAsset.upload_status = "error";
      uploadingAsset.upload_error = error.message;
    }
    showToast(`素材上传失败：${error.message}`);
    setUploadNotice(`素材上传失败：${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
    renderAssets();
    updatePreview(false);
  }
}

function updateMaterialStats() {
  const effective = getEffectiveAssets();
  const uniqueEffective = uniqueAssets(effective);
  const uploaded = uniqueEffective.filter((asset) => asset.photo_id || asset.photoId).length;
  const uploading = uniqueEffective.filter((asset) => asset.upload_status === "uploading").length;
  const failed = uniqueEffective.filter((asset) => asset.upload_status === "error").length;
  const assetCount = $("#assetCount");
  if (assetCount) assetCount.textContent = `已选：${assets.length}个`;
  const totalAds = $("#totalAds");
  if (totalAds) totalAds.textContent = effective.length;
  const taskCount = $("#taskCount");
  if (taskCount) taskCount.textContent = effective.length;
  const folderName = $("#folderName");
  if (folderName) folderName.textContent = materialFolderName || "未选择文件夹";
  const folderStats = $("#folderStats");
  if (folderStats) {
    folderStats.textContent = `本地素材 ${assets.length} 个 · 已分配 ${effective.length} 个 · 已上传 ${uploaded} 个${uploading ? ` · 上传中 ${uploading} 个` : ""}${failed ? ` · 失败 ${failed} 个` : ""} · ${materialSelectionMode === "random" ? "随机选" : "指定选"}`;
  }
  const materialToolbarStats = $("#materialToolbarStats");
  if (materialToolbarStats) {
    materialToolbarStats.textContent = `${creativeGroupCount} 个创意组 · 本地素材 ${assets.length} 个 · 每组最多 ${assetsPerGroup} 个`;
  }
  syncCreativeGroupCountInput();
  syncAssetsPerGroupInput();
  $$('input[name="folderPickMode"]').forEach((radio) => {
    const card = radio.closest(".option-card");
    if (card) card.classList.toggle("active", radio.checked);
  });
}

function renderAssets() {
  const assetBoard = $("#assetBoard");
  if (assetBoard) assetBoard.innerHTML = assets.length ? assets
    .map(
      (asset) => `
        <span class="asset-tag">
          <span>${escapeHtml(asset.name)}</span>
          <small>${escapeHtml(asset.extension)} · ${escapeHtml(asset.size)} · ${assetUploadLabel(asset)}</small>
          <button class="asset-remove" data-remove-asset="${asset.id}" type="button">×</button>
        </span>
      `
    )
    .join("") : `<span class="asset-empty">未选择本地素材文件夹</span>`;

  $$("[data-remove-asset]").forEach((button) => {
    button.addEventListener("click", () => {
      materialFileStore.delete(button.dataset.removeAsset);
      assets = assets.filter((asset) => asset.id !== button.dataset.removeAsset);
      creativeGroupAssignments = creativeGroupAssignments.map((ids) => ids.filter((id) => id !== button.dataset.removeAsset));
      renderAssets();
      updatePreview(false);
    });
  });

  $$('input[name="folderPickMode"]').forEach((radio) => {
    radio.checked = radio.value === materialSelectionMode;
  });
  updateMaterialStats();
  renderCreativeGroups();
}

function addAsset() {
  $("#folderInput").click();
}

function autoGroupAssets() {
  randomAssignAssets();
}

function renderCreativeGroups() {
  const groups = $("#creativeGroups");
  if (!groups) return;
  groups.innerHTML = Array.from({ length: creativeGroupCount }, (_, index) => {
    const assignedAssets = getAssignedAssetsForGroup(index);
    const items = assignedAssets.length
      ? assignedAssets.map((asset, itemIndex) => `
          <div class="creative-item">
            <b>创意${itemIndex + 1}</b>
            <span title="${escapeHtml(asset.relativePath)}">${escapeHtml(asset.name)}</span>
            <small>${escapeHtml(asset.extension)} · ${escapeHtml(asset.size)}</small>
            <em class="asset-status ${assetUploadClass(asset)}">${assetUploadLabel(asset)}</em>
            ${asset.upload_error ? `<em class="asset-error" title="${escapeHtml(asset.upload_error)}">${escapeHtml(asset.upload_error)}</em>` : ""}
          </div>
        `).join("")
      : `<div class="creative-empty">未分配素材</div>`;
    const picker = materialSelectionMode === "specified" ? `
      <div class="specified-picker">
        ${assets.map((asset) => `
          <label>
            <input type="checkbox" data-group-asset="${index}" value="${escapeHtml(asset.id)}" ${assignedAssets.some((item) => item.id === asset.id) ? "checked" : ""} />
            <span title="${escapeHtml(asset.relativePath)}">${escapeHtml(asset.name)}</span>
          </label>
        `).join("")}
      </div>
    ` : "";
    return `
      <article class="creative-group-card">
        <div class="creative-group-head">
          <strong>创意组${String(index + 1).padStart(2, "0")}</strong>
          <span>素材(${assignedAssets.length}/${assetsPerGroup})</span>
        </div>
        ${picker}
        <div class="creative-list">${items}</div>
      </article>
    `;
  }).join("");

  $$("[data-group-asset]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const groupIndex = Number(checkbox.dataset.groupAsset);
      const current = creativeGroupAssignments[groupIndex] || [];
      if (checkbox.checked) {
        if (current.length >= assetsPerGroup) {
          checkbox.checked = false;
          showToast(`每个创意组最多 ${assetsPerGroup} 个素材`);
          return;
        }
        creativeGroupAssignments[groupIndex] = current.concat(checkbox.value);
      } else {
        creativeGroupAssignments[groupIndex] = current.filter((id) => id !== checkbox.value);
      }
      updateMaterialStats();
      updatePreview(false);
      renderCreativeGroups();
    });
  });
}

function renderCopyLibrary() {
  const rows = [
    ["别人的棉花糖：蓬松。你的棉花糖：实心", "绿洲-刘雨微", "2026-06-12 16:56:34", "950.22", "12.55%", "23"],
    ["裹个棉花糖而已——手别抖", "绿洲-刘雨微", "2026-06-12 16:34:56", "0.00", "0.00%", "8"],
    ["罗布乐思水上乐园爬楼滑梯！", "绿洲-蔡蔓娴", "2026-06-12 16:34:56", "0.00", "0.00%", "11"],
    ["这一下，谁也站不住", "星大陆（广州）网络科技有限公司", "2026-06-11 17:43:54", "0.01", "0.03%", "17"],
    ["不用氪不用肝，单手爬塔轻松通关", "绿洲-江俊涛", "2026-06-10 18:19:24", "0.00", "0.00%", "4"],
    ["别人通勤靠地铁，我通勤靠屁股摩擦", "绿洲-章佳妮", "2026-06-08 17:57:21", "0.03", "0.06%", "7"]
  ];
  $("#copyLibraryRows").innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row[0])}</td>
      <td>${escapeHtml(row[1])}</td>
      <td>${escapeHtml(row[2])}</td>
      <td>${escapeHtml(row[3])}</td>
      <td>${escapeHtml(row[4])}</td>
      <td>${escapeHtml(row[5])}</td>
      <td><button data-copy-add="${escapeHtml(row[0])}" type="button">添加</button></td>
    </tr>
  `).join("");
  $$("[data-copy-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const textarea = $("#editorCopyText");
      textarea.value = `${textarea.value.trim()}\n${button.dataset.copyAdd}`.trim();
      showToast("已添加文案");
    });
  });
}

function getSelectedAccounts() {
  return accounts.filter((account) => account.checked);
}

function getCopies() {
  return $("#copyText").value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildRows() {
  const selectedAccounts = getSelectedAccounts();
  const copies = getCopies();
  const rows = [];

  selectedAccounts.forEach((account) => {
    creativeGroupAssignments.forEach((ids, groupIndex) => {
      const groupAssets = getAssignedAssetsForGroup(groupIndex).map((asset) => Object.assign({ groupIndex }, asset));
      if (!groupAssets.length) return;
      const primaryAsset = groupAssets[0];
      const groupNo = String(groupIndex + 1).padStart(2, "0");
      const names = buildConfiguredNames(account, primaryAsset, rows.length + 1);
      rows.push({
        index: rows.length + 1,
        account: `${account.name}(${account.id})`,
        groupName: names.unitName,
        creativeName: names.creativeName,
        asset: groupAssets.map((asset) => asset.name).join("、"),
        assetFileName: groupAssets.map((asset) => asset.fileName || asset.name).join("、"),
        assetPath: groupAssets.map((asset) => asset.relativePath).filter(Boolean).join("、"),
        assetGroup: groupNo,
        creativeCount: groupAssets.length,
        creativeAssets: groupAssets,
        copy: copies[rows.length % Math.max(copies.length, 1)] || "",
        cta: $("#cta").value,
        reason: $("#reason").value,
        budget: $("#budget").value,
        roi: $("#roi").value,
        goal: checkedGoalValue()
      });
    });
  });

  return rows;
}

function buildPayload() {
  return {
    strategyName: $("#strategyName").value,
    productName: $("#productName").value,
    groupRule: $("#groupRule").value,
    creativeRule: $("#creativeRule").value,
    budget: $("#budget").value,
    startDate: $("#startDate").value,
    roi: $("#roi").value,
    cta: $("#cta").value,
    reason: $("#reason").value,
    goal: checkedGoalValue(),
    targeting: targetingConfig,
    promotionTarget: promotionTargetConfig,
    accounts: getSelectedAccounts(),
    assets,
    materialFolderName,
    materialSelectionMode,
    creativeGroupCount,
    assetsPerGroup,
    creativeGroupAssignments,
    assignedAssets: getEffectiveAssets(),
    copies: getCopies()
  };
}

async function apiFetch(path, options = {}) {
  const headers = Object.assign({}, options.headers || {});
  if (!options.skipJsonContentType) headers["content-type"] = "application/json";
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detailMessage = body.detail && (body.detail.message || body.detail.msg || body.detail.raw);
    throw new Error([body.error || `HTTP ${response.status}`, detailMessage].filter(Boolean).join("："));
  }
  return body;
}

function normalizeBackendRows(rows) {
  return rows.map((row) => ({
    index: row.index,
    account: row.account || `${row.accountName || ""}(${row.accountId || ""})`,
    groupName: row.groupName || row.adGroupName,
    creativeName: row.creativeName,
    asset: row.asset || row.assetName,
    assetFileName: row.assetFileName || "",
    assetPath: row.assetPath || "",
    assetGroup: row.assetGroup || "",
    copy: row.copy,
    cta: $("#cta").value,
    reason: $("#reason").value,
    budget: $("#budget").value,
    roi: $("#roi").value,
    goal: checkedGoalValue()
  }));
}

function renderPreviewRows(rows) {
  const previewTotalMirror = document.querySelector("#previewTotalMirror");
  if (previewTotalMirror) previewTotalMirror.textContent = rows.length;
  $("#previewRows").innerHTML = rows
    .slice(0, 16)
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.account)}</td>
          <td>${escapeHtml(row.groupName)}</td>
          <td>${escapeHtml(row.assetFileName || row.asset)}</td>
        </tr>
      `
    )
    .join("");
}

function renderCreateResult(result, error) {
  const box = $("#createResult");
  if (!box) return;
  if (!result && !error) {
    box.className = "create-result";
    box.innerHTML = "";
    return;
  }
  if (error) {
    box.className = "create-result error";
    box.innerHTML = `
      <strong>真实创建失败</strong>
      <span>${escapeHtml(error.message || error)}</span>
    `;
    return;
  }

  const data = result.data || {};
  const detail = result.result || {};
  const resultFile = detail.result_file || "";
  const campaignPayload = detail.campaign && detail.campaign.payload ? detail.campaign.payload : {};
  const unitPayload = detail.unit && detail.unit.payload ? detail.unit.payload : {};
  const advancedCreative = detail.advanced_program_creative || null;
  const createdCreatives = advancedCreative
    ? [advancedCreative]
    : (Array.isArray(detail.creatives) && detail.creatives.length ? detail.creatives : (detail.creative ? [detail.creative] : []));
  const creativePayload = createdCreatives[0] && createdCreatives[0].payload ? createdCreatives[0].payload : {};
  const creativeIds = advancedCreative
    ? (advancedCreative.new_creative_ids || [])
    : createdCreatives.map((item) => item.new_creative_id).filter(Boolean);
  const creativeMode = data.creative_mode || (advancedCreative ? "advanced_program" : "standard");
  const materialCount = data.material_count || (advancedCreative ? advancedCreative.material_count : createdCreatives.length);
  const photoIds = advancedCreative ? (advancedCreative.photo_ids || []) : createdCreatives.map((item) => item.photo_id).filter(Boolean);
  const miniAppData = unitPayload.custom_mini_app_data || {};
  box.className = "create-result success";
  box.innerHTML = `
    <strong>真实创建成功（已暂停）</strong>
    <span>账户：${escapeHtml(data.advertiser_id || "")}</span>
    <span>计划：${escapeHtml(data.new_campaign_id || "")}</span>
    <span>广告组：${escapeHtml(data.new_unit_id || "")}</span>
    <span>创建模式：${creativeMode === "advanced_program" ? "程序化创意包" : "普通创意"}</span>
    <span>${creativeMode === "advanced_program" ? "程序化创意包" : "创意"}：${escapeHtml(creativeIds.join(", ") || data.new_creative_id || data.package_name || "")}</span>
    <span>${creativeMode === "advanced_program" ? "程序化创意包数" : "创意数"}：${escapeHtml(data.creatives_created || creativeIds.length || "")}</span>
    <span>素材数：${escapeHtml(materialCount || "")}</span>
    <span>状态：put_status=${escapeHtml(data.put_status || "")}</span>
    <span>计划名：${escapeHtml(campaignPayload.campaign_name || "")}</span>
    <span>广告组名：${escapeHtml(unitPayload.unit_name || "")}</span>
    <span>创意名：${escapeHtml(creativePayload.creative_name || creativePayload.package_name || data.package_name || "")}${createdCreatives.length > 1 && creativeMode !== "advanced_program" ? " 等" : ""}</span>
    ${photoIds.length ? `<span>素材 photo_id：${escapeHtml(photoIds.join(", "))}</span>` : ""}
    <span>ROI：${escapeHtml(unitPayload.roi_ratio || "")}</span>
    <span>推广目标：${escapeHtml(miniAppData.mini_app_id_platform || "")}</span>
    <span>单元规则：${escapeHtml(campaignPayload.auto_build_name_rule && campaignPayload.auto_build_name_rule.unit_name_rule || "")}</span>
    <span>创意规则：${escapeHtml(campaignPayload.auto_build_name_rule && campaignPayload.auto_build_name_rule.creative_name_rule || "")}</span>
    ${resultFile ? `<span>结果文件：${escapeHtml(resultFile)}</span>` : ""}
  `;
}

function updatePreview(showResult) {
  const selectedAccounts = getSelectedAccounts();
  const rows = buildRows();
  $("#accountCount").textContent = `已选账户(${selectedAccounts.length})`;
  updateMaterialStats();
  renderPreviewRows(rows);

  if (showResult) {
    $("#previewEmpty").style.display = "none";
    $("#previewResult").classList.add("show");
    showToast(`已生成 ${rows.length} 条预览广告`);
  }
}

function pickRealCreateAccount() {
  const selected = getSelectedAccounts();
  const preferred = selected.find((account) => String(account.id) === "39059876");
  if (preferred) return preferred;
  return accounts.find((account) => String(account.id) === "39059876") || selected[0] || accounts[0];
}

async function previewWithBackend() {
  try {
    const body = await apiFetch("/api/preview", {
      method: "POST",
      body: JSON.stringify(buildPayload())
    });
    const rows = normalizeBackendRows(body.data || []);
    renderPreviewRows(rows);
    $("#previewEmpty").style.display = "none";
    $("#previewResult").classList.add("show");
    showToast(`后端预览成功：${rows.length} 条广告`);
  } catch (error) {
    updatePreview(true);
    showToast(`后端不可用，已使用本地预览：${error.message}`);
  }
}

async function realCreateTestFromPage() {
  const account = pickRealCreateAccount();
  if (!account || !account.id) {
    showToast("请先选择一个媒体账号");
    renderCreateResult(null, new Error("请先选择一个媒体账号"));
    return;
  }
  const assignedLocalAssets = getEffectiveAssets();
  const firstGroupIndex = assignedLocalAssets.length ? assignedLocalAssets[0].groupIndex : 0;
  const currentGroupAssets = assignedLocalAssets.filter((asset) => asset.groupIndex === firstGroupIndex);
  const assignedSourceAssets = currentGroupAssets.map((asset) => assets.find((item) => item.id === asset.id) || asset);
  const missingPhotoIds = assignedSourceAssets.filter((asset) => !asset.photo_id && !asset.photoId);
  if (currentGroupAssets.length && missingPhotoIds.length) {
    const message = "你选的是本地文件夹素材，但还没有上传到快手素材库拿到 photo_id；为避免创建成源计划素材，本次已拦截。";
    showToast("本地素材还未上传到快手，不能真实创建");
    renderCreateResult(null, new Error(message));
    return;
  }
  const uploadedAssetInputs = assignedSourceAssets
    .map((asset, index) => ({
      asset,
      localAsset: currentGroupAssets[index] || asset,
      photoId: asset.photo_id || asset.photoId
    }))
    .filter((item) => item.photoId);
  const uploadedAsset = uploadedAssetInputs[0] && uploadedAssetInputs[0].asset;
  const firstAssignedAsset = currentGroupAssets[0] || {};
  const configuredNames = buildConfiguredNames(account, firstAssignedAsset, 1);
  const copies = getCopies();
  const firstCopy = copies[0] || "";
  if (!promotionTargetConfig.appId) {
    const message = "请先在广告组基本信息里填写推广目标 APPID";
    showToast(message);
    renderCreateResult(null, new Error(message));
    return;
  }

  const button = $("#realCreateBtn");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = uploadedAssetInputs.length ? "上传素材创建中..." : "源计划测试中...";
  renderCreateResult(null, null);
  $("#previewEmpty").style.display = "none";
  $("#previewResult").classList.add("show");

  try {
    const body = await apiFetch("/api/kuaishou/campaign/test-create-flow", {
      method: "POST",
      body: JSON.stringify({
        advertiser_id: Number(account.id),
        source_campaign_id: 9295250964,
        campaign_name: configuredNames.campaignName,
        unit_name: configuredNames.unitName,
        creative_name: configuredNames.creativeName,
        group_rule: $("#groupRule").value,
        creative_rule: $("#creativeRule").value,
        roi_ratio: $("#roi").value,
        promotion_target_type: promotionTargetConfig.type,
        mini_app_id_platform: promotionTargetConfig.appId,
        mini_app_type: promotionMiniAppType(promotionTargetConfig.type),
        start_date: $("#startDate").value || new Date().toISOString().slice(0, 10),
        photo_id: uploadedAssetInputs[0] ? uploadedAssetInputs[0].photoId : undefined,
        photo_ids: uploadedAssetInputs.map((item) => item.photoId),
        creative_assets: uploadedAssetInputs.map((item, index) => ({
          photo_id: item.photoId,
          creative_name: buildConfiguredNames(account, item.localAsset, index + 1).creativeName,
          asset_name: item.localAsset.name || item.asset.name || "",
          width: item.localAsset.width || item.asset.width,
          height: item.localAsset.height || item.asset.height,
          creative_material_type: item.localAsset.creative_material_type || item.asset.creative_material_type
        })),
        advanced_program: uploadedAssetInputs.length > 1,
        action_bar: $("#cta").value,
        description: firstCopy || $("#reason").value,
        put_status: 2,
        max_units: 1,
        max_creative_attempts: 60,
        save_files: true
      })
    });
    renderCreateResult(body, null);
    showToast(`${uploadedAsset ? "上传素材创建" : "源计划测试"}成功：计划 ${body.data.new_campaign_id}`);
  } catch (error) {
    renderCreateResult(null, error);
    showToast(`创建失败：${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function openEditor(page) {
  const normalized = page || "basic";
  const titles = {
    basic: ["广告组基本信息", "选择广告类型、投放位置、预算排期、优化目标和命名规则"],
    targeting: ["定向包", "选择定向包、人群包、区域、年龄、性别、平台和网络环境"],
    creativeInfo: ["创意基本信息", "配置原生广告、授权快手号、行动号召、推荐理由和创意分类"],
    material: ["创意素材", "选择素材选取方式、多账户分配规则，并维护自定义数量的创意组"],
    copy: ["文案", "筛选文案库、配置分配规则，并管理已选文案"]
  };
  currentEditorPage = normalized;
  $("#editorGroupRule").value = $("#groupRule").value;
  const editorGroupNameRule = $("#editorGroupNameRule");
  if (editorGroupNameRule) editorGroupNameRule.value = $("#groupRule").value;
  $("#editorBudget").value = $("#budget").value;
  $("#editorRoi").value = $("#roi").value;
  $("#editorCopyText").value = $("#copyText").value;
  fillTargetingEditor();
  fillPromotionTargetEditor();
  $("#editorTitle").textContent = titles[normalized] ? titles[normalized][0] : "编辑";
  $("#editorDesc").textContent = titles[normalized] ? titles[normalized][1] : "按参考页配置当前模块";
  $("#editorShell").classList.add("open");
  $("#editorShell").setAttribute("aria-hidden", "false");
  renderCreativeGroups();
  renderCopyLibrary();
  setEditorPage(normalized);
}

function closeEditor() {
  $("#editorShell").classList.remove("open");
  $("#editorShell").setAttribute("aria-hidden", "true");
}

function setEditorPage(page) {
  currentEditorPage = page;
  $$("[data-editor-tab]").forEach((button) => button.classList.toggle("active", button.dataset.editorTab === page));
  $$("[data-editor-page]").forEach((panel) => panel.classList.toggle("active", panel.dataset.editorPage === page));
  if (page === "targeting") renderTargetingPreview();
}

function syncEditorNameRule(sourceId) {
  const source = document.getElementById(sourceId);
  if (!source) return;
  ["editorGroupRule", "editorGroupNameRule"].forEach((id) => {
    if (id !== sourceId && document.getElementById(id)) document.getElementById(id).value = source.value;
  });
}

function saveEditor() {
  if (currentEditorPage === "basic") {
    const nameRule = ($("#editorGroupNameRule") && $("#editorGroupNameRule").value) || $("#editorGroupRule").value;
    $("#editorGroupRule").value = nameRule;
    $("#groupRule").value = nameRule;
    $("#budget").value = $("#editorBudget").value;
    $("#roi").value = $("#editorRoi").value;
    promotionTargetConfig = readPromotionTargetEditor();
    renderPromotionTargetSummary();
  } else if (currentEditorPage === "targeting") {
    targetingConfig = readTargetingEditor();
    renderTargetingSummary();
  } else if (currentEditorPage === "copy") {
    $("#copyText").value = $("#editorCopyText").value;
  }
  updatePreview(false);
  closeEditor();
  showToast("编辑内容已保存");
}

function selectCloudValue(containerSelector, button, inputSelector) {
  $$(`${containerSelector} button`).forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  document.querySelector(inputSelector).value = button.textContent.trim();
  updatePreview(false);
}

function addLibraryCopy() {
  const textarea = $("#editorCopyText");
  textarea.value = `${textarea.value.trim()}\n不用氪不用肝，单手爬塔轻松通关`.trim();
  showToast("已添加文案");
}

function shuffleCopy() {
  const copies = getCopies();
  for (let i = copies.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copies[i], copies[j]] = [copies[j], copies[i]];
  }
  $("#copyText").value = copies.join("\n");
  updatePreview(false);
  showToast("文案已乱序");
}

async function saveStrategy() {
  const payload = buildPayload();
  localStorage.setItem("kuaishouExactStrategy", JSON.stringify(payload));
  try {
    await apiFetch("/api/strategy/save", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    showToast("保存策略组成功");
  } catch (error) {
    showToast(`已本地保存，后端保存失败：${error.message}`);
  }
}

async function submitWithBackend() {
  try {
    const body = await apiFetch("/api/campaigns/create", {
      method: "POST",
      body: JSON.stringify(buildPayload())
    });
    exportCsv(normalizeBackendRows(body.data || []));
    showToast(`${body.mode === "dry_run" ? "Dry-run" : "提交"}成功：${body.count} 条`);
  } catch (error) {
    exportCsv(buildRows());
    showToast(`后端提交失败，已导出本地明细：${error.message}`);
  }
}

function exportCsv(inputRows) {
  const rows = inputRows || buildRows();
  if (!rows.length) {
    showToast("暂无可提交广告");
    return;
  }

  const headers = ["序号", "账户", "营销目标", "广告组名称", "创意名称", "创意组", "素材", "素材文件", "素材路径", "文案", "行动号召", "推荐理由", "预算", "ROI系数"];
  const body = rows.map((row) => [
    row.index,
    row.account,
    row.goal,
    row.groupName,
    row.creativeName,
    row.assetGroup,
    row.asset,
    row.assetFileName,
    row.assetPath,
    row.copy,
    row.cta,
    row.reason,
    row.budget,
    row.roi
  ]);
  const csv = [headers, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `快手程序化创建_${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("提交审核成功，已导出明细");
}

function csvCell(value) {
  return `"${replaceAllText(String(value == null ? "" : value), '"', '""')}"`;
}

function escapeHtml(value) {
  return String(value)
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

init();

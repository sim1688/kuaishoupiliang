const API_BASE = "http://127.0.0.1:4189";

const accounts = [
  { id: "112939731", name: "游霄-开荒之旅-w", remark: "游霄A", checked: true },
  { id: "112939730", name: "游霄-开荒之旅-w", remark: "游霄B", checked: true },
  { id: "112939732", name: "游霄-开荒之旅-w", remark: "游霄C", checked: true },
  { id: "110998691", name: "无敌作战-LZZ", remark: "无敌作战", checked: false },
  { id: "110964231", name: "吞食山海-LZZ", remark: "吞食山海", checked: false },
  { id: "82540931", name: "暴走大作战", remark: "暴走大作战", checked: false }
];

let assets = [
  { id: crypto.randomUUID(), name: "冲关热视频A", size: "1080x1920" },
  { id: crypto.randomUUID(), name: "双人对战素材B", size: "720x1280" },
  { id: crypto.randomUUID(), name: "经营挑战素材C", size: "1280x720" },
  { id: crypto.randomUUID(), name: "新素材组4", size: "1080x1920" },
  { id: crypto.randomUUID(), name: "竖版测新素材5", size: "900x1600" },
  { id: crypto.randomUUID(), name: "横版激励视频6", size: "1280x720" },
  { id: crypto.randomUUID(), name: "信息流素材7", size: "1440x2560" },
  { id: crypto.randomUUID(), name: "闯关挑战8", size: "1080x1920" },
  { id: crypto.randomUUID(), name: "高光片段9", size: "720x1280" },
  { id: crypto.randomUUID(), name: "小游戏素材10", size: "1080x1920" },
  { id: crypto.randomUUID(), name: "试玩素材11", size: "1280x720" },
  { id: crypto.randomUUID(), name: "跑酷素材12", size: "1080x1920" },
  { id: crypto.randomUUID(), name: "套圈素材13", size: "720x1280" },
  { id: crypto.randomUUID(), name: "双列素材14", size: "1600x900" },
  { id: crypto.randomUUID(), name: "激励素材15", size: "1080x1920" },
  { id: crypto.randomUUID(), name: "开荒素材16", size: "1080x1920" }
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function init() {
  $("#startDate").value = new Date().toISOString().slice(0, 10);
  renderAccounts();
  renderAssets();
  bindEvents();
  updatePreview(false);
}

function bindEvents() {
  ["strategyName", "productName", "groupRule", "creativeRule", "budget", "startDate", "roi", "cta", "reason", "copyText"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => updatePreview(false));
    document.getElementById(id).addEventListener("change", () => updatePreview(false));
  });

  $$('input[name="goal"]').forEach((radio) => radio.addEventListener("change", () => updatePreview(false)));
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
  $("#editorBatchAdd").addEventListener("click", () => {
    addAsset();
    renderCreativeGroups();
    showToast("已批量添加视频素材");
  });
  $("#editorAddCopy").addEventListener("click", addLibraryCopy);
  $("#autoGroupBtn").addEventListener("click", autoGroupAssets);
  $("#shuffleBtn").addEventListener("click", shuffleCopy);
  $("#previewBtn").addEventListener("click", previewWithBackend);
  $("#saveBtn").addEventListener("click", saveStrategy);
  $("#exportBtn").addEventListener("click", submitWithBackend);
  $$("#ctaCloud button").forEach((button) => button.addEventListener("click", () => selectCloudValue("#ctaCloud", button, "#cta")));
  $$("#reasonCloud button").forEach((button) => button.addEventListener("click", () => selectCloudValue("#reasonCloud", button, "#reason")));
}

function renderAccounts() {
  $("#accountList").innerHTML = accounts
    .map(
      (account, index) => `
        <label class="account-line">
          <input type="checkbox" data-account="${index}" ${account.checked ? "checked" : ""} />
          <span>${account.id}　${account.name}(${account.remark})</span>
        </label>
      `
    )
    .join("");

  $$("[data-account]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      accounts[Number(checkbox.dataset.account)].checked = checkbox.checked;
      updatePreview(false);
    });
  });
}

function renderAssets() {
  $("#assetBoard").innerHTML = assets
    .map(
      (asset) => `
        <span class="asset-tag">
          <input value="${escapeHtml(asset.name)}" data-asset-name="${asset.id}" aria-label="素材名称" />
          <small>${asset.size}</small>
          <button class="asset-remove" data-remove-asset="${asset.id}" type="button">×</button>
        </span>
      `
    )
    .join("");

  $$("[data-asset-name]").forEach((input) => {
    input.addEventListener("input", () => {
      const asset = assets.find((item) => item.id === input.dataset.assetName);
      asset.name = input.value.trim() || "未命名素材";
      updatePreview(false);
    });
  });

  $$("[data-remove-asset]").forEach((button) => {
    button.addEventListener("click", () => {
      assets = assets.filter((asset) => asset.id !== button.dataset.removeAsset);
      renderAssets();
      updatePreview(false);
    });
  });

  $("#assetCount").textContent = `已选：${assets.length}组`;
  renderCreativeGroups();
}

function addAsset() {
  assets.push({ id: crypto.randomUUID(), name: `新增素材${assets.length + 1}`, size: "1080x1920" });
  renderAssets();
  updatePreview(false);
}

function autoGroupAssets() {
  assets = Array.from({ length: 16 }, (_, index) => ({
    id: crypto.randomUUID(),
    name: `近期新素材${String(index + 1).padStart(2, "0")}`,
    size: index % 3 === 0 ? "1280x720" : "1080x1920"
  }));
  renderAssets();
  updatePreview(false);
  showToast("一键测新素材已自动分组");
}

function renderCreativeGroups() {
  const groupNames = [
    "鹃含-100熊猫修仙类-1111-86",
    "鹃含-熊猫修仙类-1104-20",
    "丽芳-100熊猫修仙-0318-沙雕修仙回来了",
    "鹃含-100熊猫修仙类-1118-88",
    "0319-100熊猫修仙-沙雕修仙回来了",
    "鹃含-熊猫修仙类-1101-148"
  ];
  $("#creativeGroups").innerHTML = Array.from({ length: 16 }, (_, index) => {
    const items = Array.from({ length: 6 }, (_, itemIndex) => {
      const source = assets[(index + itemIndex) % Math.max(assets.length, 1)]?.name || groupNames[itemIndex % groupNames.length];
      return `<div class="creative-item"><b>创意${itemIndex + 1}</b><span>${escapeHtml(source)}</span></div>`;
    }).join("");
    return `
      <article class="creative-group-card">
        <div class="creative-group-head">
          <strong>创意组${String(index + 1).padStart(2, "0")}</strong>
          <span>视频(15/15)　复制创意组</span>
        </div>
        <div class="creative-list">${items}</div>
      </article>
    `;
  }).join("");
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
  const today = ($("#startDate").value || new Date().toISOString().slice(0, 10)).replaceAll("-", "");
  const groupRule = $("#groupRule").value || "开荒之旅_[日期][序号]";
  const creativeRule = $("#creativeRule").value || "<账户备注><素材名>";
  const rows = [];

  selectedAccounts.forEach((account) => {
    assets.forEach((asset) => {
      const sequence = String(rows.length + 1).padStart(3, "0");
      rows.push({
        index: rows.length + 1,
        account: `${account.name}(${account.id})`,
        groupName: groupRule.replace("[日期]", today).replace("[序号]", sequence),
        creativeName: creativeRule.replace("<账户备注>", account.remark).replace("<素材名>", asset.name),
        asset: asset.name,
        copy: copies[rows.length % Math.max(copies.length, 1)] || "",
        cta: $("#cta").value,
        reason: $("#reason").value,
        budget: $("#budget").value,
        roi: $("#roi").value,
        goal: $('input[name="goal"]:checked')?.value || "推广小程序"
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
    goal: $('input[name="goal"]:checked')?.value || "推广小程序",
    accounts: getSelectedAccounts(),
    assets,
    copies: getCopies()
  };
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function normalizeBackendRows(rows) {
  return rows.map((row) => ({
    index: row.index,
    account: row.account || `${row.accountName || ""}(${row.accountId || ""})`,
    groupName: row.groupName || row.adGroupName,
    creativeName: row.creativeName,
    asset: row.asset || row.assetName,
    copy: row.copy,
    cta: $("#cta").value,
    reason: $("#reason").value,
    budget: $("#budget").value,
    roi: $("#roi").value,
    goal: $('input[name="goal"]:checked')?.value || "推广小程序"
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
          <td>${escapeHtml(row.asset)}</td>
        </tr>
      `
    )
    .join("");
}

function updatePreview(showResult) {
  const selectedAccounts = getSelectedAccounts();
  const rows = buildRows();
  $("#accountCount").textContent = `已选账户(${selectedAccounts.length})`;
  $("#taskCount").textContent = assets.length;
  $("#assetCount").textContent = `已选：${assets.length}组`;
  $("#totalAds").textContent = assets.length;
  renderPreviewRows(rows);

  if (showResult) {
    $("#previewEmpty").style.display = "none";
    $("#previewResult").classList.add("show");
    showToast(`已生成 ${rows.length} 条预览广告`);
  }
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

function openEditor(page) {
  const normalized = page === "targeting" ? "basic" : page;
  const titles = {
    basic: ["广告组基本信息", "选择广告类型、投放位置、预算排期、优化目标和命名规则"],
    creativeInfo: ["创意基本信息", "配置原生广告、授权快手号、行动号召、推荐理由和创意分类"],
    material: ["创意素材", "选择素材选取方式、多账户分配规则，并维护 16 个创意组"],
    copy: ["文案", "筛选文案库、配置分配规则，并管理已选文案"]
  };
  $("#editorGroupRule").value = $("#groupRule").value;
  $("#editorBudget").value = $("#budget").value;
  $("#editorRoi").value = $("#roi").value;
  $("#editorCopyText").value = $("#copyText").value;
  $("#editorTitle").textContent = titles[normalized]?.[0] || "编辑";
  $("#editorDesc").textContent = titles[normalized]?.[1] || "按参考页配置当前模块";
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
  $$("[data-editor-tab]").forEach((button) => button.classList.toggle("active", button.dataset.editorTab === page));
  $$("[data-editor-page]").forEach((panel) => panel.classList.toggle("active", panel.dataset.editorPage === page));
}

function saveEditor() {
  $("#groupRule").value = $("#editorGroupRule").value;
  $("#budget").value = $("#editorBudget").value;
  $("#roi").value = $("#editorRoi").value;
  $("#copyText").value = $("#editorCopyText").value;
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

  const headers = ["序号", "账户", "营销目标", "广告组名称", "创意名称", "素材", "文案", "行动号召", "推荐理由", "预算", "ROI系数"];
  const body = rows.map((row) => [
    row.index,
    row.account,
    row.goal,
    row.groupName,
    row.creativeName,
    row.asset,
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
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

init();

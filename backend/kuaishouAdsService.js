const fs = require("fs");
const path = require("path");
const { kuaishouRequest } = require("./kuaishouClient");

const dataDir = path.join(__dirname, "..", "data");

const unitCreateKeys = [
  "put_status",
  "bid_type",
  "ocpx_action_type",
  "roi_ratio",
  "scene_id",
  "unit_type",
  "begin_time",
  "schedule_time",
  "day_budget",
  "schema_uri",
  "show_mode",
  "smart_cover",
  "asset_mining",
  "extend_search",
  "custom_mini_app_data",
  "target",
  "outer_loop_native",
  "quick_search",
  "target_explore",
  "unit_material_type"
];

const creativeCreateKeys = [
  "photo_id",
  "creative_material_type",
  "action_bar_text",
  "description",
  "new_expose_tag",
  "outer_loop_native",
  "kol_user_type",
  "kol_user_id",
  "recommendation"
];

const advancedProgramMaxPhotos = 5;

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function pickDefined(source, keys) {
  const target = {};
  keys.forEach((key) => {
    if (source && source[key] !== undefined && source[key] !== null) {
      target[key] = cloneJson(source[key]);
    }
  });
  return target;
}

function snakeCase(value) {
  return String(value).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function normalizeKeys(value) {
  if (Array.isArray(value)) return value.map(normalizeKeys);
  if (!value || typeof value !== "object") return value;
  const next = {};
  Object.keys(value).forEach((key) => {
    next[snakeCase(key)] = normalizeKeys(value[key]);
  });
  return next;
}

function compactObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const next = {};
  Object.keys(value).forEach((key) => {
    const item = value[key];
    if (item === undefined || item === null) return;
    if (Array.isArray(item) && item.length === 0) return;
    if (typeof item === "object" && !Array.isArray(item)) {
      const child = compactObject(item);
      if (Object.keys(child).length === 0) return;
      next[key] = child;
      return;
    }
    next[key] = item;
  });
  return next;
}

function firstDefined() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = arguments[index];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function optionalBoolean(value) {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();
  if (!maxLength || text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function normalizeStringList(value) {
  const list = Array.isArray(value) ? value : [value];
  const seen = {};
  return list
    .map((item) => String(item === undefined || item === null ? "" : item).trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen[item]) return false;
      seen[item] = true;
      return true;
    });
}

function concatMap(list, mapper) {
  return (Array.isArray(list) ? list : []).reduce((items, item, index) => {
    const next = mapper(item, index);
    if (Array.isArray(next)) return items.concat(next);
    if (next !== undefined && next !== null) items.push(next);
    return items;
  }, []);
}

function normalizePhotoIdItems(options) {
  const items = [];
  const creativeAssets = Array.isArray(options.creativeAssets || options.creative_assets)
    ? options.creativeAssets || options.creative_assets
    : [];
  creativeAssets.forEach((asset) => {
    if (!asset) return;
    const photoId = firstDefined(asset.photo_id, asset.photoId);
    if (!photoId) return;
    items.push({
      photoId: String(photoId),
      creativeName: firstDefined(asset.creative_name, asset.creativeName),
      assetName: firstDefined(asset.asset_name, asset.assetName, asset.name),
      creativeMaterialType: optionalNumber(firstDefined(
        asset.creative_material_type,
        asset.creativeMaterialType,
        asset.material_type,
        asset.materialType
      )),
      width: optionalNumber(firstDefined(asset.width, asset.video_width, asset.videoWidth)),
      height: optionalNumber(firstDefined(asset.height, asset.video_height, asset.videoHeight))
    });
  });
  const photoIds = Array.isArray(options.photoIds || options.photo_ids) ? options.photoIds || options.photo_ids : [];
  photoIds.forEach((photoId) => {
    if (photoId === undefined || photoId === null || photoId === "") return;
    if (items.some((item) => item.photoId === String(photoId))) return;
    items.push({ photoId: String(photoId) });
  });
  const singlePhotoId = firstDefined(options.photoId, options.photo_id);
  if (singlePhotoId && !items.some((item) => item.photoId === String(singlePhotoId))) {
    items.push({ photoId: String(singlePhotoId) });
  }
  return items;
}

function normalizeCreativeGroups(options) {
  const rawGroups = Array.isArray(options.creativeGroups || options.creative_groups)
    ? options.creativeGroups || options.creative_groups
    : [];
  const groups = rawGroups
    .map((group, index) => {
      const groupOptions = Object.assign({}, options, group || {}, {
        creativeAssets: firstDefined(group && group.creative_assets, group && group.creativeAssets),
        photoIds: firstDefined(group && group.photo_ids, group && group.photoIds),
        photoId: firstDefined(group && group.photo_id, group && group.photoId),
        unitName: firstDefined(group && group.unit_name, group && group.unitName, options.unitName),
        creativeName: firstDefined(group && group.creative_name, group && group.creativeName, group && group.package_name, group && group.packageName, options.creativeName),
        packageName: firstDefined(group && group.package_name, group && group.packageName, group && group.creative_name, group && group.creativeName, options.packageName, options.creativeName)
      });
      const targets = normalizePhotoIdItems(groupOptions);
      if (!targets.length) return null;
      return {
        index: Number(firstDefined(group && group.index, index + 1)),
        unitName: firstDefined(group && group.unit_name, group && group.unitName, options.unitName),
        creativeName: firstDefined(group && group.creative_name, group && group.creativeName, options.creativeName),
        packageName: firstDefined(group && group.package_name, group && group.packageName, group && group.creative_name, group && group.creativeName, options.packageName, options.creativeName),
        targets
      };
    })
    .filter(Boolean);
  if (groups.length) return groups;
  const targets = normalizePhotoIdItems(options);
  return targets.length ? [{
    index: 1,
    unitName: options.unitName,
    creativeName: options.creativeName,
    packageName: options.packageName || options.creativeName,
    targets
  }] : [];
}

function suffixName(name, suffix) {
  const base = String(name || "未命名");
  const next = `${base}${suffix || ""}`;
  return next.length > 100 ? next.slice(0, 100) : next;
}

function indexedName(name, index) {
  if (!name) return undefined;
  return suffixName(name, index > 0 ? `_${index + 1}` : "");
}

function uniqueNameForGroup(name, usedNames, fallbackIndex) {
  const base = suffixName(name || `创意${fallbackIndex + 1}`, "");
  let next = base;
  let suffixIndex = 2;
  while (usedNames[next]) {
    next = suffixName(base, `_创意${suffixIndex}`);
    suffixIndex += 1;
  }
  usedNames[next] = true;
  return next;
}

function ensureAutoBuildRule(rule) {
  let value = String(rule || "").trim();
  if (!value) value = "系统自动搭建";
  if (value.indexOf("[日期]") === -1) value = `${value}_[日期]`;
  if (value.indexOf("[序号]") === -1) value = `${value}[序号]`;
  return suffixName(value, "");
}

function normalizeMiniAppId(value) {
  const next = String(value || "").trim();
  return next || undefined;
}

function replaceSchemaAppId(schemaUri, appId) {
  if (!schemaUri || !appId) return schemaUri;
  const value = String(schemaUri);
  const encoded = encodeURIComponent(appId);
  if (/[?&]appId=/.test(value)) {
    return value.replace(/([?&]appId=)[^&]*/, `$1${encoded}`);
  }
  const hashIndex = value.indexOf("#");
  const base = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : value.slice(hashIndex);
  const separator = base.indexOf("?") === -1 ? "?" : "&";
  return `${base}${separator}appId=${encoded}${hash}`;
}

function yyyymmdd(date) {
  if (date) return String(date).replace(/-/g, "");
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getResultId(result, key) {
  return result && result.data && result.data[key] ? result.data[key] : null;
}

function assertSuccess(result, action) {
  if (!result || result.code === undefined || result.code === 0) return;
  const error = new Error(result.message || `${action || "Kuaishou request"} failed`);
  error.status = 502;
  error.body = result;
  throw error;
}

function isNonRetryableAdvancedProgramError(error) {
  const body = error && error.body;
  const message = String((body && body.message) || error.message || "");
  return message.includes("不支持通过openapi") || message.includes("不支持通过OpenAPI") || message.includes("权限");
}

async function listAll(pathname, body, detailKey) {
  const pageSize = body.page_size || 100;
  let page = body.page || 1;
  let total = null;
  const details = [];
  do {
    const pageBody = Object.assign({}, body, { page, page_size: pageSize });
    const result = await kuaishouRequest(pathname, { method: "POST", body: pageBody });
    assertSuccess(result, pathname);
    const data = result.data || {};
    const pageDetails = Array.isArray(data[detailKey || "details"]) ? data[detailKey || "details"] : [];
    details.push.apply(details, pageDetails);
    total = Number(data.total_count || data.total || pageDetails.length || 0);
    if (!pageDetails.length) break;
    page += 1;
  } while (details.length < total);

  return {
    total_count: total === null ? details.length : total,
    details
  };
}

async function getCampaignSnapshot(advertiserId, campaignId) {
  const advertiser_id = Number(advertiserId);
  const campaign_id = Number(campaignId);
  if (!advertiser_id || !campaign_id) {
    const error = new Error("advertiser_id and campaign_id are required");
    error.status = 400;
    throw error;
  }

  const campaignList = await listAll("/rest/openapi/gw/dsp/campaign/list", {
    advertiser_id,
    campaign_ids: [campaign_id],
    page: 1,
    page_size: 100
  });
  const campaign = campaignList.details[0];
  if (!campaign) {
    const error = new Error(`Campaign ${campaign_id} not found`);
    error.status = 404;
    throw error;
  }

  const units = await listAll("/rest/openapi/gw/dsp/unit/list", {
    advertiser_id,
    campaign_id,
    page: 1,
    page_size: 100
  });
  const creatives = await listAll("/rest/openapi/gw/dsp/creative/list", {
    advertiser_id,
    campaign_id,
    page: 1,
    page_size: 100
  });

  return {
    advertiser_id,
    campaign_id,
    captured_at: new Date().toISOString(),
    campaign,
    units,
    creatives,
    advanced_creatives: { total_count: 0, details: [] }
  };
}

async function listCampaigns(body) {
  const result = await kuaishouRequest("/rest/openapi/gw/dsp/campaign/list", {
    method: "POST",
    body
  });
  assertSuccess(result, "list campaigns");
  return result;
}

async function listUnits(body) {
  const result = await kuaishouRequest("/rest/openapi/gw/dsp/unit/list", {
    method: "POST",
    body
  });
  assertSuccess(result, "list units");
  return result;
}

async function listCreatives(body) {
  const result = await kuaishouRequest("/rest/openapi/gw/dsp/creative/list", {
    method: "POST",
    body
  });
  assertSuccess(result, "list creatives");
  return result;
}

function buildCampaignPayload(snapshot, options) {
  const campaign = snapshot.campaign || {};
  const suffix = options.nameSuffix || `_copy_${yyyymmdd(options.startDate)}`;
  const autoBuildNameRule = normalizeKeys(campaign.auto_build_name_rule) || {};
  if (options.unitNameRule) autoBuildNameRule.unit_name_rule = ensureAutoBuildRule(options.unitNameRule);
  if (options.creativeNameRule) autoBuildNameRule.creative_name_rule = ensureAutoBuildRule(options.creativeNameRule);
  return compactObject({
    advertiser_id: Number(options.advertiserId || snapshot.advertiser_id),
    campaign_name: options.campaignName || suffixName(campaign.campaign_name, suffix),
    type: campaign.campaign_type || campaign.type,
    day_budget: campaign.day_budget,
    ad_type: campaign.ad_type,
    bid_type: campaign.bid_type,
    auto_adjust: campaign.auto_adjust,
    auto_build: campaign.auto_build,
    auto_build_name_rule: autoBuildNameRule,
    cap_roi_ratio: campaign.cap_roi_ratio,
    cap_bid: campaign.cap_bid,
    constrait_cpa: campaign.constrait_cpa !== undefined ? campaign.constrait_cpa : campaign.constraint_cpa,
    auto_manage: campaign.auto_manage
  });
}

function buildUnitPayload(sourceUnit, options) {
  const suffix = options.nameSuffix || `_copy_${yyyymmdd(options.startDate)}`;
  const source = pickDefined(sourceUnit, unitCreateKeys);
  source.custom_mini_app_data = normalizeKeys(source.custom_mini_app_data);
  source.target = normalizeKeys(source.target);
  source.advertiser_id = Number(options.advertiserId);
  source.campaign_id = Number(options.campaignId || 0);
  source.unit_name = options.unitName || suffixName(sourceUnit.unit_name, suffix);
  source.put_status = Number(options.putStatus || 2);
  const roiRatio = optionalNumber(options.roiRatio);
  if (roiRatio !== undefined) source.roi_ratio = roiRatio;
  const dayBudget = optionalNumber(options.dayBudget);
  if (dayBudget !== undefined) source.day_budget = dayBudget;
  if (options.startDate) source.begin_time = options.startDate;
  const miniAppIdPlatform = normalizeMiniAppId(firstDefined(options.miniAppIdPlatform, options.mini_app_id_platform));
  if (miniAppIdPlatform) {
    source.custom_mini_app_data = source.custom_mini_app_data || {};
    source.custom_mini_app_data.mini_app_id_platform = miniAppIdPlatform;
    source.custom_mini_app_data.mini_app_type = optionalNumber(firstDefined(options.miniAppType, options.mini_app_type)) || 2;
    source.schema_uri = replaceSchemaAppId(source.schema_uri, miniAppIdPlatform);
  }
  return compactObject(source);
}

function buildCreativePayload(sourceCreative, options) {
  const suffix = options.nameSuffix || `_copy_${yyyymmdd(options.startDate)}`;
  const source = pickDefined(sourceCreative, creativeCreateKeys);
  source.advertiser_id = Number(options.advertiserId);
  source.unit_id = Number(options.unitId || 0);
  source.creative_name = options.creativeName || suffixName(sourceCreative.creative_name, suffix);

  if (!source.action_bar_text && sourceCreative.display_info) {
    source.action_bar_text = sourceCreative.display_info.action_bar_text;
  }
  if (!source.description && sourceCreative.display_info) {
    source.description = sourceCreative.display_info.description;
  }

  if (options.includeImageToken && sourceCreative.image_token) {
    source.image_token = sourceCreative.image_token;
  }

  return compactObject(source);
}

function buildClonePlan(snapshot, options) {
  const units = snapshot.units && Array.isArray(snapshot.units.details) ? snapshot.units.details : [];
  const creatives = snapshot.creatives && Array.isArray(snapshot.creatives.details) ? snapshot.creatives.details : [];
  const advertiserId = Number(options.advertiserId || snapshot.advertiser_id);
  const nameSuffix = options.nameSuffix || `_copy_${yyyymmdd(options.startDate)}`;
  const putStatus = Number(options.putStatus || 2);
  const campaignPayload = buildCampaignPayload(snapshot, {
    advertiserId,
    nameSuffix,
    startDate: options.startDate,
    campaignName: options.campaignName,
    unitNameRule: options.unitNameRule || options.groupRule,
    creativeNameRule: options.creativeNameRule || options.creativeRule
  });
  const unitPlans = units.map((unit, index) => ({
    source_unit_id: unit.unit_id,
    source_unit_name: unit.unit_name,
    payload: buildUnitPayload(unit, {
      advertiserId,
      campaignId: 0,
      nameSuffix,
      putStatus,
      startDate: options.startDate,
      unitName: indexedName(options.unitName, index),
      roiRatio: options.roiRatio,
      dayBudget: options.dayBudget,
      miniAppIdPlatform: firstDefined(options.miniAppIdPlatform, options.mini_app_id_platform),
      miniAppType: firstDefined(options.miniAppType, options.mini_app_type)
    })
  }));
  const creativePlans = creatives.map((creative, index) => ({
    source_creative_id: creative.creative_id,
    source_unit_id: creative.unit_id,
    source_creative_name: creative.creative_name,
    payload: buildCreativePayload(creative, {
      advertiserId,
      unitId: 0,
      nameSuffix,
      includeImageToken: Boolean(options.includeImageToken),
      startDate: options.startDate,
      creativeName: indexedName(options.creativeName, index)
    })
  }));

  return {
    source: {
      advertiser_id: snapshot.advertiser_id,
      campaign_id: snapshot.campaign_id,
      campaign_name: snapshot.campaign && snapshot.campaign.campaign_name
    },
    campaign: campaignPayload,
    units: unitPlans,
    creatives: creativePlans
  };
}

async function createCampaign(payload) {
  const result = await kuaishouRequest("/rest/openapi/gw/dsp/campaign/create", {
    method: "POST",
    body: payload
  });
  assertSuccess(result, "create campaign");
  return {
    result,
    campaign_id: getResultId(result, "campaign_id")
  };
}

async function createUnit(payload) {
  const result = await kuaishouRequest("/rest/openapi/gw/dsp/unit/create", {
    method: "POST",
    body: payload
  });
  assertSuccess(result, "create unit");
  return {
    result,
    unit_id: getResultId(result, "unit_id")
  };
}

async function createCreative(payload) {
  const result = await kuaishouRequest("/rest/openapi/gw/dsp/creative/create", {
    method: "POST",
    body: payload
  });
  assertSuccess(result, "create creative");
  return {
    result,
    creative_id: getResultId(result, "creative_id")
  };
}

async function createAdvancedProgramCreative(payload) {
  const result = await kuaishouRequest("/rest/openapi/v2/creative/advanced/program/create", {
    method: "POST",
    body: payload
  });
  assertSuccess(result, "create advanced program creative");
  return {
    result,
    details: result && result.data && Array.isArray(result.data.details) ? result.data.details : [],
    creative_id: getResultId(result, "creative_id")
  };
}

async function updateCampaignStatus(advertiserId, campaignIds, putStatus) {
  const ids = Array.isArray(campaignIds) ? campaignIds : [campaignIds];
  const result = await kuaishouRequest("/rest/openapi/v1/campaign/update/status", {
    method: "POST",
    body: {
      advertiser_id: Number(advertiserId),
      campaign_ids: ids.map(Number),
      put_status: Number(putStatus)
    }
  });
  assertSuccess(result, "update campaign status");
  return result;
}

async function updateUnitStatus(advertiserId, unitIds, putStatus) {
  const ids = Array.isArray(unitIds) ? unitIds : [unitIds];
  const result = await kuaishouRequest("/rest/openapi/v1/ad_unit/update/status", {
    method: "POST",
    body: {
      advertiser_id: Number(advertiserId),
      unit_ids: ids.map(Number),
      put_status: Number(putStatus)
    }
  });
  assertSuccess(result, "update unit status");
  return result;
}

async function updateCreativeStatus(advertiserId, creativeIds, putStatus) {
  const ids = Array.isArray(creativeIds) ? creativeIds : [creativeIds];
  const result = await kuaishouRequest("/rest/openapi/v1/creative/update/status", {
    method: "POST",
    body: {
      advertiser_id: Number(advertiserId),
      creative_ids: ids.map(Number),
      put_status: Number(putStatus)
    }
  });
  assertSuccess(result, "update creative status");
  return result;
}

function writeDataFile(name, data) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  const file = path.join(dataDir, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  return file;
}

function summarizeErrors(errors) {
  const counts = {};
  errors.forEach((item) => {
    const message = item && item.response && item.response.message ? item.response.message : item.message || "unknown";
    counts[message] = (counts[message] || 0) + 1;
  });
  return Object.keys(counts)
    .map((message) => ({ message, count: counts[message] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function isHorizontalCreativeTarget(target) {
  const materialType = optionalNumber(firstDefined(target.creativeMaterialType, target.creative_material_type));
  if (materialType === 2) return true;
  if (materialType === 1) return false;
  const width = optionalNumber(target.width);
  const height = optionalNumber(target.height);
  return Boolean(width && height && width > height);
}

function extractCreativeIdsFromAdvancedProgramResponse(result) {
  const ids = [];
  const details = result && result.data && Array.isArray(result.data.details) ? result.data.details : [];
  details.forEach((detail) => {
    if (!detail) return;
    if (detail.creative_id) ids.push(detail.creative_id);
    if (Array.isArray(detail.creatives)) {
      detail.creatives.forEach((creative) => {
        if (creative && creative.creative_id) ids.push(creative.creative_id);
      });
    }
  });
  const singleId = getResultId(result, "creative_id");
  if (singleId) ids.push(singleId);
  return normalizeStringList(ids);
}

function buildAdvancedProgramCreativePayload(options) {
  const allTargets = normalizePhotoIdItems(options);
  if (allTargets.length > advancedProgramMaxPhotos) {
    const error = new Error(`程序化创意2.0最多支持 ${advancedProgramMaxPhotos} 个视频素材，请减少单创意组素材数量`);
    error.status = 400;
    throw error;
  }
  const targets = allTargets.slice(0, advancedProgramMaxPhotos);
  const horizontalPhotoIds = [];
  const verticalPhotoIds = [];
  targets.forEach((target) => {
    const list = isHorizontalCreativeTarget(target) ? horizontalPhotoIds : verticalPhotoIds;
    list.push(String(target.photoId));
  });

  const description = truncateText(firstDefined(options.description, options.copy, options.caption), 30);
  const caption = description || "你那么牛，你把第二关过了！";
  const actionBar = truncateText(firstDefined(options.actionBar, options.action_bar, options.actionBarText, options.action_bar_text), 20)
    || "试玩游戏";

  const payload = compactObject({
    advertiser_id: Number(options.advertiserId || options.advertiser_id),
    unit_id: Number(options.unitId || options.unit_id),
    package_name: suffixName(firstDefined(options.packageName, options.package_name, options.creativeName, options.creative_name), ""),
    horizontal_photo_ids: horizontalPhotoIds,
    vertical_photo_ids: verticalPhotoIds,
    action_bar: actionBar,
    captions: [caption]
  });
  payload.cover_image_tokens = [];

  const newExposeTag = firstDefined(options.newExposeTag, options.new_expose_tag);
  if (newExposeTag) payload.new_expose_tag = cloneJson(newExposeTag);

  if (!payload.horizontal_photo_ids && !payload.vertical_photo_ids) {
    const error = new Error("程序化创意需要至少 1 个已上传素材 photo_id");
    error.status = 400;
    throw error;
  }

  return {
    payload,
    targets,
    material_count: targets.length
  };
}

async function pauseTestCreatedEntities(result, advertiserId, campaignId, putStatus) {
  if (Number(putStatus) !== 2) return;
  if (campaignId && !result.campaign_status_response) {
    try {
      result.campaign_status_response = await updateCampaignStatus(advertiserId, [campaignId], 2);
    } catch (error) {
      result.errors.push({ stage: "campaign-status", response: error.body || { message: error.message } });
    }
  }
  const unitIds = normalizeStringList(
    (Array.isArray(result.units) ? result.units.map((unit) => unit && unit.new_unit_id) : [])
      .concat(result.unit && result.unit.new_unit_id)
  );
  if (unitIds.length && !result.unit_status_response) {
    try {
      result.unit_status_response = await updateUnitStatus(advertiserId, unitIds, 2);
    } catch (error) {
      result.errors.push({ stage: "unit-status", response: error.body || { message: error.message } });
    }
  }
  const creativeIds = result.creatives
    .map((creative) => creative.new_creative_id)
    .concat(concatMap(result.creatives, (creative) => creative.new_creative_ids || []))
    .filter(Boolean);
  if (creativeIds.length && !result.creative_status_response) {
    try {
      result.creative_status_response = await updateCreativeStatus(advertiserId, creativeIds, 2);
    } catch (error) {
      result.errors.push({ stage: "creative-status", response: error.body || { message: error.message } });
    }
  }
}

async function cloneCampaignFromSnapshot(snapshot, options) {
  const advertiserId = Number(options.advertiserId || snapshot.advertiser_id);
  const putStatus = Number(options.putStatus || 2);
  const nameSuffix = options.nameSuffix || `_copy_${yyyymmdd(options.startDate)}`;
  const plan = buildClonePlan(snapshot, Object.assign({}, options, { advertiserId, putStatus, nameSuffix }));
  const result = {
    source_campaign_id: snapshot.campaign_id,
    advertiser_id: advertiserId,
    started_at: new Date().toISOString(),
    campaign: null,
    units: [],
    creatives: [],
    errors: []
  };

  const campaignCreate = await createCampaign(plan.campaign);
  const newCampaignId = campaignCreate.campaign_id;
  result.campaign = {
    source_campaign_id: snapshot.campaign_id,
    new_campaign_id: newCampaignId,
    payload: plan.campaign,
    response: campaignCreate.result
  };

  for (const unitPlan of plan.units) {
    const payload = Object.assign({}, unitPlan.payload, {
      campaign_id: newCampaignId,
      put_status: putStatus
    });
    try {
      const created = await createUnit(payload);
      result.units.push({
        source_unit_id: unitPlan.source_unit_id,
        new_unit_id: created.unit_id,
        source_unit_name: unitPlan.source_unit_name,
        payload,
        response: created.result
      });
    } catch (error) {
      result.errors.push({
        stage: "unit",
        source_unit_id: unitPlan.source_unit_id,
        payload,
        response: error.body || { message: error.message }
      });
    }
  }
  result.unit_completed_at = new Date().toISOString();

  const unitIdMap = {};
  result.units.forEach((unit) => {
    unitIdMap[String(unit.source_unit_id)] = unit.new_unit_id;
  });

  for (const creativePlan of plan.creatives) {
    const newUnitId = unitIdMap[String(creativePlan.source_unit_id)];
    if (!newUnitId) {
      result.errors.push({
        stage: "creative",
        source_creative_id: creativePlan.source_creative_id,
        source_unit_id: creativePlan.source_unit_id,
        response: { message: "source unit was not created" }
      });
      continue;
    }

    const payload = Object.assign({}, creativePlan.payload, { unit_id: newUnitId });
    if (!options.includeImageToken) delete payload.image_token;

    try {
      const created = await createCreative(payload);
      result.creatives.push({
        source_creative_id: creativePlan.source_creative_id,
        new_creative_id: created.creative_id,
        source_unit_id: creativePlan.source_unit_id,
        new_unit_id: newUnitId,
        source_creative_name: creativePlan.source_creative_name,
        payload,
        response: created.result
      });
    } catch (error) {
      result.errors.push({
        stage: "creative",
        source_creative_id: creativePlan.source_creative_id,
        source_unit_id: creativePlan.source_unit_id,
        payload,
        response: error.body || { message: error.message }
      });
    }
  }
  result.creative_completed_at = new Date().toISOString();

  const unitIds = result.units.map((unit) => unit.new_unit_id).filter(Boolean);
  const creativeIds = result.creatives.map((creative) => creative.new_creative_id).filter(Boolean);
  if (newCampaignId && putStatus === 2) {
    try {
      result.campaign_pause_response = await updateCampaignStatus(advertiserId, [newCampaignId], 2);
    } catch (error) {
      result.errors.push({ stage: "campaign-status", response: error.body || { message: error.message } });
    }
    if (unitIds.length) {
      try {
        result.unit_pause_response = await updateUnitStatus(advertiserId, unitIds, 2);
      } catch (error) {
        result.errors.push({ stage: "unit-status", response: error.body || { message: error.message } });
      }
    }
    if (creativeIds.length) {
      try {
        result.creative_pause_response = await updateCreativeStatus(advertiserId, creativeIds, 2);
      } catch (error) {
        result.errors.push({ stage: "creative-status", response: error.body || { message: error.message } });
      }
    }
  }

  result.summary = {
    source_campaign_id: snapshot.campaign_id,
    new_campaign_id: newCampaignId,
    new_campaign_name: plan.campaign.campaign_name,
    units_total: plan.units.length,
    units_created: result.units.length,
    creatives_total: plan.creatives.length,
    creatives_created: result.creatives.length,
    errors: result.errors.length,
    put_status: putStatus,
    top_errors: summarizeErrors(result.errors)
  };

  if (options.saveFiles !== false) {
    const stamp = `${snapshot.campaign_id}_${yyyymmdd(today())}_${Date.now()}`;
    result.snapshot_file = writeDataFile(`campaign_${stamp}_snapshot.json`, snapshot);
    result.plan_file = writeDataFile(`campaign_${stamp}_clone_plan.json`, plan);
    result.result_file = writeDataFile(`campaign_${stamp}_clone_result.json`, result);
  }

  return result;
}

async function cloneCampaign(advertiserId, campaignId, options) {
  const snapshot = await getCampaignSnapshot(advertiserId, campaignId);
  return cloneCampaignFromSnapshot(snapshot, options || {});
}

async function testCreateCampaignFlow(advertiserId, sourceCampaignId, options) {
  options = options || {};
  const advertiser_id = Number(advertiserId);
  const source_advertiser_id = Number(firstDefined(options.sourceAdvertiserId, options.source_advertiser_id, advertiser_id));
  const source_campaign_id = Number(sourceCampaignId);
  const putStatus = Number(options.putStatus || 2);
  const sourceSnapshot = await getCampaignSnapshot(source_advertiser_id, source_campaign_id);
  const nameSuffix = options.nameSuffix || `_api_test_${Date.now()}`;
  const creativeGroups = normalizeCreativeGroups(options);
  const requestedGroups = creativeGroups.length ? creativeGroups : [{
    index: 1,
    unitName: options.unitName,
    creativeName: options.creativeName,
    targets: [{}]
  }];
  const flatPhotoIdItems = concatMap(requestedGroups, (group) => group.targets || []);
  const requestedCreativeCount = requestedGroups.reduce((sum, group) => sum + Math.max(1, group.targets.length), 0);
  const plan = buildClonePlan(sourceSnapshot, {
    advertiserId: advertiser_id,
    putStatus,
    nameSuffix,
    startDate: options.startDate || today(),
    campaignName: options.campaignName,
    unitName: options.unitName,
    creativeName: options.creativeName,
    unitNameRule: options.unitNameRule || options.groupRule,
    creativeNameRule: options.creativeNameRule || options.creativeRule,
    roiRatio: firstDefined(options.roiRatio, options.roi_ratio),
    dayBudget: options.dayBudget,
    miniAppIdPlatform: firstDefined(options.miniAppIdPlatform, options.mini_app_id_platform),
    miniAppType: firstDefined(options.miniAppType, options.mini_app_type)
  });

  const result = {
    ok: false,
    source_campaign_id,
    advertiser_id,
    started_at: new Date().toISOString(),
    campaign: null,
    unit: null,
    units: [],
    creative: null,
    creatives: [],
    creative_groups: [],
    advanced_program_creative: null,
    errors: []
  };

  const campaignCreate = await createCampaign(plan.campaign);
  const newCampaignId = campaignCreate.campaign_id;
  result.campaign = {
    new_campaign_id: newCampaignId,
    payload: plan.campaign,
    response: campaignCreate.result
  };

  const sourceUnits = plan.units.slice(0, Math.max(1, Number(options.maxUnits || 1)));
  const maxCreativeAttempts = Math.max(1, Number(options.maxCreativeAttempts || 40));

  function candidateCreativesForSourceUnit(sourceUnitId) {
    return plan.creatives
      .filter((creativePlan) => String(creativePlan.source_unit_id) === String(sourceUnitId))
      .concat(plan.creatives.filter((creativePlan) => String(creativePlan.source_unit_id) !== String(sourceUnitId)));
  }

  for (let groupIndex = 0; groupIndex < requestedGroups.length; groupIndex += 1) {
    const group = requestedGroups[groupIndex];
    const groupNumber = Number(group.index || groupIndex + 1);
    const targets = group.targets && group.targets.length ? group.targets : [{}];
    let unitRecord = null;

    for (const unitPlan of sourceUnits) {
      const unitPayload = Object.assign({}, unitPlan.payload, {
        campaign_id: newCampaignId,
        put_status: putStatus
      });
      const configuredUnitName = firstDefined(group.unitName, options.unitName);
      if (configuredUnitName) {
        unitPayload.unit_name = !group.unitName && groupIndex > 0
          ? indexedName(configuredUnitName, groupIndex)
          : suffixName(configuredUnitName, "");
      }
      const roiRatio = optionalNumber(firstDefined(options.roiRatio, options.roi_ratio));
      if (roiRatio !== undefined) unitPayload.roi_ratio = roiRatio;
      const miniAppIdPlatform = normalizeMiniAppId(firstDefined(options.miniAppIdPlatform, options.mini_app_id_platform));
      if (miniAppIdPlatform) {
        unitPayload.custom_mini_app_data = unitPayload.custom_mini_app_data || {};
        unitPayload.custom_mini_app_data.mini_app_id_platform = miniAppIdPlatform;
        unitPayload.custom_mini_app_data.mini_app_type = optionalNumber(firstDefined(options.miniAppType, options.mini_app_type)) || 2;
        unitPayload.schema_uri = replaceSchemaAppId(unitPayload.schema_uri, miniAppIdPlatform);
      }
      try {
        const unitCreate = await createUnit(unitPayload);
        unitRecord = {
          group_index: groupNumber,
          source_unit_id: unitPlan.source_unit_id,
          new_unit_id: unitCreate.unit_id,
          payload: unitPayload,
          response: unitCreate.result
        };
        result.units.push(unitRecord);
        if (!result.unit) result.unit = unitRecord;
        break;
      } catch (error) {
        result.errors.push({
          stage: "unit",
          group_index: groupNumber,
          source_unit_id: unitPlan.source_unit_id,
          payload: unitPayload,
          response: error.body || { message: error.message }
        });
      }
    }

    const groupRecord = {
      group_index: groupNumber,
      source_unit_id: unitRecord && unitRecord.source_unit_id,
      new_unit_id: unitRecord && unitRecord.new_unit_id,
      unit_name: unitRecord && unitRecord.payload && unitRecord.payload.unit_name,
      creative_name: firstDefined(group.creativeName, options.creativeName),
      requested_material_count: targets.length,
      created_creative_count: 0,
      photo_ids: targets.map((target) => target.photoId).filter(Boolean),
      new_creative_ids: [],
      creatives: []
    };
    result.creative_groups.push(groupRecord);

    if (!unitRecord) continue;

    const candidateCreatives = candidateCreativesForSourceUnit(unitRecord.source_unit_id);
    const usedCreativeNames = {};
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      const target = targets[targetIndex];
      const targetNumber = targetIndex + 1;
      let created = null;
      for (let index = 0; index < candidateCreatives.length && index < maxCreativeAttempts; index += 1) {
        const creativePlan = candidateCreatives[index];
        const creativePayload = Object.assign({}, creativePlan.payload, {
          unit_id: unitRecord.new_unit_id
        });
        const configuredCreativeName = firstDefined(target.creativeName, group.creativeName, options.creativeName);
        if (configuredCreativeName) {
          const preferredCreativeName = targetIndex > 0 && !target.creativeName && !group.creativeName
            ? indexedName(configuredCreativeName, targetIndex)
            : configuredCreativeName;
          creativePayload.creative_name = uniqueNameForGroup(preferredCreativeName, usedCreativeNames, targetIndex);
        }
        if (target.photoId) creativePayload.photo_id = String(target.photoId);
        if (target.creativeMaterialType !== undefined) creativePayload.creative_material_type = target.creativeMaterialType;
        const actionBar = truncateText(firstDefined(options.actionBar, options.action_bar, options.actionBarText, options.action_bar_text), 20);
        if (actionBar) creativePayload.action_bar_text = actionBar;
        const description = truncateText(firstDefined(options.description, options.copy, options.caption), 30);
        if (description) creativePayload.description = description;
        delete creativePayload.image_token;
        try {
          const creativeCreate = await createCreative(creativePayload);
          created = {
            group_index: groupNumber,
            target_index: targetNumber,
            source_creative_id: creativePlan.source_creative_id,
            source_unit_id: creativePlan.source_unit_id,
            new_unit_id: unitRecord.new_unit_id,
            new_creative_id: creativeCreate.creative_id,
            photo_id: creativePayload.photo_id,
            asset_name: target.assetName,
            payload: creativePayload,
            response: creativeCreate.result,
            attempt: index + 1
          };
          result.creatives.push(created);
          groupRecord.creatives.push(created);
          groupRecord.new_creative_ids.push(creativeCreate.creative_id);
          groupRecord.created_creative_count = groupRecord.creatives.length;
          if (!result.creative) result.creative = created;
          break;
        } catch (error) {
          result.errors.push({
            stage: "creative",
            group_index: groupNumber,
            source_creative_id: creativePlan.source_creative_id,
            source_unit_id: creativePlan.source_unit_id,
            target_index: targetNumber,
            photo_id: target.photoId,
            payload: creativePayload,
            response: error.body || { message: error.message }
          });
        }
      }
      if (!created && target.photoId) {
        result.errors.push({
          stage: "creative-target",
          group_index: groupNumber,
          target_index: targetNumber,
          photo_id: target.photoId,
          response: { message: "No creative could be created for this photo_id" }
        });
      }
    }
  }

  await pauseTestCreatedEntities(result, advertiser_id, newCampaignId, putStatus);

  const unitIds = result.units.map((unit) => unit.new_unit_id).filter(Boolean);
  const standardCreativeIds = result.creatives.map((creative) => creative.new_creative_id).filter(Boolean);
  const completedCreativeGroups = result.creative_groups.filter((group) =>
    Number(group.created_creative_count) === Number(group.requested_material_count)
  );
  result.ok = Boolean(result.campaign && result.units.length === requestedGroups.length && result.creatives.length === requestedCreativeCount);
  result.summary = {
    ok: result.ok,
    creative_mode: "standard_grouped",
    advertiser_id,
    source_advertiser_id,
    source_campaign_id,
    new_campaign_id: newCampaignId,
    new_unit_id: result.unit && result.unit.new_unit_id,
    new_unit_ids: unitIds,
    new_creative_id: result.creative && result.creative.new_creative_id,
    new_creative_ids: standardCreativeIds,
    advanced_program_creative_ids: [],
    campaign_name: result.campaign && result.campaign.payload && result.campaign.payload.campaign_name,
    unit_name: result.unit && result.unit.payload && result.unit.payload.unit_name,
    creative_name: result.creative && result.creative.payload && result.creative.payload.creative_name,
    package_name: null,
    ad_group_creatives_requested: requestedGroups.length,
    ad_group_creatives_created: completedCreativeGroups.length,
    creative_groups_requested: requestedGroups.length,
    creative_groups_created: completedCreativeGroups.length,
    creatives_requested: requestedCreativeCount,
    creatives_created: result.creatives.length,
    openapi_creatives_created: result.creatives.length,
    material_count: flatPhotoIdItems.length || result.creatives.length,
    materials_per_creative: requestedGroups.map((group) => Math.max(1, group.targets.length)),
    creative_group_details: result.creative_groups.map((group) => ({
      group_index: group.group_index,
      new_unit_id: group.new_unit_id,
      unit_name: group.unit_name,
      requested_material_count: group.requested_material_count,
      created_creative_count: group.created_creative_count,
      new_creative_ids: group.new_creative_ids,
      photo_ids: group.photo_ids
    })),
    roi_ratio: result.unit && result.unit.payload && result.unit.payload.roi_ratio,
    put_status: putStatus,
    creative_attempt: result.creative && result.creative.attempt,
    errors: result.errors.length,
    top_errors: summarizeErrors(result.errors)
  };

  if (!result.ok) {
    throw Object.assign(new Error("No standard creative could be created for every requested material"), {
      status: 502,
      body: result
    });
  }

  if (options.saveFiles !== false) {
    const stamp = `${source_campaign_id}_test_create_${Date.now()}`;
    result.result_file = writeDataFile(`campaign_${stamp}_result.json`, result);
  }

  return result;
}

function normalizeAsset(asset) {
  if (!asset) return null;
  if (typeof asset === "string") return { photo_id: asset };
  return asset;
}

async function createFromProgram(payload, options) {
  const rows = payload.rows || [];
  const accounts = payload.accounts || [];
  const sourceAssets = Array.isArray(payload.assignedAssets) ? payload.assignedAssets : (payload.assets || []);
  const assets = sourceAssets.map(normalizeAsset).filter(Boolean);
  const dryRun = !options || options.dryRun !== false;
  const missingPhotoIds = assets.filter((asset) => !asset.photo_id && !asset.photoId);
  if (!dryRun && missingPhotoIds.length) {
    const error = new Error("真实创建创意需要素材 photo_id；当前页面素材只有名称，不能直接提交快手创建");
    error.status = 400;
    throw error;
  }

  return {
    ok: true,
    mode: dryRun ? "dry_run" : "not_implemented",
    message: dryRun
      ? "已生成预览；传 dryRun:false 且素材包含 photo_id 后才会真实创建"
      : "从零程序化创建已校验素材，计划/广告组/创意接口已接入，仍需要页面补齐快手必填业务字段",
    accounts: accounts.length,
    assets: assets.length,
    rows
  };
}

module.exports = {
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
  createAdvancedProgramCreative,
  updateCampaignStatus,
  updateUnitStatus,
  updateCreativeStatus,
  createFromProgram
};

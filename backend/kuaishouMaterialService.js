const crypto = require("crypto");
const { kuaishouMultipartRequest } = require("./kuaishouClient");

const videoExtensions = [".mp4"];

function assertSuccess(result, action) {
  if (!result || result.code === undefined || result.code === 0) return;
  const error = new Error(result.message || `${action} failed with code ${result.code}`);
  error.status = 502;
  error.body = result;
  throw error;
}

function md5(buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

function normalizeUploadResult(result) {
  const data = result && (result.data || result);
  return {
    photo_id: findPhotoId(data),
    data
  };
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

async function uploadAdVideo(advertiserId, file) {
  const extension = String(file.extension || "").toLowerCase();
  if (!videoExtensions.includes(extension)) {
    const error = new Error("快手视频上传接口当前只接入 mp4；图片素材需要单独接 image_token 创意链路");
    error.status = 400;
    throw error;
  }
  const result = await kuaishouMultipartRequest("/rest/openapi/v2/file/ad/video/upload", {
    fields: {
      advertiser_id: Number(advertiserId),
      signature: md5(file.buffer),
      photo_name: String(file.fileName || "material").replace(/\.[^.]+$/, "").slice(0, 50),
      type: 1,
      sync: 1,
      shield_backward_switch: false
    },
    files: [
      {
        fieldName: "file",
        fileName: file.fileName || "material.mp4",
        contentType: file.contentType || "video/mp4",
        buffer: file.buffer
      }
    ],
    timeoutMs: 180000
  });
  assertSuccess(result, "upload ad video");
  const normalized = normalizeUploadResult(result);
  if (!normalized.photo_id) {
    const error = new Error("快手视频上传成功但未返回 photo_id");
    error.status = 502;
    error.body = result;
    throw error;
  }
  return {
    ok: true,
    photo_id: normalized.photo_id,
    result
  };
}

module.exports = {
  uploadAdVideo
};

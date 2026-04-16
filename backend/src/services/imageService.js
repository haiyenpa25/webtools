const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Image Service — Fixed-name overwrite mechanism với Sharp
 */

/**
 * Upload và overwrite ảnh theo tên cố định
 * Đây là cơ chế "Fixed Naming Asset Manager"
 */
async function overwriteImage(inputBuffer, fixedName, siteDir, folderName = '') {
  const outputPath = path.join(siteDir, 'images', folderName, fixedName);
  
  // Đảm bảo thư mục tồn tại
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Lấy thông tin ảnh cũ để giữ nguyên kích thước
  let targetWidth = null;
  let targetHeight = null;

  if (fs.existsSync(outputPath)) {
    try {
      const oldMeta = await sharp(outputPath).metadata();
      targetWidth = oldMeta.width;
      targetHeight = oldMeta.height;
    } catch (e) {
      // Ảnh cũ bị lỗi, bỏ qua
    }
  }

  // Process ảnh mới với Sharp
  let processor = sharp(inputBuffer);
  const newMeta = await processor.metadata();

  // Auto-scaling: resize về đúng kích thước cũ (Auto-scale)
  if (targetWidth && targetHeight) {
    processor = processor.resize(targetWidth, targetHeight, {
      fit: 'cover',
      position: 'center'
    });
  } else if (newMeta.width > 2000) {
    // Nếu ảnh quá lớn, resize về max 2000px
    processor = processor.resize(2000, null, { withoutEnlargement: true });
  }

  // Giữ nguyên format, tối ưu chất lượng
  const ext = path.extname(fixedName).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      processor = processor.jpeg({ quality: 85, progressive: true });
      break;
    case '.png':
      processor = processor.png({ compressionLevel: 8 });
      break;
    case '.webp':
      processor = processor.webp({ quality: 85 });
      break;
    default:
      processor = processor.jpeg({ quality: 85 });
  }

  // Ghi đè (overwrite) file cũ
  await processor.toFile(outputPath);

  // Lấy metadata của ảnh mới
  const finalMeta = await sharp(outputPath).metadata();

  return {
    path: outputPath,
    fixedName,
    width: finalMeta.width,
    height: finalMeta.height,
    size: fs.statSync(outputPath).size
  };
}

/**
 * Tạo thumbnail nhỏ cho Media Library
 */
async function createThumbnail(imagePath, thumbnailDir) {
  const filename = path.basename(imagePath);
  const thumbPath = path.join(thumbnailDir, `thumb_${filename}`);
  
  fs.mkdirSync(thumbnailDir, { recursive: true });

  try {
    await sharp(imagePath)
      .resize(200, 150, { fit: 'cover' })
      .jpeg({ quality: 70 })
      .toFile(thumbPath);
    return thumbPath;
  } catch (e) {
    return null;
  }
}

/**
 * Download và optimize ảnh từ remote URL
 */
async function downloadAndOptimizeImage(imageUrl, fixedName, siteDir, folderName = '') {
  const axios = require('axios');
  
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 WebTools-CMS-Crawler' }
    });

    const buffer = Buffer.from(response.data);
    
    // Kiểm tra có phải ảnh không
    const meta = await sharp(buffer).metadata();
    if (!meta.format) throw new Error('Not a valid image');

    return await overwriteImage(buffer, fixedName, siteDir, folderName);
  } catch (err) {
    console.error(`⚠️ Could not download image ${imageUrl}:`, err.message);
    return null;
  }
}

/**
 * Lấy thông tin metadata của ảnh
 */
async function getImageMeta(imagePath) {
  try {
    const meta = await sharp(imagePath).metadata();
    const stat = fs.statSync(imagePath);
    return {
      width: meta.width,
      height: meta.height,
      format: meta.format,
      size: stat.size
    };
  } catch (e) {
    return null;
  }
}

module.exports = {
  overwriteImage,
  createThumbnail,
  downloadAndOptimizeImage,
  getImageMeta
};

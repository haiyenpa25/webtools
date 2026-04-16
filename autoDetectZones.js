const cheerio = require('cheerio');
const fs = require('fs');

/**
 * Script biến một file HTML tĩnh thành HTML có các vùng chỉnh sửa (Editable Zones)
 * và tạo ra file schema.json map cấu trúc cho CMS.
 */
function autoDetectEditableZones(htmlContent) {
    const $ = cheerio.load(htmlContent);
    const schemaMap = {};
    let idCounter = 1;

    // Định nghĩa các tag văn bản và cấu hình cho chúng
    const textTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'strong', 'button', 'a'];
    
    // Xử lý Text
    textTags.forEach(tag => {
        $(tag).each((index, element) => {
            const el = $(element);
            const textContent = el.text().trim();
            
            // Bỏ qua các thẻ trống hoặc quá ngắn
            if (!textContent || textContent.length < 2) return;

            // Xóa mã độc hoặc script gắn láo nếu có (Sanitize)
            el.find('script, iframe').remove();

            // Tạo định danh duy nhất (VD: h1_hero_title, p_desc_1)
            let elClass = el.attr('class') ? el.attr('class').split(' ')[0] : '';
            if (elClass) elClass = `_${elClass}`;
            
            const fieldId = `${tag}${elClass}_${idCounter++}`;

            // Gắn thuộc tính để CMS Client-side (Visual Editor) nhận diện
            el.attr('data-editable', 'text');
            el.attr('data-field-id', fieldId);

            // Lưu vào bẳng Schema
            schemaMap[fieldId] = {
                type: 'text',
                tag: tag,
                originalValue: textContent,
                path: fieldId
            };
        });
    });

    // Xử lý Hình ảnh
    $('img').each((index, element) => {
        const el = $(element);
        const src = el.attr('src');
        if (!src) return;

        let imgName = src.split('/').pop().replace(/\.[^/.]+$/, ""); // Lấy tên file
        if (!imgName) imgName = `image_${idCounter}`;
        
        const fieldId = `img_${imgName}_${idCounter++}`;

        el.attr('data-editable', 'image');
        el.attr('data-field-id', fieldId);

        schemaMap[fieldId] = {
            type: 'image',
            tag: 'img',
            originalSrc: src,
            alt: el.attr('alt') || '',
            path: fieldId
        };
    });

    // Trả về HTML đã nhúng Overlay data và Schema map 
    return {
        processedHtml: $.html(),
        schemaMap: schemaMap
    };
}

// Giả lập chạy thử nghiệm
const sampleHTML = `
<!DOCTYPE html>
<html>
<head><title>My Vintage Site</title></head>
<body>
    <header>
        <h1 class="hero-title">Welcome to NextGen AI</h1>
        <p class="desc">Transform your workflow today.</p>
        <img class="logo" src="assets/logo-final-v2.png" alt="Logo">
    </header>
    <!-- Tricky part: Google analytics old tracker -->
    <script>console.log("Tracker tracking...");</script>
</body>
</html>
`;

console.log("=== BẮT ĐẦU PHÂN TÍCH VÀ BIẾN ĐỔI ===");
const result = autoDetectEditableZones(sampleHTML);

console.log("\n[1]. MÃ HTML ĐƯỢC CHÈN DATA-EDITABLE:");
console.log(result.processedHtml);

console.log("\n[2]. FILE SCHEMA.JSON MAP ĐỂ ĐƯA LÊN MONGO/CMS:");
console.log(JSON.stringify(result.schemaMap, null, 2));

// Save files if ran directly
fs.writeFileSync('output-processed.html', result.processedHtml);
fs.writeFileSync('schema.json', JSON.stringify(result.schemaMap, null, 2));
console.log("\n[3]. Đã xuất file output-processed.html và schema.json thành công!");

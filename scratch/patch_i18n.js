const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '../backend/src/services/i18nService.js');
let content = fs.readFileSync(file, 'utf8');

const regex = /\/\*\*\s+\*\s+D?ch m?t do?n text qua Google Translate API.*?catch \(err\) \{\s+console\.warn\([\s\S]*?return text;\s+\}\s+\}/;
const match = content.match(regex);
if(match) {
  content = content.replace(regex, `/**
 * D?ch m?t do?n text qua Google Gemini API (N?u có KEY) ho?c Google Translate (Mi?n phí)
 */
async function translateText(text, fromLang, toLang) {
  if (!text || !text.trim() || text.trim().length < 2) return text;
  if (fromLang === toLang) return text;

  // B? qua text thu?n s? / ký t? d?c bi?t
  if (/^[\\d\\s\\W]+$/.test(text)) return text;

  // 1. TH? DÙNG GEMINI AI N?U CÓ KEY
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const prompt = \`Translate the following \${fromLang} text to \${toLang}. Ensure technical MEP and engineering terms are translated accurately and contextually. Return ONLY the translated text, no markdown, no quotes, no conversational filler:\\n\\n\${text}\`;
      const response = await axios.post(
        \`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=\${apiKey}\`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { headers: { 'Content-Type': 'application/json' } }
      );
      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return response.data.candidates[0].content.parts[0].text.trim();
      }
    } catch (e) {
      console.warn(\`[GEMINI] D?ch th?t b?i, Fallback sang Google Translate. L?i: \${e.message}\`);
    }
  }

  // 2. FALLBACK SANG GOOGLE TRANSLATE MI?N PHÍ
  const chunk = text.substring(0, 4000); 
  try {
    const response = await axios.get(\`https://translate.googleapis.com/translate_a/single\`, {
      params: { client: 'gtx', sl: fromLang, tl: toLang, dt: 't', q: chunk }
    });

    if (response.data && response.data[0]) {
      return response.data[0].map(x => x[0]).join('');
    }
    return text;
  } catch (err) {
    return text;
  }
}`);
  fs.writeFileSync(file, content);
  console.log("Replaced");
} else {
  console.error("Match failed");
}

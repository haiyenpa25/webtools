const fs = require('fs');
const file = 'backend/src/routes/sites.js';
let content = fs.readFileSync(file, 'utf8');

const injection = `
/**
 * POST /api/sites/:siteId/pages/:pageId/ai-rewrite -> Dùng AI vi?t l?i nguyên kh?i HTML
 */
router.post('/:siteId/pages/:pageId/ai-rewrite', async (req, res) => {
  try {
    const { html } = req.body;
    if (!html) return res.status(400).json({ error: 'Missing HTML parameter' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Chua c?u hình GEMINI_API_KEY trong .env' });

    const axios = require('axios');
    const prompt = \`Rewrite the following HTML block to improve its marketing copy and SEO, while strictly preserving ALL HTML tags, attributes, and classes. Do not wrap with markdown or conversational tags:\\n\\n\${html}\`;
    
    const response = await axios.post(
      \`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=\${apiKey}\`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    let rewrittenHtml = html;
    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      rewrittenHtml = response.data.candidates[0].content.parts[0].text.trim();
    }
    
    res.json({ success: true, html: rewrittenHtml });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
`;

const marker = "module.exports = router;";
if(!content.includes('/ai-rewrite')) {
    content = content.replace(marker, injection + "\n" + marker);
    fs.writeFileSync(file, content);
    console.log("Injected AI Rewrite route!");
} else {
    console.log("Route already exists.");
}

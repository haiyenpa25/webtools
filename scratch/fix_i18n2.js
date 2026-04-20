const fs = require('fs');
let c = fs.readFileSync('backend/src/services/i18nService.js', 'utf8');

// Fix 1: broken prompt template literal (line 166)
c = c.replace(
    `      const prompt = Translate the following  text to . Ensure technical MEP and engineering terms are translated accurately and contextually. Return ONLY the translated text, no markdown, no conversational filler:\\n\\n;`,
    "      const prompt = `Translate the following text to ${toLang}. Ensure technical MEP and engineering terms are translated accurately and contextually. Return ONLY the translated text, no markdown, no conversational filler:\\n\\n${text}`;"
);

// Fix 2: broken Gemini URL (line 168)
c = c.replace(
    `        https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=,`,
    "        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,"
);

// Fix 3: broken console.warn (line 176)
c = c.replace(
    `      console.warn([GEMINI] D?ch th?t b?i, Fallback sang Google. L?i: );`,
    "      console.warn('[GEMINI] D?ch th?t b?i, Fallback sang Google. L?i:', e.message);"
);

// Fix 4: broken Google Translate URL (around line 184)
c = c.replace(
    `    const response = await axios.get(https://translate.googleapis.com/translate_a/single, {`,
    "    const response = await axios.get('https://translate.googleapis.com/translate_a/single', {"
);

fs.writeFileSync('backend/src/services/i18nService.js', c);
console.log('Fixed i18nService.js comprehensively');

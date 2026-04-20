const fs = require('fs');

let content = fs.readFileSync('backend/src/services/crawlerService.js', 'utf8');

// Fix 1: broken fallback filename at line 320
// \image_ + "" + .jpg\;  -->  `image_${Date.now()}.jpg`;
content = content.replace(
    `|| \\image_ + "" + .jpg\\;`,
    `|| \`image_\${Date.now()}.jpg\`;`
);

// Fix 2: broken progress message at line 333
// \\Ðang t?i ?nh: \\ + Math.min(...) + \\ / \\ + total + \\ ...\\
// -->  `Ðang t?i ?nh: ${Math.min(...)} / ${total} ...`
content = content.replace(
    /\\([^\\]+)\\ \+ Math\.min\(i \+ chunk\.length, targetImages\.length\) \+ \\ \/ \\ \+ targetImages\.length \+ \\ \.\.\.\\/,
    `\`\${m} \${Math.min(i + chunk.length, targetImages.length)} / \${targetImages.length} ...\``
);

// Fix 3 broader: any remaining \text\ that are broken string delimiters
// Pattern: '\\' + non-backslash chars + '\\' appearing where a string literal should be
content = content.replace(/ \|\| \\([^\\]+)\\;/g, ' || `$1`;');

fs.writeFileSync('backend/src/services/crawlerService.js', content);
console.log('Applied targeted fixes');

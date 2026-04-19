const fs = require('fs');
let html = fs.readFileSync('backend/public/index.html', 'utf8');

// The nav item doesn't trigger Collections.load() natively, I need to patch dashboard.js or index.html to load it
if (!html.includes('if(viewId === \'view-collections\') Collections.load()')) {
    html = html.replace(
       `document.getElementById(viewId).style.display = 'block';`,
       `document.getElementById(viewId).style.display = 'block';\n      if(viewId === 'view-collections') { Collections.load(); }`
    );
    fs.writeFileSync('backend/public/index.html', html);
    console.log("Patched tab changing logic");
} else {
    console.log("Tab logic already patched");
}

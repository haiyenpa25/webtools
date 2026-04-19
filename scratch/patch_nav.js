const fs = require('fs');
let html = fs.readFileSync('backend/public/index.html', 'utf8');

const searchTabRegex = /<a href="#" class="nav-item" data-view="search"[^>]*>[\s\S]*?<\/a>/;

const newTabs = `
          <a href="#" class="nav-item" data-view="history" onclick="App.navigate('history')">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Time Machine (L?ch S?)
          </a>
          <a href="#" class="nav-item" data-view="deploy" onclick="App.navigate('deploy')">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            1-Click Deploy
          </a>
`;

// Insert after search block
const match = html.match(searchTabRegex);
if(match && !html.includes('data-view="history"')) {
    const splitIndex = match.index + match[0].length;
    html = html.substring(0, splitIndex) + newTabs + html.substring(splitIndex);
    fs.writeFileSync('backend/public/index.html', html);
    console.log("Injected tabs");
} else {
    console.log("Not found or already injected");
}

const fs = require('fs');
let html = fs.readFileSync('backend/public/index.html', 'utf8');

const searchMarker = `<a href="#" class="nav-item" data-view="search" onclick="App.navigate('search')">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            TAm KiA?m
          </a>`;

// Try an exact index injection instead
const target = "App.navigate('search')";
const idx = html.indexOf(target);
if(idx > -1 && !html.includes('data-view="history"')) {
    let endA = html.indexOf('</a>', idx) + 4;
    
    const newTabs = `
          <a href="#" class="nav-item" data-view="history" onclick="App.navigate('history')">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Time Machine
          </a>
          <a href="#" class="nav-item" data-view="deploy" onclick="App.navigate('deploy')">
            <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            1-Click Deploy
          </a>`;
          
    html = html.substring(0, endA) + "\n" + newTabs + html.substring(endA);
    fs.writeFileSync('backend/public/index.html', html);
    console.log("Injected Successfully.");
} else {
    console.log("Failed to inject.");
}

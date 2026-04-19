const fs = require('fs');
let app = fs.readFileSync('backend/src/app.js', 'utf8');

if (!app.includes('/api/deploy')) {
    const target = "app.use('/api/history', require('./routes/history'));";
    const injection = "app.use('/api/deploy', require('./routes/deploy'));";
    app = app.replace(target, target + "\n" + injection);
    fs.writeFileSync('backend/src/app.js', app);
    console.log("Injected deploy route to app.js");
} else {
    console.log("Already registered");
}

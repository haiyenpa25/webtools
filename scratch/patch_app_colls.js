const fs = require('fs');
let app = fs.readFileSync('backend/src/app.js', 'utf8');

if (!app.includes('/api/collections')) {
    const target = "app.use('/api/deploy', require('./routes/deploy'));";
    const injection = "app.use('/api/collections', require('./routes/collections'));";
    app = app.replace(target, target + "\n" + injection);
    fs.writeFileSync('backend/src/app.js', app);
    console.log("Injected collections route to app.js");
} else {
    console.log("Already registered");
}

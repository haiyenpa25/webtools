const fs = require('fs');
let content = fs.readFileSync('backend/src/routes/deploy.js', 'utf8');

const targetMethod = `// Lm sch thuc tn
        if (remoteDir && remoteDir !== '') {
            try {
                await client.clearWorkingDir();
                console.log('Cleared working directory');
            } catch(e) {
                console.log('Warning: Could not clear remote dir, it might be empty or permissions issue', e.message);
            }
        }`;

const injectionMethod = `// Lm sach thuc tuc
        if (remoteDir && remoteDir !== '') {
            const dangerDirs = ['/', '/home', '/root', '/etc', '/var'];
            if (dangerDirs.includes(remoteDir)) {
               throw new Error('SYSTEM ERROR: Remote Directory is a root/system folder. Clear operation aborted for safety.');
            }
            try {
                await client.clearWorkingDir();
                console.log('Cleared working directory');
            } catch(e) {
                console.log('Warning: Could not clear remote dir, it might be empty or permissions issue', e.message);
            }
        }`;


if (!content.includes('dangerDirs')) {
    content = content.replace(targetMethod, injectionMethod);
    fs.writeFileSync('backend/src/routes/deploy.js', content);
    console.log("Patched deploy.js successfully");
} else {
    console.log("Already patched.");
}

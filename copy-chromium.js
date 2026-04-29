const fs = require('fs');
const path = require('path');

function findChromium() {
    const possiblePaths = [
        path.join(process.env.USERPROFILE, '.cache', 'puppeteer', 'chrome'),
        path.join(process.env.LOCALAPPDATA, 'puppeteer', 'chrome'),
        path.join(__dirname, 'node_modules', 'puppeteer', '.local-chromium')
    ];
    for (const base of possiblePaths) {
        if (fs.existsSync(base)) {
            const folders = fs.readdirSync(base).filter(f => f.startsWith('win64-'));
            if (folders.length) {
                const chromeFolder = path.join(base, folders[0], 'chrome-win64');
                if (fs.existsSync(chromeFolder)) {
                    return chromeFolder;
                }
            }
        }
    }
    return null;
}

const srcChromium = findChromium();
if (!srcChromium) {
    console.error('❌ Chromium não encontrado. Execute: npx puppeteer browsers install chrome');
    process.exit(1);
}

const destChromium = path.join(__dirname, 'release', 'ZapMix-win32-x64', 'resources', 'app', 'node_modules', 'puppeteer', '.local-chromium', 'win64-embedded', 'chrome-win64');

fs.mkdirSync(path.dirname(destChromium), { recursive: true });
fs.cpSync(srcChromium, destChromium, { recursive: true });
console.log(`✅ Chromium copiado de ${srcChromium} para ${destChromium}`);
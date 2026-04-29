const fs = require('fs');
const path = require('path');

const destApp = path.join(__dirname, 'release', 'ZapMix-win32-x64', 'resources', 'app');

// Copiar pasta public
const publicSrc = path.join(__dirname, 'public');
const publicDest = path.join(destApp, 'public');
if (fs.existsSync(publicSrc)) {
    fs.cpSync(publicSrc, publicDest, { recursive: true });
    console.log('✅ Pasta public copiada');
} else {
    console.warn('⚠️ Pasta public não encontrada');
}

// Copiar loading.html
const loadingSrc = path.join(__dirname, 'loading.html');
const loadingDest = path.join(destApp, 'loading.html');
if (fs.existsSync(loadingSrc)) {
    fs.copyFileSync(loadingSrc, loadingDest);
    console.log('✅ loading.html copiado');
} else {
    console.warn('⚠️ loading.html não encontrado');
}
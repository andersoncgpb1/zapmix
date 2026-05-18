const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { iniciarNDI, pararNDI } = require('./ndi-output');

let mainWindow;
let gtWindow;
let enqueteWindow;
let serverProcess;
let portaAtual = 3000;
let ndiIniciado = false;

function lerPorta() {
    const portaFile = path.join(process.env.APPDATA, 'ZapMix', 'porta.txt');

    if (fs.existsSync(portaFile)) {
        const porta = parseInt(fs.readFileSync(portaFile, 'utf8').trim(), 10);
        if (!isNaN(porta)) return porta;
    }

    return 3000;
}

function verificarServidor(porta) {
    return new Promise(resolve => {
        const req = http.get(`http://localhost:${porta}/api/state`, res => {
            resolve(res.statusCode === 200);
        });

        req.on('error', () => resolve(false));

        req.setTimeout(2000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

function iniciarServidor() {
    console.log('🚀 Iniciando servidor ZapMix...');

    serverProcess = spawn(process.execPath, ['server.js'], {
        cwd: __dirname,
        stdio: 'pipe',
        windowsHide: true,
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1'
        }
    });

    serverProcess.stdout.on('data', data => {
        const output = data.toString();

        console.log(`[Server]: ${output}`);

        const match = output.match(/http:\/\/localhost:(\d+)/);

        if (match) {
            portaAtual = parseInt(match[1], 10);
            console.log(`📡 Servidor na porta ${portaAtual}`);
        }
    });

    serverProcess.stderr.on('data', data => {
        console.error(`[Server Error]: ${data}`);
    });

    serverProcess.on('close', code => {
        console.log(`Servidor finalizado com código ${code}`);
    });
}

function criarJanelaPrincipal() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: path.join(__dirname, 'build', 'logotipo.ico'),
        title: 'ZapMix',
        show: false,
        backgroundColor: '#0f172a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    mainWindow.loadFile('loading.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    const timer = setInterval(async () => {
        portaAtual = lerPorta();

        const ok = await verificarServidor(portaAtual);

        if (ok) {
            clearInterval(timer);

            await mainWindow.loadURL(`http://localhost:${portaAtual}`);

            await criarJanelasNDI();
        }
    }, 2000);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

async function criarJanelasNDI() {
    if (ndiIniciado) return;

    gtWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    enqueteWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        show: false,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    await gtWindow.loadURL(`http://localhost:${portaAtual}/vmix-gt.html`);
    await enqueteWindow.loadURL(`http://localhost:${portaAtual}/vmix.html`);

    ndiIniciado = true;

    iniciarNDI({
        gtWindow,
        enqueteWindow,
        porta: portaAtual
    });
}

app.whenReady().then(() => {
    criarJanelaPrincipal();
    iniciarServidor();
});

app.on('window-all-closed', () => {
    pararNDI();

    if (serverProcess) {
        serverProcess.kill();
    }

    app.quit();
});

app.on('before-quit', () => {
    pararNDI();

    if (serverProcess) {
        serverProcess.kill();
    }
});
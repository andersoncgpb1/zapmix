const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const http = require("http");

const { startZapMixServer } = require("./server");
const { iniciarNDI, pararNDI } = require("./ndi-output");
const { validarLicenca, verificarLicencaSalva } = require("./license-manager");

let mainWindow;
let exibidorWindow;  // ANTES: gtWindow
let enqueteWindow;
let portaAtual = 3000;
let ndiIniciado = false;

// ============================================================
// FUNÇÕES DE UTILIDADE
// ============================================================
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

// ============================================================
// JANELA PRINCIPAL
// ============================================================
function criarJanelaPrincipal() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        icon: path.join(__dirname, 'build', 'logotipo.ico'),
        title: 'ZapMix',
        show: false,
        backgroundColor: '#0f172a',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('loading.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        app.quit();
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
}

// ============================================================
// JANELAS NDI
// ============================================================
async function criarJanelasNDI() {
    if (ndiIniciado) return;

    exibidorWindow = new BrowserWindow({  // ANTES: gtWindow
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

    // CARREGAR O NOVO ARQUIVO exibidor.html
    await exibidorWindow.loadURL(`http://localhost:${portaAtual}/exibidor.html`);  // ANTES: vmix-gt.html
	await enqueteWindow.loadURL(`http://localhost:${portaAtual}/enquete-exibidor.html`);

    ndiIniciado = true;
    iniciarNDI({ exibidorWindow, enqueteWindow, porta: portaAtual });  // ANTES: gtWindow
}

// ============================================================
// JANELA DE ATIVAÇÃO
// ============================================================
function criarJanelaAtivacao() {
    mainWindow = new BrowserWindow({
        width: 520,
        height: 650,
        icon: path.join(__dirname, "build", "logotipo.ico"),
        title: "Ativar ZapMix",
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile("ativar.html");
    
    mainWindow.on('closed', () => {
        app.quit();
    });
}

// ============================================================
// AUTO-UPDATER
// ============================================================
function configurarAutoUpdate() {
    if (!mainWindow) return;
    
    autoUpdater.on('checking-for-update', () => {
        console.log('Verificando atualizações...');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-status', 'Verificando atualizações...');
        }
    });

    autoUpdater.on('update-available', (info) => {
        console.log('Atualização disponível!');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-status', `Nova versão ${info.version} disponível!`);
        }
        
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Atualização Disponível',
            message: `Uma nova versão (${info.version}) está disponível. Deseja baixar agora?`,
            buttons: ['Sim', 'Mais tarde']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.downloadUpdate();
            }
        });
    });

    autoUpdater.on('update-not-available', () => {
        console.log('Nenhuma atualização disponível');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-status', 'Você está usando a versão mais recente!');
        }
    });

    autoUpdater.on('error', (err) => {
        console.error('Erro na atualização:', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-status', 'Erro ao verificar atualizações');
        }
    });

    autoUpdater.on('download-progress', (progressObj) => {
        let percent = progressObj.percent.toFixed(2);
        console.log(`Download: ${percent}%`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-progress', percent);
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('Atualização baixada!');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-status', 'Atualização baixada! Reiniciando...');
        }
        
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Atualização Pronta',
            message: 'A atualização foi baixada. Reiniciar o aplicativo para instalar?',
            buttons: ['Reiniciar agora', 'Mais tarde']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });
}

// ============================================================
// IPC HANDLERS
// ============================================================
ipcMain.handle("licenca:ativar", async (event, chave) => {
    return await validarLicenca(chave);
});

ipcMain.on("licenca:ok", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
    }
    startZapMixServer();
    criarJanelaPrincipal();
    configurarAutoUpdate();
});

ipcMain.on('check-for-updates', () => {
    console.log('Verificando atualizações manualmente...');
    autoUpdater.checkForUpdatesAndNotify();
});

// ============================================================
// INICIALIZAÇÃO DO APP
// ============================================================
app.whenReady().then(async () => {
    const licenca = await verificarLicencaSalva();
    
    if (licenca && licenca.ok) {
        startZapMixServer();
        criarJanelaPrincipal();
        configurarAutoUpdate();
        autoUpdater.checkForUpdatesAndNotify();
    } else {
        criarJanelaAtivacao();
    }
});

// ============================================================
// FINALIZAR PROCESSO CORRETAMENTE
// ============================================================
app.on('window-all-closed', () => {
    pararNDI();
    app.quit();
});

app.on('before-quit', () => {
    pararNDI();
});

app.on('will-quit', () => {
    app.exit(0);
});
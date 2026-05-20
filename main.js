const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const http = require("http");

const { startZapMixServer } = require("./server");
const { iniciarNDI, pararNDI } = require("./ndi-output");
const { validarLicenca, verificarLicencaSalva } = require("./license-manager");

let mainWindow;
let exibidorWindow;
let enqueteWindow;
let portaAtual = 3000;
let ndiIniciado = false;
let servidorIniciado = false;

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

function iniciarServidorUmaVez() {
    if (servidorIniciado) return;
    servidorIniciado = true;
    startZapMixServer();
}

function criarJanelaPrincipal() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        return;
    }

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
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    const timer = setInterval(async () => {
        if (!mainWindow || mainWindow.isDestroyed()) {
            clearInterval(timer);
            return;
        }

        portaAtual = lerPorta();
        const ok = await verificarServidor(portaAtual);

        if (ok) {
            clearInterval(timer);
            await mainWindow.loadURL(`http://localhost:${portaAtual}`);
            await criarJanelasNDI();
        }
    }, 2000);
}

async function criarJanelasNDI() {
    if (ndiIniciado) return;

    exibidorWindow = new BrowserWindow({
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

    await exibidorWindow.loadURL(`http://localhost:${portaAtual}/exibidor.html`);
    await enqueteWindow.loadURL(`http://localhost:${portaAtual}/enquete-exibidor.html`);

    ndiIniciado = true;
    iniciarNDI({ exibidorWindow, enqueteWindow, porta: portaAtual });
}

function criarJanelaAtivacao() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        return;
    }

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
        mainWindow = null;
    });
}

function configurarAutoUpdate() {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    autoUpdater.removeAllListeners();

    autoUpdater.on('checking-for-update', () => {
        console.log('Verificando atualizações...');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-status', 'Verificando atualizações...');
        }
    });

    autoUpdater.on('update-available', info => {
        console.log('Atualização disponível!');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-status', `Nova versão ${info.version} disponível!`);
        }
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Atualização Disponível',
            message: `Uma nova versão (${info.version}) está disponível. Deseja baixar agora?`,
            buttons: ['Sim', 'Mais tarde']
        }).then(result => {
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

    autoUpdater.on('error', err => {
        console.error('Erro na atualização:', err);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-status', 'Erro ao verificar atualizações');
        }
    });

    autoUpdater.on('download-progress', progressObj => {
        const percent = progressObj.percent.toFixed(2);
        console.log(`Download: ${percent}%`);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-progress', percent);
        }
    });

    autoUpdater.on('update-downloaded', () => {
        console.log('Atualização baixada!');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-status', 'Atualização baixada! Reiniciando...');
        }
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Atualização Pronta',
            message: 'A atualização foi baixada. Reiniciar o aplicativo para instalar?',
            buttons: ['Reiniciar agora', 'Mais tarde']
        }).then(result => {
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
    console.log("🔑 Validando chave:", chave);
    const resultado = await validarLicenca(chave);
    console.log("📋 Resultado:", resultado);
    return resultado;
});

ipcMain.on("licenca:ok", () => {
    console.log("✅ Licença validada! Iniciando sistema...");

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
        mainWindow = null;
    }

    iniciarServidorUmaVez();

    let tentativas = 0;
    const maxTentativas = 20;

    const aguardarServidor = setInterval(async () => {
        tentativas++;
        const porta = lerPorta();
        const servidorOk = await verificarServidor(porta);

        if (servidorOk) {
            clearInterval(aguardarServidor);
            console.log("✅ Servidor pronto! Abrindo aplicação...");
            criarJanelaPrincipal();
            configurarAutoUpdate();
            if (app.isPackaged) {
                autoUpdater.checkForUpdatesAndNotify();
            }
        } else if (tentativas >= maxTentativas) {
            clearInterval(aguardarServidor);
            console.error("❌ Servidor não iniciou após várias tentativas");
        }
    }, 1000);
});

ipcMain.on("check-for-updates", () => {
    console.log("Verificando atualizações manualmente...");
    if (app.isPackaged) {
        autoUpdater.checkForUpdatesAndNotify();
    }
});

// ============================================================
// INICIALIZAÇÃO DO APP
// ============================================================
app.whenReady().then(async () => {
    console.log("🚀 Aplicativo iniciando...");

    const licenca = await verificarLicencaSalva();

    if (licenca && licenca.ok) {
        console.log("✅ Licença válida encontrada!");

        iniciarServidorUmaVez();

        setTimeout(() => {
            criarJanelaPrincipal();
            configurarAutoUpdate();
            if (app.isPackaged) {
                autoUpdater.checkForUpdatesAndNotify();
            }
        }, 2000);
    } else {
        console.log("⚠️ Nenhuma licença válida. Mostrando tela de ativação...");
        criarJanelaAtivacao();
    }
});

// ============================================================
// FINALIZAR PROCESSO
// ============================================================
app.on('window-all-closed', () => {
    pararNDI();

    if (exibidorWindow && !exibidorWindow.isDestroyed()) {
        exibidorWindow.close();
    }

    if (enqueteWindow && !enqueteWindow.isDestroyed()) {
        enqueteWindow.close();
    }

    app.quit();
});

app.on('before-quit', () => {
    pararNDI();
});

app.on('will-quit', () => {
    app.exit(0);
});
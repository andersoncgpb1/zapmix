const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;
let serverProcess;
let portaAtual = 3000;
let tentativas = 0;

function lerPortaArquivo() {
  const userDataPath = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');
  const portaFile = path.join(userDataPath, 'ZapMix', 'porta.txt');
  if (fs.existsSync(portaFile)) {
    try {
      const porta = parseInt(fs.readFileSync(portaFile, 'utf8').trim(), 10);
      if (!isNaN(porta)) return porta;
    } catch(e) {}
  }
  return 3000;
}

function verificarServidor() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${portaAtual}/api/state`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          JSON.parse(data);
          resolve(true);
        } catch(e) {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

function iniciarServidor() {
  console.log('🚀 Iniciando servidor ZapMix...');
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    stdio: 'pipe',
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });

  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log(`[Server]: ${output}`);
    const portaMatch = output.match(/http:\/\/localhost:(\d+)/);
    if (portaMatch && portaMatch[1]) {
      portaAtual = parseInt(portaMatch[1], 10);
    }
    if (output.includes('QR Code gerado') || output.includes('WhatsApp conectado')) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://localhost:${portaAtual}`);
      }
    }
  });

  serverProcess.stderr.on('data', (data) => console.error(`[Server Error]: ${data}`));
  serverProcess.on('close', (code) => {
    console.log(`Servidor finalizado com código ${code}`);
    serverProcess = null;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, 'public', 'media', 'logotipo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    title: 'ZapMix',
    show: false,
    backgroundColor: '#0f172a'
  });

  // Carrega loading.html com caminho absoluto
  mainWindow.loadFile(path.join(__dirname, 'loading.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  const interval = setInterval(async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const url = mainWindow.webContents.getURL();
      if (url.includes('loading.html')) {
        portaAtual = lerPortaArquivo();
        const servidorOk = await verificarServidor();
        if (servidorOk) {
          mainWindow.loadURL(`http://localhost:${portaAtual}`);
          clearInterval(interval);
        } else if (tentativas > 10) {
          tentativas = 0;
          if (serverProcess) {
            serverProcess.kill();
            setTimeout(() => iniciarServidor(), 1000);
          }
        }
        tentativas++;
      } else {
        clearInterval(interval);
      }
    } else {
      clearInterval(interval);
    }
  }, 3000);

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  iniciarServidor();
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    iniciarServidor();
  }
});
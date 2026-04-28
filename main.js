const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

let mainWindow;
let serverProcess;

function startServer() {
  console.log('🚀 Iniciando servidor ZapMix...');
  
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'pipe',
    windowsHide: true
  });
  
  serverProcess.stdout.on('data', (data) => {
    console.log(`[Server]: ${data}`);
    if (data.toString().includes('Servidor rodando em')) {
      if (mainWindow) {
        mainWindow.loadURL('http://localhost:3000');
      }
    }
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server Error]: ${data}`);
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
    backgroundColor: '#f1f5f9'
  });
  
  mainWindow.loadFile('loading.html');
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  startServer();
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});
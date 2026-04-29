const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

let mainWindow;
let serverProcess;
let licencaAtiva = false;

// Função para verificar se a licença está ativa
function verificarLicencaViaAPI() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000/api/licenca/status', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.ativada === true);
        } catch(e) {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => resolve(false));
  });
}

function startServer() {
  console.log('🚀 Iniciando servidor ZapMix...');
  
  // Matar processos na porta 3000
  try {
    const { exec } = require('child_process');
    exec('netstat -ano | findstr :3000', (error, stdout) => {
      if (stdout) {
        const lines = stdout.split('\n');
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(pid) && pid !== '0') {
            exec(`taskkill /F /PID ${pid}`);
          }
        });
      }
    });
  } catch(e) {}
  
  setTimeout(() => {
    serverProcess = spawn(process.execPath, ['server.js'], {
      cwd: __dirname,
      stdio: 'pipe',
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });
    
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Server]: ${output}`);
      
      if (output.includes('Servidor rodando em')) {
        console.log('✅ Servidor pronto!');
        verificarEAbrirJanela();
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      console.error(`[Server Error]: ${data}`);
    });
    
    serverProcess.on('close', (code) => {
      console.log(`Servidor finalizado com código ${code}`);
      serverProcess = null;
    });
  }, 1000);
}

async function verificarEAbrirJanela() {
  // Aguardar um pouco para o servidor estar totalmente pronto
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const ativada = await verificarLicencaViaAPI();
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (ativada) {
      console.log('✅ Licença ativa, carregando painel principal');
      mainWindow.loadURL('http://localhost:3000');
    } else {
      console.log('🔑 Licença não ativada, carregando tela de ativação');
      mainWindow.loadURL('http://localhost:3000/ativar.html');
    }
  }
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
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
const express = require("express");
const http = require("http");
const cors = require("cors");
const QRCode = require("qrcode");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const { Client, LocalAuth } = require("whatsapp-web.js");
const multer = require("multer");

const app = express();

// ============ CONFIGURAÇÃO DE PORTA COM FALLBACK ============
const PORTA_INICIAL = 3000;
const PORTA_MAXIMA = 3010;
let PORTA_ATUAL = PORTA_INICIAL;

// ============ PASTA DE DADOS DO USUÁRIO (permissão garantida) ============
const userDataPath = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');
const zapmixDataPath = path.join(userDataPath, 'ZapMix');
const authPath = path.join(zapmixDataPath, 'auth');
if (!fs.existsSync(zapmixDataPath)) fs.mkdirSync(zapmixDataPath, { recursive: true });
if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

// Pastas de mídia dentro da pasta de dados do usuário
const fotosDir = path.join(zapmixDataPath, "fotos");
const imagensDir = path.join(zapmixDataPath, "imagens");
const videosDir = path.join(zapmixDataPath, "videos");
const audiosDir = path.join(zapmixDataPath, "audios");
const uploadsDir = path.join(zapmixDataPath, "uploads");

[fotosDir, imagensDir, videosDir, audiosDir, uploadsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ============ MIDDLEWARE ============
app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Servir arquivos estáticos da pasta 'public' com caminho absoluto
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
} else {
  console.warn("⚠️ Pasta 'public' não encontrada!");
}

// ============ MULTER ============
const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, uploadsDir); },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `background_${Date.now()}${ext}`);
  }
});
const uploadMidia = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ============ ESTADO GLOBAL ============
let backgroundAtual = { type: "default", imageUrl: null };
let qrCodeDataUrl = null;
let whatsappStatus = "iniciando";
let pendingMessages = [];
let approvedMessages = [];
let currentMessage = null;

// ============ ENQUETE ============
let enqueteAtiva = true;
let perguntaEnquete = "O que você mais gosta?";
let opcoesEnquete = [
  { id: "coracao", nome: "Coração", cor: "#ef4444", votos: 0, palavrasChave: ["coração", "coracao", "cardio", "heart"] },
  { id: "pele", nome: "Pele", cor: "#f59e0b", votos: 0, palavrasChave: ["pele", "derma", "skin"] },
  { id: "cerebro", nome: "Cérebro", cor: "#3b82f6", votos: 0, palavrasChave: ["cérebro", "cerebro", "neuro", "mente"] }
];

function getTotalVotos() {
  return opcoesEnquete.reduce((total, op) => total + op.votos, 0);
}
function getPorcentagem(opcaoId) {
  const total = getTotalVotos();
  if (total === 0) return 0;
  const opcao = opcoesEnquete.find(op => op.id === opcaoId);
  return Math.round((opcao.votos / total) * 100);
}
function getVencedor() {
  if (getTotalVotos() === 0) return null;
  return [...opcoesEnquete].sort((a, b) => b.votos - a.votos)[0];
}
function detectarVoto(mensagem) {
  if (!mensagem) return null;
  const msgLower = mensagem.toLowerCase().trim();
  for (const opcao of opcoesEnquete) {
    for (const palavra of opcao.palavrasChave) {
      if (msgLower.includes(palavra.toLowerCase())) return opcao.id;
    }
  }
  return null;
}
function contabilizarVoto(opcaoId) {
  const opcao = opcoesEnquete.find(op => op.id === opcaoId);
  if (opcao && enqueteAtiva) {
    opcao.votos++;
    emit();
    return true;
  }
  return false;
}
function emptyCurrent() {
  return {
    indice: 0, id: "", nome: "", mensagem: "", horario: "",
    foto: "/fotos/default.png", imagemUrl: null, videoUrl: null, audioUrl: null, status: "vazio"
  };
}
function cleanText(value) { return String(value || "").trim(); }
function nowBR() { return new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza", hour12: false }); }
function normalizePhone(from) { return String(from || "").replace("@c.us", "").replace("@g.us", "").replace(/[^0-9]/g, ""); }
function toDatasourceItem(item, index = 0) {
  if (!item) return emptyCurrent();
  return {
    indice: index + 1, id: item.id || "", nome: item.nome || "", mensagem: item.mensagem || "",
    horario: item.horario || "", foto: item.foto || "/fotos/default.png",
    imagemUrl: item.imagemUrl || null, videoUrl: item.videoUrl || null, audioUrl: item.audioUrl || null,
    status: item.status || "aprovada"
  };
}
function state() {
  return {
    whatsappStatus, qrCodeDataUrl, pendingMessages, approvedMessages,
    currentMessage: currentMessage || emptyCurrent(),
    enquete: {
      ativa: enqueteAtiva, pergunta: perguntaEnquete,
      opcoes: opcoesEnquete.map(op => ({ ...op, porcentagem: getPorcentagem(op.id) })),
      totalVotos: getTotalVotos(), vencedor: getVencedor()
    }
  };
}
let io = null;
function emit() { if (io) io.emit("messages:update", state()); }

// ============ MÍDIAS ============
async function baixarFotoPerfil(url, telefone) {
  try {
    if (!url || !telefone) return "/fotos/default.png";
    const filename = `${telefone}.jpg`;
    const filepath = path.join(fotosDir, filename);
    if (fs.existsSync(filepath)) return `/fotos/${filename}`;
    const response = await axios({ url, method: "GET", responseType: "arraybuffer", timeout: 12000 });
    fs.writeFileSync(filepath, response.data);
    return `/fotos/${filename}`;
  } catch { return "/fotos/default.png"; }
}
async function salvarMidia(media, messageId, tipo) {
  try {
    let ext, dir, urlPath;
    if (tipo === "image") { ext = media.mimetype.split("/")[1] || "jpg"; dir = imagensDir; urlPath = "/imagens"; }
    else if (tipo === "video") { ext = media.mimetype.split("/")[1] || "mp4"; dir = videosDir; urlPath = "/videos"; }
    else if (tipo === "audio") { ext = media.mimetype.split("/")[1] || "ogg"; dir = audiosDir; urlPath = "/audios"; }
    else return null;
    const filename = `${messageId}_${Date.now()}.${ext}`;
    const filepath = path.join(dir, filename);
    const buffer = Buffer.from(media.data, "base64");
    fs.writeFileSync(filepath, buffer);
    return `${urlPath}/${filename}`;
  } catch { return null; }
}
function addPending(data) {
  const text = cleanText(data.mensagem);
  if (!text && !data.imagemUrl && !data.videoUrl && !data.audioUrl) return null;
  let mensagemFinal = text;
  if (text && data.origem !== "manual") {
    const voto = detectarVoto(text);
    if (voto && enqueteAtiva) {
      const opcao = opcoesEnquete.find(op => op.id === voto);
      if (opcao) {
        contabilizarVoto(voto);
        mensagemFinal = `VOTO: ${opcao.nome} - ${text}`;
      }
    }
  }
  const item = {
    id: Date.now().toString() + Math.random().toString(16).slice(2),
    nome: cleanText(data.nome || "Participante"), mensagem: mensagemFinal,
    foto: data.foto || "/fotos/default.png", imagemUrl: data.imagemUrl || null,
    videoUrl: data.videoUrl || null, audioUrl: data.audioUrl || null,
    origem: data.origem || "whatsapp", status: "pendente",
    createdAt: new Date().toISOString(), horario: nowBR()
  };
  pendingMessages.unshift(item);
  pendingMessages = pendingMessages.slice(0, 200);
  emit();
  return item;
}

// ============ WHATSAPP CLIENT ============
let client = null;
function iniciarWhatsApp() {
  let executablePath = null;
  const possiblePaths = [
    path.join(process.resourcesPath || '', 'app', 'node_modules', 'puppeteer', '.local-chromium'),
    path.join(__dirname, 'node_modules', 'puppeteer', '.local-chromium')
  ];
  for (const base of possiblePaths) {
    if (fs.existsSync(base)) {
      const folders = fs.readdirSync(base).filter(f => f.startsWith('win64-'));
      if (folders.length) {
        const candidate = path.join(base, folders[0], 'chrome-win64', 'chrome.exe');
        if (fs.existsSync(candidate)) {
          executablePath = candidate;
          console.log(`✅ Chromium encontrado em: ${executablePath}`);
          break;
        }
      }
    }
  }
  if (!executablePath) console.log('⚠️ Chromium não encontrado, tentando Chrome/Edge do sistema');
  client = new Client({
    authStrategy: new LocalAuth({ clientId: "zapmix", dataPath: authPath }),
    puppeteer: {
      headless: true,
      executablePath: executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
    }
  });
  client.on("qr", async (qr) => {
    whatsappStatus = "aguardando_qr";
    qrCodeDataUrl = await QRCode.toDataURL(qr);
    emit();
    console.log("📱 QR Code gerado!");
  });
  client.on("ready", () => {
    whatsappStatus = "conectado";
    qrCodeDataUrl = null;
    emit();
    console.log("✅ WhatsApp conectado!");
  });
  client.on("authenticated", () => console.log("🔐 Autenticado"));
  client.on("auth_failure", (msg) => console.error("❌ Falha auth:", msg));
  client.on("disconnected", (reason) => console.log("⚠️ Desconectado:", reason));
  client.on("message", async (msg) => {
    try {
      if (msg.from === "status@broadcast") return;
      const contact = await msg.getContact();
      const nome = contact.pushname || contact.name || contact.number || "Participante";
      const telefone = normalizePhone(msg.from);
      let mensagemTexto = msg.body || "";
      let foto = "/fotos/default.png";
      let imagemUrl = null, videoUrl = null, audioUrl = null;
      try {
        const profilePicUrl = await contact.getProfilePicUrl();
        if (profilePicUrl) foto = await baixarFotoPerfil(profilePicUrl, telefone);
      } catch (e) {}
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media) {
            if (media.mimetype.startsWith("image/")) {
              imagemUrl = await salvarMidia(media, msg.id.id, "image");
              if (!mensagemTexto) mensagemTexto = "📷 Imagem";
            } else if (media.mimetype.startsWith("video/")) {
              videoUrl = await salvarMidia(media, msg.id.id, "video");
              if (!mensagemTexto) mensagemTexto = "🎬 Vídeo";
            } else if (media.mimetype.startsWith("audio/")) {
              audioUrl = await salvarMidia(media, msg.id.id, "audio");
              if (!mensagemTexto) mensagemTexto = "🎵 Áudio";
            }
          }
        } catch (err) {}
      }
      if (!mensagemTexto && !imagemUrl && !videoUrl && !audioUrl) return;
      addPending({ nome, telefone, mensagem: mensagemTexto, foto, imagemUrl, videoUrl, audioUrl, origem: "whatsapp" });
    } catch (err) { console.error("Erro mensagem:", err); }
  });
  client.initialize();
}

// ============ ROTA DE DESCONECTAR WHATSAPP ============
app.post("/api/whatsapp/disconnect", async (req, res) => {
  console.log("🔌 Solicitado desconectar WhatsApp");
  if (client) {
    try {
      await client.destroy();
      console.log("Cliente WhatsApp destruído");

      // Apagar a pasta de autenticação para forçar novo QR Code
      if (fs.rmSync) {
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log(`🗑️ Sessão eliminada em: ${authPath}`);
      } else {
        // Fallback para versões antigas do Node
        const { exec } = require('child_process');
        exec(`rmdir /s /q "${authPath}"`, (err) => {
          if (err) console.error("Erro ao deletar sessão:", err);
          else console.log("Sessão excluída via rmdir");
        });
      }

      whatsappStatus = "desconectado";
      qrCodeDataUrl = null;
      emit();
      res.json({ ok: true, message: "WhatsApp desconectado. Um novo QR Code será gerado em instantes." });

      // Reiniciar o cliente para gerar novo QR sem precisar reiniciar o app
      setTimeout(() => {
        console.log("Reiniciando WhatsApp para novo QR...");
        iniciarWhatsApp();
      }, 2000);

    } catch (err) {
      console.error("Erro ao desconectar:", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  } else {
    res.json({ ok: false, message: "Cliente não inicializado" });
  }
});
// ============ ROTAS API ============
app.get("/api/state", (req, res) => res.json(state()));
app.get("/api/enquete", (req, res) => res.json({
  ativa: enqueteAtiva, pergunta: perguntaEnquete,
  opcoes: opcoesEnquete.map(op => ({ id: op.id, nome: op.nome, cor: op.cor, votos: op.votos, porcentagem: getPorcentagem(op.id) })),
  totalVotos: getTotalVotos(), vencedor: getVencedor()
}));
app.get("/datasource", (req, res) => res.json([toDatasourceItem(currentMessage, 0)]));
app.get("/datasource/approved", (req, res) => res.json(approvedMessages.map((item, i) => toDatasourceItem(item, i))));

app.post("/api/manual", (req, res) => {
  const item = addPending({ nome: req.body.nome, mensagem: req.body.mensagem, foto: req.body.foto, origem: "manual" });
  res.json({ ok: true, item });
});
app.post("/api/messages/:id/approve", (req, res) => {
  const index = pendingMessages.findIndex(m => m.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Mensagem não encontrada." });
  const [item] = pendingMessages.splice(index, 1);
  item.status = "aprovada";
  approvedMessages.unshift(item);
  emit();
  res.json({ ok: true, item });
});
app.post("/api/messages/:id/reject", (req, res) => {
  pendingMessages = pendingMessages.filter(m => m.id !== req.params.id);
  emit();
  res.json({ ok: true });
});
app.post("/api/messages/:id/onair", (req, res) => {
  const item = approvedMessages.find(m => m.id === req.params.id) || pendingMessages.find(m => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Mensagem não encontrada." });
  currentMessage = { ...item, status: "no_ar" };
  emit();
  res.json({ ok: true, currentMessage });
});
app.post("/api/clear", (req, res) => {
  currentMessage = null;
  emit();
  res.json({ ok: true });
});
app.post("/api/maintenance/clear-all", (req, res) => {
  pendingMessages = [];
  approvedMessages = [];
  currentMessage = null;
  emit();
  res.json({ ok: true, message: "Todas as mensagens e mídias foram apagadas." });
});
app.post("/api/background/upload", uploadMidia.single('background'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });
  res.json({ ok: true, url: `/uploads/${req.file.filename}` });
});
app.post("/api/background/set", (req, res) => {
  const { background, imageUrl } = req.body;
  if (background) {
    backgroundAtual = { type: background, imageUrl: imageUrl || null };
    res.json({ ok: true, background });
  } else res.status(400).json({ error: "Background inválido" });
});
app.get("/api/background/get", (req, res) => res.json(backgroundAtual));

// ============ ROTAS DE MÍDIA ============
app.get("/fotos/:file", (req, res) => {
  const filePath = path.join(fotosDir, req.params.file);
  fs.existsSync(filePath) ? res.sendFile(filePath) : res.status(404).end();
});
app.get("/imagens/:file", (req, res) => {
  const filePath = path.join(imagensDir, req.params.file);
  fs.existsSync(filePath) ? res.sendFile(filePath) : res.status(404).end();
});
app.get("/videos/:file", (req, res) => {
  const filePath = path.join(videosDir, req.params.file);
  fs.existsSync(filePath) ? res.sendFile(filePath) : res.status(404).end();
});
app.get("/audios/:file", (req, res) => {
  const filePath = path.join(audiosDir, req.params.file);
  fs.existsSync(filePath) ? res.sendFile(filePath) : res.status(404).end();
});
app.get("/uploads/:file", (req, res) => {
  const filePath = path.join(uploadsDir, req.params.file);
  fs.existsSync(filePath) ? res.sendFile(filePath) : res.status(404).end();
});

// ============ PÁGINAS HTML ============
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/enquete.html", (req, res) => res.sendFile(path.join(__dirname, "public", "enquete.html")));
app.get("/vmix.html", (req, res) => res.sendFile(path.join(__dirname, "public", "vmix.html")));
app.get("/vmix-gt.html", (req, res) => res.sendFile(path.join(__dirname, "public", "vmix-gt.html")));

// ============ INICIAR SERVIDOR E WHATSAPP ============
function iniciarServidor(porta) {
  const serverHttp = http.createServer(app);
  io = new Server(serverHttp, { cors: { origin: "*" } });
  serverHttp.listen(porta, () => {
    PORTA_ATUAL = porta;
    console.log(`\n🚀 Servidor rodando em http://localhost:${PORTA_ATUAL}`);
    console.log(`📁 Dados do usuário em: ${zapmixDataPath}`);
    const portaFilePath = path.join(zapmixDataPath, 'porta.txt');
    fs.writeFileSync(portaFilePath, String(PORTA_ATUAL));
    if (!process.env.ELECTRON_RUN_AS_NODE) {
      setTimeout(() => {
        const { exec } = require('child_process');
        const cmd = process.platform === 'win32' ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
        exec(`${cmd} http://localhost:${PORTA_ATUAL}`);
      }, 2000);
    }
  });
  serverHttp.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const nextPort = porta + 1;
      if (nextPort <= PORTA_MAXIMA) {
        console.log(`⚠️ Porta ${porta} ocupada, tentando ${nextPort}...`);
        iniciarServidor(nextPort);
      } else {
        console.error(`❌ Sem porta disponível de ${PORTA_INICIAL} a ${PORTA_MAXIMA}`);
        process.exit(1);
      }
    } else {
      console.error('Erro ao iniciar servidor:', err);
      process.exit(1);
    }
  });
}

iniciarServidor(PORTA_INICIAL);
iniciarWhatsApp();
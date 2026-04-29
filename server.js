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
const serverHttp = http.createServer(app);
const io = new Server(serverHttp, { cors: { origin: "*" } });

const PORT = 3000;
const PUBLIC_BASE_URL = `http://localhost:${PORT}`;
const DEFAULT_PHOTO_URL = `${PUBLIC_BASE_URL}/fotos/default.png`;

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(express.static("public"));

// Criar pastas
const fotosDir = path.join(__dirname, "public", "fotos");
const imagensDir = path.join(__dirname, "public", "imagens");
const videosDir = path.join(__dirname, "public", "videos");
const audiosDir = path.join(__dirname, "public", "audios");
const uploadsDir = path.join(__dirname, "public", "uploads");

[fotosDir, imagensDir, videosDir, audiosDir, uploadsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

let qrCodeDataUrl = null;
let whatsappStatus = "iniciando";
let pendingMessages = [];
let approvedMessages = [];
let currentMessage = null;

// ============ ENQUETE ============
let enqueteAtiva = true;
let perguntaEnquete = "O que você mais gosta?";
let opcoesEnquete = [
  { id: "coracao", nome: "Coracao", cor: "#ef4444", votos: 0, palavrasChave: ["coração", "coracao", "cardio", "heart"] },
  { id: "pele", nome: "Pele", cor: "#f59e0b", votos: 0, palavrasChave: ["pele", "derma", "skin"] },
  { id: "cerebro", nome: "Cerebro", cor: "#3b82f6", votos: 0, palavrasChave: ["cérebro", "cerebro", "neuro", "mente"] }
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

function resetarVotos() {
  opcoesEnquete.forEach(op => op.votos = 0);
  emit();
}

function emptyCurrent() {
  return {
    indice: 0,
    id: "",
    nome: "",
    mensagem: "",
    horario: "",
    foto: DEFAULT_PHOTO_URL,
    imagemUrl: null,
    videoUrl: null,
    audioUrl: null,
    status: "vazio"
  };
}

function cleanText(value) {
  return String(value || "").trim();
}

function nowBR() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza", hour12: false });
}

function normalizePhone(from) {
  return String(from || "").replace("@c.us", "").replace("@g.us", "").replace(/[^0-9]/g, "");
}

function toDatasourceItem(item, index = 0) {
  if (!item) return emptyCurrent();
  return {
    indice: index + 1,
    id: item.id || "",
    nome: item.nome || "",
    mensagem: item.mensagem || "",
    horario: item.horario || "",
    foto: item.foto || DEFAULT_PHOTO_URL,
    imagemUrl: item.imagemUrl || null,
    videoUrl: item.videoUrl || null,
    audioUrl: item.audioUrl || null,
    status: item.status || "aprovada"
  };
}

function state() {
  return {
    whatsappStatus,
    qrCodeDataUrl,
    pendingMessages,
    approvedMessages,
    currentMessage: currentMessage || emptyCurrent(),
    enquete: {
      ativa: enqueteAtiva,
      pergunta: perguntaEnquete,
      opcoes: opcoesEnquete.map(op => ({ ...op, porcentagem: getPorcentagem(op.id) })),
      totalVotos: getTotalVotos(),
      vencedor: getVencedor()
    }
  };
}

function emit() {
  io.emit("messages:update", state());
}

async function baixarFotoPerfil(url, telefone) {
  try {
    if (!url || !telefone) return DEFAULT_PHOTO_URL;
    const filename = `${telefone}.jpg`;
    const filepath = path.join(fotosDir, filename);
    const response = await axios({ url, method: "GET", responseType: "arraybuffer", timeout: 12000 });
    fs.writeFileSync(filepath, response.data);
    return `${PUBLIC_BASE_URL}/fotos/${filename}`;
  } catch (error) {
    return DEFAULT_PHOTO_URL;
  }
}

async function salvarMidia(media, messageId, tipo) {
  try {
    let ext, dir, urlPath;
    if (tipo === "image") {
      ext = media.mimetype.split("/")[1] || "jpg";
      dir = imagensDir;
      urlPath = "/imagens";
    } else if (tipo === "video") {
      ext = media.mimetype.split("/")[1] || "mp4";
      dir = videosDir;
      urlPath = "/videos";
    } else if (tipo === "audio") {
      ext = media.mimetype.split("/")[1] || "ogg";
      dir = audiosDir;
      urlPath = "/audios";
    } else {
      return null;
    }
    const filename = `${messageId}_${Date.now()}.${ext}`;
    const filepath = path.join(dir, filename);
    const buffer = Buffer.from(media.data, "base64");
    fs.writeFileSync(filepath, buffer);
    return `${PUBLIC_BASE_URL}${urlPath}/${filename}`;
  } catch (error) {
    return null;
  }
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
    nome: cleanText(data.nome || "Participante"),
    mensagem: mensagemFinal,
    foto: data.foto || DEFAULT_PHOTO_URL,
    imagemUrl: data.imagemUrl || null,
    videoUrl: data.videoUrl || null,
    audioUrl: data.audioUrl || null,
    origem: data.origem || "whatsapp",
    status: "pendente",
    createdAt: new Date().toISOString(),
    horario: nowBR()
  };

  pendingMessages.unshift(item);
  pendingMessages = pendingMessages.slice(0, 200);
  emit();
  return item;
}

function encontrarChrome() {
  const caminhos = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env.PROGRAMFILES + '\\Google\\Chrome\\Application\\chrome.exe',
    process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const caminho of caminhos) {
    if (fs.existsSync(caminho)) return caminho;
  }
  return null;
}

const chromePath = encontrarChrome();

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "zapmix" }),
  puppeteer: {
    headless: true,
    executablePath: chromePath,
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

client.on("authenticated", () => console.log("🔐 WhatsApp autenticado"));
client.on("auth_failure", (msg) => console.error("❌ Falha de autenticação:", msg));
client.on("disconnected", (reason) => console.log("⚠️ WhatsApp desconectado:", reason));

client.on("message", async (msg) => {
  try {
    if (msg.from === "status@broadcast") return;
    const contact = await msg.getContact();
    const nome = contact.pushname || contact.name || contact.number || "Participante";
    const telefone = normalizePhone(msg.from);
    let mensagemTexto = msg.body || "";
    let foto = DEFAULT_PHOTO_URL;
    let imagemUrl = null;
    let videoUrl = null;
    let audioUrl = null;
    let mediaType = null;

    try {
      const profilePicUrl = await contact.getProfilePicUrl();
      if (profilePicUrl) foto = await baixarFotoPerfil(profilePicUrl, telefone);
    } catch (error) {}

    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media) {
          if (media.mimetype.startsWith("image/")) {
            imagemUrl = await salvarMidia(media, msg.id.id, "image");
            mediaType = "image";
            if (!mensagemTexto) mensagemTexto = "Imagem enviada";
          } else if (media.mimetype.startsWith("video/")) {
            videoUrl = await salvarMidia(media, msg.id.id, "video");
            mediaType = "video";
            if (!mensagemTexto) mensagemTexto = "Video enviado";
          } else if (media.mimetype.startsWith("audio/")) {
            audioUrl = await salvarMidia(media, msg.id.id, "audio");
            mediaType = "audio";
            if (!mensagemTexto) mensagemTexto = "Audio enviado";
          }
        }
      } catch (err) {}
    }

    if (!mensagemTexto && !imagemUrl && !videoUrl && !audioUrl) return;
    addPending({ nome, telefone, mensagem: mensagemTexto, foto, imagemUrl, videoUrl, audioUrl, mediaType, origem: "whatsapp" });
  } catch (error) {}
});

client.initialize();

// ============ ROTAS API ============
app.get("/api/state", (req, res) => res.json(state()));
app.get("/api/enquete", (req, res) => res.json({
  ativa: enqueteAtiva,
  pergunta: perguntaEnquete,
  opcoes: opcoesEnquete.map(op => ({ id: op.id, nome: op.nome, cor: op.cor, votos: op.votos, porcentagem: getPorcentagem(op.id) })),
  totalVotos: getTotalVotos(),
  vencedor: getVencedor()
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
  res.json({ ok: true });
});

// ============ ROTAS DA INTERFACE ============
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/ativar.html", (req, res) => res.sendFile(path.join(__dirname, "public", "ativar.html")));
app.get("/enquete.html", (req, res) => res.sendFile(path.join(__dirname, "public", "enquete.html")));
app.get("/vmix.html", (req, res) => res.sendFile(path.join(__dirname, "public", "vmix.html")));
app.get("/vmix-gt.html", (req, res) => res.sendFile(path.join(__dirname, "public", "vmix-gt.html")));

// ============ INICIAR ============
serverHttp.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`✅ WhatsApp + Enquete + Mídias`);
  console.log(`💡 Envie: coracao, pele, cerebro (case insensitive)`);
  
  if (!process.env.ELECTRON_RUN_AS_NODE) {
    setTimeout(() => {
      const { exec } = require('child_process');
      exec('start http://localhost:3000');
    }, 2000);
  }
});
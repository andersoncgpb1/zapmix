const express = require("express");
const http = require("http");
const cors = require("cors");
const QRCode = require("qrcode");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { exec } = require("child_process");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const DEFAULT_PHOTO_URL = `${PUBLIC_BASE_URL}/fotos/default.png`;

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(express.static("public"));

// ============ DIRETÓRIOS DE DADOS (FORA DO SNAPSHOT) ============
let userDataDir;
if (process.pkg) {
  // Executável gerado pelo pkg: usar pasta ao lado do executável
  userDataDir = path.join(path.dirname(process.execPath), "zapmix-data");
} else {
  // Desenvolvimento normal: usar a pasta do projeto
  userDataDir = __dirname;
}

// Garantir que a pasta de dados existe
if (!fs.existsSync(userDataDir)) {
  fs.mkdirSync(userDataDir, { recursive: true });
}

// Pastas internas
const fotosDir = path.join(userDataDir, "public", "fotos");
const imagensDir = path.join(userDataDir, "public", "imagens");
const videosDir = path.join(userDataDir, "public", "videos");
const audiosDir = path.join(userDataDir, "public", "audios");
const wwebjsAuthDir = path.join(userDataDir, ".wwebjs_auth");
const configFile = path.join(userDataDir, "enquete-config.json");

// Criar pastas de mídia
[fotosDir, imagensDir, videosDir, audiosDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Redirecionar a sessão do WhatsApp
process.env.PUPPETEER_CACHE_DIR = path.join(userDataDir, ".puppeteer-cache");

// ============ ENQUETE ============
let enqueteAtiva = true;
let perguntaEnquete = "O que você mais gosta?";
let opcoesEnquete = [
  { id: "coracao", nome: "Coracao", cor: "#ef4444", votos: 0, palavrasChave: ["coração", "coracao", "cardio", "heart"] },
  { id: "pele", nome: "Pele", cor: "#f59e0b", votos: 0, palavrasChave: ["pele", "derma", "skin"] },
  { id: "cerebro", nome: "Cerebro", cor: "#3b82f6", votos: 0, palavrasChave: ["cérebro", "cerebro", "neuro", "mente"] }
];

// Funções de persistência da enquete
function carregarConfiguracao() {
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, "utf8");
      const config = JSON.parse(data);
      perguntaEnquete = config.pergunta || perguntaEnquete;
      opcoesEnquete = config.opcoes || opcoesEnquete;
      console.log("📁 Configuração da enquete carregada.");
    }
  } catch (error) {
    console.log("Nenhuma configuração salva encontrada.");
  }
}
function salvarConfiguracao() {
  const config = { pergunta: perguntaEnquete, opcoes: opcoesEnquete };
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
  console.log("💾 Configuração da enquete salva.");
}

carregarConfiguracao();

// Demais funções (getTotalVotos, getPorcentagem, ...) mantidas iguais
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

// ============ FUNÇÕES AUXILIARES ============
function emptyCurrent() {
  return {
    indice: 0,
    id: "",
    nome: "",
    telefone: "",
    cidade: "",
    mensagem: "",
    horario: "",
    foto: DEFAULT_PHOTO_URL,
    imagemUrl: null,
    videoUrl: null,
    audioUrl: null,
    mediaType: null,
    status: "vazio"
  };
}
function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/[<>]/g, "").trim();
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
    telefone: item.telefone || "",
    cidade: item.cidade || "",
    mensagem: item.mensagem || "",
    horario: item.horario || "",
    foto: item.foto || DEFAULT_PHOTO_URL,
    imagemUrl: item.imagemUrl || null,
    videoUrl: item.videoUrl || null,
    audioUrl: item.audioUrl || null,
    mediaType: item.mediaType || null,
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
      opcoes: opcoesEnquete.map(op => ({
        ...op,
        porcentagem: getPorcentagem(op.id)
      })),
      totalVotos: getTotalVotos(),
      vencedor: getVencedor()
    }
  };
}
function emit() {
  io.emit("messages:update", state());
}

// ============ WHATSAPP CLIENT (com redirecionamento da pasta de autenticação) ============
let qrCodeDataUrl = null;
let whatsappStatus = "iniciando";
let pendingMessages = [];
let approvedMessages = [];
let currentMessage = null;

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "zapmix",
    dataPath: wwebjsAuthDir,
  }),
  puppeteer: {
    headless: true,
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
client.on("auth_failure", (msg) => {
  console.error("❌ Falha de autenticação:", msg);
  whatsappStatus = "falha_autenticacao";
  emit();
});
client.on("disconnected", (reason) => {
  console.log("⚠️ WhatsApp desconectado:", reason);
  whatsappStatus = "desconectado";
  emit();
});
client.on("message", async (msg) => {
  try {
    if (msg.from === "status@broadcast") return;
    const contact = await msg.getContact();
    const nome = contact.pushname || contact.name || contact.number || "Participante";
    const telefone = normalizePhone(msg.from);
    let mensagemTexto = msg.body || "";
    let foto = DEFAULT_PHOTO_URL;
    let imagemUrl = null, videoUrl = null, audioUrl = null, mediaType = null;
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
      } catch (err) { console.log("Erro ao baixar mídia:", err.message); }
    }
    if (!mensagemTexto && !imagemUrl && !videoUrl && !audioUrl) return;
    addPending({
      nome, telefone, mensagem: mensagemTexto, foto,
      imagemUrl, videoUrl, audioUrl, mediaType,
      origem: msg.from.endsWith("@g.us") ? "grupo" : "whatsapp"
    });
  } catch (error) { console.error("Erro ao processar mensagem:", error); }
});

client.initialize();

// ============ FUNÇÕES DE ARQUIVO E MÍDIA ============
async function baixarFotoPerfil(url, telefone) {
  try {
    if (!url || !telefone) return DEFAULT_PHOTO_URL;
    const filename = `${telefone}.jpg`;
    const filepath = path.join(fotosDir, filename);
    const response = await axios({ url, method: "GET", responseType: "arraybuffer", timeout: 12000 });
    fs.writeFileSync(filepath, response.data);
    return `${PUBLIC_BASE_URL}/fotos/${filename}`;
  } catch (error) { return DEFAULT_PHOTO_URL; }
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
    return `${PUBLIC_BASE_URL}${urlPath}/${filename}`;
  } catch (error) { return null; }
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
    telefone: cleanText(data.telefone || ""),
    cidade: cleanText(data.cidade || ""),
    mensagem: mensagemFinal,
    foto: data.foto || DEFAULT_PHOTO_URL,
    imagemUrl: data.imagemUrl || null,
    videoUrl: data.videoUrl || null,
    audioUrl: data.audioUrl || null,
    mediaType: data.mediaType || null,
    origem: data.origem || "whatsapp",
    status: "pendente",
    createdAt: new Date().toISOString(),
    horario: nowBR()
  };
  pendingMessages.unshift(item);
  pendingMessages = pendingMessages.slice(0, 200);
  emit();
  console.log(`📨 Nova mensagem: ${item.nome}`);
  return item;
}

// ============ ROTAS ============
app.get("/api/state", (req, res) => res.json(state()));
app.get("/api/enquete", (req, res) => {
  res.json({
    ativa: enqueteAtiva,
    pergunta: perguntaEnquete,
    opcoes: opcoesEnquete.map(op => ({ id: op.id, nome: op.nome, cor: op.cor, votos: op.votos, porcentagem: getPorcentagem(op.id) })),
    totalVotos: getTotalVotos(),
    vencedor: getVencedor()
  });
});
app.get("/api/enquete/pergunta", (req, res) => res.json({ pergunta: perguntaEnquete }));
app.post("/api/enquete/pergunta", (req, res) => {
  const { pergunta } = req.body;
  if (pergunta) { perguntaEnquete = pergunta; salvarConfiguracao(); emit(); res.json({ ok: true }); }
  else res.status(400).json({ error: "Pergunta inválida" });
});
app.post("/api/enquete/resetar", (req, res) => { resetarVotos(); salvarConfiguracao(); res.json({ ok: true }); });
app.post("/api/enquete/toggle", (req, res) => { enqueteAtiva = !enqueteAtiva; emit(); res.json({ ativa: enqueteAtiva }); });
app.post("/api/enquete/opcoes", (req, res) => {
  const { opcoes } = req.body;
  if (opcoes && Array.isArray(opcoes) && opcoes.length >= 2) {
    opcoesEnquete = opcoes.map(op => ({ ...op, votos: 0, palavrasChave: op.palavrasChave || [op.id] }));
    salvarConfiguracao();
    resetarVotos();
    emit();
    res.json({ ok: true });
  } else res.status(400).json({ error: "Mínimo de 2 opções" });
});
app.get("/datasource", (req, res) => res.json([toDatasourceItem(currentMessage, 0)]));
app.get("/datasource/approved", (req, res) => {
  const lista = approvedMessages.map((item, index) => toDatasourceItem(item, index));
  res.json(lista.length === 0 ? [emptyCurrent()] : lista);
});
app.post("/api/manual", (req, res) => {
  const item = addPending({ nome: req.body.nome, mensagem: req.body.mensagem, foto: req.body.foto || DEFAULT_PHOTO_URL, origem: "manual" });
  if (!item) return res.status(400).json({ error: "Mensagem vazia." });
  res.json({ ok: true, item });
});
app.post("/api/messages/:id/update", (req, res) => {
  const item = pendingMessages.find(m => m.id === req.params.id) ||
               approvedMessages.find(m => m.id === req.params.id) ||
               (currentMessage && currentMessage.id === req.params.id ? currentMessage : null);
  if (!item) return res.status(404).json({ error: "Mensagem não encontrada." });
  if (req.body.nome !== undefined) item.nome = cleanText(req.body.nome);
  if (req.body.mensagem !== undefined) item.mensagem = cleanText(req.body.mensagem);
  if (req.body.foto !== undefined) item.foto = cleanText(req.body.foto);
  if (req.body.imagemUrl !== undefined) item.imagemUrl = req.body.imagemUrl;
  if (req.body.videoUrl !== undefined) item.videoUrl = req.body.videoUrl;
  if (req.body.audioUrl !== undefined) item.audioUrl = req.body.audioUrl;
  if (currentMessage && currentMessage.id === item.id) currentMessage = { ...item, status: "no_ar" };
  emit();
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
app.post("/api/clear", (req, res) => { currentMessage = null; emit(); res.json({ ok: true }); });
app.post("/api/maintenance/clear-all", (req, res) => {
  const pendingCount = pendingMessages.length;
  const approvedCount = approvedMessages.length;
  pendingMessages = [];
  approvedMessages = [];
  currentMessage = null;
  emit();
  res.json({ ok: true, pendingDeleted: pendingCount, approvedDeleted: approvedCount });
});

// Verificar se está rodando dentro do Electron
const isElectron = process.versions.electron !== undefined;

// Iniciar servidor
const serverInstance = server.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`✅ WhatsApp + Enquete + Mídias`);
  console.log(`📁 Dados salvos em: ${userDataDir}`);
  console.log(`💡 Envie: coracao, pele, cerebro (case insensitive)`);
  
  // Só abrir navegador se NÃO for Electron
  if (!isElectron) {
    setTimeout(() => {
      const { exec } = require('child_process');
      exec('start http://localhost:3000');
    }, 2000);
  }
});

// Exportar para uso no Electron
if (isElectron) {
  module.exports = serverInstance;
}
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

const PORTA_INICIAL = 3000;
const PORTA_MAXIMA = 3010;
let PORTA_ATUAL = PORTA_INICIAL;

const userDataPath = process.env.APPDATA || path.join(require("os").homedir(), "AppData", "Roaming");
const zapmixDataPath = path.join(userDataPath, "ZapMix");
const authPath = path.join(zapmixDataPath, "auth");

if (!fs.existsSync(zapmixDataPath)) fs.mkdirSync(zapmixDataPath, { recursive: true });
if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

const fotosDir = path.join(zapmixDataPath, "fotos");
const imagensDir = path.join(zapmixDataPath, "imagens");
const videosDir = path.join(zapmixDataPath, "videos");
const audiosDir = path.join(zapmixDataPath, "audios");
const uploadsDir = path.join(zapmixDataPath, "uploads");

[fotosDir, imagensDir, videosDir, audiosDir, uploadsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

const publicPath = path.join(__dirname, "public");
if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `background_${Date.now()}${ext}`);
    }
});

const uploadMidia = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }
});

let backgroundAtual = { type: "default", imageUrl: null };
let qrCodeDataUrl = null;
let whatsappStatus = "iniciando";
let pendingMessages = [];
let approvedMessages = [];
let currentMessage = null;
let io = null;

let enqueteAtiva = true;
let perguntaEnquete = "O que você mais gosta?";
let opcoesEnquete = [
    { id: "coracao", nome: "Coração", cor: "#ef4444", votos: 0, palavrasChave: ["coração", "coracao", "cardio", "heart"] },
    { id: "pele", nome: "Pele", cor: "#f59e0b", votos: 0, palavrasChave: ["pele", "derma", "skin"] },
    { id: "cerebro", nome: "Cérebro", cor: "#3b82f6", votos: 0, palavrasChave: ["cérebro", "cerebro", "neuro", "mente"] }
];

function getTotalVotos() {
    return opcoesEnquete.reduce((total, op) => total + Number(op.votos || 0), 0);
}

function getPorcentagem(opcaoId) {
    const total = getTotalVotos();
    if (total === 0) return 0;

    const opcao = opcoesEnquete.find(op => op.id === opcaoId);
    if (!opcao) return 0;

    return Math.round((Number(opcao.votos || 0) / total) * 100);
}

function getVencedor() {
    if (getTotalVotos() === 0) return null;
    return [...opcoesEnquete].sort((a, b) => Number(b.votos || 0) - Number(a.votos || 0))[0];
}

function detectarVoto(mensagem) {
    if (!mensagem) return null;

    const msgLower = mensagem.toLowerCase().trim();

    for (const opcao of opcoesEnquete) {
        for (const palavra of opcao.palavrasChave || []) {
            if (msgLower.includes(String(palavra).toLowerCase())) {
                return opcao.id;
            }
        }
    }

    return null;
}

function contabilizarVoto(opcaoId) {
    const opcao = opcoesEnquete.find(op => op.id === opcaoId);

    if (opcao && enqueteAtiva) {
        opcao.votos = Number(opcao.votos || 0) + 1;
        emit();
        return true;
    }

    return false;
}

function emptyCurrent() {
    return {
        indice: 0,
        id: "",
        nome: "",
        mensagem: "",
        horario: "",
        foto: "/fotos/default.png",
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
    return new Date().toLocaleString("pt-BR", {
        timeZone: "America/Fortaleza",
        hour12: false
    });
}

function normalizePhone(from) {
    return String(from || "")
        .replace("@c.us", "")
        .replace("@g.us", "")
        .replace(/[^0-9]/g, "");
}

function toDatasourceItem(item, index = 0) {
    if (!item) return emptyCurrent();

    return {
        indice: index + 1,
        id: item.id || "",
        nome: item.nome || "",
        mensagem: item.mensagem || "",
        horario: item.horario || "",
        foto: item.foto || "/fotos/default.png",
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
    if (io) io.emit("messages:update", state());
}

async function baixarFotoPerfil(url, telefone) {
    try {
        if (!url || !telefone) return "/fotos/default.png";

        const filename = `${telefone}.jpg`;
        const filepath = path.join(fotosDir, filename);

        if (fs.existsSync(filepath)) return `/fotos/${filename}`;

        const response = await axios({
            url,
            method: "GET",
            responseType: "arraybuffer",
            timeout: 12000
        });

        fs.writeFileSync(filepath, response.data);

        return `/fotos/${filename}`;
    } catch {
        return "/fotos/default.png";
    }
}

async function salvarMidia(media, messageId, tipo) {
    try {
        if (!media || !media.data) {
            console.log("⚠️ Mídia vazia ou inválida");
            return null;
        }

        let ext = "bin";
        let dir = uploadsDir;
        let urlPath = "/uploads";

        if (tipo === "image") {
            ext = "jpg";
            if (media.mimetype && media.mimetype.includes("/")) {
                ext = media.mimetype.split("/")[1].split(";")[0] || "jpg";
            }
            dir = imagensDir;
            urlPath = "/imagens";
        }

        if (tipo === "video") {
            ext = "mp4";
            if (media.mimetype && media.mimetype.includes("/")) {
                ext = media.mimetype.split("/")[1].split(";")[0] || "mp4";
            }
            dir = videosDir;
            urlPath = "/videos";
        }

        if (tipo === "audio") {
            ext = "ogg";
            if (media.mimetype && media.mimetype.includes("/")) {
                ext = media.mimetype.split("/")[1].split(";")[0] || "ogg";
            }
            dir = audiosDir;
            urlPath = "/audios";
        }

        ext = ext
            .replace("jpeg", "jpg")
            .replace("mpeg", "mp3")
            .replace("x-matroska", "mkv")
            .replace("ogg; codecs=opus", "ogg");

        const safeId = String(messageId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, "");
        const filename = `${tipo}_${safeId}_${Date.now()}.${ext}`;
        const filepath = path.join(dir, filename);

        const buffer = Buffer.from(media.data, "base64");
        fs.writeFileSync(filepath, buffer);

        console.log(`✅ Mídia salva: ${filepath}`);

        return `${urlPath}/${filename}`;
    } catch (err) {
        console.error("❌ Erro ao salvar mídia:", err.message);
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
        foto: data.foto || "/fotos/default.png",
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

let client = null;

function encontrarNavegador() {
    const caminhos = [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
    ];

    for (const caminho of caminhos) {
        if (fs.existsSync(caminho)) {
            return caminho;
        }
    }

    return null;
}

function iniciarWhatsApp() {
    try {
        const executablePath = encontrarNavegador();

        if (!executablePath) {
            whatsappStatus = "erro";
            console.log("❌ Chrome ou Edge não encontrado no computador.");
            emit();
            return;
        }

        console.log("🌐 Navegador usado pelo WhatsApp:", executablePath);

        client = new Client({
            authStrategy: new LocalAuth({
                clientId: "zapmix",
                dataPath: authPath
            }),
            puppeteer: {
                headless: true,
                executablePath,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-extensions",
                    "--disable-background-timer-throttling",
                    "--disable-backgrounding-occluded-windows",
                    "--disable-renderer-backgrounding"
                ]
            }
        });

        client.on("qr", async qr => {
            whatsappStatus = "aguardando_qr";
            qrCodeDataUrl = await QRCode.toDataURL(qr);
            console.log("📱 QR Code gerado!");
            emit();
        });

        client.on("ready", () => {
            whatsappStatus = "conectado";
            qrCodeDataUrl = null;
            console.log("✅ WhatsApp conectado!");
            emit();
        });

        client.on("authenticated", () => {
            console.log("🔐 WhatsApp autenticado");
        });

        client.on("auth_failure", msg => {
            whatsappStatus = "erro";
            console.error("❌ Falha na autenticação:", msg);
            emit();
        });

        client.on("disconnected", reason => {
            whatsappStatus = "desconectado";
            console.log("⚠️ WhatsApp desconectado:", reason);
            emit();
        });

        client.on("message", async msg => {
            try {
                if (msg.from === "status@broadcast") return;

                const contact = await msg.getContact();
                const nome = contact.pushname || contact.name || contact.number || "Participante";
                const telefone = normalizePhone(msg.from);

                let mensagemTexto = msg.body || "";
                let foto = "/fotos/default.png";
                let imagemUrl = null;
                let videoUrl = null;
                let audioUrl = null;

                try {
                    const profilePicUrl = await contact.getProfilePicUrl();
                    if (profilePicUrl) {
                        foto = await baixarFotoPerfil(profilePicUrl, telefone);
                    }
                } catch {}

                if (msg.hasMedia) {
                    try {
                        const media = await msg.downloadMedia();

                        if (media) {
                            if (media.mimetype.startsWith("image/")) {
                                imagemUrl = await salvarMidia(media, msg.id.id, "image");
                                if (!mensagemTexto) mensagemTexto = "📷 Imagem";
                            }

                            if (media.mimetype.startsWith("video/")) {
                                videoUrl = await salvarMidia(media, msg.id.id, "video");
                                if (!mensagemTexto) mensagemTexto = "🎬 Vídeo";
                            }

                            if (media.mimetype.startsWith("audio/")) {
                                audioUrl = await salvarMidia(media, msg.id.id, "audio");
                                if (!mensagemTexto) mensagemTexto = "🎵 Áudio";
                            }
                        }
                    } catch (err) {
                        console.error("❌ Erro ao baixar mídia:", err.message);
                    }
                }

                if (!mensagemTexto && !imagemUrl && !videoUrl && !audioUrl) return;

                addPending({
                    nome,
                    telefone,
                    mensagem: mensagemTexto,
                    foto,
                    imagemUrl,
                    videoUrl,
                    audioUrl,
                    origem: "whatsapp"
                });
            } catch (err) {
                console.error("Erro mensagem:", err);
            }
        });

        client.initialize().catch(err => {
            whatsappStatus = "erro";
            console.error("❌ Erro ao iniciar WhatsApp:", err.message);
            emit();
        });

    } catch (err) {
        whatsappStatus = "erro";
        console.error("❌ Erro geral no WhatsApp:", err.message);
        emit();
    }
}

// WHATSAPP
app.post("/api/whatsapp/disconnect", async (req, res) => {
    console.log("🔌 Solicitado desconectar WhatsApp");

    if (client) {
        try {
            await client.destroy();

            if (fs.rmSync) {
                fs.rmSync(authPath, { recursive: true, force: true });
            }

            whatsappStatus = "desconectado";
            qrCodeDataUrl = null;
            emit();

            res.json({ ok: true, message: "WhatsApp desconectado" });

            setTimeout(() => {
                iniciarWhatsApp();
            }, 2000);
        } catch (err) {
            res.status(500).json({ ok: false, error: err.message });
        }
    } else {
        res.json({ ok: false, message: "Cliente não inicializado" });
    }
});

// STATE
app.get("/api/state", (req, res) => {
    res.json(state());
});

// ENQUETE
app.get("/api/enquete", (req, res) => {
    res.json({
        ativa: enqueteAtiva,
        pergunta: perguntaEnquete,
        opcoes: opcoesEnquete.map(op => ({
            ...op,
            porcentagem: getPorcentagem(op.id)
        })),
        totalVotos: getTotalVotos(),
        vencedor: getVencedor()
    });
});

app.get("/api/enquete/pergunta", (req, res) => {
    res.json({
        ok: true,
        pergunta: perguntaEnquete
    });
});

app.post("/api/enquete/pergunta", (req, res) => {
    const { pergunta } = req.body;

    if (!pergunta || !String(pergunta).trim()) {
        return res.status(400).json({ ok: false, error: "Pergunta inválida." });
    }

    perguntaEnquete = String(pergunta).trim();

    emit();

    res.json({ ok: true, pergunta: perguntaEnquete });
});

app.post("/api/enquete/opcoes", (req, res) => {
    const { opcoes } = req.body;

    if (!Array.isArray(opcoes) || opcoes.length < 2) {
        return res.status(400).json({
            ok: false,
            error: "Informe pelo menos duas opções."
        });
    }

    opcoesEnquete = opcoes.map((op, index) => ({
        id: op.id || `opcao${index + 1}`,
        nome: op.nome || `Opção ${index + 1}`,
        cor: op.cor || "#90d105",
        votos: Number(op.votos || 0),
        palavrasChave: Array.isArray(op.palavrasChave)
            ? op.palavrasChave.map(p => String(p).trim().toLowerCase()).filter(Boolean)
            : String(op.palavrasChave || "")
                .split(",")
                .map(p => p.trim().toLowerCase())
                .filter(Boolean)
    }));

    emit();

    res.json({ ok: true, opcoes: opcoesEnquete });
});

app.post("/api/enquete/resetar", (req, res) => {
    opcoesEnquete = opcoesEnquete.map(op => ({
        ...op,
        votos: 0
    }));

    emit();

    res.json({ ok: true, message: "Votos resetados." });
});

app.post("/api/enquete/toggle", (req, res) => {
    enqueteAtiva = !enqueteAtiva;

    emit();

    res.json({
        ok: true,
        ativa: enqueteAtiva
    });
});

// DATASOURCE
app.get("/datasource", (req, res) => {
    res.json([toDatasourceItem(currentMessage, 0)]);
});

app.get("/datasource/approved", (req, res) => {
    res.json(approvedMessages.map((item, i) => toDatasourceItem(item, i)));
});

// MENSAGENS
app.post("/api/manual", (req, res) => {
    const item = addPending({
        nome: req.body.nome,
        mensagem: req.body.mensagem,
        foto: req.body.foto,
        origem: "manual"
    });

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
    const item =
        approvedMessages.find(m => m.id === req.params.id) ||
        pendingMessages.find(m => m.id === req.params.id);

    if (!item) return res.status(404).json({ error: "Mensagem não encontrada." });

    currentMessage = { ...item, status: "no_ar" };

    emit();

    res.json({ ok: true, currentMessage });
});

app.post("/api/messages/:id/update", (req, res) => {
    const { nome, mensagem, foto, imagemUrl, videoUrl, audioUrl } = req.body;

    const updateItem = item => {
        if (item.id !== req.params.id) return item;

        return {
            ...item,
            nome: nome ?? item.nome,
            mensagem: mensagem ?? item.mensagem,
            foto: foto ?? item.foto,
            imagemUrl: imagemUrl || null,
            videoUrl: videoUrl || null,
            audioUrl: audioUrl || null
        };
    };

    pendingMessages = pendingMessages.map(updateItem);
    approvedMessages = approvedMessages.map(updateItem);

    if (currentMessage && currentMessage.id === req.params.id) {
        currentMessage = updateItem(currentMessage);
    }

    emit();

    res.json({ ok: true });
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

    res.json({ ok: true, message: "Todas as mensagens foram apagadas." });
});

// BACKGROUND
app.post("/api/background/upload", uploadMidia.single("background"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });

    res.json({ ok: true, url: `/uploads/${req.file.filename}` });
});

app.post("/api/background/set", (req, res) => {
    const { background, imageUrl } = req.body;

    if (background) {
        backgroundAtual = {
            type: background,
            imageUrl: imageUrl || null
        };

        emit();

        res.json({ ok: true, background });
    } else {
        res.status(400).json({ error: "Background inválido" });
    }
});

app.get("/api/background/get", (req, res) => {
    res.json(backgroundAtual);
});

// ROTAS DE MÍDIA
app.get("/fotos/:file", (req, res) => {
    const filePath = path.join(fotosDir, req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(filePath);
});

app.get("/imagens/:file", (req, res) => {
    const filePath = path.join(imagensDir, req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(filePath);
});

app.get("/videos/:file", (req, res) => {
    const filePath = path.join(videosDir, req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(filePath);
});

app.get("/audios/:file", (req, res) => {
    const filePath = path.join(audiosDir, req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(filePath);
});

app.get("/uploads/:file", (req, res) => {
    const filePath = path.join(uploadsDir, req.params.file);
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(filePath);
});

// PÁGINAS
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/enquete.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "enquete.html"));
});

app.get("/vmix.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "vmix.html"));
});

app.get("/vmix-gt.html", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "vmix-gt.html"));
});

// SERVIDOR
function iniciarServidor(porta) {
    const serverHttp = http.createServer(app);

    io = new Server(serverHttp, {
        cors: { origin: "*" }
    });

    serverHttp.listen(porta, () => {
        PORTA_ATUAL = porta;

        console.log(`\n🚀 Servidor rodando em http://localhost:${PORTA_ATUAL}`);
        console.log(`📁 Dados do usuário em: ${zapmixDataPath}`);

        console.log(`\n📡 Para usar no vMix:`);
        console.log(`   - Web Browser GT: http://localhost:${PORTA_ATUAL}/vmix-gt.html`);
        console.log(`   - Web Browser Enquete: http://localhost:${PORTA_ATUAL}/vmix.html`);
        console.log(`   - NDI: ZapMix - GT / ZapMix - Enquete`);

        const portaFilePath = path.join(zapmixDataPath, "porta.txt");
        fs.writeFileSync(portaFilePath, String(PORTA_ATUAL));
    });

    serverHttp.on("error", err => {
        if (err.code === "EADDRINUSE") {
            const nextPort = porta + 1;

            if (nextPort <= PORTA_MAXIMA) {
                console.log(`⚠️ Porta ${porta} ocupada, tentando ${nextPort}...`);
                iniciarServidor(nextPort);
            } else {
                console.error(`❌ Sem porta disponível de ${PORTA_INICIAL} a ${PORTA_MAXIMA}`);
                process.exit(1);
            }
        } else {
            console.error("Erro ao iniciar servidor:", err);
            process.exit(1);
        }
    });
}

function startZapMixServer() {
    iniciarServidor(PORTA_INICIAL);
    iniciarWhatsApp();
}

module.exports = {
    startZapMixServer,
    getPortaAtual: () => PORTA_ATUAL
};

if (require.main === module) {
    startZapMixServer();
}
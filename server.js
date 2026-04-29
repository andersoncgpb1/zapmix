const express = require("express");
const http = require("http");
const cors = require("cors");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const multer = require("multer");
const crypto = require("crypto");

const app = express();
const serverHttp = http.createServer(app);
const io = new Server(serverHttp, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(express.static("public"));

// Criar pastas
const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ============ SISTEMA DE LICENÇA ============
const licencasFile = path.join(__dirname, 'licencas.json');
let licencas = {};

function gerarChave() {
  const random = crypto.randomBytes(16).toString('hex').toUpperCase();
  return `${random.substring(0,4)}-${random.substring(4,8)}-${random.substring(8,12)}-${random.substring(12,16)}`;
}

function carregarLicencas() {
  try {
    if (fs.existsSync(licencasFile)) {
      const data = fs.readFileSync(licencasFile, 'utf8');
      licencas = JSON.parse(data);
      console.log(`📋 ${Object.keys(licencas).length} licenças carregadas`);
    } else {
      // Criar licenças de exemplo
      licencas = {
        "TEST-1234-ABCD-5678": {
          chave: "TEST-1234-ABCD-5678",
          titular: "Usuário Teste",
          email: "teste@exemplo.com",
          tipo: "premium",
          maxComputadores: 999,
          computadores: [],
          ativa: true,
          dataCriacao: new Date().toISOString(),
          expiracao: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
        }
      };
      fs.writeFileSync(licencasFile, JSON.stringify(licencas, null, 2));
      console.log("✅ Licença de teste criada");
    }
  } catch (error) {
    console.log("Erro ao carregar licenças:", error);
  }
}

function salvarLicencas() {
  fs.writeFileSync(licencasFile, JSON.stringify(licencas, null, 2));
}

function validarFormatoChave(chave) {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(chave);
}

// Rota para validar licença
app.post("/api/licenca/validar", (req, res) => {
  const { chave, computadorId } = req.body;
  console.log(`🔍 Validando chave: ${chave}`);
  
  if (!chave || !validarFormatoChave(chave)) {
    return res.json({ valida: false, error: "Formato de chave inválido" });
  }
  
  const licenca = licencas[chave];
  
  if (!licenca) {
    return res.json({ valida: false, error: "Chave não encontrada" });
  }
  
  if (!licenca.ativa) {
    return res.json({ valida: false, error: "Chave desativada" });
  }
  
  if (licenca.expiracao && new Date(licenca.expiracao) < new Date()) {
    return res.json({ valida: false, error: "Licença expirada" });
  }
  
  if (computadorId && (!licenca.computadores || !licenca.computadores.includes(computadorId))) {
    if (!licenca.computadores) licenca.computadores = [];
    if (!licenca.computadores.includes(computadorId)) {
      licenca.computadores.push(computadorId);
      salvarLicencas();
    }
  }
  
  res.json({
    valida: true,
    tipo: licenca.tipo,
    titular: licenca.titular,
    expiracao: licenca.expiracao
  });
});

// Rota para gerar licença
app.post("/api/gerar-licenca", (req, res) => {
  const { nome, email, codigo } = req.body;
  
  console.log(`📝 Gerar licença: ${nome} - ${email}`);
  
  if (!nome || !email) {
    return res.status(400).json({ erro: "Nome e e-mail são obrigatórios" });
  }
  
  // Verificar se e-mail já existe
  const emailExistente = Object.values(licencas).find(lic => lic.email === email);
  if (emailExistente) {
    return res.status(400).json({ 
      erro: "Este e-mail já possui uma licença ativa!",
      chaveExistente: emailExistente.chave
    });
  }
  
  const chave = gerarChave();
  const expiracao = new Date();
  expiracao.setDate(expiracao.getDate() + 365);
  
  licencas[chave] = {
    chave,
    titular: nome,
    email: email,
    tipo: "premium",
    maxComputadores: 1,
    computadores: [],
    ativa: true,
    dataCriacao: new Date().toISOString(),
    expiracao: expiracao.toISOString()
  };
  
  salvarLicencas();
  
  console.log(`✅ Licença gerada: ${chave}`);
  
  res.json({ sucesso: true, chave, titular: nome });
});

// Rota para verificar status
app.get("/api/licenca/status", (req, res) => {
  res.json({ ativada: false });
});

// Rota para listar licenças (admin)
app.get("/api/admin/licencas", (req, res) => {
  const listaLicencas = Object.values(licencas).map(lic => ({
    chave: lic.chave,
    titular: lic.titular,
    email: lic.email,
    ativa: lic.ativa,
    computadores: lic.computadores || [],
    dataCriacao: lic.dataCriacao,
    expiracao: lic.expiracao
  }));
  res.json({ licencas: listaLicencas });
});

// Rota para ações admin
app.post("/api/admin/licencas/acao", (req, res) => {
  const { acao, chave } = req.body;
  const licenca = licencas[chave];
  
  if (!licenca) {
    return res.status(404).json({ erro: "Licença não encontrada" });
  }
  
  if (acao === 'desativar') {
    licenca.ativa = false;
    salvarLicencas();
    res.json({ sucesso: true });
  } else if (acao === 'ativar') {
    licenca.ativa = true;
    salvarLicencas();
    res.json({ sucesso: true });
  } else if (acao === 'deletar') {
    delete licencas[chave];
    salvarLicencas();
    res.json({ sucesso: true });
  } else {
    res.status(400).json({ erro: "Ação inválida" });
  }
});

// Rota para enquete (exemplo)
app.get("/api/enquete", (req, res) => {
  res.json({
    ativa: true,
    pergunta: "O que você mais gosta?",
    opcoes: [],
    totalVotos: 0
  });
});

carregarLicencas();

// Iniciar servidor
serverHttp.listen(PORT, () => {
  console.log(`\n🚀 API rodando em http://localhost:${PORT}`);
  console.log(`📋 Licenças carregadas: ${Object.keys(licencas).length}`);
});
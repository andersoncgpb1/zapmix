const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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
      licencas = {
        "TEST-1234-ABCD-5678": {
          chave: "TEST-1234-ABCD-5678",
          titular: "Usuário Teste",
          email: "teste@exemplo.com",
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

carregarLicencas();

// ============ ROTAS ============

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
  
  res.json({
    valida: true,
    tipo: "premium",
    titular: licenca.titular,
    expiracao: licenca.expiracao
  });
});

app.post("/api/gerar-licenca", (req, res) => {
  const { nome, email, codigo } = req.body;
  
  console.log(`📝 Gerar licença: ${nome} - ${email}`);
  
  if (!nome || !email) {
    return res.status(400).json({ erro: "Nome e e-mail são obrigatórios" });
  }
  
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
    ativa: true,
    dataCriacao: new Date().toISOString(),
    expiracao: expiracao.toISOString()
  };
  
  salvarLicencas();
  
  console.log(`✅ Licença gerada: ${chave}`);
  
  res.json({ sucesso: true, chave, titular: nome });
});

app.get("/api/licenca/status", (req, res) => {
  res.json({ ativada: false });
});

app.get("/api/admin/licencas", (req, res) => {
  const listaLicencas = Object.values(licencas).map(lic => ({
    chave: lic.chave,
    titular: lic.titular,
    email: lic.email,
    ativa: lic.ativa,
    dataCriacao: lic.dataCriacao,
    expiracao: lic.expiracao
  }));
  res.json({ licencas: listaLicencas });
});

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

app.get("/api/enquete", (req, res) => {
  res.json({
    ativa: true,
    pergunta: "O que você mais gosta?",
    opcoes: [],
    totalVotos: 0
  });
});

// ============ INICIAR SERVIDOR (COM TRATAMENTO DE PORTA) ============
const PORTA_PADRAO = 3000;

function iniciarServidor(porta) {
	// Rota para a raiz
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>ZapMix API</title>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial; text-align: center; padding: 50px; background: #0f172a; color: white; }
        h1 { color: #90d105; }
        a { color: #90d105; }
      </style>
    </head>
    <body>
      <h1>🚀 ZapMix API</h1>
      <p>API de licenças rodando!</p>
      <p>📋 <a href="/api/admin/licencas">Ver licenças</a></p>
      <p>💡 Para usar o aplicativo completo, acesse a interface principal.</p>
    </body>
    </html>
  `);
});
  const server = app.listen(porta, () => {
    console.log(`\n🚀 API rodando em http://localhost:${porta}`);
    console.log(`📋 ${Object.keys(licencas).length} licenças carregadas`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ Porta ${porta} ocupada, tentando porta ${porta + 1}...`);
      iniciarServidor(porta + 1);
    } else {
      console.error('Erro:', err);
    }
  });
}

iniciarServidor(PORTA_PADRAO);
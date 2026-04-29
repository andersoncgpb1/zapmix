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
      // Criar licença de teste
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

// ============ ROTAS ============

// Validar licença (usada pelo aplicativo)
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

// Gerar nova licença (usado pelo site)
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
    ativa: true,
    dataCriacao: new Date().toISOString(),
    expiracao: expiracao.toISOString()
  };
  
  salvarLicencas();
  
  console.log(`✅ Licença gerada: ${chave}`);
  
  res.json({ sucesso: true, chave, titular: nome });
});

// Status da licença
app.get("/api/licenca/status", (req, res) => {
  res.json({ ativada: false });
});

// Listar licenças (admin)
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

// Ações admin
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

// Rota de enquete (opcional)
app.get("/api/enquete", (req, res) => {
  res.json({
    ativa: true,
    pergunta: "Enquete ZapMix",
    opcoes: [],
    totalVotos: 0
  });
});

carregarLicencas();

app.listen(PORT, () => {
  console.log(`\n🚀 API ZapMix rodando em https://localhost:${PORT}`);
  console.log(`📋 ${Object.keys(licencas).length} licenças carregadas`);
});
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

app.use(express.static("public"));

// ============ MIDDLEWARE DE PROTEÇÃO (TEM QUE VIR PRIMEIRO) ============
app.use((req, res, next) => {
  console.log(`🔒 Verificando: ${req.path}`);
  
  // Rotas públicas
  if (req.path === '/ativar.html' || 
      req.path === '/api/licenca/validar' || 
      req.path === '/api/licenca/salvar' ||
      req.path === '/api/licenca/status' ||
      req.path === '/favicon.ico' ||
      req.path.startsWith('/socket.io/')) {
    console.log(`✅ Rota pública: ${req.path}`);
    return next();
  }
  
  // Verificar licença
  const licencaFile = path.join(__dirname, 'licenca_ativa.json');
  
  if (!fs.existsSync(licencaFile)) {
    console.log(`❌ SEM LICENÇA! Redirecionando -> /ativar.html`);
    return res.redirect('/ativar.html');
  }
  
  console.log(`✅ Licença OK: ${req.path}`);
  next();
});

// ============ ROTAS ============
app.get("/", (req, res) => {
  console.log(`📄 Rota / chamada`);
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/ativar.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "ativar.html"));
});

app.get("/api/licenca/status", (req, res) => {
  const ativada = fs.existsSync(path.join(__dirname, 'licenca_ativa.json'));
  res.json({ ativada });
});

app.post("/api/licenca/validar", express.json(), (req, res) => {
  const { chave } = req.body;
  console.log(`🔑 Validando chave: ${chave}`);
  
  if (chave === "TEST-1234-ABCD-5678") {
    fs.writeFileSync(path.join(__dirname, 'licenca_ativa.json'), JSON.stringify({ chave, titular: "Teste" }));
    console.log(`✅ Licença ativada!`);
    return res.json({ valida: true, titular: "Teste" });
  }
  
  res.json({ valida: false, error: "Chave inválida" });
});

app.post("/api/licenca/salvar", express.json(), (req, res) => {
  const { chave, titular } = req.body;
  fs.writeFileSync(path.join(__dirname, 'licenca_ativa.json'), JSON.stringify({ chave, titular }));
  res.json({ ok: true });
});

// ============ INICIAR ============
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
  console.log(`🔒 Proteção de licença ATIVA!`);
  console.log(`💡 Chave de teste: TEST-1234-ABCD-5678\n`);
});
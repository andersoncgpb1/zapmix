const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const LICENCAS_FILE = path.join(__dirname, 'licencas.json');

function gerarChave() {
  const random = crypto.randomBytes(16).toString('hex').toUpperCase();
  return `${random.substring(0,4)}-${random.substring(4,8)}-${random.substring(8,12)}-${random.substring(12,16)}`;
}

function carregarLicencas() {
  try {
    if (fs.existsSync(LICENCAS_FILE)) {
      const data = fs.readFileSync(LICENCAS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {}
  return {};
}

function salvarLicencas(licencas) {
  fs.writeFileSync(LICENCAS_FILE, JSON.stringify(licencas, null, 2));
  console.log(`✅ Licenças salvas em ${LICENCAS_FILE}`);
}

function adicionarLicenca(titular, tipo = 'premium', maxComputadores = 1, diasValidade = 365) {
  const licencas = carregarLicencas();
  const chave = gerarChave();
  
  const expiracao = new Date();
  expiracao.setDate(expiracao.getDate() + diasValidade);
  
  licencas[chave] = {
    chave,
    titular,
    tipo,
    maxComputadores,
    computadores: [],
    ativa: true,
    dataCriacao: new Date().toISOString(),
    expiracao: expiracao.toISOString()
  };
  
  salvarLicencas(licencas);
  
  console.log(`\n✅ LICENÇA GERADA COM SUCESSO!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🔑 CHAVE: ${chave}`);
  console.log(`👤 TITULAR: ${titular}`);
  console.log(`📅 EXPIRAÇÃO: ${expiracao.toLocaleDateString('pt-BR')}`);
  console.log(`💻 MÁX. COMPUTADORES: ${maxComputadores}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  
  return chave;
}

function listarLicencas() {
  const licencas = carregarLicencas();
  const keys = Object.keys(licencas);
  
  if (keys.length === 0) {
    console.log('\n📭 Nenhuma licença encontrada.\n');
    return;
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('                                   LICENÇAS                                    ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  for (const [chave, lic] of Object.entries(licencas)) {
    const status = lic.ativa ? '🟢 ATIVA' : '🔴 INATIVA';
    const expiracao = new Date(lic.expiracao).toLocaleDateString('pt-BR');
    const computadores = `${lic.computadores?.length || 0}/${lic.maxComputadores}`;
    
    console.log(`\n🔑 ${chave}`);
    console.log(`   📌 Status: ${status}`);
    console.log(`   👤 Titular: ${lic.titular}`);
    console.log(`   📅 Expira: ${expiracao}`);
    console.log(`   💻 Computadores: ${computadores}`);
    console.log(`   🏷️ Tipo: ${lic.tipo}`);
    console.log('─────────────────────────────────────────────────────────────────────────────');
  }
  console.log('');
}

function desativarLicenca(chave) {
  const licencas = carregarLicencas();
  if (licencas[chave]) {
    licencas[chave].ativa = false;
    salvarLicencas(licencas);
    console.log(`\n✅ Licença ${chave} foi DESATIVADA\n`);
  } else {
    console.log(`\n❌ Licença ${chave} NÃO encontrada\n`);
  }
}

function ativarLicencaAdmin(chave) {
  const licencas = carregarLicencas();
  if (licencas[chave]) {
    licencas[chave].ativa = true;
    salvarLicencas(licencas);
    console.log(`\n✅ Licença ${chave} foi ATIVADA\n`);
  } else {
    console.log(`\n❌ Licença ${chave} NÃO encontrada\n`);
  }
}

function gerarLote(quantidade, diasValidade = 365) {
  console.log(`\n🔧 Gerando ${quantidade} licenças...\n`);
  for (let i = 0; i < quantidade; i++) {
    adicionarLicenca(`Cliente ${i+1}`, 'premium', 1, diasValidade);
  }
  console.log(`\n✅ ${quantidade} licenças geradas com sucesso!\n`);
}

function removerComputador(chave, computadorId) {
  const licencas = carregarLicencas();
  if (licencas[chave] && licencas[chave].computadores) {
    const index = licencas[chave].computadores.indexOf(computadorId);
    if (index !== -1) {
      licencas[chave].computadores.splice(index, 1);
      salvarLicencas(licencas);
      console.log(`\n✅ Computador ${computadorId} removido da licença ${chave}\n`);
      return true;
    }
  }
  console.log(`\n❌ Computador não encontrado na licença\n`);
  return false;
}

async function mostrarMenu() {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (query) => new Promise(resolve => readline.question(query, resolve));
  
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║              🔐 GERADOR DE LICENÇAS ZAPMIX 🔐                 ║
║                                                               ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║   1  │  Gerar nova licença                                   ║
║   2  │  Listar todas as licenças                             ║
║   3  │  Desativar licença                                    ║
║   4  │  Ativar licença                                       ║
║   5  │  Gerar lote de licenças (10)                          ║
║   6  │  Remover computador da licença                        ║
║   7  │  Sair                                                 ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
  
  const opcao = await question('👉 Escolha uma opção: ');
  
  switch(opcao) {
    case '1':
      const titular = await question('👤 Nome do titular: ');
      const tipo = await question('🏷️ Tipo (premium/basic): ') || 'premium';
      const maxPc = parseInt(await question('💻 Máximo de computadores (1-5): ') || '1');
      const dias = parseInt(await question('📅 Dias de validade (365 padrão): ') || '365');
      adicionarLicenca(titular, tipo, maxPc, dias);
      break;
      
    case '2':
      listarLicencas();
      break;
      
    case '3':
      const chaveDes = await question('🔑 Digite a chave para DESATIVAR: ');
      desativarLicenca(chaveDes.toUpperCase());
      break;
      
    case '4':
      const chaveAt = await question('🔑 Digite a chave para ATIVAR: ');
      ativarLicencaAdmin(chaveAt.toUpperCase());
      break;
      
    case '5':
      const qtd = parseInt(await question('📦 Quantidade de licenças: ') || '10');
      const diasLote = parseInt(await question('📅 Dias de validade: ') || '365');
      gerarLote(qtd, diasLote);
      break;
      
    case '6':
      const chaveRm = await question('🔑 Digite a chave: ');
      const pcId = await question('💻 Digite o ID do computador: ');
      removerComputador(chaveRm.toUpperCase(), pcId);
      break;
      
    case '7':
      console.log('\n👋 Saindo...\n');
      readline.close();
      process.exit(0);
      break;
      
    default:
      console.log('\n❌ Opção inválida! Tente novamente.\n');
  }
  
  readline.close();
  mostrarMenu();
}

if (process.argv[2] === '--gerar') {
  const titular = process.argv[3] || 'Cliente';
  adicionarLicenca(titular);
} else if (process.argv[2] === '--lote') {
  const qtd = parseInt(process.argv[3]) || 10;
  gerarLote(qtd);
} else if (process.argv[2] === '--listar') {
  listarLicencas();
} else {
  mostrarMenu();
}
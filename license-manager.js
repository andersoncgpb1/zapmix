const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

const API_URL = "https://zapmix-site.vercel.app/api/licenca/validar";

const licensePath = path.join(
  process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
  "ZapMix",
  "license.json"
);

function getMachineId() {
  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()?.[0]?.model || "",
    os.userInfo()?.username || ""
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function lerLicencaLocal() {
  try {
    if (!fs.existsSync(licensePath)) return null;
    return JSON.parse(fs.readFileSync(licensePath, "utf8"));
  } catch {
    return null;
  }
}

function salvarLicencaLocal(data) {
  const dir = path.dirname(licensePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(licensePath, JSON.stringify(data, null, 2), "utf8");
}

async function validarLicenca(chave) {
  try {
    const machineId = getMachineId();
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave, machineId })
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch {
      return { ok: false, status: "ERRO_SERVIDOR", error: "Servidor retornou resposta inválida: " + text.substring(0, 120) };
    }
    if (!response.ok || !data.ok) {
      return { ok: false, status: data.status || "INVALIDA", error: data.error || data.erro || "Licença inválida" };
    }
    const licenca = {
      chave, machineId, cliente: data.cliente, status: data.status,
      validade: data.validade, modulos: data.modulos || [], validadaEm: new Date().toISOString()
    };
    salvarLicencaLocal(licenca);
    return { ok: true, licenca };
  } catch (err) {
    return { ok: false, status: "SEM_CONEXAO", error: "Erro ao validar licença: " + err.message };
  }
}

async function verificarLicencaSalva() {
  const local = lerLicencaLocal();
  if (!local || !local.chave) {
    return { ok: false, status: "SEM_LICENCA", error: "Nenhuma licença salva" };
  }
  return validarLicenca(local.chave);
}

module.exports = { validarLicenca, verificarLicencaSalva, lerLicencaLocal, getMachineId };
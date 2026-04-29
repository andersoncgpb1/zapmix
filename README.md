# 🚀 ZapMix – WhatsApp + Enquete + vMix para TV

[![Licença](https://img.shields.io/badge/licença-MIT-green)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-41.3.0-blue)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-18+-brightgreen)](https://nodejs.org/)

**ZapMix** é uma aplicação desktop (Windows) que integra **WhatsApp Web**, **enquetes ao vivo** e **vMix** (software de produção de vídeo). Permite receber mensagens de WhatsApp, moderar conteúdos (aprovar, colocar no ar), exibir enquete em tempo real e enviar tudo para o vMix via URLs dinâmicas.

![Tela principal do ZapMix](screenshots/principal.png)

---

## ✨ Funcionalidades

- 📱 **Conexão com WhatsApp** via QR Code (sessão persistente).
- 🧹 **Moderação**: mensagens pendentes → aprovar → colocar no GT (vMix) sem misturar aprovação e exibição.
- 📊 **Enquete interativa** – votos por palavras‑chave no WhatsApp (ex: `coração`, `pele`, `cérebro`). Resultados em tempo real.
- 🖼️ **Suporte a mídias**: imagens, vídeos e áudios recebidos via WhatsApp.
- 🎛️ **Painel de controlo** com simulação manual de mensagens, edição de conteúdo, fundo personalizado para telas vMix.
- 🔗 **URLs prontas** para colocar no vMix:
  - GT principal: `http://localhost:3000/vmix-gt.html`
  - Enquete: `http://localhost:3000/vmix.html`
  - Aprovadas (histórico): `http://localhost:3000/datasource/approved`
- ⚙️ **Fallback de porta** (se 3000 ocupada, tenta até 3010).
- 📦 **Empacotamento** em um único `.exe` (via Electron) – roda em qualquer Windows sem instalar Node ou navegador.

---

## 📦 Como executar (desenvolvimento)

1. **Clone o repositório**
   ```bash
   git clone https://github.com/andersoncgpb1/zapmix.git
   cd zapmix

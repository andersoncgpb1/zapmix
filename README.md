# ZapMix - Gestão Inteligente para TV

[![Licença](https://img.shields.io/badge/licença-MIT-green)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-37.10.3-blue)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/Node-18+-brightgreen)](https://nodejs.org/)
[![Versão](https://img.shields.io/badge/versão-1.0.7-orange)](https://github.com/andersoncgpb1/zapmix/releases)

**ZapMix** é uma aplicação desktop para Windows criada para produção de TV e transmissões ao vivo. O sistema integra **WhatsApp Web**, **moderação de mensagens**, **exibição de mídias**, **enquetes ao vivo** e **sorteios**, com páginas prontas para usar no **vMix**, OBS ou qualquer software que aceite fonte Web Browser.

![Tela principal do ZapMix](screenshots/principal.png)

---

## Funcionalidades

### WhatsApp

- Conexão via QR Code com sessão persistente.
- Chromium integrado ao aplicativo, reduzindo dependência do navegador instalado no computador.
- Recebimento de mensagens, imagens, vídeos, áudios e figurinhas.
- Captura de nome, foto de perfil e dados disponíveis do participante.
- Reconexão e monitoramento do estado do WhatsApp.
- Status visível nas páginas principais: iniciando, aguardando QR, autenticado, conectado e desconectado.

### Moderação

- Fluxo de mensagens pendentes, aprovadas e mensagem em exibição.
- Aprovar, rejeitar, editar e colocar mensagens **NO AR**.
- Remover mensagem atual do exibidor.
- Limpar aprovadas, mensagens e arquivos locais.
- Simulação manual para testes sem depender de mensagens reais.
- Alertas e confirmações com design padronizado do ZapMix.

### Exibidor de Mensagens

- Página dedicada para uso no vMix/OBS via Web Browser.
- Layout otimizado para TV.
- Exibição de textos, imagens, vídeos, áudios e figurinhas.
- Ajuste visual para mídias verticais e horizontais.
- Background configurável por cor ou imagem.
- Tela cheia e exibição sem botões de interação no layout final.

### Enquete Interativa

- Votos por palavras-chave recebidas no WhatsApp.
- Pergunta, opções, cores e palavras-chave configuráveis.
- Pré-visualização no painel de controle.
- Exibidor de enquete em tempo real.
- Resultado para TV sem exibir quantidade de votos, mantendo a tela mais limpa.

### Sorteio ao Vivo

- Sistema de sorteio integrado às mensagens recebidas.
- Participantes capturados automaticamente pelo WhatsApp.
- Adição manual de participantes.
- Remoção individual, limpeza de lista e histórico.
- Exibidor dedicado para sorteio em transmissão.

### Interface do Aplicativo

- Menu do Electron em português.
- Atalhos no menu para Moderação, Enquete, Sorteio, Configurações e Exibidores.
- Janela **Sobre o ZapMix** com versão instalada, desenvolvedor e verificação de atualizações.
- Alertas modernos em todas as páginas principais.
- Nome do desenvolvedor nas páginas internas, exceto exibidores.

### Atualizações

- Auto-updater via GitHub Releases.
- Arquivo `latest.yml` gerado junto ao instalador.
- Verificação manual de atualizações pelo menu **Ajuda > Verificar atualizações**.

---

## URLs para vMix/OBS

Use estas páginas como fonte **Web Browser**:

- Exibidor de Mensagens: `http://localhost:3000/exibidor.html`
- Exibidor de Enquete: `http://localhost:3000/enquete-exibidor.html`
- Exibidor de Sorteio: `http://localhost:3000/sorteio-exibidor.html`

Páginas internas do painel:

- Moderação: `http://localhost:3000/`
- Configurações: `http://localhost:3000/config.html`
- Enquete: `http://localhost:3000/enquete.html`
- Sorteio: `http://localhost:3000/sorteio.html`

> A partir da versão 1.0.7, o NDI foi removido do aplicativo para evitar engasgos de áudio/vídeo e deixar a operação mais estável usando fontes Web Browser.

---

## Versão atual

**ZapMix 1.0.7**

Principais destaques:

- Sistema de sorteio ao vivo.
- Exibidores otimizados para TV.
- Melhorias no WhatsApp e na captura de mídias.
- Menu em português.
- Alertas redesenhados.
- Remoção do NDI para maior estabilidade.

---

## Licença

MIT

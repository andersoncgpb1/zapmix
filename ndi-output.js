const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const NDI_WIDTH = 1920;
const NDI_HEIGHT = 1080;
const FPS = 10;

let ffmpegGT = null;
let ffmpegEnquete = null;
let interval = null;
let ativo = false;
let ultimoAudioUrl = null;
let portaServidor = 3000;

const zapmixDataPath = path.join(process.env.APPDATA, 'ZapMix');

function resolverArquivoLocal(url) {
    if (!url) return null;

    const clean = String(url).split('?')[0];

    if (clean.startsWith('/videos/')) {
        return path.join(zapmixDataPath, 'videos', path.basename(clean));
    }

    if (clean.startsWith('/audios/')) {
        return path.join(zapmixDataPath, 'audios', path.basename(clean));
    }

    return null;
}

function buscarEstado() {
    return new Promise(resolve => {
        const req = http.get(`http://localhost:${portaServidor}/api/state`, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(null);
                }
            });
        });

        req.on('error', () => resolve(null));
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(null);
        });
    });
}

function obterAudioAtual(state) {
    const current = state && state.currentMessage ? state.currentMessage : null;
    if (!current) return null;

    if (current.videoUrl) return current.videoUrl;
    if (current.audioUrl) return current.audioUrl;

    return null;
}

function criarProcessoNDI(nomeFonte, comAudio = false, audioUrl = null) {
    const ffmpegPath = path.join(__dirname, 'bin', 'ffmpeg.exe');

    if (!fs.existsSync(ffmpegPath)) {
        console.log('⚠️ FFmpeg não encontrado:', ffmpegPath);
        return null;
    }

    const args = [
        '-hide_banner',
        '-loglevel', 'warning',

        '-thread_queue_size', '1024',
        '-f', 'rawvideo',
        '-pix_fmt', 'bgra',
        '-s', `${NDI_WIDTH}x${NDI_HEIGHT}`,
        '-r', String(FPS),
        '-i', '-'
    ];

    if (comAudio) {
        const arquivoAudio = resolverArquivoLocal(audioUrl);

        if (arquivoAudio && fs.existsSync(arquivoAudio)) {
            args.push(
                '-thread_queue_size', '1024',
                '-i', arquivoAudio
            );
        } else {
            args.push(
                '-f', 'lavfi',
                '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000'
            );
        }

        args.push(
            '-map', '0:v:0',
            '-map', '1:a:0?',
            '-c:a', 'pcm_s16le',
            '-ar', '48000',
            '-ac', '2',
            '-af', 'aresample=async=1:first_pts=0'
        );
    }

    args.push(
        '-f', 'libndi_newtek',
        nomeFonte
    );

    const proc = spawn(ffmpegPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
    });

    proc.stdin.on('error', err => {
        console.log(`⚠️ ${nomeFonte}: stdin fechado (${err.code})`);
    });

    proc.stderr.on('data', data => {
        const msg = data.toString();
        if (!msg.includes('frame=')) {
            console.log(`[NDI ${nomeFonte}]: ${msg}`);
        }
    });

    proc.on('close', code => {
        console.log(`NDI ${nomeFonte} encerrado. Código: ${code}`);
    });

    return proc;
}

function pararProcesso(proc) {
    if (proc && !proc.killed) {
        try {
            if (proc.stdin && !proc.stdin.destroyed) proc.stdin.end();
            proc.kill();
        } catch {}
    }
}

function reiniciarGT(audioUrl) {
    pararProcesso(ffmpegGT);

    ffmpegGT = criarProcessoNDI('ZapMix - GT', true, audioUrl);
    ultimoAudioUrl = audioUrl || null;

    if (audioUrl) {
        console.log(`🔊 Áudio NDI GT ativo: ${audioUrl}`);
    } else {
        console.log('🔇 NDI GT com áudio silencioso');
    }
}

function processoValido(proc) {
    return proc &&
        !proc.killed &&
        proc.exitCode === null &&
        proc.stdin &&
        !proc.stdin.destroyed &&
        proc.stdin.writable;
}

async function capturarFrame(win) {
    if (!win || win.isDestroyed()) return null;

    const image = await win.webContents.capturePage();

    return image.resize({
        width: NDI_WIDTH,
        height: NDI_HEIGHT
    }).toBitmap();
}

function escreverFrame(proc, buffer) {
    if (!processoValido(proc) || !buffer) return;

    try {
        proc.stdin.write(buffer);
    } catch (err) {
        console.log('Erro ao escrever frame:', err.message);
    }
}

function iniciarNDI({ gtWindow, enqueteWindow, porta }) {
    if (ativo) return;

    portaServidor = porta || 3000;

    ffmpegGT = criarProcessoNDI('ZapMix - GT', true, null);
    ffmpegEnquete = criarProcessoNDI('ZapMix - Enquete', false, null);

    if (!ffmpegGT || !ffmpegEnquete) {
        console.log('NDI não iniciado.');
        return;
    }

    ativo = true;

    let contadorEstado = 0;

    interval = setInterval(async () => {
        if (!ativo) return;

        try {
            contadorEstado++;

            if (contadorEstado >= FPS) {
                contadorEstado = 0;

                const state = await buscarEstado();
                const audioAtual = obterAudioAtual(state);

                if (audioAtual !== ultimoAudioUrl) {
                    reiniciarGT(audioAtual);
                }
            }

            const frameGT = await capturarFrame(gtWindow);
            const frameEnquete = await capturarFrame(enqueteWindow);

            escreverFrame(ffmpegGT, frameGT);
            escreverFrame(ffmpegEnquete, frameEnquete);
        } catch (err) {
            console.log('Erro no NDI:', err.message);
        }
    }, Math.round(1000 / FPS));

    console.log('🎬 NDI iniciado');
    console.log('📡 Fontes NDI: ZapMix - GT / ZapMix - Enquete');
}

function pararNDI() {
    ativo = false;

    if (interval) {
        clearInterval(interval);
        interval = null;
    }

    pararProcesso(ffmpegGT);
    pararProcesso(ffmpegEnquete);

    ffmpegGT = null;
    ffmpegEnquete = null;
    ultimoAudioUrl = null;

    console.log('🔌 NDI desligado');
}

module.exports = {
    iniciarNDI,
    pararNDI
};
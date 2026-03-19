// ---------------------------------------------------------------
// NEXXT EFFECTS � DEFENSIVE UTILITIES
// Todas as intera��es com DOM, Node e ExtendScript passam por aqui.
// Nenhuma falha individual pode derrubar outro m�dulo.
// ---------------------------------------------------------------

// -- NEXXT GLOBAL NAMESPACE (required by heygen_studio.js) ------
// INJEÇÃO GLOBAL DE PATH NODE.JS: garante FFmpeg e ferramentas
// NEXXT: resolve o caminho real do plugin
var PLUGIN_TOOLS_DIR = '';
var _IS_WIN = process.platform === 'win32';
var _EXE = _IS_WIN ? '.exe' : '';
try {
    const _path = require('path');
    // Abordagem robusta para CEP macOS e Windows
    // window.location.pathname retém %20, precisamos de decodeURI
    let _filePath = decodeURI(window.location.pathname);
    if (_IS_WIN && _filePath.startsWith('/')) {
        _filePath = _filePath.substring(1); // remove '/' inicial no windows (/C:/...)
    }
    const _pluginRoot = _path.dirname(_filePath);
    PLUGIN_TOOLS_DIR = _path.join(_pluginRoot, 'tools');
    const _pathSep = _IS_WIN ? ';' : ':';
    if (!process.env.PATH.includes(PLUGIN_TOOLS_DIR)) {
        process.env.PATH = PLUGIN_TOOLS_DIR + _pathSep + process.env.PATH;
    }
    // macOS: Adobe CEP não herda o PATH completo do shell — injeta caminhos do Homebrew manualmente
    if (!_IS_WIN) {
        const _macPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
        _macPaths.forEach(function(p) {
            if (!process.env.PATH.includes(p)) {
                process.env.PATH = process.env.PATH + _pathSep + p;
            }
        });
        
        // Auto-fix Apple Quarantine for bundled binaries
        try {
            const _cp = require('child_process');
            _cp.exec('xattr -rd com.apple.quarantine "' + PLUGIN_TOOLS_DIR + '"', (err) => {
                if (!err) console.log('[Nexxt] Quarentena removida com sucesso!');
            });
            _cp.exec('chmod -R +x "' + PLUGIN_TOOLS_DIR + '"');
        } catch(e) {
            console.error('[Nexxt] Falha no auto-unquarantine:', e);
        }
    }
    console.log('[Nexxt] Tools dir resolvido:', PLUGIN_TOOLS_DIR);
} catch (e) {
    console.error('[Nexxt] Falha ao injetar tools no PATH:', e);
}
window.Nexxt = window.Nexxt || {
    Utils: {
        safeEl: function (id) {
            try { return document.getElementById(id) || null; }
            catch (e) { return null; }
        },
        safeEval: function (script, cb) {
            try {
                const csi = window.csInterface || (typeof CSInterface !== 'undefined' ? new CSInterface() : null);
                if (csi) csi.evalScript(script, cb || function () { });
            } catch (e) { console.error('[Nexxt.safeEval]', e); }
        },
        notify: function (msg, type) {
            if (typeof notify === 'function') notify(msg, type);
            else console.log('[Nexxt.notify]', type, msg);
        }
    }
};

/**
 * Retorna o elemento DOM pelo ID de forma segura.
 * Se n�o existir, retorna null sem jogar erro.
 */
function safeEl(id) {
    try { return document.getElementById(id) || null; }
    catch (e) { console.warn('[safeEl] Elemento n�o encontrado:', id, e); return null; }
}

/**
 * Faz require() de um m�dulo Node de forma segura.
 * Se o m�dulo n�o existir, notifica e retorna null.
 */
function safeRequire(mod) {
    try { return require(mod); }
    catch (e) { console.error('[safeRequire] M�dulo n�o carregado:', mod, e); return null; }
}

/**
 * Executa um script ExtendScript via CSInterface de forma segura.
 * O callback sempre verifica se a resposta � nula ou prefixada com ERRO.
 * @param {string} script - O script ExtendScript a executar
 * @param {function} onSuccess - Callback com a resposta limpa
 * @param {function} [onError]  - Callback de erro (opcional)
 */
function safeEval(script, onSuccess, onError) {
    try {
        if (!csInterface) { throw new Error('CSInterface n�o inicializada'); }
        csInterface.evalScript(script, (res) => {
            try {
                if (res === null || res === undefined || res === 'undefined') {
                    const msg = 'Resposta vazia do ExtendScript.';
                    if (onError) onError(msg); else console.warn('[safeEval]', msg);
                    return;
                }
                if (typeof res === 'string' && res.indexOf('ERRO') === 0) {
                    const msg = res.replace(/^ERRO\|?/, '');
                    if (onError) onError(msg); else notify(msg, 'error');
                    return;
                }
                if (onSuccess) onSuccess(res);
            } catch (cbErr) {
                console.error('[safeEval] Erro no callback:', cbErr);
                if (onError) onError(cbErr.message);
            }
        });
    } catch (e) {
        console.error('[safeEval] Falha ao chamar evalScript:', e);
        if (onError) onError(e.message);
    }
}

// ---------------------------------------------------------------
// VARI�VEIS GLOBAIS
// ---------------------------------------------------------------
// - Vari�veis globais carregadas do localStorage (Global Settings Store)
let userSavePath = localStorage.getItem("nexxt_save_path");
let userNSFWPath = localStorage.getItem("nexxt_nsfw_path");
let heygenKey = localStorage.getItem("heygen_api_key");
let heygenCurrentPath = [{ id: null, name: 'Galeria' }];
let heygenAllVideos = [];
let heygenCurrentFilter = 'all';
let groqKey = localStorage.getItem('groq_api_key') || '';
let replicateKey = "REPLICATE_API_KEY_HERE";

// Toggle States
let autoBleepNSFW = localStorage.getItem("auto_bleep_nsfw") === "true";
let autoBleepCustom = localStorage.getItem("auto_bleep_custom") === "true";

// ---------------------------------------------------------------
// SISTEMA DE NOTIFICAÇÃO DE ATUALIZAÇÃO
// ---------------------------------------------------------------
// Altere NEXXT_VERSION e NEXXT_CHANGELOG a cada release.
// O modal aparece automaticamente quando o usuário abre o plugin
// pela primeira vez após uma atualização.
// ---------------------------------------------------------------
const NEXXT_VERSION = "2.0.7";
const NEXXT_CHANGELOG = [
    "Nova correção CRÍTICA para a Ferramenta de VSL Detector (Correção do corte do texto aos 30 segundos)",
    "Nova correção CRÍTICA da Ferramenta de VSL Detector (Modelo de Visão restaurado na nuvem)",
    "Nova correção CRÍTICA para usuários de Mac (Erro: FFmpeg is not trusted/damaged)",
    "Remoção automática da quarentena da Apple nos binários instalados via ZXP",
    "VSL Detector: marcadores do Premiere criados automaticamente em cada produto detectado",
    "VSL Detector: batching de 8 frames por chamada - rate limit praticamente impossivel",
    "VSL Detector: thumbnail do frame exibido nos cards de resultado",
    "VSL Detector: clique no resultado move o playhead do Premiere para o instante exato",
    "Fix: Isolar Voz e Isolar Musica voltaram a funcionar",
    "Fix: audio isolado sempre vai para a primeira track completamente vazia (sem sobrepor)",
    "Fix: importacao de audio usa overwrite (nao mais ripple insert que empurrava conteudo)"
];

function mostrarModalAtualizacao() {
    try { if (localStorage.getItem('nexxt_last_version') === NEXXT_VERSION) return; } catch (e) { }

    // Overlay
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.3s ease;pointer-events:auto;';

    // Card
    var card = document.createElement('div');
    card.style.cssText = 'background:linear-gradient(135deg,rgba(30,30,40,0.97),rgba(20,20,30,0.99));border:1px solid rgba(99,102,241,0.3);border-radius:16px;padding:32px;max-width:400px;width:90%;box-shadow:0 25px 60px rgba(0,0,0,0.5);transform:translateY(20px);transition:transform 0.3s ease;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;pointer-events:auto;';

    // Header
    var header = document.createElement('div');
    header.style.cssText = 'text-align:center;margin-bottom:20px;';
    header.innerHTML = '<div style="font-size:40px;margin-bottom:8px;"></div><h2 style="margin:0;font-size:18px;font-weight:700;color:#fff;">Nexxt Effects Atualizado!</h2><div style="margin-top:6px;font-size:12px;color:rgba(99,102,241,0.9);font-weight:600;letter-spacing:0.5px;">VERSÃO ' + NEXXT_VERSION + '</div>';

    // Changelog list
    var listBox = document.createElement('div');
    listBox.style.cssText = 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:12px 16px;margin-bottom:24px;max-height:200px;overflow-y:auto;';
    var listTitle = document.createElement('div');
    listTitle.style.cssText = 'font-size:11px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.35);margin-bottom:8px;font-weight:700;';
    listTitle.textContent = 'O que há de novo';
    listBox.appendChild(listTitle);
    NEXXT_CHANGELOG.forEach(function (item) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
        row.innerHTML = '<span style="flex-shrink:0;"></span><span style="font-size:12px;color:rgba(255,255,255,0.85);line-height:1.5;">' + item + '</span>';
        listBox.appendChild(row);
    });

    // Dismiss button criado via createElement, evento vinculado diretamente
    var btn = document.createElement('button');
    btn.textContent = 'Entendi!';
    btn.style.cssText = 'width:100%;padding:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:0.3px;pointer-events:auto;';

    var dismissed = false;
    function dismiss() {
        if (dismissed) return;
        dismissed = true;
        try { localStorage.setItem('nexxt_last_version', NEXXT_VERSION); } catch (e) { }
        overlay.style.opacity = '0';
        overlay.style.pointerEvents = 'none';
        setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
    }

    btn.addEventListener('click', dismiss);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss(); });

    card.appendChild(header);
    card.appendChild(listBox);
    card.appendChild(btn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(function () {
        overlay.style.opacity = '1';
        card.style.transform = 'translateY(0)';
    });
}



// ---------------------------------------------------------------
// SISTEMA DE AUTO-UPDATE V2 (VIA GITHUB RELEASES)
// ---------------------------------------------------------------
let _verificacaoEmAndamento = false;
async function verificarAtualizacao() {
    if (_verificacaoEmAndamento) return;
    _verificacaoEmAndamento = true;
    try {
        // Usa fetch nativo do Chromium (CEF) não precisa de node-fetch
        const urlJSON = "https://raw.githubusercontent.com/editnexxt-code/Releases/main/version.json";
        const response = await fetch(urlJSON + "?t=" + Date.now());
        const remoteInfo = await response.json();

        // ── DETECÇÃO DE PLATAFORMA ────────────────────────────────────────────────
        // O version.json remoto usa campos por OS:
        // { "mac": {"version":"2.0.3","url":"...","changelog":[]},
        //   "windows": {"version":"2.0.5","url":"...","changelog":[]} }
        // Fallback: campo genérico "version" (formato legado)
        const _isMac = (typeof process !== 'undefined' && process.platform === 'darwin');
        const _platformKey = _isMac ? 'mac' : 'windows';
        const platformInfo = remoteInfo[_platformKey] || remoteInfo;
        const versionRemota = (platformInfo.version || remoteInfo.version || '0.0.0');
        const infoFinal = {
            version:   versionRemota,
            url:       platformInfo.url       || remoteInfo.url       || '',
            changelog: platformInfo.changelog || remoteInfo.changelog || []
        };

        // Limpa as versões para comparar (remove 'v' etc e converte pra array numérico)
        const vLocal  = NEXXT_VERSION.replace(/[^0-9.]/g, '').split('.').map(Number);
        const vRemota = versionRemota.replace(/[^0-9.]/g, '').split('.').map(Number);

        let hasUpdate = false;
        for (let i = 0; i < Math.max(vLocal.length, vRemota.length); i++) {
            const loc = vLocal[i] || 0;
            const rem = vRemota[i] || 0;
            if (rem > loc) { hasUpdate = true; break; }
            if (rem < loc) { break; }
        }

        if (hasUpdate) {
            try { if (localStorage.getItem('nexxt_update_snoozed') === infoFinal.version) { mostrarModalAtualizacao(); return; } } catch (e) { }
            mostrarAvisoNovaVersao(infoFinal);
        } else {
            // Se não tem att nova, mostra o modal do nosso changelog local se ele for novo para o user
            mostrarModalAtualizacao();
        }

    } catch (err) {
        _verificacaoEmAndamento = false;
        console.warn("[Auto-Update] Erro ao checar versão:", err);
        mostrarModalAtualizacao(); // Fallback para mostrar modal local se tiver offline
    }
}

function mostrarAvisoNovaVersao(remoteInfo) {
    const overlay = document.createElement('div');
    overlay.id = 'nexxt-new-version-overlay';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:999999',
        'background:rgba(0,0,0,0.85)', 'backdrop-filter:blur(10px)',
        'display:flex', 'align-items:center', 'justify-content:center',
        'opacity:0', 'transition:opacity 0.3s ease'
    ].join(';');

    const changelogHTML = remoteInfo.changelog.map(item =>
        `<div style="display:flex; align-items:flex-start; gap:8px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="flex-shrink:0; font-size:14px;">${item.charAt(0) === '' || item.charAt(0) === '' || item.charAt(0) === '' ? '' : ''}</span>
            <span style="font-size:12px; color:rgba(255,255,255,0.9); line-height:1.5;">${item}</span>
        </div>`
    ).join('');

    overlay.innerHTML = `
        <div style="
            background: linear-gradient(135deg, rgba(20,20,30,0.95), rgba(10,10,20,0.98));
            border: 1px solid rgba(220, 38, 38, 0.4);
            border-radius: 16px;
            padding: 32px;
            max-width: 420px;
            width: 90%;
            box-shadow: 0 25px 60px rgba(0,0,0,0.6), 0 0 40px rgba(220, 38, 38, 0.2);
            transform: translateY(20px);
            transition: transform 0.3s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            position: relative;
            overflow: hidden;
        ">
            <!-- Efeito de brilho de fundo -->
            <div style="position:absolute; top:-50px; left:50%; width:150px; height:150px; background:rgba(220, 38, 38, 0.3); filter:blur(50px); transform:translateX(-50%); pointer-events:none;"></div>

            <div style="text-align:center; margin-bottom:20px; position:relative; z-index:2;">
                <div style="font-size:40px; margin-bottom:8px; animation: pulse 2s infinite;"></div>
                <h2 style="margin:0; font-size:19px; font-weight:800; color:#fff; letter-spacing:-0.3px;">Nova Versão Disponível!</h2>
                <div style="margin-top:6px; font-size:13px; color:rgba(248, 113, 113, 0.9); font-weight:700; letter-spacing:0.5px;">A VERSÃO ${remoteInfo.version} CHEGOU</div>
            </div>

            <div style="
                background: rgba(255,255,255,0.02);
                border: 1px solid rgba(255,255,255,0.05);
                border-radius: 10px;
                padding: 12px 16px;
                margin-bottom: 24px;
                max-height: 200px;
                overflow-y: auto;
                position:relative; z-index:2;
            ">
                <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:rgba(255,255,255,0.4); margin-bottom:8px; font-weight:700;">Novidades Exclusivas</div>
                ${changelogHTML}
            </div>

            <div style="display:flex; gap:12px; position:relative; z-index:2;">
                <button id="btn-update-later" style="
                    flex: 1;
                    padding: 12px;
                    background: rgba(255,255,255,0.05);
                    border: 1px solid rgba(255,255,255,0.1);
                    border-radius: 10px;
                    color: rgba(255,255,255,0.7);
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                ">Depois</button>
                <button id="btn-update-download" style="
                    flex: 2;
                    padding: 12px;
                    background: linear-gradient(135deg, #ef4444, #b91c1c);
                    border: none;
                    border-radius: 10px;
                    color: #fff;
                    font-size: 13px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    letter-spacing: 0.3px;
                    box-shadow: 0 4px 15px rgba(220, 38, 38, 0.4);
                ">Baixar Atualização ZXP</button>
            </div>
            
            <style>
                @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }
                #btn-update-later:hover { background: rgba(255,255,255,0.1) !important; color:#fff !important; }
                #btn-update-download:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(220, 38, 38, 0.6) !important; }
                #btn-update-download:active { transform: translateY(1px); }
            </style>
        </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        overlay.querySelector('div').style.transform = 'translateY(0)';
    });

    const fechar = () => {
        try { localStorage.setItem('nexxt_update_snoozed', remoteInfo.version); } catch (e) { }
        overlay.style.opacity = '0';
        setTimeout(() => { try { overlay.remove(); } catch (e) { } }, 300);
        document.removeEventListener('keydown', escHandler);
    };

    // Fechar clicando no fundo (fora do card)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });

    // Fechar com Escape
    const escHandler = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', escHandler);

    // Usar overlay.querySelector para não depender de IDs únicos no DOM
    overlay.querySelector('#btn-update-later').onclick = fechar;

    overlay.querySelector('#btn-update-download').onclick = () => {
        try {
            if (typeof csInterface !== 'undefined' && csInterface && csInterface.openURLInDefaultBrowser) {
                csInterface.openURLInDefaultBrowser(remoteInfo.url);
            } else {
                var _cp = require('child_process');
                if (process.platform === 'darwin') {
                    _cp.exec('open "' + remoteInfo.url + '"');
                } else {
                    _cp.exec('start "" "' + remoteInfo.url + '"');
                }
            }
        } catch (e) {
            window.open(remoteInfo.url, '_blank');
        }
    };
}


window.onload = () => {
    try {
        const vb = document.getElementById('nexxt-version-badge');
        if (vb) vb.textContent = 'v' + NEXXT_VERSION;
    } catch (e) { }

    try {
        const el = safeEl('campoBusca');
        if (el) el.focus();
    } catch (e) { console.warn('[onload] focus:', e); }

    // Carrega valores no Menu de Configurações Global
    try {
        const m = [
            ['settings-path-downloads', userSavePath],
            ['settings-path-nsfw', userNSFWPath],
            ['settings-api-groq', localStorage.getItem('groq_api_key')],
            ['settings-api-heygen', heygenKey],
            ['settings-api-gemini', localStorage.getItem('nexxt_gemini_key')],
            ['settings-path-srt', localStorage.getItem('nexxt_srt_path')]
        ];
        m.forEach(([id, val]) => { if (val) { const el = safeEl(id); if (el) el.value = val; } });

        const autoBleepEl = safeEl('settings-auto-bleep');
        if (autoBleepEl) {
            autoBleepEl.checked = autoBleepNSFW;
            autoBleepEl.onchange = (e) => {
                autoBleepNSFW = e.target.checked;
                localStorage.setItem("auto_bleep_nsfw", autoBleepNSFW ? "true" : "false");
            };
        }

        const autoBleepCustomEl = safeEl('settings-auto-bleep-custom');
        if (autoBleepCustomEl) {
            autoBleepCustomEl.checked = autoBleepCustom;
            autoBleepCustomEl.onchange = (e) => {
                autoBleepCustom = e.target.checked;
                localStorage.setItem("auto_bleep_custom", autoBleepCustom ? "true" : "false");
            };
        }
    } catch (e) { console.warn('[onload] settings init:', e); }

    // Configura pasta padrão de downloads
    try {
        if (!userSavePath) {
            const path = safeRequire('path');
            const os = safeRequire('os');
            if (path && os) {
                userSavePath = path.join(os.homedir(), 'Downloads', 'Nexxt_Downloads');
                const el = safeEl('settings-path-downloads');
                if (el) el.value = userSavePath;
            }
        }
        document.querySelectorAll('.path-value-text').forEach(el => {
            try { el.innerText = userSavePath || ''; } catch (e) { }
        });
        const fs = safeRequire('fs');
        if (fs && userSavePath && !fs.existsSync(userSavePath)) {
            fs.mkdirSync(userSavePath, { recursive: true });
        }
    } catch (e) { console.warn('[onload] folder setup:', e); }

    // Handlers do Settings
    try {
        const dlBtn = safeEl('btn-settings-path-dl');
        const nsfwBtn = safeEl('btn-settings-path-nsfw');
        const saveBtn = safeEl('btn-settings-save');
        if (dlBtn) dlBtn.onclick = escolherPastaMaster;
        if (nsfwBtn) nsfwBtn.onclick = escolherPastaNSFW;
        if (saveBtn) saveBtn.onclick = salvarConfiguracoesGlobais;
    } catch (e) { console.warn('[onload] settings handlers:', e); }

    try { renderizarInterface(); } catch (e) { console.error('[onload] renderizarInterface:', e); }
    try { verificarLoginHeyGen(); } catch (e) { console.error('[onload] verificarLoginHeyGen:', e); }

    // Mostra modal de atualização se for uma versão nova
    try { verificarAtualizacao(); } catch (e) { console.warn('[onload] verificarAtualizacao:', e); }
};

// HeyGen: trocar chave
(function () {
    const btn = safeEl('btn-change-heygen');
    if (!btn) return;
    btn.onclick = () => {
        try {
            localStorage.removeItem('heygen_api_key');
            heygenKey = null;
            const inputEl = safeEl('input-heygen-key');
            if (inputEl) inputEl.value = '';
            verificarLoginHeyGen();
            notify('Desconectado com sucesso.', 'info');
        } catch (e) { console.error('[btn-change-heygen]', e); }
    };
})();

var csInterface;
try { csInterface = new CSInterface(); }
catch (e) { console.error('FATAL: CSInterface n�o p�de ser inicializada.', e); }

var campo = safeEl('campoBusca');
var navContainer = safeEl('nav-container');
var listaUI = safeEl('results-list');


// ===================== SISTEMA DE PASTA & SETTINGS =====================
let fpCurrentPath = "";
let fpCallback = null;

function carregarDrives() {
    const listQuick = document.getElementById("fp-quick-list");
    const listDrives = document.getElementById("fp-drives-list");
    listDrives.innerHTML = `<div style="text-align:center; padding: 10px; opacity: 0.5;"><svg class="spinner" viewBox="0 0 50 50" style="width:16px; height:16px;"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg></div>`;

    const os = require('os');
    const path = require('path');
    const homedir = os.homedir();

    let defaultDrives = [
        { name: "Home", path: homedir },
        { name: "Downloads", path: path.join(homedir, "Downloads") },
        { name: "Desktop", path: path.join(homedir, "Desktop") },
        { name: "Documents", path: path.join(homedir, "Documents") }
    ];

    let htmlQuick = "";
    defaultDrives.forEach(d => {
        htmlQuick += `<div class="fp-drive" onclick="abrirPastaPicker('${d.path.replace(/\\/g, '\\\\')}')">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
             ${d.name}
         </div>`;
    });
    listQuick.innerHTML = htmlQuick;

    if (os.platform() === 'win32') {
        const cp = require('child_process');
        cp.exec('wmic logicaldisk get name', (err, stdout) => {
            let htmlDrives = "";
            if (!err) {
                const lines = stdout.split('\n');
                lines.forEach(line => {
                    const match = line.match(/[A-Za-z]:/);
                    if (match) {
                        const driveLetter = match[0] + "\\";
                        htmlDrives += `<div class="fp-drive" onclick="abrirPastaPicker('${driveLetter.replace(/\\/g, '\\\\')}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12H2 M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
                            Disco Local (${match[0]})
                        </div>`;
                    }
                });
            } else {
                htmlDrives = `<div class="fp-drive" onclick="abrirPastaPicker('C:\\\\')">C:\\</div>`;
            }
            listDrives.innerHTML = htmlDrives;
        });
    } else if (os.platform() === 'darwin') {
        const fs = require('fs');
        const path = require('path');
        let htmlDrives = `<div class="fp-drive" onclick="abrirPastaPicker('${os.homedir().replace(/'/g, "\\'")}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
            Home</div>`;
        try {
            const vols = fs.readdirSync('/Volumes');
            vols.forEach(v => {
                if (!v.startsWith('.')) {
                    const vp = '/Volumes/' + v;
                    htmlDrives += `<div class="fp-drive" onclick="abrirPastaPicker('${vp.replace(/'/g, "\\'")}')">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 12H2 M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>
                        ${v}</div>`;
                }
            });
        } catch (e) {}
        listDrives.innerHTML = htmlDrives;
    } else {
        listDrives.innerHTML = `<div class="fp-drive" onclick="abrirPastaPicker('/')">/ (Root)</div>`;
    }
}

function abrirPastaPicker(dirPath) {
    const fs = require('fs');
    const path = require('path');
    try {
        if (!fs.existsSync(dirPath)) {
            notify("A pasta n�o existe ou est� inacess�vel.", "error");
            return;
        }

        fpCurrentPath = dirPath;
        document.getElementById("fp-current-path").value = fpCurrentPath;

        const list = document.getElementById("fp-items-list");
        list.innerHTML = "";

        const items = fs.readdirSync(dirPath, { withFileTypes: true });

        items.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

        let html = "";
        let hasItems = false;
        items.forEach(item => {
            if (item.name.startsWith('.') || item.name.startsWith('$')) return; // hide hidden files
            if (!item.isDirectory()) return; // only folders
            hasItems = true;

            const fullPath = path.join(dirPath, item.name).replace(/\\/g, '\\\\');
            html += `
            <div class="fp-item" onclick="abrirPastaPicker('${fullPath}')">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="rgba(99, 102, 241, 0.05)" stroke="#6366F1" stroke-width="1.2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <div class="fp-item-text" title="${item.name}">${item.name}</div>
            </div>`;
        });

        if (!hasItems) {
            html = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 40px; font-size: 13px;">Esta pasta est� vazia de subpastas.</div>`;
        }
        list.innerHTML = html;

    } catch (err) {
        notify("Acesso negado ou erro ao ler a pasta.", "error");
    }
}

function openCustomFolderPicker(title, initialPath, callback) {
    fpCallback = callback;
    document.getElementById("fp-title").innerText = title;

    const modal = document.getElementById("folder-picker-modal");
    modal.classList.remove("hidden-view");
    modal.style.display = "flex";

    setTimeout(() => {
        modal.style.opacity = "1";
        modal.style.pointerEvents = "auto";
    }, 10);

    carregarDrives();
    abrirPastaPicker(initialPath || userSavePath || require('os').homedir());
}

function closeFolderPicker() {
    const modal = document.getElementById("folder-picker-modal");
    modal.style.opacity = "0";
    modal.style.pointerEvents = "none";
    setTimeout(() => {
        modal.style.display = "none";
        modal.classList.add("hidden-view");
    }, 300);
}

// Binda bot�es da interface no startup
if (document.getElementById("fp-btn-up")) {
    document.getElementById("fp-btn-up").onclick = () => {
        const path = require('path');
        const parent = path.dirname(fpCurrentPath);
        if (parent !== fpCurrentPath) abrirPastaPicker(parent);
    };
    document.getElementById("fp-btn-refresh").onclick = () => {
        abrirPastaPicker(fpCurrentPath);
    };
    document.getElementById("fp-btn-select").onclick = () => {
        if (fpCallback && fpCurrentPath) {
            fpCallback(fpCurrentPath);
            closeFolderPicker();
        }
    };

    document.getElementById("fp-current-path").onkeydown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            abrirPastaPicker(e.target.value.trim());
        }
    };
}

function escolherPastaMaster() {
    openCustomFolderPicker("Selecione a pasta RAIZ para a extens�o", userSavePath, (selectedPath) => {
        document.getElementById('settings-path-downloads').value = selectedPath;
    });
}

function escolherPastaNSFW() {
    const defaultPath = userNSFWPath || require('path').join(userSavePath || require('os').homedir(), 'Private');
    openCustomFolderPicker("Selecione o cofre para vídeos sens�veis", defaultPath, (selectedPath) => {
        document.getElementById('settings-path-nsfw').value = selectedPath;
    });
}

function escolherPastaSRT() {
    const defaultPath = localStorage.getItem('nexxt_srt_path') || require('path').join(userSavePath || require('os').homedir(), 'SRT_Review');
    openCustomFolderPicker("Selecione a pasta para SRT revisados", defaultPath, (selectedPath) => {
        document.getElementById('settings-path-srt').value = selectedPath;
    });
}

function salvarConfiguracoesGlobais() {
    const dlPath = document.getElementById('settings-path-downloads').value.trim();
    if (dlPath) { userSavePath = dlPath; localStorage.setItem("nexxt_save_path", userSavePath); }

    const nsfwPath = document.getElementById('settings-path-nsfw').value.trim();
    if (nsfwPath) { userNSFWPath = nsfwPath; localStorage.setItem("nexxt_nsfw_path", userNSFWPath); }

    const groqStr = document.getElementById('settings-api-groq') && document.getElementById('settings-api-groq').value.trim();
    if (groqStr) { groqKey = groqStr; localStorage.setItem('groq_api_key', groqKey); }

    const hgStr = document.getElementById('settings-api-heygen').value.trim();
    if (hgStr) { heygenKey = hgStr; localStorage.setItem("heygen_api_key", heygenKey); }

    const gmStr = document.getElementById('settings-api-gemini') && document.getElementById('settings-api-gemini').value.trim();
    if (gmStr) { localStorage.setItem("nexxt_gemini_key", gmStr); }

    const srtPath = document.getElementById('settings-path-srt');
    if (srtPath && srtPath.value.trim()) { localStorage.setItem('nexxt_srt_path', srtPath.value.trim()); }

    const autoBleepEl = document.getElementById('settings-auto-bleep');
    if (autoBleepEl) {
        autoBleepNSFW = autoBleepEl.checked;
        localStorage.setItem("auto_bleep_nsfw", autoBleepNSFW ? "true" : "false");
    }

    const autoBleepCustomEl = document.getElementById('settings-auto-bleep-custom');
    if (autoBleepCustomEl) {
        autoBleepCustom = autoBleepCustomEl.checked;
        localStorage.setItem("auto_bleep_custom", autoBleepCustom ? "true" : "false");
    }

    // Atualizar UI
    document.querySelectorAll('.path-value-text').forEach(el => el.innerText = userSavePath);
    notify("Configurações Globais Salvas!", "success");
}

function escolherPasta() {
    escolherPastaMaster(); // Backward compatibility handler wrapper
}
// ===================== NOTIFICA��O =====================
function notify(message, type = 'success') {
    let container = document.getElementById('toast-container');
    // Prote��o: cria o container dinamicamente se foi removido do HTML por engano
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '?' : type === 'error' ? '?' : '?';
    toast.innerHTML = `<span style="font-size:18px">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        toast.style.transition = '0.4s ease';
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}
document.getElementById("link-instagram").onclick = () => {
    csInterface.openURLInDefaultBrowser("https://www.instagram.com/nexxtedit/");
};

let abaAtiva = "all";
let devAtivo = "all";
let catAtiva = "all";
let favoritos = JSON.parse(localStorage.getItem("favoritos") || "[]");
let recentes = []; localStorage.removeItem("recentes"); // Zera recentes conforme solicitado
let usageStats = JSON.parse(localStorage.getItem("nexxt_stats") || "{}");

function atualizarTema(tema) { document.body.className = "theme-" + tema; }
const devBtns = document.querySelectorAll("#dev-tabs button");
const colBtns = document.querySelectorAll("#collection-tabs button");
const allSidebarBtns = document.querySelectorAll(".sidebar .tabs button");

function clearSidebarActive() { allSidebarBtns.forEach(b => b.classList.remove("active")); }
function mostrarTela(telaId) {
    const views = ["view-welcome", "view-effects", "view-ai", "view-ai-director", "view-downloader", "view-nsfw", "view-captions", "view-heygen", "view-settings", "view-image-studio", "view-srt-review", "view-kling", "view-variabilizador"];
    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.classList.add("hidden-view");
    });
    const target = document.getElementById(telaId);
    if (target) target.classList.remove("hidden-view");
    document.getElementById("header-search").style.display = (telaId === "view-effects") ? "flex" : "none";

    // Global Back Button Logic
    const backBtn = document.getElementById("global-back-btn");
    if (backBtn) {
        if (telaId === "view-welcome") {
            backBtn.style.display = "none";
        } else {
            backBtn.style.display = "flex";
        }
    }
}

// Sidebar Buttons
if (document.getElementById("btn-tab-dl")) document.getElementById("btn-tab-dl").onclick = () => { clearSidebarActive(); document.getElementById("btn-tab-dl").classList.add("active"); atualizarTema("downloader"); mostrarTela("view-downloader"); carregarHistoricoDownloaderLocal(); };
if (document.getElementById("btn-tab-captions")) document.getElementById("btn-tab-captions").onclick = () => { clearSidebarActive(); document.getElementById("btn-tab-captions").classList.add("active"); atualizarTema("captions"); mostrarTela("view-captions"); };
if (document.getElementById("btn-tab-ai")) document.getElementById("btn-tab-ai").onclick = () => { clearSidebarActive(); document.getElementById("btn-tab-ai").classList.add("active"); atualizarTema("ai"); mostrarTela("view-ai"); };
if (document.getElementById("btn-tab-ai-director")) document.getElementById("btn-tab-ai-director").onclick = () => { clearSidebarActive(); document.getElementById("btn-tab-ai-director").classList.add("active"); atualizarTema("ai"); mostrarTela("view-ai-director"); };
if (document.getElementById("btn-tab-image-studio")) document.getElementById("btn-tab-image-studio").onclick = () => { clearSidebarActive(); document.getElementById("btn-tab-image-studio").classList.add("active"); atualizarTema("image-studio"); mostrarTela("view-image-studio"); };
if (document.getElementById("btn-tab-heygen")) document.getElementById("btn-tab-heygen").onclick = () => { clearSidebarActive(); document.getElementById("btn-tab-heygen").classList.add("active"); atualizarTema("heygen"); mostrarTela("view-heygen"); if (window.verificarLoginHeyGen) window.verificarLoginHeyGen(); };
if (document.getElementById("btn-tab-nsfw")) document.getElementById("btn-tab-nsfw").onclick = () => { clearSidebarActive(); document.getElementById("btn-tab-nsfw").classList.add("active"); atualizarTema("downloader"); mostrarTela("view-nsfw"); carregarHistoricoNSFWLocal(); };
if (document.getElementById("btn-tab-settings")) document.getElementById("btn-tab-settings").onclick = () => { clearSidebarActive(); document.getElementById("btn-tab-settings").classList.add("active"); atualizarTema("all"); mostrarTela("view-settings"); try { const _lic = JSON.parse(localStorage.getItem('nexxt_license') || '{}'); const _el = document.getElementById('topup-plan-name'); if (_el) _el.textContent = _lic.plan || ''; } catch (e) { } };
if (document.getElementById("btn-tab-srt")) document.getElementById("btn-tab-srt").onclick = () => { clearSidebarActive(); document.getElementById("btn-tab-srt").classList.add("active"); atualizarTema("all"); mostrarTela("view-srt-review"); if (window.initSrtReview) window.initSrtReview(); };
if (document.getElementById("btn-tab-kling")) document.getElementById("btn-tab-kling").onclick = () => { clearSidebarActive(); document.getElementById("btn-tab-kling").classList.add("active"); atualizarTema("ai"); mostrarTela("view-kling"); };


// Restaura a visualizao da tela se recarregar
devBtns.forEach(btn => {
    if (["btn-tab-ai", "btn-tab-ai-director", "btn-tab-dl", "btn-tab-captions", "btn-tab-heygen", "btn-tab-nsfw", "btn-tab-settings"].includes(btn.id)) return;
    btn.onclick = () => { clearSidebarActive(); btn.classList.add("active"); abaAtiva = "all"; devAtivo = btn.dataset.dev; atualizarTema(devAtivo); mostrarTela("view-effects"); renderizarInterface(); };
});

colBtns.forEach(btn => {
    btn.onclick = () => { clearSidebarActive(); btn.classList.add("active"); abaAtiva = btn.dataset.tab; atualizarTema("all"); mostrarTela("view-effects"); renderizarInterface(); };
});

if (campo) campo.oninput = () => renderizarInterface();


const listaDeEfeitos = [
    { nome: "Lumetri Color", dev: "premiere", cat: "video", sub: "color" },
    { nome: "Brightness & Contrast", dev: "premiere", cat: "video", sub: "color" },
    { nome: "Color Balance (RGB)", dev: "premiere", cat: "video", sub: "color" },
    { nome: "Color Balance (HLS)", dev: "premiere", cat: "video", sub: "color" },
    { nome: "Fast Color Corrector", dev: "premiere", cat: "video", sub: "color" },
    { nome: "Gaussian Blur", dev: "premiere", cat: "video", sub: "blur" },
    { nome: "Directional Blur", dev: "premiere", cat: "video", sub: "blur" },
    { nome: "Unsharp Mask", dev: "premiere", cat: "video", sub: "blur" },
    { nome: "Sharpen", dev: "premiere", cat: "video", sub: "blur" },
    { nome: "Camera Blur", dev: "premiere", cat: "video", sub: "blur" },
    { nome: "Basic 3D", dev: "premiere", cat: "video", sub: "utility" },
    { nome: "Transform", dev: "premiere", cat: "video", sub: "utility" },
    { nome: "Flip Horizontal", dev: "premiere", cat: "video", sub: "utility" },
    { nome: "Flip Vertical", dev: "premiere", cat: "video", sub: "utility" },
    { nome: "Crop", dev: "premiere", cat: "video", sub: "utility" },
    { nome: "Lens Distortion", dev: "premiere", cat: "video", sub: "distort" },
    { nome: "Warp Stabilizer", dev: "premiere", cat: "video", sub: "distort" },
    { nome: "Wave Warp", dev: "premiere", cat: "video", sub: "distort" },
    { nome: "Bulge", dev: "premiere", cat: "video", sub: "distort" },
    { nome: "Spherize", dev: "premiere", cat: "video", sub: "distort" },
    { nome: "Luma Key", dev: "premiere", cat: "video", sub: "keying" },
    { nome: "Ultra Key", dev: "premiere", cat: "video", sub: "keying" },
    { nome: "Track Matte Key", dev: "premiere", cat: "video", sub: "keying" },
    { nome: "Posterize", dev: "premiere", cat: "video", sub: "stylize" },
    { nome: "Find Edges", dev: "premiere", cat: "video", sub: "stylize" },
    { nome: "Solarize", dev: "premiere", cat: "video", sub: "stylize" },
    { nome: "Tint", dev: "premiere", cat: "video", sub: "stylize" },
    { nome: "Invert", dev: "premiere", cat: "video", sub: "stylize" },
    { nome: "4-Color Gradient", dev: "premiere", cat: "video", sub: "generate" },
    { nome: "Color Gradient", dev: "premiere", cat: "video", sub: "generate" },
    { nome: "Lens Flare", dev: "premiere", cat: "video", sub: "generate" },
    { nome: "Noise", dev: "premiere", cat: "video", sub: "others" },
    { nome: "VR Digital Glitch", dev: "premiere", cat: "video", sub: "vr" },
    { nome: "VR Sharpen", dev: "premiere", cat: "video", sub: "vr" },
    { nome: "VR Blur", dev: "premiere", cat: "video", sub: "vr" },
    { nome: "Amplify", dev: "premiere", cat: "audio", sub: "dynamics" },
    { nome: "Compressor", dev: "premiere", cat: "audio", sub: "dynamics" },
    { nome: "Multiband Compressor", dev: "premiere", cat: "audio", sub: "dynamics" },
    { nome: "Hard Limiter", dev: "premiere", cat: "audio", sub: "dynamics" },
    { nome: "Dynamics Processing", dev: "premiere", cat: "audio", sub: "dynamics" },
    { nome: "Parametric Equalizer", dev: "premiere", cat: "audio", sub: "eq" },
    { nome: "FFT Filter", dev: "premiere", cat: "audio", sub: "eq" },
    { nome: "Highpass", dev: "premiere", cat: "audio", sub: "eq" },
    { nome: "Lowpass", dev: "premiere", cat: "audio", sub: "eq" },
    { nome: "Band Pass", dev: "premiere", cat: "audio", sub: "eq" },
    { nome: "Analog Delay", dev: "premiere", cat: "audio", sub: "effects" },
    { nome: "Delay", dev: "premiere", cat: "audio", sub: "effects" },
    { nome: "Studio Reverb", dev: "premiere", cat: "audio", sub: "effects" },
    { nome: "Flanger/Chorus", dev: "premiere", cat: "audio", sub: "modulation" },
    { nome: "Phaser", dev: "premiere", cat: "audio", sub: "modulation" },
    { nome: "DeEsser", dev: "premiere", cat: "audio", sub: "repair" },
    { nome: "DeHummer", dev: "premiere", cat: "audio", sub: "repair" },
    { nome: "DeNoise", dev: "premiere", cat: "audio", sub: "repair" },
    { nome: "Stereo Expander", dev: "premiere", cat: "audio", sub: "stereo" },
    { nome: "Balance", dev: "premiere", cat: "audio", sub: "stereo" },
    { nome: "Channel Volume", dev: "premiere", cat: "audio", sub: "stereo" },
    { nome: "Zoom Blur", dev: "artlist", cat: "video", sub: "blurs" },
    { nome: "Channel Mixer", dev: "artlist", cat: "video", sub: "channel" },
    { nome: "Channel Swapper", dev: "artlist", cat: "video", sub: "channel" },
    { nome: "Chromatic Aberration", dev: "artlist", cat: "video", sub: "channel" },
    { nome: "Exposure Pro", dev: "artlist", cat: "video", sub: "color correction" },
    { nome: "Tone Coloring", dev: "artlist", cat: "video", sub: "color correction" },
    { nome: "Cine Style", dev: "artlist", cat: "video", sub: "color grading" },
    { nome: "Classic Cine Style", dev: "artlist", cat: "video", sub: "color grading" },
    { nome: "Hue Colorize", dev: "artlist", cat: "video", sub: "color grading" },
    { nome: "Hue Shift", dev: "artlist", cat: "video", sub: "color grading" },
    { nome: "Derez", dev: "artlist", cat: "video", sub: "distort" },
    { nome: "Energy Distortion", dev: "artlist", cat: "video", sub: "distort" },
    { nome: "Fluid Distortion", dev: "artlist", cat: "video", sub: "distort" },
    { nome: "Heat Distortion", dev: "artlist", cat: "video", sub: "distort" },
    { nome: "Smoke Distortion", dev: "artlist", cat: "video", sub: "distort" },
    { nome: "Witness Protection", dev: "artlist", cat: "video", sub: "distort" },
    { nome: "Auto Volumetrics", dev: "artlist", cat: "video", sub: "generate" },
    { nome: "Clouds", dev: "artlist", cat: "video", sub: "generate" },
    { nome: "Cosmos", dev: "artlist", cat: "video", sub: "generate" },
    { nome: "Drop Shadow", dev: "artlist", cat: "video", sub: "generate" },
    { nome: "Electro", dev: "artlist", cat: "video", sub: "generate" },
    { nome: "Grid", dev: "artlist", cat: "video", sub: "generate" },
    { nome: "Picture-in-Picture", dev: "artlist", cat: "video", sub: "generate" },
    { nome: "Split Screen Masking", dev: "artlist", cat: "video", sub: "generate" },
    { nome: "Timecode", dev: "artlist", cat: "video", sub: "generate" },
    { nome: "Fill Color", dev: "artlist", cat: "video", sub: "gradients" },
    { nome: "Color Gradient", dev: "artlist", cat: "video", sub: "gradients" },
    { nome: "Film Damage", dev: "artlist", cat: "video", sub: "grunge" },
    { nome: "Film Grain", dev: "artlist", cat: "video", sub: "grunge" },
    { nome: "Flicker", dev: "artlist", cat: "video", sub: "grunge" },
    { nome: "Scan Lines", dev: "artlist", cat: "video", sub: "grunge" },
    { nome: "Stutter", dev: "artlist", cat: "video", sub: "grunge" },
    { nome: "TV Damage", dev: "artlist", cat: "video", sub: "grunge" },
    { nome: "Sharpen", dev: "artlist", cat: "video", sub: "sharpen" },
    { nome: "Unsharpen", dev: "artlist", cat: "video", sub: "sharpen" },
    { nome: "Highpass Sharpen", dev: "artlist", cat: "video", sub: "sharpen" },
    { nome: "Cartoon", dev: "artlist", cat: "video", sub: "stylize" },
    { nome: "Emboss", dev: "artlist", cat: "video", sub: "stylize" },
    { nome: "Find Edges", dev: "artlist", cat: "video", sub: "stylize" },
    { nome: "Threshold", dev: "artlist", cat: "video", sub: "stylize" },
    { nome: "Quad Warp", dev: "artlist", cat: "video", sub: "warp" },
    { nome: "Page Curl", dev: "artlist", cat: "video", sub: "warp" },

    // REDGIANT PLUGINS
    { nome: "Magic Bullet Looks", dev: "redgiant", cat: "video", sub: "color" },
    { nome: "Colorista", dev: "redgiant", cat: "video", sub: "color" },
    { nome: "Universe Glitch", dev: "redgiant", cat: "video", sub: "stylize" },
    { nome: "Universe VHS", dev: "redgiant", cat: "video", sub: "stylize" },
    { nome: "Cosmo", dev: "redgiant", cat: "video", sub: "beauty" },
    { nome: "Optical Glow", dev: "redgiant", cat: "video", sub: "generate" },
    { nome: "Knoll Light Factory", dev: "redgiant", cat: "video", sub: "generate" },
    { nome: "PluralEyes", dev: "redgiant", cat: "video", sub: "sync" },

    // SAPPHIRE PLUGINS
    { nome: "S_Glow", dev: "sapphire", cat: "video", sub: "lighting" },
    { nome: "S_Shake", dev: "sapphire", cat: "video", sub: "distort" },
    { nome: "S_Flicker", dev: "sapphire", cat: "video", sub: "time" },
    { nome: "S_Glitch", dev: "sapphire", cat: "video", sub: "stylize" },
    { nome: "S_FilmEffect", dev: "sapphire", cat: "video", sub: "color" },
    { nome: "S_EdgeDetect", dev: "sapphire", cat: "video", sub: "stylize" },
    { nome: "S_WarpChroma", dev: "sapphire", cat: "video", sub: "warp" },
    { nome: "S_Rays", dev: "sapphire", cat: "video", sub: "lighting" },

    // BORIS FX PLUGINS
    { nome: "BCC Film Glow", dev: "borisfx", cat: "video", sub: "lighting" },
    { nome: "BCC Lens Flare", dev: "borisfx", cat: "video", sub: "lighting" },
    { nome: "BCC Beauty Studio", dev: "borisfx", cat: "video", sub: "beauty" },
    { nome: "BCC Title Studio", dev: "borisfx", cat: "video", sub: "text" },
    { nome: "BCC Film Damage", dev: "borisfx", cat: "video", sub: "stylize" },
    { nome: "BCC Cross Glitch", dev: "borisfx", cat: "video", sub: "transitions" },
    { nome: "BCC Particle Illusion", dev: "borisfx", cat: "video", sub: "generate" },
    { nome: "Mocha Pro", dev: "borisfx", cat: "video", sub: "tracking" }
];

function salvarStorage() {
    localStorage.setItem("favoritos", JSON.stringify(favoritos));
    localStorage.setItem("recentes", JSON.stringify(recentes));
    localStorage.setItem("nexxt_stats", JSON.stringify(usageStats));
}

function renderizarInterface() {
    const termo = campo.value.toLowerCase();
    listaUI.innerHTML = "";
    let baseLista = [...listaDeEfeitos].sort((a, b) => a.nome.localeCompare(b.nome));
    if (abaAtiva === "favorites") baseLista = baseLista.filter(e => favoritos.includes(e.nome));
    else if (abaAtiva === "recent") baseLista = baseLista.filter(e => recentes.includes(e.nome));
    else if (devAtivo !== "all") baseLista = baseLista.filter(e => e.dev === devAtivo);
    baseLista.filter(e => e.nome.toLowerCase().includes(termo)).forEach((e, i) => {
        let li = criarItem(e);
        listaUI.appendChild(li);
    });
}

function criarItem(e) {
    const li = document.createElement("li");
    li.className = "result-item";

    let badgeClass = "";
    let badgeText = "";

    if (e.dev === "premiere") {
        badgeClass = "badge-pr";
        badgeText = "PR";
    } else if (e.dev === "artlist") {
        badgeClass = "badge-art";
        badgeText = "ART";
    } else if (e.dev === "redgiant") {
        badgeClass = "badge-rg";
        badgeText = "RG";
    } else if (e.dev === "sapphire") {
        badgeClass = "badge-sapph";
        badgeText = "SPH";
    } else if (e.dev === "borisfx") {
        badgeClass = "badge-boris";
        badgeText = "BFX";
    }

    li.innerHTML = `<button class="fav-btn ${favoritos.includes(e.nome) ? "active" : ""}">?</button>
                    <span class="effect-name">${e.nome}</span>
                    <span class="badge ${badgeClass}">${badgeText}</span>`;
    li.onclick = () => {
        csInterface.evalScript(`$._nexxt.aplicarEfeito(${JSON.stringify(e.nome)}, ${JSON.stringify(e.cat)})`, (r) => {
            if (r !== "Sucesso") notify(r, "error");
        });
        recentes = [e.nome, ...recentes.filter(r => r !== e.nome)].slice(0, 20); salvarStorage(); renderizarInterface();
    };
    li.querySelector(".fav-btn").onclick = (ev) => { ev.stopPropagation(); favoritos = favoritos.includes(e.nome) ? favoritos.filter(f => f !== e.nome) : [...favoritos, e.nome]; salvarStorage(); renderizarInterface(); };
    return li;
}

// ===================== AI AUDIO (ISOLATE) =====================
// ===================== AI AUDIO (ISOLATE) =====================
function handleAudioAI(tipo) {
    if (!window.csInterface) { notify('CSInterface nao disponivel. Reinicie o plugin.', 'error'); return; }

    const apiKey = replicateKey;

    const btnId = tipo === 'voice' ? 'btn-isolate-voice' : 'btn-isolate-music';
    const btn = document.getElementById(btnId);
    if (!btn) { notify('Botao nao encontrado: ' + btnId, 'error'); return; }

    const texto = btn.querySelector('.ai-text-subtle');
    if (!texto) { notify('Texto do botao nao encontrado', 'error'); return; }

    if (btn.classList.contains('loading')) return;
    btn.classList.add('loading');
    const originalText = texto.innerText;
    texto.innerText = 'Lendo timeline...';

    csInterface.evalScript('$._nexxt.prepararAudioIA()', function (res) {
        console.log('[AudioAI] prepararAudioIA result:', res);

        if (!res || res === 'undefined') {
            btn.classList.remove('loading'); texto.innerText = originalText;
            notify('ExtendScript retornou vazio. Verifique se ha um clipe selecionado na timeline.', 'error'); return;
        }

        if (res.indexOf('ERRO') !== -1) {
            btn.classList.remove('loading'); texto.innerText = originalText;
            notify('Erro na timeline: ' + res.replace('ERRO|', ''), 'error'); return;
        }

        const path = require('path');
        const fs = require('fs');
        const child_process = require('child_process');
        const objOs = require('os');
        const https = require('https');
        const http = require('http');

        // ========================================================================
        // INJEÇÃO NO PATH: Garante que ffmpeg.exe (bundled) seja encontrado globalmente
        // ========================================================================
        const nexxtToolsPath = path.join(__dirname, 'tools');
        if (!process.env.PATH.includes(nexxtToolsPath)) {
            process.env.PATH = nexxtToolsPath + ';' + process.env.PATH;
        }

        // Format: "SUCESSO||mediaPath|inPoint|duration|clipStart"
        let camParts = res.split('|');
        // The media path is the 3rd segment (index 2) after "SUCESSO||"
        let caminhoAudio = camParts[2];

        // Extrai inPoint e duration passados pelo Premiere via prepararAudioIA
        const inPoint = camParts[3] || 0;
        const duration = camParts[4] || 0;

        if (!caminhoAudio || caminhoAudio === 'undefined' || caminhoAudio.trim() === '') {
            btn.classList.remove('loading'); texto.innerText = originalText;
            notify('Arquivo original nao detectado. Selecione um clipe na timeline.', 'error'); return;
        }

        caminhoAudio = caminhoAudio.trim();

        if (!fs.existsSync(caminhoAudio)) {
            btn.classList.remove('loading'); texto.innerText = originalText;
            notify('Arquivo de midia nao encontrado em disco: ' + caminhoAudio, 'error'); return;
        }

        texto.innerText = 'Cortando áudio (FFmpeg)...';

        // Usa FFmpeg para extrair apenas o trecho de áudio desejado num arquivo MP3 temporário leve
        // Isso evita carregar um vídeo inteiro de 4GB na RAM e travar o painel com o payload Base64
        const tempDir = objOs.tmpdir();
        const tmpAudioPath = path.join(tempDir, `isolate_nexxt_${Date.now()}.mp3`);

        const _ffmpegBin = (typeof PLUGIN_TOOLS_DIR !== 'undefined' && PLUGIN_TOOLS_DIR ? require('path').join(PLUGIN_TOOLS_DIR, 'ffmpeg' + (process.platform === 'win32' ? '.exe' : '')) : 'ffmpeg');
        const argsFfmpeg = ['-y', '-ss', String(inPoint), '-i', caminhoAudio, '-t', String(duration), '-c:a', 'libmp3lame', '-q:a', '2', tmpAudioPath];

        child_process.execFile(_ffmpegBin, argsFfmpeg, (err) => {
            if (err) {
                btn.classList.remove('loading'); texto.innerText = originalText;
                notify('Erro ao extrair áudio com FFmpeg. Ele está instalado?', 'error'); return;
            }

            texto.innerText = 'Enviando para Demucs...';

            try {
                // Lê apenas o mp3 extraído
                const buffer = fs.readFileSync(tmpAudioPath);
                const base64 = buffer.toString('base64');
                const dataUri = `data:audio/mp3;base64,${base64}`;

                // Podemos limpar o arquivo temporário
                fs.unlinkSync(tmpAudioPath);

                fetch('https://api.replicate.com/v1/predictions', {
                    method: 'POST',
                    headers: { 'Authorization': `Token ${apiKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        version: '25a173108cff36ef9f80f854c162d01df9e6528be175794b81158fa03836d953',
                        input: { audio: dataUri }
                    })
                })
                    .then(r => r.json())
                    .then(p => {
                        console.log('[AudioAI] Prediction created:', p);
                        if (!p || !p.urls || !p.urls.get) {
                            btn.classList.remove('loading'); texto.innerText = originalText;
                            notify('Erro ao criar predicao: ' + (p && p.detail ? p.detail : JSON.stringify(p)), 'error'); return;
                        }

                        texto.innerText = 'Separando áudio...';
                        let attempts = 0;

                        const check = setInterval(() => {
                            attempts++;
                            if (attempts > 100) {
                                clearInterval(check); btn.classList.remove('loading'); texto.innerText = originalText;
                                notify('Timeout  separacao demorou mais de 5 minutos', 'error'); return;
                            }
                            fetch(p.urls.get, { headers: { 'Authorization': `Token ${apiKey}` } })
                                .then(r => r.json())
                                .then(st => {
                                    console.log('[AudioAI] Poll status:', st.status);
                                    if (st.status === 'failed' || st.status === 'canceled') {
                                        clearInterval(check); btn.classList.remove('loading'); texto.innerText = originalText;
                                        notify('Erro Demucs: ' + (st.error || st.status), 'error'); return;
                                    }
                                    if (st.status === 'succeeded') {
                                        clearInterval(check);

                                        let outputUrl = null;
                                        if (typeof st.output === 'string') {
                                            outputUrl = st.output; // Se retornou um texto direto (ex: stem especifico foi usado)
                                        } else if (typeof st.output === 'object') {
                                            outputUrl = tipo === 'voice' ? st.output.vocals : st.output.other;
                                        }

                                        if (!outputUrl) {
                                            btn.classList.remove('loading'); texto.innerText = originalText;
                                            notify('URL de saida nao encontrada no output do Replicate', 'error'); return;
                                        }
                                        texto.innerText = 'Baixando...';

                                        // Garante que basePath ou userSavePath existe globalmente ou use um fallback
                                        const globalPath = (typeof userSavePath !== 'undefined') ? userSavePath : path.join(objOs.homedir(), 'Downloads', 'Nexxt_Downloads');
                                        if (!fs.existsSync(globalPath)) fs.mkdirSync(globalPath, { recursive: true });

                                        const baseName = path.basename(caminhoAudio, path.extname(caminhoAudio));
                                        const outPath = path.join(globalPath, (tipo === 'voice' ? 'Voz_' : 'Instrumental_') + baseName + '.mp3');
                                        const file = fs.createWriteStream(outPath);
                                        require('https').get(outputUrl, (dlRes) => {
                                            dlRes.pipe(file);
                                            file.on('finish', () => {
                                                file.close();
                                                csInterface.evalScript(`$._nexxt.importarEAdicionarNaTimeline(${JSON.stringify(outPath)})`);
                                                btn.classList.remove('loading'); texto.innerText = originalText;
                                                notify((tipo === 'voice' ? 'Voz isolada' : 'Instrumental isolado') + ' adicionado a Timeline!', 'success');
                                                adicionarAoHistorico((tipo === 'voice' ? 'Voz: ' : 'Instrumental: ') + path.basename(caminhoAudio));
                                            });
                                        }).on('error', (e) => {
                                            btn.classList.remove('loading'); texto.innerText = originalText;
                                            notify('Erro no download: ' + e.message, 'error');
                                        });
                                    }
                                })
                                .catch(e => {
                                    clearInterval(check); btn.classList.remove('loading'); texto.innerText = originalText;
                                    notify('Erro no polling: ' + e.message, 'error');
                                });
                        }, 3000);
                    })
                    .catch(err => {
                        btn.classList.remove('loading'); texto.innerText = originalText;
                        notify('Erro de rede: ' + err.message, 'error');
                    });
            } catch (err) {
                btn.classList.remove('loading'); texto.innerText = originalText;
                notify('Erro ao processar audio: ' + err.message, 'error'); return;
            }
        });
    });
}
if (document.getElementById('btn-isolate-voice')) document.getElementById('btn-isolate-voice').onclick = () => handleAudioAI('voice');
if (document.getElementById('btn-isolate-music')) document.getElementById('btn-isolate-music').onclick = () => handleAudioAI('music');

// As configs da API Hugging Face e Replicate agora so gerenciadas via Menu de Configurações (salvarConfiguracoesGlobais).

// ==== GERADOR DE VOZ (MiniMax Speech 2.6 Turbo via Replicate) ====
// (Handler MiniMax antigo removido substituído pela IIFE unificada abaixo, linha ~2261)

async function downloadAndImportAudioMinimax(url, extension = "mp3") {
    const btn = document.getElementById('btn-generate-minimax');
    const status = document.getElementById('minimax-status');
    const path = require('path');
    const fs = require('fs');

    try {
        if (status) status.innerText = `Baixando áudio completo (${extension.toUpperCase()})...`;

        const fileName = `MiniMax_${Date.now()}.${extension}`;
        const fullPath = path.join(userSavePath, fileName).replace(/\\/g, '/');

        const audioRes = await fetch(url);
        const arrayBuffer = await audioRes.arrayBuffer();
        fs.writeFileSync(fullPath, Buffer.from(arrayBuffer));

        if (status) status.innerText = "Importando para o Premiere...";

        csInterface.evalScript(`$._nexxt.importarAudioParaTimeline("${fullPath}")`, (res) => {
            btn.classList.remove('loading');
            btn.innerHTML = "??? Gerar Voz e Inserir na Timeline";
            if (res === "SUCESSO") {
                notify(`Voz gerada e importada com sucesso! (${extension.toUpperCase()})`, "success");
            } else {
                notify("Erro ao importar áudio: " + res, "error");
            }
        });
    } catch (err) {
        notify("Erro no download/importao final: " + err.message, "error");
        btn.classList.remove('loading');
        btn.innerHTML = "??? Gerar Voz e Inserir na Timeline";
    }
}

// Histrico de áudios Gerados
function adicionarAoHistorico(nomeFaixa) {
    const historyList = document.getElementById('ai-history-list');

    // Se estava vazio e a div continha formata��o de classe, limpa
    if (historyList.children.length === 0 || historyList.innerHTML.includes("vazio")) historyList.innerHTML = '';

    const div = document.createElement('div');
    div.className = "audio-track-item";
    div.innerHTML = `
        <div class="play-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path></svg>
        </div>
        <div class="track-info">
            <span class="track-name">${nomeFaixa}</span>
            <div class="waveform-glass">
                <div class="wave-bar" style="height: 10px;"></div>
                <div class="wave-bar" style="height: 15px;"></div>
                <div class="wave-bar" style="height: 8px;"></div>
                <div class="wave-bar" style="height: 12px;"></div>
            </div>
        </div>
    `;

    // Adiciona ao topo
    historyList.prepend(div);
}

// remnants of Auto Legendas removed


// ===================== DOWNLOADER =====================
// ===================== DOWNLOADER =====================
function iniciarDownloadMedia(tipo, res, btn) {
    const url = document.getElementById('input-dl-url').value.trim();
    if (!url) return notify("Cole o link!", "error");

    const dlStart = document.getElementById('input-dl-start') ? document.getElementById('input-dl-start').value.trim() : "";
    const dlEnd = document.getElementById('input-dl-end') ? document.getElementById('input-dl-end').value.trim() : "";

    // UI elements for progress
    const progressBox = document.getElementById('dl-progress-box');
    const progressFill = document.getElementById('dl-progress-fill');
    const progressPercent = document.getElementById('dl-progress-percent');
    const progressStatus = document.getElementById('dl-progress-status-desc');
    const textStatus = document.getElementById('dl-progress-text');

    // Support buttons with or without a <span> child
    const texto = btn.querySelector('span') || btn;
    const original = texto.innerText || texto.textContent;

    // Disable all download buttons while running
    ['btn-dl-mp4-max', 'btn-dl-mp4-720', 'btn-dl-mp3'].forEach(id => {
        const b = document.getElementById(id);
        if (b) { b.disabled = true; b.style.opacity = '0.5'; }
    });
    texto.innerText = "Preparando...";

    progressBox.style.display = 'flex';
    progressFill.style.width = '0%';
    progressPercent.innerText = '0%';
    progressStatus.innerText = 'Iniciando conexão...';
    textStatus.innerText = 'Baixando...';

    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');

    if (!fs.existsSync(userSavePath)) fs.mkdirSync(userSavePath, { recursive: true });

    const baseDir = userSavePath.replace(/\\/g, '/');
    const uniqueId = "DL_" + Date.now();

    let args = [];
    if (tipo === 'audio') {
        args = ["--newline", "--no-warnings", "--no-mtime", "--restrict-filenames", "-x", "--audio-format", "mp3", "--audio-quality", "0", "--no-playlist", "--write-thumbnail", "--convert-thumbnails", "jpg", "-o", `${baseDir}/${uniqueId}_[%(extractor_key)s]_%(title)s.%(ext)s`, url];
    } else {
        if (res === '720') {
            args = ["--newline", "--no-warnings", "--no-mtime", "--restrict-filenames", "-S", "vcodec:h264,res:720,acodec:m4a", "--merge-output-format", "mp4", "--recode-video", "mp4", "--no-playlist", "--write-thumbnail", "--convert-thumbnails", "jpg", "-o", `${baseDir}/${uniqueId}_[%(extractor_key)s]_%(title)s.%(ext)s`, url];
        } else {
            args = ["--newline", "--no-warnings", "--no-mtime", "--restrict-filenames", "-S", "vcodec:h264,acodec:m4a", "--merge-output-format", "mp4", "--recode-video", "mp4", "--no-playlist", "--write-thumbnail", "--convert-thumbnails", "jpg", "-o", `${baseDir}/${uniqueId}_[%(extractor_key)s]_%(title)s.%(ext)s`, url];
        }
    }

    // [INJE��O DO CORTE PARCIAL CIR�RGICO]
    // O yt-dlp aceita --download-sections "*start-end"
    if (dlStart || dlEnd) {
        const tempoInicial = dlStart || "0";
        const tempoFinal = dlEnd || "inf";

        // Em formatos adaptativos (como VP9/DASH do YouTube), for�ar o download na unha requer --force-keyframes-at-cuts
        args.splice(args.length - 1, 0, "--download-sections", `*${tempoInicial}-${tempoFinal}`);
        args.splice(args.length - 1, 0, "--force-keyframes-at-cuts");
    }

    // Usa caminho absoluto para garantir que o yt-dlp.exe dentro de /tools/ seja encontrado
    const _ytDlpBin = (PLUGIN_TOOLS_DIR ? require('path').join(PLUGIN_TOOLS_DIR, 'yt-dlp' + _EXE) : 'yt-dlp');
    const ytDlp = spawn(_ytDlpBin, args, { env: process.env });

    ytDlp.stdout.on('data', (data) => {
        const output = data.toString();

        // Exemplo: [download] 45.5% of ~50.00MiB at  1.23MiB/s ETA 00:22
        const percentMatch = output.match(/(\d+\.\d+)%/);
        if (percentMatch && percentMatch[1]) {
            const percent = parseFloat(percentMatch[1]);
            progressFill.style.width = percent + '%';
            progressPercent.innerText = Math.round(percent) + '%';
            texto.innerText = "Baixando...";

            const speedMatch = output.match(/at\s+(.+?\/s)/);
            const etaMatch = output.match(/ETA\s+([\d:]+)/);
            if (speedMatch && etaMatch) {
                progressStatus.innerText = `Velocidade: ${speedMatch[1].trim()} | Tempo Restante: ${etaMatch[1].trim()}`;
            } else {
                progressStatus.innerText = "Processando arquivo...";
            }
        } else if (output.includes('Merging') || (output.includes('Extracting') && !output.includes('Extracting URL')) || output.includes('Fixing')) {
            progressFill.style.width = '100%';
            progressPercent.innerText = '100%';
            texto.innerText = "Convertendo...";
            textStatus.innerText = 'Finalizando...';
            progressStatus.innerText = "Processando arquivo final, aguarde...";
        } else if (output.includes('frame=') || output.includes('bitrate=')) {
            // FFMPEG Native Downloading Fallback (para recortes)
            progressStatus.innerText = "Baixando blocos (FFmpeg)... Puxando o vídeo!";
        }
    });

    ytDlp.stderr.on('data', (data) => {
        console.error("yt-dlp erro:", data.toString());
    });

    ytDlp.on('close', (code) => {
        // Re-enable all download buttons
        ['btn-dl-mp4-max', 'btn-dl-mp4-720', 'btn-dl-mp3'].forEach(id => {
            const b = document.getElementById(id);
            if (b) { b.disabled = false; b.style.opacity = '1'; }
        });
        texto.innerText = original;

        setTimeout(() => { progressBox.style.display = 'none'; }, 2000);

        if (code !== 0) {
            progressStatus.innerText = "Erro no download!";
            progressFill.style.background = "#EF4444";
            return notify("Erro no download. Link inválido ou protegido. O FFmpeg est� instalado?", "error");
        }

        try {
            const arquivos = fs.readdirSync(baseDir);
            let arquivoBaixado = null;

            for (let file of arquivos) {
                if (file.startsWith(uniqueId) && !file.endsWith('.part') && !file.endsWith('.ytdl') && !file.endsWith('.jpg') && !file.endsWith('.webp') && !file.endsWith('.png')) {
                    arquivoBaixado = path.join(baseDir, file);
                    break;
                }
            }

            if (arquivoBaixado && fs.existsSync(arquivoBaixado)) {
                progressStatus.innerText = "Concluído!";
                csInterface.evalScript(`$._nexxt.importarEAdicionarNaTimeline(${JSON.stringify(arquivoBaixado)})`);
                notify("Download importado com sucesso!", "success");

                // --- INJE��O DE HIST�RICO ATRAV�S DO SCANNER DA PASTA NO LUGAR DE ITEM �NICO ---
                setTimeout(() => { carregarHistoricoDownloaderLocal(); }, 1500);

            } else {
                notify("Falha no download. Arquivo final n�o encontrado.", "error");
            }
        } catch (e) {
            notify("Erro interno ao ler a pasta do computador.", "error");
        }
    });
}

// ===================== HIST�RICO DOWNLOADER =====================
function adicionarAoHistoricoDownloader(nomeArquivo, tipo, thumbPath, fullPath, targetList = null) {
    const list = targetList || document.getElementById('dl-recent-list');
    if (!list) return;

    // Limpa vazio inicial
    if (list.innerHTML.includes("Nenhum download")) {
        list.innerHTML = "";
    }

    // Processa o nome do arquivo para remover o prefixo DL_123456789_ e descobrir a plataforma
    let displayNome = nomeArquivo;
    let plataforma = "";

    // Tenta casar o padrão com a extratora: DL_123456789_[Youtube]_Meu_Video.mp4
    const matchDL_Ext = displayNome.match(/^DL_\d+_\[(.*?)\]_(.*)$/);
    if (matchDL_Ext) {
        plataforma = matchDL_Ext[1].toLowerCase();
        displayNome = matchDL_Ext[2];
    } else {
        // Tenta casar o padrão antigo: DL_123456789_Meu_Video.mp4
        const matchDL = displayNome.match(/^DL_\d+_(.*)$/);
        if (matchDL) {
            displayNome = matchDL[1];
        }
    }

    // Limpa a extens�o no display se quiser, mas deixamos pq muitas vezes ajuda a saber se � mp3 ou mp4.
    // Opcional: displayNome = displayNome.replace(/\.(mp4|mp3|m4a|wav)$/i, "");

    const div = document.createElement('div');
    // Agora o padding esquerdo � 0 para a thumb colar na borda. overflow: hidden corta os cantos da thumb.
    div.style.cssText = "position: relative; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; display: flex; align-items: center; transition: all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94); cursor: pointer; overflow: hidden; min-height: 50px; box-shadow: 0 4px 12px rgba(0,0,0,0); transform: translateY(0);";

    let visualMedia = "";
    if (thumbPath) {
        // Thumbnail responsiva colada na esquerda ocupando mais espa�o, com fade-out (m�scara de gradiente) mais longo
        const safeThumbURI = "file:///" + thumbPath.replace(/\\/g, '/');
        visualMedia = `<div style="width: 140px; height: 100%; position: absolute; left: 0; top: 0; bottom: 0; z-index: 1;">
            <img src="${safeThumbURI}?t=${Date.now()}" style="width: 100%; height: 100%; object-fit: cover; mask-image: linear-gradient(to right, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%); -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,1) 40%, rgba(0,0,0,0) 100%); mix-blend-mode: lighten;">
        </div>`;
    } else {
        // Fallback pro �cone original, mantemos o padding pra n�o ficar grudado pois n�o � uma imagem de fundo
        const isAudio = tipo === 'audio';
        const iconColor = isAudio ? '#34D399' : '#9d71e8';
        const iconSvg = isAudio ?
            `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>` :
            `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`;
        visualMedia = `<div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 6px; display: flex; flex-shrink: 0; margin-left: 14px; position: relative; z-index: 2;">${iconSvg}</div>`;
    }

    // O padding geral foi movido para os elementos de texto/�cones
    const leftSpace = thumbPath ? '120px' : '12px'; // Se tem imagem fundo, empurra o texto sutilmente

    let networkIcon = "";
    if (plataforma.includes("youtube")) {
        networkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="color: rgba(255,255,255,0.4);"><path d="M21.582,6.186c-0.23-0.86-0.908-1.538-1.768-1.768C18.254,4,12,4,12,4S5.746,4,4.186,4.418 c-0.86,0.23-1.538,0.908-1.768,1.768C2,7.746,2,12,2,12s0,4.254,0.418,5.814c0.23,0.86,0.908,1.538,1.768,1.768 C5.746,20,12,20,12,20s6.254,0,7.814-0.418c0.861-0.23,1.538-0.908,1.768-1.768C22,16.254,22,12,22,12S22,7.746,21.582,6.186z M10,15.464V8.536L16,12L10,15.464z"></path></svg>`;
    } else if (plataforma.includes("instagram")) {
        networkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: rgba(255,255,255,0.4);"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>`;
    } else if (plataforma.includes("tiktok")) {
        networkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="color: rgba(255,255,255,0.4);"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1.04-.1z"></path></svg>`;
    } else if (plataforma.includes("twitter") || plataforma.includes("x")) {
        networkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: rgba(255,255,255,0.4);"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path></svg>`;
    } else if (plataforma.includes("pornhub") || plataforma.includes("redtube")) {
        networkIcon = `<div style="background: rgba(255,153,0,0.2); color: #ff9900; font-size: 8px; font-weight: 900; padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(255,153,0,0.5);">PH</div>`;
    } else if (plataforma.includes("xvideos") || plataforma.includes("xnxx")) {
        networkIcon = `<div style="background: rgba(220,38,38,0.2); color: #ef4444; font-size: 8px; font-weight: 900; padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(220,38,38,0.5);">XV</div>`;
    } else if (plataforma.includes("spankbang")) {
        networkIcon = `<div style="background: rgba(59,130,246,0.2); color: #3b82f6; font-size: 8px; font-weight: 900; padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(59,130,246,0.5);">SB</div>`;
    } else if (plataforma.includes("eporner")) {
        networkIcon = `<div style="background: rgba(168,85,247,0.2); color: #a855f7; font-size: 8px; font-weight: 900; padding: 2px 4px; border-radius: 4px; border: 1px solid rgba(168,85,247,0.5);">EP</div>`;
    } else {
        networkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: rgba(255,255,255,0.4);"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>`;
    }

    div.innerHTML = `
        ${visualMedia}
        <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; padding: 10px 14px; padding-left: ${leftSpace}; position: relative; z-index: 2;">
            <span style="font-size: 11px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0px 1px 3px rgba(0,0,0,0.8);" title="${displayNome}">${displayNome}</span>
            <span style="font-size: 9px; color: var(--text-secondary); opacity: 0.9; text-shadow: 0px 1px 2px rgba(0,0,0,0.8);">Importado para Projeto (Agora mesmo)</span>
        </div>
        <div style="padding-right: 14px; display: flex; align-items: center; justify-content: center; position: relative; z-index: 2; border-left: 1px solid rgba(255,255,255,0.05); padding-left: 14px; height: 100%;">
            ${networkIcon}
        </div>
    `;

    div.onmouseenter = () => {
        let bgGradient = "linear-gradient(90deg, rgba(30,0,0,0.8) 0%, rgba(90,10,10,0.5) 100%)";
        let bColor = "rgba(255,50,50,0.4)";
        let bShadow = "0 8px 16px rgba(255,0,0,0.3)";

        if (plataforma.includes("youtube")) {
            bgGradient = "linear-gradient(90deg, rgba(40,0,0,0.8) 0%, rgba(120,10,10,0.5) 100%)";
            bColor = "rgba(255,50,50,0.4)";
            bShadow = "0 8px 16px rgba(255,0,0,0.3)";
        } else if (plataforma.includes("facebook")) {
            bgGradient = "linear-gradient(90deg, rgba(0,15,40,0.8) 0%, rgba(20,50,120,0.5) 100%)";
            bColor = "rgba(50,130,255,0.4)";
            bShadow = "0 8px 16px rgba(20,100,255,0.3)";
        } else if (plataforma.includes("instagram")) {
            bgGradient = "linear-gradient(90deg, rgba(40,0,30,0.9) 0%, rgba(80,10,120,0.6) 100%)";
            bColor = "rgba(255,50,200,0.5)";
            bShadow = "0 8px 16px rgba(200,50,255,0.3)";
        } else if (plataforma.includes("tiktok")) {
            bgGradient = "linear-gradient(90deg, rgba(238,29,82,0.8) 0%, rgba(255,255,255,0.3) 100%)";
            bColor = "rgba(255,255,255,0.6)";
            bShadow = "0 8px 16px rgba(238,29,82,0.3)";
        } else if (plataforma.includes("twitter") || plataforma.includes("x")) {
            bgGradient = "linear-gradient(90deg, rgba(0,0,0,0.9) 0%, rgba(255,255,255,0.3) 100%)";
            bColor = "rgba(255,255,255,0.5)";
            bShadow = "0 8px 16px rgba(255,255,255,0.2)";
        } else if (plataforma.includes("pornhub") || plataforma.includes("redtube")) {
            bgGradient = "linear-gradient(90deg, rgba(40,25,0,0.8) 0%, rgba(120,80,0,0.5) 100%)";
            bColor = "rgba(255,153,0,0.5)";
            bShadow = "0 8px 16px rgba(255,153,0,0.3)";
        } else if (plataforma.includes("xvideos") || plataforma.includes("xnxx")) {
            bgGradient = "linear-gradient(90deg, rgba(40,0,0,0.8) 0%, rgba(140,20,20,0.5) 100%)";
            bColor = "rgba(220,38,38,0.5)";
            bShadow = "0 8px 16px rgba(220,38,38,0.3)";
        } else if (plataforma.includes("spankbang")) {
            bgGradient = "linear-gradient(90deg, rgba(0,25,40,0.8) 0%, rgba(20,80,140,0.5) 100%)";
            bColor = "rgba(59,130,246,0.5)";
            bShadow = "0 8px 16px rgba(59,130,246,0.3)";
        } else if (plataforma.includes("eporner")) {
            bgGradient = "linear-gradient(90deg, rgba(25,0,40,0.8) 0%, rgba(80,20,140,0.5) 100%)";
            bColor = "rgba(168,85,247,0.5)";
            bShadow = "0 8px 16px rgba(168,85,247,0.3)";
        }

        div.style.background = bgGradient;
        div.style.borderColor = bColor;
        div.style.transform = "translateY(-2px)";
        div.style.boxShadow = bShadow;
    };
    div.onmouseleave = () => {
        div.style.background = "rgba(0,0,0,0.2)";
        div.style.borderColor = "rgba(255,255,255,0.05)";
        div.style.transform = "translateY(0)";
        div.style.boxShadow = "0 4px 12px rgba(0,0,0,0)";
    };

    div.onclick = () => {
        const fs = require('fs');
        if (fullPath && fs.existsSync(fullPath)) {
            const cp = require('child_process');
            if (process.platform === 'darwin') {
                cp.exec('open -R "' + fullPath + '"');
            } else {
                cp.exec('explorer.exe /select,"' + fullPath + '"');
            }
        } else {
            notify("Este arquivo foi movido ou excluído do computador.", "error");
            div.style.opacity = "0";
            div.style.transform = "translateX(-20px)";
            setTimeout(() => div.remove(), 250);
        }
    };

    list.appendChild(div); // Mudado de prepend para appendChild porque a lista vir ordenada do mais novo pro mais velho
}

// NOVO: SCANNER DE PASTA PARA HISTRICO PERSISTENTE
function carregarHistoricoDownloaderLocal() {
    const list = document.getElementById('dl-recent-list');
    if (!list) return;

    list.innerHTML = ""; // Limpa a lista pra re-renderizar

    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    try {
        let safePath = userSavePath;
        if (!safePath) {
            safePath = path.join(os.homedir(), 'Downloads', 'Nexxt_Downloads');
        }

        if (!fs.existsSync(safePath)) {
            list.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 11px; margin-top: 10px;">Nenhum download encontrado</div>`;
            return;
        }

        const files = fs.readdirSync(safePath)
            .filter(f => f.startsWith('DL_') && (f.endsWith('.mp4') || f.endsWith('.mp3')))
            .map(f => {
                const fullPath = path.join(safePath, f);
                return {
                    name: f,
                    path: fullPath,
                    time: fs.statSync(fullPath).mtime.getTime(),
                    isAudio: f.endsWith('.mp3')
                };
            })
            // Maior timestamp (mais novo) primeiro
            .sort((a, b) => b.time - a.time)
            // Pegamos s� os 15 mais recentes pra interface n�o ficar infinita
            .slice(0, 15);

        if (files.length === 0) {
            list.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 11px; margin-top: 10px;">Nenhum download encontrado na pasta atual</div>`;
            return;
        }

        files.forEach(fileInfo => {
            const baseNameNoExt = fileInfo.path.substring(0, fileInfo.path.lastIndexOf('.'));
            let possibleThumbPath = baseNameNoExt + '.jpg';
            if (!fs.existsSync(possibleThumbPath)) { possibleThumbPath = null; }

            // Reutiliza a fun��o de renderiza��o UI passando os par�metros mapeados e o FULL PATH (para abrir a pasta)
            adicionarAoHistoricoDownloader(fileInfo.name, fileInfo.isAudio ? 'audio' : 'video', possibleThumbPath, fileInfo.path);
        });

    } catch (err) {
        console.error("Erro ao ler hist�rico de downloads:", err);
        list.innerHTML = `<div style="text-align: center; color: #EF4444; font-size: 11px; margin-top: 10px;">Erro ao carregar pasta</div>`;
    }
}


// CORRE��O: Adicionando o registro do bot�o mp4-720 que estava faltando
if (document.getElementById('btn-dl-mp4-max')) {
    document.getElementById('btn-dl-mp4-max').onclick = function () { iniciarDownloadMedia('video', 'max', this); };
}
if (document.getElementById('btn-dl-mp4-720')) {
    document.getElementById('btn-dl-mp4-720').onclick = function () { iniciarDownloadMedia('video', '720', this); };
}
if (document.getElementById('btn-dl-mp3')) {
    document.getElementById('btn-dl-mp3').onclick = function () { iniciarDownloadMedia('audio', 'mp3', this); };
}

// ===================== NSFW DOWNLOADER (PRIVATE) =====================
function setNSFWPath() {
    if (!userNSFWPath) {
        const path = require('path');
        userNSFWPath = path.join(userSavePath || require('os').homedir(), "Private");
    }

    document.querySelectorAll('#nsfw-path-value-text').forEach(el => el.innerText = userNSFWPath);
    if (document.getElementById('settings-path-nsfw')) document.getElementById('settings-path-nsfw').value = userNSFWPath;
}

setTimeout(setNSFWPath, 1000); // Garante inicializa��o ap�s savePath

if (document.getElementById('btn-nsfw-alterar')) {
    document.getElementById('btn-nsfw-alterar').onclick = () => {
        escolherPastaNSFW();
        // O modal do Settings j� salva userNSFWPath no memory state global, sync back no display local:
        document.querySelectorAll('#nsfw-path-value-text').forEach(el => el.innerText = userNSFWPath);
        carregarHistoricoNSFWLocal();
    };
}

async function iniciarDownloadNSFW(tipo, res, btn) {
    const url = document.getElementById('input-nsfw-url').value.trim();
    if (!url) return notify("Cole o link protegido!", "error");

    const dlStart = document.getElementById('input-nsfw-start') ? document.getElementById('input-nsfw-start').value.trim() : "";
    const dlEnd = document.getElementById('input-nsfw-end') ? document.getElementById('input-nsfw-end').value.trim() : "";

    const progressBox = document.getElementById('nsfw-progress-box');
    const progressFill = document.getElementById('nsfw-progress-fill');
    const progressPercent = document.getElementById('nsfw-progress-percent');
    const progressStatus = document.getElementById('nsfw-progress-status-desc');
    const textStatus = document.getElementById('nsfw-progress-text');

    const original = btn.querySelector('.dl-card-content').innerHTML;

    document.querySelectorAll('#view-nsfw .dl-action-card').forEach(b => b.classList.add('loading'));
    btn.querySelector('.dl-card-content').innerHTML = "<span class='dl-card-title' style='color:#EF4444;'>Preparando...</span>";

    progressBox.style.display = 'flex';
    progressFill.style.width = '0%';
    progressFill.style.background = ''; // FIX: reseta cor vermelha de erro anterior
    progressPercent.innerText = '0%';
    progressStatus.innerText = 'Iniciando conexão segura...';
    textStatus.innerText = 'Baixando HQ...';

    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');

    if (!userNSFWPath) setNSFWPath();
    if (!fs.existsSync(userNSFWPath)) fs.mkdirSync(userNSFWPath, { recursive: true });

    const baseDir = userNSFWPath.replace(/\\/g, '/');
    const uniqueId = "NSFW_" + Date.now();

    const urlLower = url.toLowerCase();
    let siteName = "Private";
    if (urlLower.includes('pornhub')) siteName = "Pornhub";
    else if (urlLower.includes('xvideos')) siteName = "Xvideos";
    else if (urlLower.includes('spankbang')) siteName = "Spankbang";
    else if (urlLower.includes('redtube')) siteName = "RedTube";
    else if (urlLower.includes('xnxx')) siteName = "XNXX";
    else if (urlLower.includes('eporner')) siteName = "Eporner";
    else if (urlLower.includes('xhamster')) siteName = "Xhamster";

    let args = [];
    if (res === '720') {
        args = ["--newline", "--no-warnings", "--no-mtime", "--restrict-filenames", "-S", "vcodec:h264,res:720,acodec:m4a", "--merge-output-format", "mp4", "--recode-video", "mp4", "--no-playlist", "--write-thumbnail", "-o", `${baseDir}/${uniqueId}_[${siteName}]_%(title)s.%(ext)s`, url];
    } else {
        args = ["--newline", "--no-warnings", "--no-mtime", "--restrict-filenames", "-S", "vcodec:h264,acodec:m4a", "--merge-output-format", "mp4", "--recode-video", "mp4", "--no-playlist", "--write-thumbnail", "-o", `${baseDir}/${uniqueId}_[${siteName}]_%(title)s.%(ext)s`, url];
    }

    // ── BYPASS ANTI-SCRAPING ─────────────────────────────────────────────────
    // Estratégia 1: cookies-from-browser (usa sessão real do usuário no Chrome/Safari)
    // Estratégia 2: impersonate chrome (mascara TLS como Chrome real — sem dependência externa)
    progressStatus.innerText = 'Configurando acesso seguro...';

    const isSitePremium = urlLower.includes('pornhub') || urlLower.includes('xvideos') ||
        urlLower.includes('spankbang') || urlLower.includes('redtube') ||
        urlLower.includes('xnxx') || urlLower.includes('eporner') || urlLower.includes('xhamster');

    if (isSitePremium) {
        // Estratégia 1: tentar extrair cookies do Chrome instalado (acesso real de usuário logado)
        const _isMacOS = (typeof process !== 'undefined' && process.platform === 'darwin');
        try {
            const cookiesFromBrowser = _isMacOS ? 'chrome' : 'chrome';
            args.splice(0, 0, '--cookies-from-browser', cookiesFromBrowser);
            console.log('[NSFW] Usando cookies do browser:', cookiesFromBrowser);
        } catch (e) {
            console.warn('[NSFW] Falha ao usar cookies do browser, usando impersonation:', e.message);
        }
        // Estratégia 2: impersonate chrome (TLS fingerprint — sempre ativo como camada extra)
        args.splice(0, 0, '--impersonate', 'chrome');
    }

    if (dlStart || dlEnd) {
        const tempoInicial = dlStart || "0";
        const tempoFinal = dlEnd || "inf";
        args.splice(args.length - 1, 0, "--download-sections", `*${tempoInicial}-${tempoFinal}`);
        args.splice(args.length - 1, 0, "--force-keyframes-at-cuts");
    }

    progressStatus.innerText = 'Puxando o vídeo encapsulado...';
    // Usa caminho absoluto para garantir que o yt-dlp.exe dentro de /tools/ seja encontrado
    const _ytDlpBinNsfw = (PLUGIN_TOOLS_DIR ? require('path').join(PLUGIN_TOOLS_DIR, 'yt-dlp' + _EXE) : 'yt-dlp');
    const ytDlp = spawn(_ytDlpBinNsfw, args, { env: process.env });

    ytDlp.stdout.on('data', (data) => {
        const output = data.toString();
        try { fs.appendFileSync(path.join(baseDir, 'nsfw_debug.txt'), 'STDOUT: ' + output + '\\n'); } catch (e) { }
        const percentMatch = output.match(/(\d+\.\d+)%/);
        if (percentMatch && percentMatch[1]) {
            const percent = parseFloat(percentMatch[1]);
            progressFill.style.width = percent + '%';
            progressPercent.innerText = Math.round(percent) + '%';
            const speedMatch = output.match(/at\s+(.+?\/s)/);
            const etaMatch = output.match(/ETA\s+([\d:]+)/);
            if (speedMatch && etaMatch) {
                progressStatus.innerText = `Blindado Volátil | SD: ${speedMatch[1].trim()} | RESTANTE: ${etaMatch[1].trim()}`;
            } else {
                progressStatus.innerText = "Fragmentando arquivo...";
            }
        } else if (output.includes('Merging') || (output.includes('Extracting') && !output.includes('Extracting URL')) || output.includes('Fixing')) {
            progressFill.style.width = '100%';
            progressPercent.innerText = '100%';
            textStatus.innerText = 'Finalizando...';
            progressStatus.innerText = "Processando arquivo isolado, aguarde...";
        } else if (output.includes('frame=') || output.includes('bitrate=')) {
            progressStatus.innerText = "Baixando blocos HLS via FFmpeg nativo...";
        }
    });

    ytDlp.stderr.on('data', (data) => {
        const errStr = data.toString();
        console.error("YTDLP ERRO:", errStr);
        try { fs.appendFileSync(path.join(baseDir, 'nsfw_debug.txt'), errStr + '\\n'); } catch (e) { }
        if (errStr.toLowerCase().includes('error')) {
            progressStatus.innerText = "Aviso: " + errStr.substring(0, 50) + "...";
        }
    });

    ytDlp.on('close', (code) => {
        try { fs.appendFileSync(path.join(baseDir, 'nsfw_debug.txt'), 'EXIT CODE: ' + code + '\\n'); } catch (e) { }
        document.querySelectorAll('#view-nsfw .dl-action-card').forEach(b => b.classList.remove('loading'));
        btn.querySelector('.dl-card-content').innerHTML = original;

        setTimeout(() => { progressBox.style.display = 'none'; }, 2000);

        if (code !== 0) {
            progressStatus.innerText = "Erro no download!";
            progressFill.style.background = "#EF4444";
            return notify("Erro ou Bloqueio. Tente o modo Rápido (720p).", "error");
        }

        // FIX: aguarda 500ms para garantir que o arquivo final foi escrito pelo FFmpeg
        setTimeout(() => {
            try {
                const arquivos = fs.readdirSync(baseDir);
                let arquivoBaixado = null;
                // FIX: aceita múltiplas extensões (yt-dlp pode gerar .mkv/.webm antes do re-encode)
                const VIDEO_EXTS = ['.mp4', '.mkv', '.webm', '.m4v', '.mov'];
                for (let file of arquivos) {
                    const ext = path.extname(file).toLowerCase();
                    if (file.startsWith(uniqueId) && VIDEO_EXTS.includes(ext)) {
                        arquivoBaixado = path.join(baseDir, file);
                        break;
                    }
                }

                if (arquivoBaixado && fs.existsSync(arquivoBaixado)) {
                    progressStatus.innerText = "Concluído!";
                    // FIX: removido double-escaping JSON.stringify já faz o escape correto
                    csInterface.evalScript(`$._nexxt.importarEAdicionarNaTimeline(${JSON.stringify(arquivoBaixado)})`);
                    notify("Mídia Segura inserida do Cofre!", "success");
                    // FIX: double-refresh 2.5s para o arquivo, 5s para a thumbnail
                    setTimeout(() => { carregarHistoricoNSFWLocal(); }, 2500);
                    setTimeout(() => { carregarHistoricoNSFWLocal(); }, 5000);
                } else {
                    notify("Falha. Arquivo final corrompido ou ausente.", "error");
                }
            } catch (e) {
                notify("Erro interno no acesso ao Cofre Privado.", "error");
            }
        }, 500);
    });
}

function carregarHistoricoNSFWLocal() {
    const list = document.getElementById('nsfw-recent-list');
    if (!list) return;

    list.innerHTML = "";
    const fs = require('fs');
    if (!userNSFWPath) setNSFWPath();

    try {
        if (!fs.existsSync(userNSFWPath)) {
            list.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 11px; margin-top: 20px; opacity:0.5;">Cofre Vazio ou Indisponível</div>`;
            return;
        }

        const files = fs.readdirSync(userNSFWPath)
            .filter(f => f.startsWith('NSFW_') && f.endsWith('.mp4'))
            .map(f => {
                const fullPath = require('path').join(userNSFWPath, f);
                return { name: f, path: fullPath, time: fs.statSync(fullPath).mtime.getTime() };
            }).sort((a, b) => b.time - a.time).slice(0, 15);

        if (files.length === 0) {
            list.innerHTML = `<div style="text-align: center; color: var(--text-secondary); font-size: 11px; margin-top: 20px; opacity:0.5;">Nenhum arquivo no cofre.</div>`;
            return;
        }

        files.forEach(fileInfo => {
            const baseNameNoExt = fileInfo.path.substring(0, fileInfo.path.lastIndexOf('.'));
            let thumbPath = null;
            const thExts = ['.jpg', '.webp', '.avif', '.png'];
            for (let ext of thExts) {
                if (fs.existsSync(baseNameNoExt + ext)) {
                    thumbPath = baseNameNoExt + ext;
                    break;
                }
            }

            adicionarAoHistoricoDownloader(fileInfo.name.replace('NSFW_', ''), 'video', thumbPath, fileInfo.path, list);
        });
    } catch (err) {
        list.innerHTML = `<div style="text-align: center; color: #EF4444; font-size: 11px; margin-top: 10px;">Erro ao carregar o Cofre.</div>`;
    }
}

if (document.getElementById('btn-nsfw-mp4-max')) {
    document.getElementById('btn-nsfw-mp4-max').onclick = function (e) { e.preventDefault(); iniciarDownloadNSFW('video', 'max', this); };
}
if (document.getElementById('btn-nsfw-mp4-720')) {
    document.getElementById('btn-nsfw-mp4-720').onclick = function (e) { e.preventDefault(); iniciarDownloadNSFW('video', '720', this); };
}

// ===================== HEYGEN SYNC (INTEGRA��O E CASCATA) =====================
function verificarLoginHeyGen() {
    heygenKey = localStorage.getItem("heygen_api_key");

    // Sempre esconde o studio ao entrar aqui (voltarGaleria chama esta fun��o)
    const studioEl = document.getElementById('heygen-studio-screen');
    if (studioEl) studioEl.style.display = 'none';

    if (heygenKey) {
        const loginEl = document.getElementById('heygen-login-screen');
        const gallEl = document.getElementById('heygen-gallery-screen');
        if (loginEl) loginEl.style.display = 'none';
        if (gallEl) gallEl.style.display = 'flex';
        // Sincroniza o caminho em tempo real ao abrir
        document.querySelectorAll('.path-value-text').forEach(el => { try { el.innerText = userSavePath; } catch (e) { } });
        carregarDadosHeyGen(null);
    } else {
        const loginEl = document.getElementById('heygen-login-screen');
        const gallEl = document.getElementById('heygen-gallery-screen');
        if (loginEl) loginEl.style.display = 'flex';
        if (gallEl) gallEl.style.display = 'none';
    }
}


if (document.getElementById('btn-save-heygen')) {
    document.getElementById('btn-save-heygen').onclick = () => {
        const input = document.getElementById('input-heygen-key').value.trim();
        if (input === "") return notify("Insira uma chave v�lida", "error");
        localStorage.setItem("heygen_api_key", input);
        notify("Conta conectada com sucesso!", "success");
        verificarLoginHeyGen();
    };
}

// Estado Global do HeyGen (declarado no topo do arquivo)

window.renderizarMockHeyGen = () => {
    const currentFolder = heygenCurrentPath[heygenCurrentPath.length - 1];
    carregarDadosHeyGen(currentFolder.id, currentFolder.name, true);
};

// Navegação de Breadcrumbs
window.navigateToHeyGenBreadcrumb = (index, folderId) => {
    heygenCurrentPath = heygenCurrentPath.slice(0, index + 1);

    // Atualiza o select para "Raiz" se voltar ao topo
    if (index === 0) {
        const select = document.getElementById("heygen-folders-select");
        if (select) select.value = "raiz";
    }

    carregarDadosHeyGen(folderId, null, true);
};

// Quando seleciona uma pasta no Select Dropdown
window.filtrarHeyGenPasta = (folderId, folderName) => {
    if (folderId === "raiz") {
        window.navigateToHeyGenBreadcrumb(0, null);
    } else {
        heygenCurrentPath = [
            { id: null, name: 'Galeria' },
            { id: folderId, name: folderName }
        ];
        carregarDadosHeyGen(folderId, null, false);
    }
};

// Lgica de Filtro em Abas
window.filtrarHeyGen = (filterType) => {
    heygenCurrentFilter = filterType;
    document.querySelectorAll('#heygen-tabs .pill-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderizarVideosHeyGenCacheados();
};

// Evento de Busca
document.getElementById('heygen-search')?.addEventListener('input', (e) => {
    renderizarVideosHeyGenCacheados();
});

function renderizarVideosHeyGenCacheados() {
    const videoGrid = document.getElementById('heygen-grid');
    videoGrid.innerHTML = "";

    const searchTerm = document.getElementById('heygen-search') ? document.getElementById('heygen-search').value.toLowerCase() : "";

    let filtrados = heygenAllVideos.filter(v => {
        const title = (v.title || v.video_title || "").toLowerCase();
        const matchesSearch = title.includes(searchTerm);

        let matchesTab = true;
        if (heygenCurrentFilter === 'processing') {
            matchesTab = v.status !== 'completed'; // Assumindo que o que n�o � completed est� processando
        } else if (heygenCurrentFilter === 'recent') {
            // Ser� ordenado depois
        }
        return matchesSearch && matchesTab;
    });

    if (heygenCurrentFilter === 'recent') {
        // Ordenar por data decrescente (mais novos primeiro) - baseado no created_ts se existir
        filtrados.sort((a, b) => {
            const timeA = a.created_ts || 0;
            const timeB = b.created_ts || 0;
            return timeB - timeA;
        });
        filtrados = filtrados.slice(0, 15); // Limita os 15 mais recentes
    }

    if (filtrados.length === 0) {
        videoGrid.innerHTML = "<div style='grid-column: 1/-1; text-align:center; padding:20px; color:gray;'>Nenhum vídeo encontrado.</div>";
        return;
    }

    filtrados.forEach(v => {
        const vId = v.video_id || v.id;
        const vTitle = v.title || v.video_title || "Avatar Video";
        const safeTitle = vTitle.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        let initialThumb = v.thumbnail_url || v.thumbnail || v.gif_url || v.image_url || "";

        // Formatar Dura��o
        let durationStr = "00:00";
        if (v.duration) {
            const d = Math.round(v.duration);
            const m = Math.floor(d / 60).toString().padStart(2, '0');
            const s = (d % 60).toString().padStart(2, '0');
            durationStr = `${m}:${s}`;
        }

        // Formatar Data
        let dateStr = "";
        if (v.created_ts) {
            const date = new Date(v.created_ts * 1000);
            if (date.getFullYear() > 2000) {
                dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
            }
        }

        const card = document.createElement('div');
        card.className = 'video-card';

        // Label de Processing
        const processingLabel = v.status !== 'completed' ? `<div style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.6); color: #FBBF24; padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; border: 1px solid rgba(251, 191, 36, 0.3); z-index: 2; display: flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg> Processando</div>` : '';

        card.innerHTML = `
            <div class="video-thumb" onclick="${v.status === 'completed' ? `baixarVideoHeyGen('${vId}', '${safeTitle}', this)` : ''}" style="${v.status !== 'completed' ? 'cursor: not-allowed; opacity: 0.7;' : ''}">
                ${processingLabel}
                <img id="thumb-${vId}" src="${initialThumb}" onerror="this.src='https://www.heygen.com/favicon.ico'; this.style.opacity='0.2';" 
                     style="width:100%; height:100%; object-fit:cover; border-radius:12px; transition: 0.3s;">
                ${v.status === 'completed' ? `<div class="video-duration" style="background: rgba(157, 113, 232, 0.9); color: white;">? Importar</div>` : ''}
            </div>
            <div class="video-info" style="display: flex; flex-direction: column; gap: 4px;">
                <span class="video-title" title="${safeTitle}" style="font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${vTitle}</span>
                <div style="display: flex; justify-content: space-between; align-items: center; color: var(--text-secondary); font-size: 11px;">
                    ${dateStr ? `<span>${dateStr}</span>` : '<span>Avatar Video</span>'}
                    ${v.duration ? `<span style="background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px;">${durationStr}</span>` : ''}
                </div>
            </div>
        `;
        videoGrid.appendChild(card);

        if (!initialThumb && v.status === 'completed') {
            fetch(`https://api.heygen.com/v1/video_status.get?video_id=${vId}`, {
                headers: { "x-api-key": heygenKey, "accept": "application/json" }
            })
                .then(r => r.json())
                .then(detail => {
                    const d = detail.data;
                    if (d) {
                        const betterThumb = d.thumbnail_url || d.gif_url || d.image_url;
                        if (betterThumb) {
                            const imgEl = document.getElementById(`thumb-${vId}`);
                            if (imgEl) {
                                imgEl.src = betterThumb;
                                imgEl.style.opacity = '1';
                            }
                        }
                    }
                })
                .catch(err => console.error("Erro ao buscar thumb", vId));
        }
    });
}

function renderizarBreadcrumbs() {
    const container = document.getElementById('heygen-breadcrumbs');
    if (!container) return;

    container.innerHTML = "";
    heygenCurrentPath.forEach((step, index) => {
        const isLast = index === heygenCurrentPath.length - 1;
        const span = document.createElement('span');

        if (isLast) {
            span.style.color = "var(--text-primary)";
            span.innerText = step.name;
        } else {
            span.style.cursor = "pointer";
            span.style.transition = "0.2s";
            span.onmouseover = () => span.style.color = "var(--text-primary)";
            span.onmouseout = () => span.style.color = "var(--text-secondary)";
            span.innerText = step.name;
            span.onclick = () => navigateToHeyGenBreadcrumb(index, step.id);

            const separator = document.createElement('span');
            separator.innerText = ">";
            separator.style.margin = "0 4px";
            separator.style.opacity = "0.5";

            container.appendChild(span);
            container.appendChild(separator);
            return;
        }
        container.appendChild(span);
    });
}

async function carregarDadosHeyGen(folderId, folderName, isNavigatingBreadcrumb) {
    if (folderId === undefined) folderId = null;
    if (folderName === undefined) folderName = null;
    if (isNavigatingBreadcrumb === undefined) isNavigatingBreadcrumb = false;

    var folderGrid = document.getElementById('heygen-folder-grid'); // may be null handled below
    var videoGrid = document.getElementById('heygen-grid');
    var btnRefresh = document.getElementById('btn-refresh-heygen');

    try {
        if (folderName && !isNavigatingBreadcrumb) {
            heygenCurrentPath.push({ id: folderId, name: folderName });
        } else if (!folderId && !isNavigatingBreadcrumb) {
            heygenCurrentPath = [{ id: null, name: 'Galeria' }];
        }
        if (typeof renderizarBreadcrumbs === 'function') renderizarBreadcrumbs();

        if (folderGrid) {
            folderGrid.innerHTML = '';
            for (var i = 0; i < 4; i++) {
                folderGrid.innerHTML += '<div class="folder-card skeleton" style="width:120px;height:38px;"></div>';
            }
        }
        if (videoGrid) {
            videoGrid.innerHTML = '';
            for (var j = 0; j < 8; j++) {
                videoGrid.innerHTML += '<div class="video-card"><div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text" style="width:40%;height:10px;"></div></div>';
            }
        }
        if (btnRefresh) {
            btnRefresh.style.opacity = '0.5';
            btnRefresh.textContent = 'Atualizando...';
        }

        var urlVideos = 'https://api.heygen.com/v1/video.list?limit=100';
        var urlFolders = 'https://api.heygen.com/v1/folders';
        if (folderId) {
            urlVideos += '&folder_id=' + folderId;
            urlFolders += '?parent_id=' + folderId;
        }

        var results = await Promise.all([
            fetch(urlFolders, { headers: { 'x-api-key': heygenKey, 'accept': 'application/json' } }),
            fetch(urlVideos, { headers: { 'x-api-key': heygenKey, 'accept': 'application/json' } })
        ]);
        var folderRes = results[0];
        var videoRes = results[1];

        var fData = await folderRes.json();
        var vData = await videoRes.json();

        var folderSelect = document.getElementById('heygen-folders-select');
        if (folderSelect) {
            // Keep track of current selection
            var currentVal = folderId || "raiz";

            // Clear existing options
            folderSelect.innerHTML = '<option value="raiz">Raiz / Voltar</option>';

            var folders = (fData.data && (fData.data.folders || fData.data.list)) || [];
            folders.forEach(function (f) {
                var fid = f.id || f.folder_id;
                var name = f.name || f.folder_name || f.title || 'Pasta';

                var opt = document.createElement('option');
                opt.value = fid;
                opt.textContent = name;
                folderSelect.appendChild(opt);
            });

            // Re-select the correct option
            var optionExists = Array.from(folderSelect.options).some(function (opt) { return opt.value == currentVal; });
            if (optionExists) {
                folderSelect.value = currentVal;
            } else if (folderId) {
                // Se a pasta atual no tem subpastas ou no retornou a si mesma, adicionamos ela foradamente para ficar selecionado
                var opt = document.createElement('option');
                opt.value = folderId;
                opt.textContent = folderName || "Pasta Atual";
                folderSelect.appendChild(opt);
                folderSelect.value = folderId;
            } else {
                folderSelect.value = "raiz";
            }
        }

        heygenAllVideos = (vData.data && (vData.data.videos || vData.data.list)) || [];
        if (typeof renderizarVideosHeyGenCacheados === 'function') renderizarVideosHeyGenCacheados();

    } catch (err) {
        console.error('[HeyGen] carregarDadosHeyGen erro:', err);
        const errMsg = (err && (err.message || String(err))) || 'erro desconhecido';
        try { if (typeof notify === 'function') notify('HeyGen: ' + errMsg, 'error'); } catch (e) { }
        if (videoGrid) videoGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#EF4444;font-size:12px;">Erro: ' + errMsg + '<br><br>Verifique sua chave de API nas Configurações.</div>';
    } finally {
        if (btnRefresh) {
            btnRefresh.style.opacity = '1';
            btnRefresh.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>';
        }
    }
}

// 3. DOWNLOAD E INJE��O AUTOM�TICA

async function baixarVideoHeyGen(videoId, title, elem) {
    if (!videoId) return notify("ID do vídeo inválido", "error");
    notify("Iniciando transfer�ncia...", "info");
    elem.style.opacity = "0.5";

    try {
        const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
            headers: { "x-api-key": heygenKey, "accept": "application/json" }
        });
        const json = await res.json();
        const videoData = json.data;

        if (videoData && videoData.status === "completed" && videoData.video_url) {
            const fs = require('fs');
            const path = require('path');
            const https = require('https');

            if (!fs.existsSync(userSavePath)) fs.mkdirSync(userSavePath, { recursive: true });

            // LIMPA NOME DO ARQUIVO: Remove caracteres que d�o erro no Windows (\ / : * ? " < > |)
            const safeFileName = title.replace(/[\\/:*?"<>|]/g, "").trim();
            const fileName = safeFileName ? `${safeFileName}.mp4` : `HeyGen_${videoId}.mp4`;

            // Corrige o pathing do windows para n�o quebrar a string no evalScript
            const fullPath = path.join(userSavePath, fileName).replace(/\\/g, '\\\\');
            const file = fs.createWriteStream(fullPath);

            https.get(videoData.video_url, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();

                    // CORRE��O AQUI: Chamando a fun��o existente no Premiere.jsx que joga na pasta "Nexxt Downloads"
                    csInterface.evalScript('$._nexxt.importarEAdicionarNaTimeline("' + fullPath.replace(/\\/g, '/') + '")');

                    notify("Vídeo importado para Nexxt Downloads!", "success");
                    elem.style.opacity = "1";
                });
            }).on('error', (err) => {
                fs.unlink(fullPath); throw err;
            });
        } else {
            notify("O vídeo ainda est� gerando...", "error");
            elem.style.opacity = "1";
        }
    } catch (err) {
        notify("Erro ao baixar vídeo.", "error");
        elem.style.opacity = "1";
    }
}

// ===================== HEYGEN: CLONAGEM DE VOZ DA TIMELINE =====================
async function clonarVozTimeline(btnId, nomeDaVoz) {
    const btn = document.getElementById(btnId);
    if (!btn || btn.classList.contains('loading')) return;

    const textoOriginal = btn.innerHTML;
    btn.classList.add('loading');
    btn.innerHTML = "Lendo Timeline...";

    csInterface.evalScript('$._nexxt.obterDadosParaClonagem()', async function (res) {
        if (!res || res.startsWith("ERRO")) {
            btn.classList.remove('loading');
            btn.innerHTML = textoOriginal;
            notify(res ? res.split("|")[1] : "Erro na comunicação com Premiere", "error");
            return;
        }

        const partes = res.split("||");
        const caminhoAudioOriginal = partes[1];
        const inPoint = parseFloat(partes[2]);
        const duration = parseFloat(partes[3]);

        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const { exec } = require('child_process');

        // Cria um arquivo tempor�rio na pasta Temp do Windows
        const tempDir = os.tmpdir();
        const outputTempPath = path.join(tempDir, `voz_heygen_${Date.now()}.mp3`);

        btn.innerHTML = "Cortando áudio (FFmpeg)...";

        // Comando FFmpeg: -ss (Pula at� o inPoint) e -t (Corta pela dura��o)
        const cmd = `ffmpeg -y -ss ${inPoint} -i "${caminhoAudioOriginal}" -t ${duration} -c:a libmp3lame -q:a 2 "${outputTempPath}"`;

        exec(cmd, async (err) => {
            if (err) {
                btn.classList.remove('loading');
                btn.innerHTML = textoOriginal;
                notify("Erro ao fatiar áudio com FFmpeg. Ele est� instalado?", "error");
                return;
            }

            btn.innerHTML = "Enviando pro HeyGen...";

            try {
                // Prepara o arquivo cortado para o envio via API
                const buffer = fs.readFileSync(outputTempPath);
                const blob = new Blob([buffer], { type: 'audio/mpeg' });

                const formData = new FormData();
                formData.append("file", blob, "clonagem.mp3");
                // *Atenção: A chave 'name' e o endpoint podem variar conforme a documenta��o mais atual do HeyGen.
                // Verifique a doc deles caso eles exijam outro formato no body.
                formData.append("name", nomeDaVoz || "Nova Voz Timeline");

                const response = await fetch("https://api.heygen.com/v1/voice/clone", {
                    method: "POST",
                    headers: {
                        "x-api-key": heygenKey
                        // N�o defina 'Content-Type' aqui; o fetch faz isso sozinho com FormData
                    },
                    body: formData
                });

                const data = await response.json();

                // Limpa o arquivo tempor�rio do HD
                fs.unlinkSync(outputTempPath);

                if (!response.ok || data.error) {
                    throw new Error(data.error?.message || "Erro na API do HeyGen");
                }

                btn.classList.remove('loading');
                btn.innerHTML = textoOriginal;

                // data.data.voice_id (Exemplo de retorno de sucesso)
                notify("Voz clonada com sucesso!", "success");
                console.log("ID da Nova Voz:", data);

            } catch (apiErr) {
                btn.classList.remove('loading');
                btn.innerHTML = textoOriginal;
                notify("Falha no upload: " + apiErr.message, "error");
            }
        });
    });
}



// ===================== ACCORDION LIBRARY MENU =====================
const btnAccordionEffects = document.getElementById("btn-accordion-effects");
const navAccordionEffects = document.getElementById("nav-accordion-effects");

if (btnAccordionEffects && navAccordionEffects) {
    btnAccordionEffects.addEventListener("click", () => {
        btnAccordionEffects.classList.toggle("expanded");
        navAccordionEffects.classList.toggle("open");
    });
}

// Exemplo de como plugar no bot�o do seu HTML
// document.getElementById('btn-clone-voice').onclick = () => clonarVozTimeline('btn-clone-voice', 'Voz do VSL 01');

// ===================== MINIMAX VOICE PICKER ENGINE =====================
(function () {
    // ===================== MM_VOICES LISTA OFICIAL COMPLETA (speech-02-hd/turbo) =====================
    const MM_VOICES = [
        // --- Portuguese (Brazil + PT) ---
        { id: 'Portuguese_SentimentalLady', name: 'Sentimental Lady', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_BossyLeader', name: 'Bossy Leader', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_Wiselady', name: 'Wise Lady', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_Strong-WilledBoy', name: 'Strong-Willed Boy', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_Deep-VoicedGentleman', name: 'Deep Voice Gentleman', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_UpsetGirl', name: 'Upset Girl', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_PassionateWarrior', name: 'Passionate Warrior', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_AnimeCharacter', name: 'Anime Character', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_ConfidentWoman', name: 'Confident Woman', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_AngryMan', name: 'Angry Man', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_CaptivatingStoryteller', name: 'Captivating Storyteller', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_Godfather', name: 'Godfather', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_ReservedYoungMan', name: 'Reserved Young Man', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_SmartYoungGirl', name: 'Smart Young Girl', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_Kind-heartedGirl', name: 'Kind-hearted Girl', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_Pompouslady', name: 'Pompous Lady', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_Grinch', name: 'Grinch', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_Debator', name: 'Debator', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_SweetGirl', name: 'Sweet Girl', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_AttractiveGirl', name: 'Attractive Girl', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_ThoughtfulMan', name: 'Thoughtful Man', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_PlayfulGirl', name: 'Playful Girl', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_GorgeousLady', name: 'Gorgeous Lady', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_LovelyLady', name: 'Lovely Lady', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_SereneWoman', name: 'Serene Woman', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_SadTeen', name: 'Sad Teen', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_MaturePartner', name: 'Mature Partner', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_Comedian', name: 'Comedian', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_NaughtySchoolgirl', name: 'Naughty Schoolgirl', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_Narrator', name: 'Narrator', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_ToughBoss', name: 'Tough Boss', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_Fussyhostess', name: 'Fussy Hostess', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_Dramatist', name: 'Dramatist', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_Steadymentor', name: 'Steady Mentor', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_Jovialman', name: 'Jovial Man', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_CharmingQueen', name: 'Charming Queen', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_SantaClaus', name: 'Santa Claus', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_Rudolph', name: 'Rudolph', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_Arnold', name: 'Arnold', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_CharmingSanta', name: 'Charming Santa', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_CharmingLady', name: 'Charming Lady', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_Ghost', name: 'Ghost', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_HumorousElder', name: 'Humorous Elder', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_CalmLeader', name: 'Calm Leader', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_GentleTeacher', name: 'Gentle Teacher', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_EnergeticBoy', name: 'Energetic Boy', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_ReliableMan', name: 'Reliable Man', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_SereneElder', name: 'Serene Elder', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_GrimReaper', name: 'Grim Reaper', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_AssertiveQueen', name: 'Assertive Queen', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_WhimsicalGirl', name: 'Whimsical Girl', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_StressedLady', name: 'Stressed Lady', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_FriendlyNeighbor', name: 'Friendly Neighbor', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_CaringGirlfriend', name: 'Caring Girlfriend', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_PowerfulSoldier', name: 'Powerful Soldier', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_FascinatingBoy', name: 'Fascinating Boy', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_RomanticHusband', name: 'Romantic Husband', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_StrictBoss', name: 'Strict Boss', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_InspiringLady', name: 'Inspiring Lady', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_PlayfulSpirit', name: 'Playful Spirit', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_ElegantGirl', name: 'Elegant Girl', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_CompellingGirl', name: 'Compelling Girl', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_PowerfulVeteran', name: 'Powerful Veteran', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_SensibleManager', name: 'Sensible Manager', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_ThoughtfulLady', name: 'Thoughtful Lady', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_TheatricalActor', name: 'Theatrical Actor', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_FragileBoy', name: 'Fragile Boy', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_ChattyGirl', name: 'Chatty Girl', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_RationalMan', name: 'Rational Man', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_WiseScholar', name: 'Wise Scholar', lang: 'pt', gender: 'Male' },
        { id: 'Portuguese_FrankLady', name: 'Frank Lady', lang: 'pt', gender: 'Female' },
        { id: 'Portuguese_DeterminedManager', name: 'Determined Manager', lang: 'pt', gender: 'Male' },
        // --- English ---
        { id: 'English_Trustworth_Man', name: 'Trustworthy Man', lang: 'en', gender: 'Male' },
        { id: 'English_Aussie_Bloke', name: 'Aussie Bloke', lang: 'en', gender: 'Male' },
        { id: 'English_CalmWoman', name: 'Calm Woman', lang: 'en', gender: 'Female' },
        { id: 'English_UpsetGirl', name: 'Upset Girl', lang: 'en', gender: 'Female' },
        { id: 'English_Gentle-voiced_man', name: 'Gentle-voiced Man', lang: 'en', gender: 'Male' },
        { id: 'English_Whispering_girl', name: 'Whispering Girl', lang: 'en', gender: 'Female' },
        { id: 'English_Diligent_Man', name: 'Diligent Man', lang: 'en', gender: 'Male' },
        { id: 'English_Graceful_Lady', name: 'Graceful Lady', lang: 'en', gender: 'Female' },
        { id: 'English_ReservedYoungMan', name: 'Reserved Young Man', lang: 'en', gender: 'Male' },
        { id: 'English_PlayfulGirl', name: 'Playful Girl', lang: 'en', gender: 'Female' },
        { id: 'English_ManWithDeepVoice', name: 'Man With Deep Voice', lang: 'en', gender: 'Male' },
        { id: 'English_MaturePartner', name: 'Mature Partner', lang: 'en', gender: 'Male' },
        { id: 'English_FriendlyPerson', name: 'Friendly Person', lang: 'en', gender: 'Neutral' },
        { id: 'English_MatureBoss', name: 'Mature Boss', lang: 'en', gender: 'Male' },
        { id: 'English_Debator', name: 'Debator', lang: 'en', gender: 'Male' },
        { id: 'English_LovelyGirl', name: 'Lovely Girl', lang: 'en', gender: 'Female' },
        { id: 'English_Steadymentor', name: 'Steady Mentor', lang: 'en', gender: 'Male' },
        { id: 'English_Deep-VoicedGentleman', name: 'Deep-Voiced Gentleman', lang: 'en', gender: 'Male' },
        { id: 'English_Wiselady', name: 'Wise Lady', lang: 'en', gender: 'Female' },
        { id: 'English_CaptivatingStoryteller', name: 'Captivating Storyteller', lang: 'en', gender: 'Male' },
        { id: 'English_DecentYoungMan', name: 'Decent Young Man', lang: 'en', gender: 'Male' },
        { id: 'English_SentimentalLady', name: 'Sentimental Lady', lang: 'en', gender: 'Female' },
        { id: 'English_ImposingManner', name: 'Imposing Manner', lang: 'en', gender: 'Male' },
        { id: 'English_SadTeen', name: 'Sad Teen', lang: 'en', gender: 'Female' },
        { id: 'English_PassionateWarrior', name: 'Passionate Warrior', lang: 'en', gender: 'Male' },
        { id: 'English_WiseScholar', name: 'Wise Scholar', lang: 'en', gender: 'Male' },
        { id: 'English_Soft-spokenGirl', name: 'Soft-spoken Girl', lang: 'en', gender: 'Female' },
        { id: 'English_SereneWoman', name: 'Serene Woman', lang: 'en', gender: 'Female' },
        { id: 'English_ConfidentWoman', name: 'Confident Woman', lang: 'en', gender: 'Female' },
        { id: 'English_PatientMan', name: 'Patient Man', lang: 'en', gender: 'Male' },
        { id: 'English_Comedian', name: 'Comedian', lang: 'en', gender: 'Male' },
        { id: 'English_BossyLeader', name: 'Bossy Leader', lang: 'en', gender: 'Female' },
        { id: 'English_Strong-WilledBoy', name: 'Strong-Willed Boy', lang: 'en', gender: 'Male' },
        { id: 'English_StressedLady', name: 'Stressed Lady', lang: 'en', gender: 'Female' },
        { id: 'English_AssertiveQueen', name: 'Assertive Queen', lang: 'en', gender: 'Female' },
        { id: 'English_AnimeCharacter', name: 'Anime Character', lang: 'en', gender: 'Female' },
        { id: 'English_Jovialman', name: 'Jovial Man', lang: 'en', gender: 'Male' },
        { id: 'English_WhimsicalGirl', name: 'Whimsical Girl', lang: 'en', gender: 'Female' },
        { id: 'English_Kind-heartedGirl', name: 'Kind-hearted Girl', lang: 'en', gender: 'Female' },
        // --- Spanish ---
        { id: 'Spanish_SereneWoman', name: 'Serene Woman', lang: 'es', gender: 'Female' },
        { id: 'Spanish_MaturePartner', name: 'Mature Partner', lang: 'es', gender: 'Male' },
        { id: 'Spanish_CaptivatingStoryteller', name: 'Captivating Storyteller', lang: 'es', gender: 'Male' },
        { id: 'Spanish_Narrator', name: 'Narrator', lang: 'es', gender: 'Male' },
        { id: 'Spanish_WiseScholar', name: 'Wise Scholar', lang: 'es', gender: 'Male' },
        { id: 'Spanish_Kind-heartedGirl', name: 'Kind-hearted Girl', lang: 'es', gender: 'Female' },
        { id: 'Spanish_DeterminedManager', name: 'Determined Manager', lang: 'es', gender: 'Male' },
        { id: 'Spanish_BossyLeader', name: 'Bossy Leader', lang: 'es', gender: 'Female' },
        { id: 'Spanish_ReservedYoungMan', name: 'Reserved Young Man', lang: 'es', gender: 'Male' },
        { id: 'Spanish_ConfidentWoman', name: 'Confident Woman', lang: 'es', gender: 'Female' },
        { id: 'Spanish_ThoughtfulMan', name: 'Thoughtful Man', lang: 'es', gender: 'Male' },
        { id: 'Spanish_Strong-WilledBoy', name: 'Strong-Willed Boy', lang: 'es', gender: 'Male' },
        { id: 'Spanish_SophisticatedLady', name: 'Sophisticated Lady', lang: 'es', gender: 'Female' },
        { id: 'Spanish_RationalMan', name: 'Rational Man', lang: 'es', gender: 'Male' },
        { id: 'Spanish_AnimeCharacter', name: 'Anime Character', lang: 'es', gender: 'Female' },
        { id: 'Spanish_Deep-tonedMan', name: 'Deep-toned Man', lang: 'es', gender: 'Male' },
        { id: 'Spanish_Jovialman', name: 'Jovial Man', lang: 'es', gender: 'Male' },
        { id: 'Spanish_SantaClaus', name: 'Santa Claus', lang: 'es', gender: 'Male' },
        { id: 'Spanish_Wiselady', name: 'Wise Lady', lang: 'es', gender: 'Female' },
        { id: 'Spanish_Steadymentor', name: 'Steady Mentor', lang: 'es', gender: 'Male' },
        { id: 'Spanish_EnergeticBoy', name: 'Energetic Boy', lang: 'es', gender: 'Male' },
        { id: 'Spanish_WhimsicalGirl', name: 'Whimsical Girl', lang: 'es', gender: 'Female' },
        { id: 'Spanish_Comedian', name: 'Comedian', lang: 'es', gender: 'Male' },
        { id: 'Spanish_Debator', name: 'Debator', lang: 'es', gender: 'Male' },
        // --- French ---
        { id: 'French_Male_Speech_New', name: 'Male Speech', lang: 'fr', gender: 'Male' },
        { id: 'French_Female_News Anchor', name: 'Female Anchor', lang: 'fr', gender: 'Female' },
        { id: 'French_CasualMan', name: 'Casual Man', lang: 'fr', gender: 'Male' },
        { id: 'French_MovieLeadFemale', name: 'Movie Lead Female', lang: 'fr', gender: 'Female' },
        { id: 'French_FemaleAnchor', name: 'Female Anchor (2)', lang: 'fr', gender: 'Female' },
        { id: 'French_MaleNarrator', name: 'Male Narrator', lang: 'fr', gender: 'Male' },
        // --- German ---
        { id: 'German_FriendlyMan', name: 'Friendly Man', lang: 'de', gender: 'Male' },
        { id: 'German_SweetLady', name: 'Sweet Lady', lang: 'de', gender: 'Female' },
        { id: 'German_PlayfulMan', name: 'Playful Man', lang: 'de', gender: 'Male' },
        // --- Italian ---
        { id: 'Italian_BraveHeroine', name: 'Brave Heroine', lang: 'it', gender: 'Female' },
        { id: 'Italian_Narrator', name: 'Narrator', lang: 'it', gender: 'Male' },
        { id: 'Italian_WanderingSorcerer', name: 'Wandering Sorcerer', lang: 'it', gender: 'Male' },
        { id: 'Italian_DiligentLeader', name: 'Diligent Leader', lang: 'it', gender: 'Male' },
        // --- Korean ---
        { id: 'Korean_SweetGirl', name: 'Sweet Girl', lang: 'ko', gender: 'Female' },
        { id: 'Korean_CheerfulBoyfriend', name: 'Cheerful Boyfriend', lang: 'ko', gender: 'Male' },
        { id: 'Korean_EnchantingSister', name: 'Enchanting Sister', lang: 'ko', gender: 'Female' },
        { id: 'Korean_ShyGirl', name: 'Shy Girl', lang: 'ko', gender: 'Female' },
        { id: 'Korean_ReliableSister', name: 'Reliable Sister', lang: 'ko', gender: 'Female' },
        { id: 'Korean_StrictBoss', name: 'Strict Boss', lang: 'ko', gender: 'Male' },
        { id: 'Korean_SassyGirl', name: 'Sassy Girl', lang: 'ko', gender: 'Female' },
        { id: 'Korean_ChildhoodFriendGirl', name: 'Childhood Friend Girl', lang: 'ko', gender: 'Female' },
        { id: 'Korean_PlayboyCharmer', name: 'Playboy Charmer', lang: 'ko', gender: 'Male' },
        { id: 'Korean_ElegantPrincess', name: 'Elegant Princess', lang: 'ko', gender: 'Female' },
        { id: 'Korean_BraveYouth', name: 'Brave Youth', lang: 'ko', gender: 'Male' },
        { id: 'Korean_CalmLady', name: 'Calm Lady', lang: 'ko', gender: 'Female' },
        { id: 'Korean_IntellectualSenior', name: 'Intellectual Senior', lang: 'ko', gender: 'Male' },
        { id: 'Korean_MatureLady', name: 'Mature Lady', lang: 'ko', gender: 'Female' },
        { id: 'Korean_InnocentBoy', name: 'Innocent Boy', lang: 'ko', gender: 'Male' },
        { id: 'Korean_CharmingSister', name: 'Charming Sister', lang: 'ko', gender: 'Female' },
        { id: 'Korean_CalmGentleman', name: 'Calm Gentleman', lang: 'ko', gender: 'Male' },
        { id: 'Korean_WiseElf', name: 'Wise Elf', lang: 'ko', gender: 'Female' },
        { id: 'Korean_GentleBoss', name: 'Gentle Boss', lang: 'ko', gender: 'Male' },
        { id: 'Korean_ColdGirl', name: 'Cold Girl', lang: 'ko', gender: 'Female' },
        { id: 'Korean_IntellectualMan', name: 'Intellectual Man', lang: 'ko', gender: 'Male' },
        { id: 'Korean_CaringWoman', name: 'Caring Woman', lang: 'ko', gender: 'Female' },
        { id: 'Korean_WiseTeacher', name: 'Wise Teacher', lang: 'ko', gender: 'Male' },
        { id: 'Korean_ConfidentBoss', name: 'Confident Boss', lang: 'ko', gender: 'Male' },
        // --- Japanese ---
        { id: 'Japanese_IntellectualSenior', name: 'Intellectual Senior', lang: 'ja', gender: 'Male' },
        { id: 'Japanese_DecisivePrincess', name: 'Decisive Princess', lang: 'ja', gender: 'Female' },
        { id: 'Japanese_LoyalKnight', name: 'Loyal Knight', lang: 'ja', gender: 'Male' },
        { id: 'Japanese_DominantMan', name: 'Dominant Man', lang: 'ja', gender: 'Male' },
        { id: 'Japanese_SeriousCommander', name: 'Serious Commander', lang: 'ja', gender: 'Male' },
        { id: 'Japanese_ColdQueen', name: 'Cold Queen', lang: 'ja', gender: 'Female' },
        { id: 'Japanese_DependableWoman', name: 'Dependable Woman', lang: 'ja', gender: 'Female' },
        { id: 'Japanese_GentleButler', name: 'Gentle Butler', lang: 'ja', gender: 'Male' },
        { id: 'Japanese_KindLady', name: 'Kind Lady', lang: 'ja', gender: 'Female' },
        { id: 'Japanese_CalmLady', name: 'Calm Lady', lang: 'ja', gender: 'Female' },
        { id: 'Japanese_OptimisticYouth', name: 'Optimistic Youth', lang: 'ja', gender: 'Male' },
        { id: 'Japanese_GenerousIzakayaOwner', name: 'Generous Izakaya Owner', lang: 'ja', gender: 'Male' },
        { id: 'Japanese_SportyStudent', name: 'Sporty Student', lang: 'ja', gender: 'Male' },
        { id: 'Japanese_InnocentBoy', name: 'Innocent Boy', lang: 'ja', gender: 'Male' },
        { id: 'Japanese_GracefulMaiden', name: 'Graceful Maiden', lang: 'ja', gender: 'Female' },
        // --- Chinese ---
        { id: 'Chinese (Mandarin)_Reliable_Executive', name: 'Reliable Executive', lang: 'zh', gender: 'Male' },
        { id: 'Chinese (Mandarin)_News_Anchor', name: 'News Anchor', lang: 'zh', gender: 'Male' },
        { id: 'Chinese (Mandarin)_Mature_Woman', name: 'Mature Woman', lang: 'zh', gender: 'Female' },
        { id: 'Chinese (Mandarin)_Kind-hearted_Antie', name: 'Kind-hearted Auntie', lang: 'zh', gender: 'Female' },
        { id: 'Chinese (Mandarin)_Refreshing_Young_Man', name: 'Refreshing Young Man', lang: 'zh', gender: 'Male' },
        { id: 'Chinese (Mandarin)_Gentleman', name: 'Gentleman', lang: 'zh', gender: 'Male' },
        { id: 'Chinese (Mandarin)_Warm_Bestie', name: 'Warm Bestie', lang: 'zh', gender: 'Female' },
        { id: 'Chinese (Mandarin)_Sweet_Lady', name: 'Sweet Lady', lang: 'zh', gender: 'Female' },
        { id: 'Chinese (Mandarin)_Wise_Women', name: 'Wise Women', lang: 'zh', gender: 'Female' },
        { id: 'Chinese (Mandarin)_Gentle_Youth', name: 'Gentle Youth', lang: 'zh', gender: 'Male' },
        { id: 'Chinese (Mandarin)_Warm_Girl', name: 'Warm Girl', lang: 'zh', gender: 'Female' },
        { id: 'Chinese (Mandarin)_Radio_Host', name: 'Radio Host', lang: 'zh', gender: 'Male' },
        { id: 'Chinese (Mandarin)_Soft_Girl', name: 'Soft Girl', lang: 'zh', gender: 'Female' },
        { id: 'Chinese (Mandarin)_IntellectualGirl', name: 'Intellectual Girl', lang: 'zh', gender: 'Female' },
        { id: 'Chinese (Mandarin)_Warm_HeartedGirl', name: 'Warm-Hearted Girl', lang: 'zh', gender: 'Female' },
        // --- Russian ---
        { id: 'Russian_HandsomeChildhoodFriend', name: 'Handsome Childhood Friend', lang: 'ru', gender: 'Male' },
        { id: 'Russian_BrightHeroine', name: 'Bright Heroine', lang: 'ru', gender: 'Female' },
        { id: 'Russian_AmbitiousWoman', name: 'Ambitious Woman', lang: 'ru', gender: 'Female' },
        { id: 'Russian_ReliableMan', name: 'Reliable Man', lang: 'ru', gender: 'Male' },
        { id: 'Russian_CrazyQueen', name: 'Crazy Queen', lang: 'ru', gender: 'Female' },
        { id: 'Russian_AttractiveGuy', name: 'Attractive Guy', lang: 'ru', gender: 'Male' },
        // --- Arabic ---
        { id: 'Arabic_CalmWoman', name: 'Calm Woman', lang: 'ar', gender: 'Female' },
        { id: 'Arabic_FriendlyGuy', name: 'Friendly Guy', lang: 'ar', gender: 'Male' },
        // --- Indonesian ---
        { id: 'Indonesian_SweetGirl', name: 'Sweet Girl', lang: 'id', gender: 'Female' },
        { id: 'Indonesian_CalmWoman', name: 'Calm Woman', lang: 'id', gender: 'Female' },
        { id: 'Indonesian_ConfidentWoman', name: 'Confident Woman', lang: 'id', gender: 'Female' },
        { id: 'Indonesian_CaringMan', name: 'Caring Man', lang: 'id', gender: 'Male' },
        { id: 'Indonesian_BossyLeader', name: 'Bossy Leader', lang: 'id', gender: 'Female' },
        { id: 'Indonesian_DeterminedBoy', name: 'Determined Boy', lang: 'id', gender: 'Male' },
        // --- Turkish ---
        { id: 'Turkish_CalmWoman', name: 'Calm Woman', lang: 'tr', gender: 'Female' },
        { id: 'Turkish_Trustworthyman', name: 'Trustworthy Man', lang: 'tr', gender: 'Male' },
        // --- Ukrainian ---
        { id: 'Ukrainian_CalmWoman', name: 'Calm Woman', lang: 'uk', gender: 'Female' },
        // --- Dutch ---
        { id: 'Dutch_kindhearted_girl', name: 'Kind-hearted Girl', lang: 'nl', gender: 'Female' },
        { id: 'Dutch_bossy_leader', name: 'Bossy Leader', lang: 'nl', gender: 'Female' },
        // --- Vietnamese ---
        { id: 'Vietnamese_kindhearted_girl', name: 'Kind-hearted Girl', lang: 'vi', gender: 'Female' },
    ];

    let currentMMTag = 'all';

    function renderVoices(voices) {
        const grid = document.getElementById('mm-voice-grid');
        if (!grid) return;
        const q = (document.getElementById('mm-voice-search') || {}).value || '';
        const filtered = voices.filter(v => {
            const matchTag = currentMMTag === 'all' || v.lang === currentMMTag;
            const matchSearch = !q || v.name.toLowerCase().includes(q.toLowerCase());
            return matchTag && matchSearch;
        });
        grid.innerHTML = filtered.map(v => `
            <div onclick="window.selectMMVoice('${v.id}','${v.name}','${v.lang}','${v.gender}')"
                 style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:10px 12px; cursor:pointer; transition:0.2s; display:flex; flex-direction:column; gap:3px;"
                 onmouseover="this.style.background='rgba(124,58,237,0.15)'; this.style.borderColor='rgba(124,58,237,0.4)'"
                 onmouseout="this.style.background='rgba(255,255,255,0.04)'; this.style.borderColor='rgba(255,255,255,0.08)'">
                <div style="font-size:11px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${v.name}</div>
                <div style="font-size:9px; color:var(--text-secondary);">${v.lang.toUpperCase()} &middot; ${v.gender}</div>
            </div>
        `).join('') || '<div style="grid-column:1/-1;text-align:center;padding:20px;opacity:0.4;font-size:12px;">Nenhuma voz encontrada</div>';
    }

    window.openMMVoicePicker = function () {
        const modal = document.getElementById('mm-voice-modal');
        if (!modal) return;
        modal.style.display = 'flex';
        setTimeout(() => modal.style.opacity = '1', 10);
        renderVoices(MM_VOICES);
    };

    window.closeMMVoicePicker = function () {
        const modal = document.getElementById('mm-voice-modal');
        if (!modal) return;
        modal.style.opacity = '0';
        setTimeout(() => modal.style.display = 'none', 220);
    };

    // patch close button
    const closeBtn = document.querySelector('#mm-voice-modal button');
    if (closeBtn) closeBtn.onclick = window.closeMMVoicePicker;

    window.selectMMVoice = function (id, name, lang, gender) {
        const voiceIdEl = document.getElementById('minimax-voice-id');
        const labelEl = document.getElementById('mm-voice-label');
        const subEl = document.getElementById('mm-voice-sub');
        if (voiceIdEl) voiceIdEl.value = id;
        if (labelEl) labelEl.textContent = name;
        if (subEl) subEl.textContent = lang.toUpperCase() + ' · ' + gender;
        window.closeMMVoicePicker();
        // Navigate back: focus textarea so user can start typing immediately
        setTimeout(function () {
            const ta = document.getElementById('input-minimax-text');
            if (ta) ta.focus();
        }, 250);
    };

    window.filterMMVoices = function () { renderVoices(MM_VOICES); };
    window.setMMVoiceTag = function (btn, tag) {
        currentMMTag = tag;
        document.querySelectorAll('.mm-tag-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        renderVoices(MM_VOICES);
    };

    // Wire the voice card click
    const voiceCard = document.getElementById('mm-selected-voice-card');
    if (voiceCard) voiceCard.onclick = window.openMMVoicePicker;

    // Emotion pill selector
    window.setMMEmotionDropdown = function (sel) { /* legacy, handled by pills now */ };
    window.setMMEmotion = function (btn, value) {
        document.querySelectorAll('.mm-emotion-pill').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        const hidden = document.getElementById('minimax-emotion');
        if (hidden) hidden.value = value;
    };

    // Language Boost pill selector
    window.setLangBoost = function (btn) {
        document.querySelectorAll('.lang-boost-pill').forEach(function (b) {
            b.classList.remove('lb-active');
            b.style.background = 'rgba(255,255,255,0.04)';
            b.style.borderColor = 'rgba(255,255,255,0.1)';
            b.style.color = 'rgba(255,255,255,0.5)';
        });
        if (btn) {
            btn.classList.add('lb-active');
            btn.style.background = 'rgba(124,58,237,0.25)';
            btn.style.borderColor = 'rgba(124,58,237,0.6)';
            btn.style.color = '#a78bfa';
            const langEl = document.getElementById('minimax-language');
            if (langEl) langEl.value = btn.dataset.val;
        }
    };

    // Set default voice label to match new voice list
    (function () {
        const labelEl = document.getElementById('mm-voice-label');
        const subEl = document.getElementById('mm-voice-sub');
        const idEl = document.getElementById('minimax-voice-id');
        if (idEl && idEl.value === 'Wise_Woman') {
            idEl.value = 'English_Wiselady';
            if (labelEl) labelEl.textContent = 'Wise Lady';
            if (subEl) subEl.textContent = 'EN \u00b7 Female';
        }
    })();

    // Char counter for main textarea
    (function () {
        const ta = document.getElementById('input-minimax-text');
        const cnt = document.getElementById('mm-char-count');
        if (ta && cnt) {
            ta.addEventListener('input', function () {
                cnt.innerText = ta.value.length.toLocaleString();
                cnt.style.color = ta.value.length > 10000 ? '#ef4444' : 'inherit';
            });
        }
    })();
})();

// (IIFE duplicada do HeyGen Gallery Loader removida verificarLoginHeyGen original na linha ~1537 é a versão correta)

// ===================== MINIMAX SPEECH 2.6 TURBO (REPLICATE) =====================
(function () {
    const btn = document.getElementById('btn-generate-minimax');
    if (!btn) return;

    btn.addEventListener('click', async function () {
        // --- Guard: Replicate key (usa a variável global hardcoded) ---
        if (!replicateKey) {
            notify('Chave API do Replicate não encontrada. Contate o suporte.', 'error');
            return;
        }

        // --- Read all UI controls ---
        const text = (document.getElementById('input-minimax-text') || {}).value || '';
        if (!text.trim()) {
            notify('Escreva o texto para gerar a voz.', 'error');
            return;
        }

        const voiceId = (document.getElementById('minimax-voice-id') || {}).value || 'Wise_Woman';
        const emotion = (document.getElementById('minimax-emotion') || {}).value || 'auto';
        const speed = parseFloat((document.getElementById('minimax-speed') || {}).value || '1.0');
        const pitch = parseInt((document.getElementById('minimax-pitch') || {}).value || '0', 10);
        const volume = parseFloat((document.getElementById('minimax-volume') || {}).value || '1.0');
        const langBoost = (document.getElementById('minimax-language') || {}).value || 'Null';
        const enNorm = !!(document.getElementById('minimax-en-norm') || {}).checked;

        // --- Parse format selector (e.g. "mp3_128000", "wav", "flac") ---
        const formatRaw = (document.getElementById('minimax-format') || {}).value || 'mp3_128000';
        let audioFormat = 'mp3';
        let bitrate = 128000;
        if (formatRaw === 'wav') { audioFormat = 'wav'; bitrate = 128000; }
        else if (formatRaw === 'flac') { audioFormat = 'flac'; bitrate = 128000; }
        else if (formatRaw === 'mp3_256000') { audioFormat = 'mp3'; bitrate = 256000; }
        else { audioFormat = 'mp3'; bitrate = 128000; }

        // Determine file extension
        const ext = (audioFormat === 'flac') ? 'flac'
            : (audioFormat === 'wav') ? 'wav'
                : 'mp3';


        // --- HD Mode: selects between Turbo and HD model ---
        const isHDMode = !!(document.getElementById('minimax-hd-toggle') || {}).checked;
        const ttsEndpoint = isHDMode
            ? 'https://api.replicate.com/v1/models/minimax/speech-02-hd/predictions'
            : 'https://api.replicate.com/v1/models/minimax/speech-2.6-turbo/predictions';

        // --- UI: loading state ---
        const statusEl = document.getElementById('minimax-status');
        const originalLabel = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = isHDMode ? '️ Gerando em HD...' : ' Enviando para MiniMax...';
        if (statusEl) { statusEl.style.display = 'block'; statusEl.innerText = isHDMode ? 'Gerando com MiniMax HD (alta fidelidade)...' : 'Criando predição na Replicate...'; }

        try {
            // -- Step 1: Create prediction --------------------------------------
            const createRes = await fetch(ttsEndpoint, {
                method: 'POST',
                headers: {
                    'Authorization': 'Token ' + replicateKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'wait'  // ask Replicate to wait up to 60s
                },
                body: JSON.stringify({
                    input: {
                        text: text,
                        voice_id: voiceId,
                        emotion: emotion,
                        speed: speed,
                        pitch: pitch,
                        volume: volume,
                        audio_format: audioFormat,
                        bitrate: bitrate,
                        language_boost: langBoost,
                        english_normalization: enNorm
                    }
                })
            });

            if (!createRes.ok) {
                const errBody = await createRes.text();
                if (createRes.status === 429 || createRes.status === 402) {
                    throw new Error('Limite Excedido (429/402). Verifique seu cartão ou recarregue fundos na Replicate.');
                }
                throw new Error('Replicate error ' + createRes.status + ': ' + errBody);
            }

            let prediction = await createRes.json();

            // -- Step 2: Poll until succeeded / failed -------------------------
            if (statusEl) statusEl.innerText = 'Aguardando modelo MiniMax... (pode levar ~15s)';

            const MAX_POLLS = 40;
            let polls = 0;
            while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled') {
                if (polls++ >= MAX_POLLS) throw new Error('Timeout: MiniMax demorou mais de ~2 minutos. Tente novamente.');
                await new Promise(r => setTimeout(r, 3000));
                if (statusEl) statusEl.innerText = 'Processando... (' + (polls * 3) + 's)';

                const pollRes = await fetch('https://api.replicate.com/v1/predictions/' + prediction.id, {
                    headers: { 'Authorization': 'Token ' + replicateKey }
                });
                prediction = await pollRes.json();
            }

            if (prediction.status !== 'succeeded') {
                throw new Error('Falha na geração: ' + (prediction.error || prediction.status));
            }

            // -- Step 3: Get audio URL from output -----------------------------
            // Replicate returns output as a string URL (or sometimes wrapped in object)
            let audioUrl = prediction.output;
            if (typeof audioUrl === 'object' && audioUrl !== null) {
                audioUrl = audioUrl.audio || audioUrl.url || Object.values(audioUrl)[0];
            }
            if (!audioUrl || typeof audioUrl !== 'string') {
                throw new Error('URL de áudio inv�lida retornada pela API.');
            }

            // -- Step 4: Download audio to local file --------------------------
            if (statusEl) statusEl.innerText = 'Baixando áudio gerado...';

            const path = require('path');
            const fs = require('fs');

            if (!userSavePath) { notify('Defina uma pasta de saída nas Configurações.', 'error'); return; }
            if (!fs.existsSync(userSavePath)) fs.mkdirSync(userSavePath, { recursive: true });

            const fileName = 'MiniMax_' + Date.now() + '.' + ext;
            const fullPath = path.join(userSavePath, fileName);

            const audioRes = await fetch(audioUrl);
            if (!audioRes.ok) throw new Error('Falha no download do áudio: ' + audioRes.status);

            const buffer = Buffer.from(await audioRes.arrayBuffer());
            fs.writeFileSync(fullPath, buffer);

            // -- Step 5: Inject into Premiere timeline -------------------------
            if (statusEl) statusEl.innerText = 'Inserindo na timeline...';
            const safePath = fullPath.replace(/\\/g, '\\\\');
            csInterface.evalScript('$._nexxt.importarEAdicionarNaTimeline("' + safePath.replace(/\\/g, '/') + '")', () => { });

            notify('??? Voz MiniMax inserida na timeline!', 'success');

        } catch (err) {
            console.error('[MiniMax TTS]', err);
            notify('Erro MiniMax: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalLabel;
            if (statusEl) { statusEl.style.display = 'none'; }
        }
    });
})();

// ===================== IMPORTAR SRT ? GERAR LEGENDAS =====================
(function () {
    const btnSrt = document.getElementById('btn-import-srt');
    if (!btnSrt) return;

    btnSrt.addEventListener('click', function () {
        // Use a hidden file input to open the native OS file picker
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.srt';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.onchange = async function () {
            const file = input.files && input.files[0];
            document.body.removeChild(input);
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (e) {
                const raw = e.target.result;

                // -- Parse SRT -----------------------------------------------
                // Suporta: \n (Unix), \r\n (Windows), \r (Mac antigo)
                // Suporta: HH:MM:SS,mmm e HH:MM:SS.mmm
                // Suporta: tags HTML (<i>, <b>, <font>), tags estilo {ASS}, posicionamento
                function srtTimeToSec(t) {
                    // "HH:MM:SS,mmm" ou "HH:MM:SS.mmm"
                    // Usa regex para extrair partes com precisao
                    const m = t.match(/(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
                    if (!m) return 0;
                    const ms = parseInt(m[4].padEnd(3, '0'), 10); // normaliza 1-3 digitos p/ ms
                    return parseInt(m[1], 10) * 3600
                         + parseInt(m[2], 10) * 60
                         + parseInt(m[3], 10)
                         + ms / 1000;
                }

                const gapEl = document.getElementById('slider-gap-frames');
                const gapFrames = gapEl ? parseInt(gapEl.value) : 3;

                // Normaliza line-endings para \n antes de dividir
                const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                // Divide em blocos por linha em branco (1 ou mais)
                const blocks = normalized.trim().split(/\n{2,}/);
                const captions = [];

                blocks.forEach(block => {
                    const lines = block.split('\n').map(l => l.trim()).filter(l => l !== '');
                    if (lines.length < 2) return;

                    // Encontra linha de timecode (contém -->)
                    const tcIdx = lines.findIndex(l => l.includes('-->'));
                    if (tcIdx === -1) return;

                    const tcLine = lines[tcIdx];
                    // Aceita HH:MM:SS,mmm e HH:MM:SS.mmm; ignora extras na linha (posicionamento etc.)
                    const tcMatch = tcLine.match(/(\d+:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d+:\d{2}:\d{2}[,.]\d{1,3})/);
                    if (!tcMatch) return;

                    const start = srtTimeToSec(tcMatch[1]);
                    const end   = srtTimeToSec(tcMatch[2]);

                    // Texto: todas as linhas após o timecode, unidas por espaço
                    const text = lines.slice(tcIdx + 1)
                        .join(' ')
                        .replace(/<[^>]+>/g, '')     // strip tags HTML como <i>, <b>, <font>
                        .replace(/\{[^}]*\}/g, '')   // strip tags ASS/SSA como {\an8}
                        .replace(/\s+/g, ' ')        // colapsa espaços multiplos
                        .trim();

                    if (text && end > start) {
                        captions.push({ text, start, end, gapFrames });
                    }
                });

                if (captions.length === 0) {
                    notify('Nenhuma legenda encontrada no arquivo SRT.', 'error');
                    return;
                }

                // -- Require a MOGRT to be selected --------------------------
                // selectedMogrtPath is declared in captions.js (same global scope)
                if (typeof selectedMogrtPath === 'undefined' || !selectedMogrtPath) {
                    notify('Selecione um template MOGRT antes de importar o SRT.', 'error');
                    return;
                }

                notify('SRT lido (' + captions.length + ' legendas) � enviando para a timeline...', 'info');

                // -- Obter offset do clipe selecionado na timeline --
                // SRT timestamps sao relativos ao inicio do arquivo de midia.
                // Se o clipe esta na posicao X da sequence, somamos X a cada timestamp.
                csInterface.evalScript('$._nexxt.obterOffsetClipeSelecionado()', function(offsetRes) {
                    var clipOffset = parseFloat(offsetRes) || 0;

                    var captionsComOffset = captions.map(function(c) {
                        return { text: c.text, start: c.start + clipOffset, end: c.end + clipOffset, gapFrames: c.gapFrames };
                    });

                    var offsetMsg = clipOffset > 0 ? ' (offset +' + clipOffset.toFixed(2) + 's)' : '';
                    notify('SRT lido (' + captionsComOffset.length + ' legendas)' + offsetMsg + ' - enviando para a timeline...', 'info');

                    // -- Send to Premiere via gerarLegendasMogrt ------------------
                    function getBase64(str) {
                        return btoa(unescape(encodeURIComponent(str)));
                    }

                    const payload = JSON.stringify({ chunks: captionsComOffset, gapFrames: gapFrames, bleepsData: [] });
                    const b64 = JSON.stringify(getBase64(payload));
                    const pPath = JSON.stringify(selectedMogrtPath);
                    const pExt = JSON.stringify(csInterface.getSystemPath(SystemPath.EXTENSION));

                    csInterface.evalScript(
                        '$._nexxt.gerarLegendasMogrt(' + b64 + ', ' + pPath + ', true, ' + pExt + ')',
                        function (res) {
                            if (res && res.indexOf('SUCESSO') === 0) {
                                var diagPart = res.indexOf('|') > -1 ? res.split('|').slice(1).join(' ').trim() : '';
                                notify('SRT inserido! ' + (diagPart || ''), 'success');
                            } else if (res === 'ERRO_TRILHA') {
                                notify('Crie a Trilha de Video 2 (V2) para inserir as legendas.', 'error');
                            } else {
                                notify(res || 'Erro ao inserir legendas do SRT.', 'error');
                            }
                        }
                    );
                });
            };

            reader.readAsText(file, 'UTF-8');
        };

        input.click();
    });
})();

// (IIFE V3 REDESIGN removido funções unificadas no VOICE PICKER ENGINE acima)

// ===================== EMOTION GRID PICKER (MINIMAX) =====================
(function () {
    // Inject CSS for the emotion grid buttons
    const style = document.createElement('style');
    style.textContent = `
        .mm-em-btn {
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            color: rgba(255,255,255,0.8);
            border-radius: 7px;
            padding: 7px 4px;
            font-size: 10px;
            font-weight: 600;
            cursor: pointer;
            text-align: center;
            transition: 0.15s;
            white-space: nowrap;
        }
        .mm-em-btn:hover {
            background: rgba(124,58,237,0.2);
            border-color: rgba(124,58,237,0.5);
            color: #fff;
        }
        .mm-em-btn.active {
            background: rgba(124,58,237,0.3);
            border-color: rgba(124,58,237,0.6);
            color: #fff;
            font-weight: 700;
        }
        #mm-emotion-grid {
            display: none;
        }
        #mm-emotion-grid.open {
            display: grid !important;
        }
    `;
    document.head.appendChild(style);

    window._mmEmotionOpen = false;

    window.toggleMMEmotionGrid = function () {
        const grid = document.getElementById('mm-emotion-grid');
        const chevron = document.getElementById('mm-emotion-chevron');
        const selector = document.getElementById('mm-emotion-selector');
        if (!grid) return;
        window._mmEmotionOpen = !window._mmEmotionOpen;
        grid.classList.toggle('open', window._mmEmotionOpen);
        if (chevron) chevron.style.transform = window._mmEmotionOpen ? 'rotate(180deg)' : '';
        if (selector) selector.style.borderColor = window._mmEmotionOpen ? 'rgba(124,58,237,0.5)' : '';
    };

    window.selectMMEmotion = function (value, label, btn) {
        const hidden = document.getElementById('minimax-emotion');
        const labelEl = document.getElementById('mm-emotion-label');
        if (hidden) hidden.value = value;
        if (labelEl) labelEl.textContent = label;
        // Update active button styling
        document.querySelectorAll('.mm-em-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        // Close the grid
        window._mmEmotionOpen = false;
        const grid = document.getElementById('mm-emotion-grid');
        const chevron = document.getElementById('mm-emotion-chevron');
        const selector = document.getElementById('mm-emotion-selector');
        if (grid) grid.classList.remove('open');
        if (chevron) chevron.style.transform = '';
        if (selector) selector.style.borderColor = '';
    };

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#mm-emotion-selector') && window._mmEmotionOpen) {
            window._mmEmotionOpen = false;
            const grid = document.getElementById('mm-emotion-grid');
            const chevron = document.getElementById('mm-emotion-chevron');
            const selector = document.getElementById('mm-emotion-selector');
            if (grid) grid.classList.remove('open');
            if (chevron) chevron.style.transform = '';
            if (selector) selector.style.borderColor = '';
        }
    });
})();

// ---------------------------------------------------------------
// NEXXT LICENSE GUARD
// Valida a chave de licença do usuário na inicialização do plugin.
// ---------------------------------------------------------------

// ️ CONFIGURE: troque pela URL real do seu site no Netlify:
const NEXXT_VALIDATE_URL = 'https://nexxtedit.netlify.app/.netlify/functions/validate-login';
const NEXXT_USAGE_URL = 'https://nexxtedit.netlify.app/.netlify/functions/check-and-increment-usage';
const NEXXT_TOPUP_URL = 'https://nexxtedit.netlify.app/.netlify/functions/create-topup-checkout';
const NEXXT_LOGOUT_URL = 'https://nexxtedit.netlify.app/.netlify/functions/logout-device';

function getDeviceId() {
    try {
        const os = require('os');
        return os.hostname() + '_' + os.userInfo().username;
    } catch (e) {
        let id = localStorage.getItem('nx_device_id');
        if (!id) {
            const arr = new Uint8Array(16);
            crypto.getRandomValues(arr);
            id = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
            localStorage.setItem('nx_device_id', id);
        }
        return id;
    }
}

async function validateLicenseRemote(email, license_key) {
    return new Promise((resolve) => {
        try {
            const https = require('https');
            const payload = JSON.stringify({ email, license_key, device_id: getDeviceId(), source: 'plugin' });
            const req = https.request({
                hostname: 'nexxtedit.netlify.app',
                path: '/.netlify/functions/validate-login',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            }, (res) => {
                let raw = '';
                res.on('data', chunk => raw += chunk);
                res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
            });
            req.on('error', () => resolve(null));
            req.write(payload);
            req.end();
        } catch (e) { resolve(null); }
    });
}

async function checkLicense() {
    const stored = localStorage.getItem('nexxt_license');
    if (!stored) return false;
    try {
        const { email, license_key } = JSON.parse(stored);
        if (!email || !license_key) return false;
        const data = await validateLicenseRemote(email, license_key);
        if (!data) return true;          // sem internet: confia na licença salva
        if (data.ok) {
            // Atualiza o plano salvo caso tenha mudado
            try {
                const s = JSON.parse(localStorage.getItem('nexxt_license') || '{}');
                if (data.user && data.user.plan) { s.plan = data.user.plan; localStorage.setItem('nexxt_license', JSON.stringify(s)); }
            } catch (e) { }
            return true;
        }
        if (data.error) localStorage.removeItem('nexxt_license'); // licença revogada
        return false;
    } catch (e) {
        return true; // erro de rede: confia na licença salva
    }
}

// ---------------------------------------------------------------
// NEXXT USAGE CHECK verifica quota no servidor antes de gerar
// ---------------------------------------------------------------
async function nexxtCheckUsage(action, toolName) {
    const raw = localStorage.getItem('nexxt_license');
    if (!raw) return { allowed: false, reason: 'not_logged_in' };
    let license_key;
    try { license_key = JSON.parse(raw).license_key; } catch { return { allowed: false, reason: 'invalid_session' }; }
    if (!license_key) return { allowed: false, reason: 'no_key' };

    return new Promise((resolve) => {
        try {
            const https = require('https');
            const payload = JSON.stringify({ license_key, action, tool_name: toolName || 'Unknown' });
            const req = https.request({
                hostname: 'nexxtedit.netlify.app',
                path: '/.netlify/functions/check-and-increment-usage',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({ allowed: true }); } });
            });
            req.on('error', () => resolve({ allowed: true })); // erro de rede: libera
            req.write(payload);
            req.end();
        } catch (e) { resolve({ allowed: true }); }
    });
}
window.nexxtCheckUsage = nexxtCheckUsage;

// ---------------------------------------------------------------
// NEXXT LOGOUT desvincula dispositivo e volta para tela de login
// ---------------------------------------------------------------
async function logoutDevice() {
    const raw = localStorage.getItem('nexxt_license');
    if (!raw) { showActivationScreen(); return; }
    const { email, license_key } = JSON.parse(raw);

    notify('Deslogando...', 'info');
    try {
        const https = require('https');
        const payload = JSON.stringify({ email, license_key });
        await new Promise((resolve) => {
            const req = https.request({
                hostname: 'nexxtedit.netlify.app',
                path: '/.netlify/functions/logout-device',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            }, (res) => { res.on('data', () => { }); res.on('end', resolve); });
            req.on('error', resolve);
            req.write(payload);
            req.end();
        });
    } catch (e) { }

    localStorage.removeItem('nexxt_license');
    const ov = document.getElementById('nexxt-license-overlay');
    if (ov) ov.remove();
    showActivationScreen();
}
window.logoutDevice = logoutDevice;

// ---------------------------------------------------------------
// NEXXT TOP-UP abre checkout Stripe para pacotes de crédito
// ---------------------------------------------------------------
async function buyTopUp(packType) {
    const raw = localStorage.getItem('nexxt_license');
    if (!raw) { notify('Nenhuma licença ativa encontrada.', 'error'); return; }
    const { license_key } = JSON.parse(raw);
    if (!license_key) { notify('Chave de licença não encontrada.', 'error'); return; }

    notify('Aguarde, gerando checkout...', 'info');
    try {
        const https = require('https');
        const payload = JSON.stringify({ license_key, pack_type: packType });
        const data = await new Promise((resolve, reject) => {
            const req = https.request({
                hostname: 'nexxtedit.netlify.app',
                path: '/.netlify/functions/create-topup-checkout',
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
            }, (res) => {
                let raw = '';
                res.on('data', chunk => raw += chunk);
                res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
            });
            req.on('error', reject);
            req.write(payload);
            req.end();
        });
        if (data.url) {
            if (window.csInterface) {
                window.csInterface.openURLInDefaultBrowser(data.url);
            } else {
                window.open(data.url, '_blank');
            }
        } else {
            notify('Erro ao gerar checkout: ' + (data.detail || data.error || 'tente novamente'), 'error');
        }
    } catch (e) {
        console.error('buyTopUp error:', e);
        notify('Erro de conexão. Tente novamente.', 'error');
    }
}
window.buyTopUp = buyTopUp;

function showActivationScreen() {
    const overlay = document.createElement('div');
    overlay.id = 'nexxt-license-overlay';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:999999',
        'background:#0d0d14',
        'display:flex', 'align-items:center', 'justify-content:center',
        'opacity:0', 'transition:opacity 0.4s ease',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'
    ].join(';');

    overlay.innerHTML = `
        <div style="
            background:linear-gradient(135deg,rgba(18,16,30,0.99),rgba(10,10,18,1));
            border:1px solid rgba(120,86,255,0.25);
            border-radius:20px;
            padding:40px 36px;
            max-width:360px;
            width:90%;
            box-shadow:0 25px 60px rgba(0,0,0,0.7),0 0 50px rgba(120,86,255,0.12);
            position:relative;
            overflow:hidden;
        ">
            <div style="position:absolute;top:-50px;left:50%;width:220px;height:220px;background:rgba(120,86,255,0.12);filter:blur(70px);transform:translateX(-50%);pointer-events:none;"></div>
            <div style="position:absolute;top:0;left:15%;right:15%;height:1px;background:linear-gradient(90deg,transparent,rgba(155,124,255,0.5),transparent);"></div>
            <div style="text-align:center;margin-bottom:28px;position:relative;z-index:2;">
                <div style="font-size:34px;margin-bottom:10px;"></div>
                <div style="font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:rgba(155,124,255,0.8);margin-bottom:6px;">NEXXT EFFECTS</div>
                <h2 style="margin:0;font-size:17px;font-weight:700;color:#fff;letter-spacing:-0.3px;">Ativar Licença</h2>
                <p style="margin:8px 0 0;font-size:11px;color:rgba(139,138,160,0.6);line-height:1.7;">Digite seu e-mail e a chave de licença<br>recebida após a compra.</p>
            </div>
            <div style="position:relative;z-index:2;">
                <div style="margin-bottom:12px;">
                    <label style="display:block;font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:rgba(139,138,160,0.5);margin-bottom:6px;">E-mail</label>
                    <input id="nx-act-email" type="email" placeholder="seu@email.com" autocomplete="email" style="
                        width:100%;background:rgba(0,0,0,0.35);
                        border:1px solid rgba(255,255,255,0.07);
                        border-radius:10px;padding:11px 13px;font-size:13px;
                        color:#fff;outline:none;font-family:inherit;
                        transition:border-color .2s;box-sizing:border-box;
                    "/>
                </div>
                <div style="margin-bottom:18px;">
                    <label style="display:block;font-size:9px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:rgba(139,138,160,0.5);margin-bottom:6px;">Chave de Licença</label>
                    <input id="nx-act-key" type="text" placeholder="NX-XXXX-XXXX-XXXX" autocomplete="off" style="
                        width:100%;background:rgba(0,0,0,0.35);
                        border:1px solid rgba(255,255,255,0.07);
                        border-radius:10px;padding:11px 13px;font-size:13px;
                        color:#fff;outline:none;font-family:monospace;letter-spacing:0.08em;
                        transition:border-color .2s;box-sizing:border-box;
                    "/>
                </div>
                <button id="nx-act-btn" style="
                    width:100%;padding:13px;border-radius:11px;border:none;
                    background:linear-gradient(135deg,#7856ff,#9b7cff);
                    color:#fff;font-size:13px;font-weight:700;cursor:pointer;
                    box-shadow:0 0 28px rgba(120,86,255,0.4);
                    transition:opacity .2s;letter-spacing:0.02em;
                    font-family:inherit;
                ">Ativar Plugin</button>
                <div id="nx-act-err" style="
                    font-size:11px;color:#f87171;text-align:center;
                    margin-top:10px;min-height:16px;
                "></div>
                <p style="text-align:center;margin-top:14px;font-size:10px;color:rgba(139,138,160,0.35);line-height:1.6;">
                    Sem licença? Acesse <span style="color:rgba(155,124,255,0.7);">nexxt.edit</span> para adquirir.
                </p>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    setTimeout(() => {
        const inp = document.getElementById('nx-act-email');
        if (inp) inp.focus();
    }, 400);

    document.getElementById('nx-act-btn').addEventListener('click', activateLicense);
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Enter') activateLicense(); });
}

async function activateLicense() {
    const emailEl = document.getElementById('nx-act-email');
    const keyEl = document.getElementById('nx-act-key');
    const btn = document.getElementById('nx-act-btn');
    const errEl = document.getElementById('nx-act-err');

    const email = (emailEl.value || '').trim();
    const key = (keyEl.value || '').trim().toUpperCase();

    errEl.textContent = '';
    errEl.style.color = '#f87171';

    if (!email || !key) { errEl.textContent = 'Preencha todos os campos.'; return; }
    if (!email.includes('@')) { errEl.textContent = 'E-mail inválido.'; return; }
    if (!key.startsWith('NX-')) { errEl.textContent = 'Formato inválido. Ex: NX-XXXX-XXXX-XXXX'; return; }

    btn.textContent = 'Verificando...';
    btn.style.opacity = '0.6';
    btn.style.pointerEvents = 'none';

    try {
        const data = await validateLicenseRemote(email, key);

        if (data && data.ok) {
            localStorage.setItem('nexxt_license', JSON.stringify({ email, license_key: key, plan: data.user?.plan || 'Starter' }));
            const ov = document.getElementById('nexxt-license-overlay');
            ov.style.opacity = '0';
            setTimeout(() => {
                ov.remove();
                if (typeof mostrarTela === 'function') { mostrarTela('view-welcome'); clearSidebarActive(); }
                if (typeof carregarHistoricoDownloaderLocal === 'function') carregarHistoricoDownloaderLocal();
                if (typeof verificarAtualizacao === 'function') verificarAtualizacao();
            }, 350);
            return;
        }

        btn.textContent = 'Ativar Plugin';
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';

        const errs = {
            invalid_credentials: 'E-mail ou chave de licença incorretos.',
            license_inactive: 'Esta licença foi cancelada ou desativada.',
            device_mismatch: '️ Chave já ativa em outro dispositivo.',
        };
        const code = data && data.error;
        errEl.textContent = errs[code] || 'Erro ao validar. Tente novamente.';
        if (code === 'device_mismatch') errEl.style.color = '#fbbf24';

    } catch (e) {
        btn.textContent = 'Ativar Plugin';
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        errEl.textContent = 'Erro de conexão. Verifique sua internet.';
    }
}

// ---------------------------------------------------------------
// Initialize requer licença ativa para usar o plugin
// ---------------------------------------------------------------
(function initNexxt() {
    function runInit() {
        const savedLicense = localStorage.getItem('nexxt_license');
        if (!savedLicense) {
            showActivationScreen();
            return;
        }
        if (typeof mostrarTela === 'function') {
            mostrarTela('view-welcome');
            clearSidebarActive();
        }
        if (typeof carregarHistoricoDownloaderLocal === 'function') carregarHistoricoDownloaderLocal();
        if (typeof verificarAtualizacao === 'function') verificarAtualizacao();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runInit);
    } else {
        runInit();
    }
})();



// ===================== KLING 2.5 TURBO PRO =====================
(function () {
    'use strict';

    // State 
    var HISTORY_KEY = 'nexxt_kling_history';
    var klingState = {
        startImage: null,   // { dataUri: 'data:image/...;base64,...' }
        endImage: null,
        aspectRatio: '16:9',
        duration: 5,
        negOpen: false
    };

    // Helpers 
    function klingSetStatus(msg, type) {
        var el = document.getElementById('kling-status');
        if (!el) return;
        if (!msg) { el.style.display = 'none'; return; }
        el.style.display = 'block';
        el.innerText = msg;
        if (type === 'error') {
            el.style.background = 'rgba(239,68,68,0.08)';
            el.style.borderColor = 'rgba(239,68,68,0.3)';
            el.style.color = '#ef4444';
        } else if (type === 'success') {
            el.style.background = 'rgba(16,185,129,0.08)';
            el.style.borderColor = 'rgba(16,185,129,0.3)';
            el.style.color = '#10b981';
        } else {
            el.style.background = 'rgba(99,102,241,0.08)';
            el.style.borderColor = 'rgba(99,102,241,0.2)';
            el.style.color = 'rgba(255,255,255,0.7)';
        }
    }

    function loadHistory() {
        try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
        catch (e) { return []; }
    }
    function saveHistory(arr) {
        // Keep max 20 items
        var trimmed = arr.slice(0, 20);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    }

    // Render History 
    function renderKlingHistory() {
        var grid = document.getElementById('kling-history-grid');
        var empty = document.getElementById('kling-history-empty');
        if (!grid) return;
        var history = loadHistory();
        if (!history.length) {
            if (empty) empty.style.display = 'block';
            // Remove all video cards but keep empty message
            Array.from(grid.querySelectorAll('.kling-hist-card')).forEach(function (c) { c.remove(); });
            return;
        }
        if (empty) empty.style.display = 'none';
        // Re-render all cards
        Array.from(grid.querySelectorAll('.kling-hist-card')).forEach(function (c) { c.remove(); });
        history.forEach(function (item, idx) {
            var card = document.createElement('div');
            card.className = 'kling-hist-card';
            card.title = item.prompt || 'Video ' + (idx + 1);
            card.innerHTML =
                '<video src="' + item.localPath + '" muted loop preload="metadata" style="width:100%;border-radius:11px 11px 0 0;" ' +
                'onmouseenter="this.play()" onmouseleave="this.pause();this.currentTime=0;" ' +
                'onerror="this.parentElement.querySelector(\'.kling-hist-meta\').innerHTML=\'<span style=\\\'color:rgba(239,68,68,0.7);font-size:10px;\\\'>Arquivo não encontrado</span>\'"></video>' +
                '<div class="kling-hist-meta" style="padding:8px 10px; background:rgba(0,0,0,0.3);">' +
                '<div style="font-size:10px; color:#fff; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + (item.prompt || 'Video').substring(0, 40) + '</div>' +
                '<div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">' +
                '<span style="font-size:9px; color:rgba(255,255,255,0.35);">' + item.ar + ' &middot; ' + item.dur + 's</span>' +
                '<button onclick="window.klingImportVideo(\'' + item.localPath.replace(/\\/g, '\\\\') + '\')" ' +
                'style="padding:3px 8px; background:rgba(99,102,241,0.2); border:1px solid rgba(99,102,241,0.4); border-radius:5px; color:#a78bfa; font-size:10px; cursor:pointer; font-weight:700;">Import</button>' +
                '</div></div>';
            grid.insertBefore(card, grid.firstChild);
        });
    }

    // Frame Loading 
    window.klingLoadFrame = function (which, input) {
        var file = input && input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
            var dataUri = e.target.result;
            var preview = document.getElementById('kling-' + which + '-preview');
            var icon = document.getElementById('kling-' + which + '-icon');
            var label = document.getElementById('kling-' + which + '-label');
            if (which === 'start') {
                klingState.startImage = { dataUri: dataUri };
            } else {
                klingState.endImage = { dataUri: dataUri };
            }
            if (preview) { preview.src = dataUri; preview.style.display = 'block'; }
            if (icon) icon.style.display = 'none';
            if (label) label.style.display = 'none';
        };
        reader.readAsDataURL(file);
        input.value = '';
    };

    // Capture Frame from Premiere Timeline 
    window.klingCaptureFrame = function (which) {
        if (!window.csInterface) { notify('CSInterface nao disponivel.', 'error'); return; }
        klingSetStatus('Capturando frame da timeline...', 'info');
        csInterface.evalScript('$._nexxt.capturarFrameTimeline()', function (res) {
            if (!res || res === 'undefined' || res === 'null') {
                klingSetStatus('Erro: resposta vazia do Premiere.', 'error'); return;
            }
            if (res.indexOf('ERRO|') === 0) {
                klingSetStatus(res.replace('ERRO|', ''), 'error'); return;
            }
            // res = path to exported JPG
            try {
                var fs = require('fs');
                if (!fs.existsSync(res)) { klingSetStatus('Frame nao encontrado: ' + res, 'error'); return; }
                var ext = res.split('.').pop().toLowerCase();
                var mime = ext === 'png' ? 'image/png' : 'image/jpeg';
                var b64 = fs.readFileSync(res).toString('base64');
                var dataUri = 'data:' + mime + ';base64,' + b64;
                var preview = document.getElementById('kling-' + which + '-preview');
                var icon = document.getElementById('kling-' + which + '-icon');
                var label = document.getElementById('kling-' + which + '-label');
                if (which === 'start') klingState.startImage = { dataUri: dataUri };
                else klingState.endImage = { dataUri: dataUri };
                if (preview) { preview.src = dataUri; preview.style.display = 'block'; }
                if (icon) icon.style.display = 'none';
                if (label) label.style.display = 'none';
                klingSetStatus('Frame capturado!', 'success');
                setTimeout(function () { klingSetStatus('', ''); }, 2000);
            } catch (e) { klingSetStatus('Erro: ' + e.message, 'error'); }
        });
    };

    // Controls 
    window.klingSetAR = function (btn, ar) {
        klingState.aspectRatio = ar;
        ['kling-ar-169', 'kling-ar-916', 'kling-ar-11'].forEach(function (id) {
            var b = document.getElementById(id);
            if (b) b.className = 'k-chip' + (b === btn ? ' active' : '');
        });
    };

    window.klingSetDur = function (btn, dur) {
        klingState.duration = dur;
        ['kling-dur-5', 'kling-dur-10'].forEach(function (id) {
            var b = document.getElementById(id);
            if (b) b.className = 'k-chip' + (b === btn ? ' active' : '');
        });
    };

    window.klingToggleNeg = function () {
        klingState.negOpen = !klingState.negOpen;
        var area = document.getElementById('kling-neg-area');
        var chevron = document.getElementById('kling-neg-chevron');
        if (area) area.style.display = klingState.negOpen ? 'block' : 'none';
        if (chevron) chevron.style.transform = klingState.negOpen ? 'rotate(90deg)' : '';
    };

    // Generate 
    window.klingGenerate = async function () {
        var promptEl = document.getElementById('kling-prompt');
        var negPromptEl = document.getElementById('kling-negative-prompt');
        var btn = document.getElementById('kling-gen-btn');

        var prompt = promptEl ? promptEl.value.trim() : '';
        if (!prompt && !klingState.startImage) {
            klingSetStatus('Digite um prompt ou selecione um Start Frame.', 'error'); return;
        }

        // Verifica quota de vídeos antes de gerar
        var usageCheck = await nexxtCheckUsage('video');
        if (!usageCheck.allowed) {
            var usageMsg = usageCheck.reason === 'quota_exceeded'
                ? 'Limite atingido! Você usou todos os ' + usageCheck.limit + ' vídeos do plano ' + usageCheck.plan + ' este mês.'
                : 'Não foi possível verificar sua quota. Tente novamente.';
            klingSetStatus(usageMsg, 'error');
            return;
        }

        if (btn) { btn.disabled = true; btn.innerHTML = '<div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;display:inline-block;"></div> Gerando...'; }
        klingSetStatus('\u23F3 Enviando para Kling... (~30-90s)', 'info');

        // Build input payload only include params that have values
        var input = {
            aspect_ratio: klingState.aspectRatio,
            duration: klingState.duration
        };
        if (prompt) input.prompt = prompt;
        var negPrompt = negPromptEl ? negPromptEl.value.trim() : '';
        if (negPrompt) input.negative_prompt = negPrompt;
        if (klingState.startImage) input.start_image = klingState.startImage.dataUri;
        if (klingState.endImage) input.end_image = klingState.endImage.dataUri;

        try {
            // POST prediction
            var res = await fetch('https://api.replicate.com/v1/models/kwaivgi/kling-v2.5-turbo-pro/predictions', {
                method: 'POST',
                headers: {
                    'Authorization': 'Token ' + replicateKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'wait'
                },
                body: JSON.stringify({ input: input })
            });
            if (!res.ok) {
                var errText = await res.text();
                throw new Error('API ' + res.status + ': ' + errText);
            }
            var pred = await res.json();

            // Poll until done (Prefer:wait may return immediately)
            var polls = 0;
            while (pred.status !== 'succeeded' && pred.status !== 'failed' && pred.status !== 'canceled') {
                if (polls++ > 60) throw new Error('Timeout apos 3 minutos.');
                await new Promise(function (r) { setTimeout(r, 3000); });
                klingSetStatus('\u23F3 Processando... (' + (polls * 3) + 's)', 'info');
                var pr = await fetch('https://api.replicate.com/v1/predictions/' + pred.id, {
                    headers: { 'Authorization': 'Token ' + replicateKey }
                });
                if (!pr.ok) throw new Error('Poll error ' + pr.status);
                pred = await pr.json();
            }

            if (pred.status === 'failed' || pred.status === 'canceled') {
                throw new Error('Falha: ' + (pred.error || pred.status));
            }

            // Get video URL from output
            var videoUrl = pred.output;
            if (Array.isArray(videoUrl)) videoUrl = videoUrl[0];
            if (typeof videoUrl === 'object' && videoUrl) videoUrl = videoUrl.url || videoUrl.video || Object.values(videoUrl)[0];
            if (!videoUrl || typeof videoUrl !== 'string') throw new Error('Sem URL de video na resposta: ' + JSON.stringify(pred.output));

            klingSetStatus('\u2705 Video gerado! Baixando...', 'success');

            // Download video to Nexxt Downloads folder
            var path = require('path');
            var fs = require('fs');
            var https = require('https');

            // Usa a pasta Nexxt Downloads configurada pelo usuário (igual outros downloads)
            var savePath = localStorage.getItem('nexxt_save_path');
            if (!savePath) {
                savePath = path.join(require('os').homedir(), 'Downloads', 'Nexxt_Downloads');
            }
            var klingDir = path.join(savePath, 'Kling_Videos');
            if (!fs.existsSync(klingDir)) fs.mkdirSync(klingDir, { recursive: true });

            var safeName = (prompt || 'kling').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
            var outFile = path.join(klingDir, 'kling_' + safeName + '_' + Date.now() + '.mp4');

            var resp = await fetch(videoUrl);
            if (!resp.ok) {
                throw new Error('Download falhou: HTTP ' + resp.status);
            }
            var buffer = await resp.arrayBuffer();
            fs.writeFileSync(outFile, Buffer.from(buffer));

            // Save to history
            var history = loadHistory();
            history.unshift({
                prompt: prompt || '(image-to-video)',
                localPath: outFile,
                ar: klingState.aspectRatio,
                dur: klingState.duration,
                date: Date.now(),
                id: pred.id
            });
            saveHistory(history);
            renderKlingHistory();

            // Importa para o projeto Premiere e insere na timeline
            klingSetStatus('\u2705 Video salvo! Importando para a timeline...', 'success');
            var escapedPath = outFile.replace(/\\/g, '\\\\');
            csInterface.evalScript('$._nexxt.importarDownloadParaProjeto("' + escapedPath + '")', function (importRes) {
                if (importRes && importRes.indexOf('Sucesso') === 0) {
                    klingSetStatus('\u2705 Video importado na timeline!', 'success');
                    notify('\uD83C\uDFAC Kling ' + klingState.duration + 's  Na timeline e salvo em Kling_Videos!', 'success');
                } else {
                    klingSetStatus('\u2705 Video salvo em Kling_Videos. Importe manualmente.', 'success');
                    notify('\uD83C\uDFAC Video salvo! Erro ao inserir na timeline: ' + (importRes || '?'), 'info');
                }
            });

        } catch (err) {
            console.error('[Kling]', err);
            klingSetStatus('\u274C ' + err.message, 'error');
            notify('Kling erro: ' + err.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Generate';
            }
        }
    };

    // Import to Timeline 
    window.klingImportVideo = function (filePath) {
        if (!window.csInterface) { notify('CSInterface nao disponivel.', 'error'); return; }
        var escaped = filePath.replace(/\\/g, '\\\\');
        csInterface.evalScript('$._nexxt.importarAudioTimeline("' + escaped + '")', function (r) {
            if (r && r.indexOf('ERRO') === 0) { notify('Importado mas erro: ' + r, 'info'); }
            else { notify('\uD83C\uDFAC Video importado na timeline!', 'success'); }
        });
    };

    // Clear History 
    window.klingClearHistory = function () {
        localStorage.removeItem(HISTORY_KEY);
        renderKlingHistory();
        notify('Historico Kling limpo.', 'info');
    };

    // Init 
    if (document.readyState === 'complete') renderKlingHistory();
    else window.addEventListener('load', renderKlingHistory);
})();

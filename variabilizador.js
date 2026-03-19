// ÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉ
// VARIABILIZADOR.JS  Nexxt Effects Bundle
// Bloco A: Lumetri Color (micro-ajustes de cor)
// Bloco B: Safe Ad Nexxt (background loop anti-fingerprint)
// Bloco C: Asset Packs (download in-panel)
// ÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉÉ

// BLOCO A: LUMETRI COLOR 

var VARI_COR_KEYS = ['brightness', 'contrast', 'highlights', 'shadows', 'saturation', 'sharpness'];

function variLabelCor(key, rawVal) {
    var mul = rawVal / 1000;
    if (key === 'saturation') {
        var lumetri = 100 + (mul - 1) * 100;
        return lumetri.toFixed(1).replace('.', ',');
    }
    var scales = { brightness: 5, contrast: 100, highlights: 100, shadows: 100, sharpness: 50 };
    var delta = (mul - 1) * (scales[key] || 100);
    var sign = delta >= 0 ? '+' : '';
    return sign + delta.toFixed(Math.abs(delta) < 1 ? 2 : 1).replace('.', ',');
}

function variSyncLabel(key) {
    var slider = document.getElementById('vari-s-' + key);
    var lbl = document.getElementById('vari-v-' + key);
    if (!slider || !lbl) return;
    lbl.textContent = variLabelCor(key, parseInt(slider.value));
}

function variSyncLabelDirect(key, divisor) {
    var slider = document.getElementById('vari-s-' + key);
    var lbl = document.getElementById('vari-v-' + key);
    if (!slider || !lbl) return;
    var val = parseInt(slider.value) * (divisor || 1);
    lbl.textContent = (val % 1 === 0) ? String(val) : val.toFixed(2).replace('.', ',');
}

function variSetStatus(msg, color) {
    var el = document.getElementById('vari-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || 'rgba(255,255,255,0.4)';
}

function variabilizadorRoll() {
    VARI_COR_KEYS.forEach(function (key) {
        var slider = document.getElementById('vari-s-' + key);
        if (!slider) return;
        slider.value = Math.floor(Math.random() * 101) + 950;
        variSyncLabel(key);
    });
    var sGrain = document.getElementById('vari-s-grain');
    var lGrain = document.getElementById('vari-v-grain');
    if (sGrain && lGrain) {
        sGrain.value = Math.floor(Math.random() * 16);
        lGrain.textContent = sGrain.value;
    }
    var sVig = document.getElementById('vari-s-vignette');
    var lVig = document.getElementById('vari-v-vignette');
    if (sVig && lVig) {
        sVig.value = -(Math.floor(Math.random() * 26) + 5);
        lVig.textContent = (parseInt(sVig.value) * 0.01).toFixed(2).replace('.', ',');
    }
    variSetStatus('Roll aplicado  clique em Aplicar para usar nos clips.', '#9b7cff');
}


function variabilizadorReset() {
    VARI_COR_KEYS.forEach(function (key) {
        var slider = document.getElementById('vari-s-' + key);
        if (!slider) return;
        slider.value = 1000;
        variSyncLabel(key);
    });
    var sGrain = document.getElementById('vari-s-grain');
    if (sGrain) { sGrain.value = 0; document.getElementById('vari-v-grain').textContent = '0'; }
    var sVig = document.getElementById('vari-s-vignette');
    if (sVig) { sVig.value = 0; document.getElementById('vari-v-vignette').textContent = '0,00'; }
    variSetStatus('Valores resetados.', 'rgba(255,255,255,0.4)');
}

function variabilizadorAplicar() {
    function mulOf(key) { return parseInt(document.getElementById('vari-s-' + key).value) / 1000; }
    var params = {
        brightness: mulOf('brightness'),
        contrast: mulOf('contrast'),
        highlights: mulOf('highlights'),
        shadows: mulOf('shadows'),
        saturation: mulOf('saturation'),
        sharpness: mulOf('sharpness'),
        grain: parseInt(document.getElementById('vari-s-grain').value),
        vignette: parseInt(document.getElementById('vari-s-vignette').value) * 0.01
    };
    var btn = document.getElementById('vari-btn-apply');
    var btnText = document.getElementById('vari-btn-apply-text');
    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = 'Aplicando...';
    variSetStatus('Aplicando nos clips selecionados...', '#9b7cff');
    var paramsStr = JSON.stringify(params);
    csInterface.evalScript(
        '$._nexxt.variabilizarCores(' + JSON.stringify(paramsStr) + ')',
        function (res) {
            if (btn) btn.disabled = false;
            if (btnText) btnText.textContent = 'Aplicar aos Selecionados';
            
            if (!res || res.indexOf('ERRO') === 0) {
                variSetStatus(' ' + (res ? res.replace('ERRO|', '') : 'Erro desconhecido'), '#f87171');
            } else {
                var n = parseInt(res.replace('SUCESSO|', '')) || 0;
                variSetStatus(' Lumetri Color aplicado em ' + n + ' clip(s)!', '#4ade80');
            }
        }
    );
}

function variabilizadorDiag() {
    var diagEl = document.getElementById('vari-diag');
    if (!diagEl) return;
    diagEl.style.display = 'block';
    diagEl.textContent = 'Executando diagnóstico...';
    csInterface.evalScript('$._nexxt.diagnosticarVariabilizador()', function (res) {
        diagEl.textContent = res || '(sem resposta)';
    });
}

// TAB SWITCHING 

function variTabSwitch(tab) {
    var lumetriDiv = document.getElementById('vari-tab-lumetri');
    var safeadDiv = document.getElementById('vari-tab-safead');
    var btnL = document.getElementById('vari-tab-btn-lumetri');
    var btnS = document.getElementById('vari-tab-btn-safead');
    var isL = (tab === 'lumetri');
    if (lumetriDiv) lumetriDiv.style.display = isL ? '' : 'none';
    if (safeadDiv) safeadDiv.style.display = isL ? 'none' : '';
    function _s(btn, active) {
        if (!btn) return;
        btn.style.background = active ? 'linear-gradient(135deg,rgba(120,86,255,0.25),rgba(120,86,255,0.15))' : 'transparent';
        btn.style.borderColor = active ? 'rgba(120,86,255,0.4)' : 'transparent';
        btn.style.color = active ? '#c4b0ff' : 'var(--text-secondary)';
    }
    _s(btnL, isL);
    _s(btnS, !isL);
}

// BLOCO B: SAFE AD NEXXT 

var SAFEAD_DURACAO_ALVO = 150;  // segundos (YouTube 2:30)
var SAFEAD_BG_OPACIDADE = 10;   // opacidade do overlay sobre o original (550%)
// OVERLAY: vídeo abstrato que fica SOBRE o original com opacidade baixa (sempre de backgrounds/)
var SAFEAD_BG_ARQUIVO = null; // null = aleatório de backgrounds/
// VIDEO FINAL: cena que preenche o trecho extra (durOriginal Æ target)
var SAFEAD_FINAL_CATEGORIA = 'beachs'; // categoria do vídeo final
var SAFEAD_FINAL_ARQUIVO = null;     // null = aleatório da categoria
// NOISE: íudio que fica sob o original
var SAFEAD_NOISE_ARQUIVO = null; // null = aleatório
// VOLUME SLIDERS
var SAFEAD_NOISE_VOLUME = -15;  // dB do canal noise (-40 a 0)
var SAFEAD_FINAL_VOLUME = -15;  // dB do canal final (-40 a 0)

function safeAdUpdateNoiseVolume(val) {
    SAFEAD_NOISE_VOLUME = parseFloat(val) || -15;
    var numEl = document.getElementById('san-noise-num');
    var rangeEl = document.getElementById('san-noise-range');
    if (numEl) numEl.value = SAFEAD_NOISE_VOLUME;
    if (rangeEl) rangeEl.value = SAFEAD_NOISE_VOLUME;
}

function safeAdUpdateFinalVolume(val) {
    SAFEAD_FINAL_VOLUME = parseFloat(val) || -15;
    var numEl = document.getElementById('san-final-num');
    var rangeEl = document.getElementById('san-final-range');
    if (numEl) numEl.value = SAFEAD_FINAL_VOLUME;
    if (rangeEl) rangeEl.value = SAFEAD_FINAL_VOLUME;
}

function safeAdSetStatus(msg, cor) {
    var el = document.getElementById('safead-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = cor || 'rgba(255,255,255,0.4)';
}

function safeAdSetDlStatus(msg, cor) {
    var el = document.getElementById('safead-dl-status');
    if (!el) return;
    el.textContent = msg;
    el.style.color = cor || 'rgba(255,255,255,0.4)';
}

function safeAdSelectCategoria(cat, el) {
    // Highlight clicked button
    document.querySelectorAll('.safead-cat-btn').forEach(function (btn) {
        btn.style.background = 'rgba(255,255,255,0.04)';
        btn.style.borderColor = 'rgba(255,255,255,0.1)';
        btn.style.color = 'var(--text-secondary)';
    });
    if (el) {
        el.style.background = 'rgba(120,86,255,0.2)';
        el.style.borderColor = 'rgba(120,86,255,0.5)';
        el.style.color = '#c4b0ff';
    }
    // backgrounds Æ seleciona o OVERLAY (fica sobre o original)
    // demais categorias Æ selecionam o VIDEO FINAL (preenche após o original)
    if (cat === 'backgrounds') {
        safeAdAbrirGaleria(cat, 'overlay');
    } else {
        SAFEAD_FINAL_CATEGORIA = cat;
        SAFEAD_FINAL_ARQUIVO = null;
        var selFinal = document.getElementById('safead-final-selecionado');
        if (selFinal) selFinal.textContent = ' Aleatório';
        safeAdAbrirGaleria(cat, 'final');
    }
}

var _CAT_LABELS = { beachs: ' Praia', landscape: ' Paisagem', rains: ' Chuva', waterfalls: ' Cachoeira', timers: '⏱ Timer', backgrounds: ' Fundo' };

function safeAdAbrirGaleria(cat, modo) {
    var modal = document.getElementById('safead-gallery-modal');
    var grid = document.getElementById('safead-gallery-grid');
    var title = document.getElementById('safead-gallery-title');
    if (!modal || !grid) return;
    modal._safeadModo = modo || 'final';

    var modeLabel = (modo === 'overlay') ? '  Overlay (Background)' : '  Vídeo Final';
    if (title) title.textContent = (_CAT_LABELS[cat] || cat) + modeLabel;

    try {
        var fsN = require('fs');
        var pathN = require('path');
        var FINAL_CATS = ['beachs', 'landscape', 'rains', 'waterfalls', 'timers'];

        // Para o modo FINAL: criar/atualizar barra de categorias SEM recriar o modal inteiro
        if (modo === 'final') {
            var tabBar = document.getElementById('safead-gallery-tabbar');
            if (!tabBar) {
                // Criar tab bar uma unica vez
                tabBar = document.createElement('div');
                tabBar.id = 'safead-gallery-tabbar';
                tabBar.style.cssText = 'grid-column:span 2;display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.07);';
                FINAL_CATS.forEach(function(c2) {
                    var tab = document.createElement('button');
                    tab.setAttribute('data-gal-cat', c2);
                    tab.textContent = _CAT_LABELS[c2] || c2;
                    tab.style.cssText = 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 10px;color:var(--text-secondary);font-size:10px;cursor:pointer;white-space:nowrap;transition:all .15s;';
                    tab.addEventListener('click', function(e) {
                        e.stopPropagation();
                        SAFEAD_FINAL_CATEGORIA = c2;
                        _safeAdCarregarVideos(c2, 'final');
                    });
                    tabBar.appendChild(tab);
                });
                // Inserir como primeiro filho do grid
                grid.insertBefore(tabBar, grid.firstChild);
            }
            // Atualizar destaque da aba ativa
            tabBar.querySelectorAll('button').forEach(function(b) {
                var isActive = b.getAttribute('data-gal-cat') === cat;
                b.style.background = isActive ? 'rgba(120,86,255,0.3)' : 'rgba(255,255,255,0.05)';
                b.style.borderColor = isActive ? 'rgba(120,86,255,0.6)' : 'rgba(255,255,255,0.1)';
                b.style.color = isActive ? '#c4b0ff' : 'var(--text-secondary)';
            });
        } else {
            // Para overlay: limpar tudo normalmente (sem tabs)
            grid.innerHTML = '';
        }

        _safeAdCarregarVideos(cat, modo);
        modal.style.display = 'flex';
    } catch (e) {
        console.warn('[Nexxt] safeAdAbrirGaleria:', e);
    }
}

// Carrega apenas os cards de video sem recriar o tabbar
function _safeAdCarregarVideos(cat, modo) {
    var grid = document.getElementById('safead-gallery-grid');
    if (!grid) return;
    var fsN = require('fs'), pathN = require('path');

    var cardsContainer = document.getElementById('safead-gallery-cards-container');
    if (!cardsContainer) {
        cardsContainer = document.createElement('div');
        cardsContainer.id = 'safead-gallery-cards-container';
        cardsContainer.style.cssText = 'grid-column:span 2;display:grid;grid-template-columns:repeat(2,1fr);gap:8px;transition:opacity 0.15s;';
        grid.appendChild(cardsContainer);
    } else {
        // First load, move existing cards into it if any
        var toMove = [];
        grid.childNodes.forEach(function(n) {
            if (n.id !== 'safead-gallery-tabbar' && n.id !== 'safead-gallery-cards-container') toMove.push(n);
        });
        toMove.forEach(function(n) { cardsContainer.appendChild(n); });
    }

    var catPath = pathN.join(_safeAdGetPluginPath(), 'vari-assets', cat);
    var files = fsN.existsSync(catPath)
        ? fsN.readdirSync(catPath).filter(function(f) { return /\.mp4$/i.test(f); }).sort()
        : [];

    var frag = document.createDocumentFragment();
    var aleatorioCard = _safeAdMakeGaleriaCard(' Aleatório', null, null, true, modo);
    aleatorioCard.style.opacity = '0';
    aleatorioCard.style.transform = 'translateY(10px)';
    aleatorioCard.style.transition = 'opacity 0.3s, transform 0.3s, border-color 0.18s';
    frag.appendChild(aleatorioCard);
    
    files.forEach(function(f) {
        var fp = pathN.join(catPath, f);
        var src = require('url').pathToFileURL(fp).href;
        var card = _safeAdMakeGaleriaCard(f.replace(/\.mp4$/i, ''), fp, src, false, modo);
        card.style.opacity = '0';
        card.style.transform = 'translateY(10px)';
        card.style.transition = 'opacity 0.3s, transform 0.3s, border-color 0.18s';
        frag.appendChild(card);
    });

    // Fade out old -> Swap -> Fade in new cascade
    cardsContainer.style.opacity = '0';
    setTimeout(function() {
        cardsContainer.innerHTML = '';
        cardsContainer.appendChild(frag);
        cardsContainer.style.opacity = '1';
        
        // Trigger cascade animation
        setTimeout(function() {
            var children = Array.prototype.slice.call(cardsContainer.children);
            children.forEach(function(child, i) {
                setTimeout(function() {
                    child.style.opacity = '1';
                    child.style.transform = 'translateY(0)';
                }, i * 35); // 35ms stagger
            });
        }, 50);
    }, 150);
}


function _safeAdMakeGaleriaCard(label, fullPath, videoSrc, isRandom, modo) {
    var card = document.createElement('div');
    card.style.cssText = 'border:2px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden;cursor:pointer;transition:border-color .18s,transform .18s;background:#0a0a12;' + (isRandom ? 'grid-column:span 2;' : '');

    if (isRandom) {
        var inner = document.createElement('div');
        inner.style.cssText = 'padding:22px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:linear-gradient(135deg,rgba(120,86,255,0.14),rgba(120,86,255,0.04));';
        inner.innerHTML = '<span style="font-size:30px;"></span>' +
            '<span style="font-size:12px;color:#c4b0ff;font-weight:700;">Aleatório</span>' +
            '<span style="font-size:10px;color:var(--text-secondary);">Sorteia um vídeo da categoria</span>';
        card.appendChild(inner);
    } else {
        var video = document.createElement('video');
        video.src = videoSrc;
        video.style.cssText = 'width:100%;display:block;aspect-ratio:16/9;object-fit:cover;background:transparent;pointer-events:none;opacity:0;transition:opacity 0.25s;';
        video.muted = true;
        video.loop = true;
        video.preload = 'metadata';
        video.addEventListener('loadedmetadata', function () {
            video.currentTime = 1;
        });
        // Fade in quando o primeiro frame estiver pronto (sem flash preto)
        video.addEventListener('seeked', function onFirstSeek() {
            video.style.opacity = '1';
            video.removeEventListener('seeked', onFirstSeek);
        });

        var lbl = document.createElement('div');
        lbl.style.cssText = 'padding:5px 8px;font-size:9px;color:rgba(255,255,255,0.45);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:rgba(0,0,0,0.5);';
        lbl.textContent = label;

        card.appendChild(video);
        card.appendChild(lbl);

        card.addEventListener('mouseenter', function () {
            card.style.borderColor = 'rgba(120,86,255,0.75)';
            card.style.transform = 'scale(1.02)';
            try { video.play(); } catch (e) { }
        });
        card.addEventListener('mouseleave', function () {
            card.style.borderColor = 'rgba(255,255,255,0.08)';
            card.style.transform = '';
            video.pause();
            video.currentTime = 1;
        });
    }

    card.addEventListener('click', function () {
        var m = modo || 'final';
        if (m === 'overlay') {
            safeAdSelectOverlay(fullPath || null, isRandom ? ' Aleatório' : label);
        } else {
            safeAdSelectFinal(fullPath || null, isRandom ? ' Aleatório' : label);
        }
        safeAdFecharGaleria();
    });

    if (isRandom) {
        card.addEventListener('mouseenter', function () { card.style.borderColor = 'rgba(120,86,255,0.75)'; });
        card.addEventListener('mouseleave', function () { card.style.borderColor = 'rgba(255,255,255,0.08)'; });
    }

    return card;
}

function safeAdFecharGaleria() {
    var modal = document.getElementById('safead-gallery-modal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.querySelectorAll('video').forEach(function (v) { v.pause(); });
}

function safeAdAbrirGaleriaNoise() {
    var modal = document.getElementById('safead-noise-modal');
    var grid = document.getElementById('safead-noise-grid');
    if (!modal || !grid) return;
    try {
        var fs = require('fs');
        var path = require('path');
        var noisePath = path.join(_safeAdGetPluginPath(), 'vari-assets', 'noises');
        var files = fs.existsSync(noisePath)
            ? fs.readdirSync(noisePath).filter(function (f) { return /\.mp3$/i.test(f); }).sort() : [];
        grid.innerHTML = '';
        grid.appendChild(_safeAdMakeNoiseCard(' Aleatório', null, null, true));
        files.forEach(function (f) {
            var fp = path.join(noisePath, f);
            var src = require('url').pathToFileURL(fp).href;
            // Store only the FILENAME (Nicktrix pattern) never a full path or file:// URI
            grid.appendChild(_safeAdMakeNoiseCard(f.replace(/\.mp3$/i, ''), f, src, false));
        });
        modal.style.display = 'flex';
    } catch (e) { console.warn('[Nexxt] safeAdAbrirGaleriaNoise:', e); }
}

function _safeAdMakeNoiseCard(label, fullPath, audioSrc, isRandom) {
    var card = document.createElement('div');
    card.style.cssText = 'border:2px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden;cursor:pointer;transition:border-color .18s;background:#0a0a12;padding:12px;display:flex;align-items:center;gap:10px;' + (isRandom ? 'grid-column:span 2;' : '');
    var audio = !isRandom ? new Audio(audioSrc) : null;
    var icon = document.createElement('span');
    icon.textContent = isRandom ? '' : '';
    icon.style.cssText = 'font-size:18px;flex-shrink:0;';
    var lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    card.appendChild(icon);
    card.appendChild(lbl);
    card.addEventListener('mouseenter', function () {
        card.style.borderColor = 'rgba(120,86,255,0.75)';
        if (audio) { audio.volume = 0.4; try { audio.play(); } catch (e) { } }
    });
    card.addEventListener('mouseleave', function () {
        card.style.borderColor = 'rgba(255,255,255,0.08)';
        if (audio) { audio.pause(); audio.currentTime = 0; }
    });
    card.addEventListener('click', function () {
        if (audio) audio.pause();
        safeAdSelectNoise(fullPath || null, label);
        safeAdFecharGaleriaNoise();
    });
    return card;
}

function safeAdFecharGaleriaNoise() {
    var modal = document.getElementById('safead-noise-modal');
    if (!modal) return;
    modal.style.display = 'none';
    modal.querySelectorAll('audio').forEach(function (a) { a.pause(); });
}

function safeAdSelectNoise(arquivo, label) {
    SAFEAD_NOISE_ARQUIVO = arquivo || null;
    var el = document.getElementById('safead-noise-selecionado');
    if (el) el.textContent = label || ' Aleatório';
}

// Seletor do VIDEO FINAL (Praia, Paisagem, Chuva, Cachoeira, Timer)
function safeAdSelectFinal(arquivo, label) {
    SAFEAD_FINAL_ARQUIVO = arquivo || null;
    var sel = document.getElementById('safead-final-selecionado');
    var prev = document.getElementById('safead-final-preview');
    if (arquivo) {
        var src = require('url').pathToFileURL(arquivo).href;
        if (prev) { prev.src = src; prev.style.display = 'block'; try { prev.play(); } catch(e){} }
        if (sel) sel.style.display = 'none';
    } else {
        if (prev) { prev.pause(); prev.src = ''; prev.style.display = 'none'; }
        if (sel) { sel.textContent = label || ' Aleatório'; sel.style.display = ''; }
    }
}

// Seletor do OVERLAY (fundo abstrato de backgrounds/ fica sobre o original)
function safeAdSelectOverlay(arquivo, label) {
    SAFEAD_BG_ARQUIVO = arquivo || null;
    var sel = document.getElementById('safead-overlay-selecionado');
    var prev = document.getElementById('safead-overlay-preview');
    if (arquivo) {
        var src = require('url').pathToFileURL(arquivo).href;
        if (prev) { prev.src = src; prev.style.display = 'block'; try { prev.play(); } catch(e){} }
        if (sel) sel.style.display = 'none';
    } else {
        if (prev) { prev.pause(); prev.src = ''; prev.style.display = 'none'; }
        if (sel) { sel.textContent = label || ' Aleatório'; sel.style.display = ''; }
    }
}

// Manter compatibilidade retroativa
function safeAdSelectVideo(arquivo, label) { safeAdSelectFinal(arquivo, label); }

function safeAdDetectarDuracao() {
    var display = document.getElementById('safead-dur-display');
    if (display) display.textContent = 'detectando...';
    csInterface.evalScript('$._nexxt.getDuracaoTimeline()', function (res) {
        var seg = parseFloat(res) || 0;
        if (!display) return;
        if (seg > 0) {
            var mm = Math.floor(seg / 60), ss = Math.round(seg % 60);
            display.textContent = mm + ':' + (ss < 10 ? '0' : '') + ss + ' detectado';
            display.style.color = '#4ade80';
        } else {
            display.textContent = 'nada detectado';
            display.style.color = '#f87171';
        }
    });
}

function safeAdAplicarPreset(seg, el) {
    if (!seg || isNaN(seg) || seg <= 0) return;
    SAFEAD_DURACAO_ALVO = seg;
    var input = document.getElementById('safead-segundos');
    if (input) input.value = seg;
    document.querySelectorAll('.safead-preset-btn').forEach(function (btn) {
        btn.style.background = 'rgba(255,255,255,0.04)';
        btn.style.borderColor = 'rgba(255,255,255,0.1)';
        btn.style.color = 'var(--text-secondary)';
    });
    if (el && el.classList) {
        el.style.background = 'rgba(120,86,255,0.15)';
        el.style.borderColor = 'rgba(120,86,255,0.35)';
        el.style.color = '#c4b0ff';
    }
}

function _safeAdBtnsSetDisabled(disabled) {
    ['safead-btn-aleatorio', 'safead-btn-montar', 'safead-btn-remover'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.disabled = disabled;
    });
}

function _safeAdGetPluginPath() {
    var p = window.__adobe_cep__.getSystemPath('extension');
    // Strip file: URL prefix
    p = p.replace(/^file:\/\/\//, '/').replace(/^file:\/\//, '').replace(/^file:/, '');
    // Decode URL encoding (%20 Æ espaço, etc.)
    try { p = decodeURIComponent(p); } catch (e) { }
    // Windows: remove barra inicial antes da letra do drive: /C:/Users Æ C:/Users
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    return p;
}

function _safeAdMontarInterno() {
    var pluginPath = _safeAdGetPluginPath();

    safeAdSetStatus('Montando Safe Ad Nexxt...', '#9b7cff');
    _safeAdBtnsSetDisabled(true);

    // Read volume sliders from correct IDs
    var noiseVolEl = document.getElementById('safead-vol-noise');
    var finalVolEl = document.getElementById('safead-vol-final');
    // safead-vol-final is 0-100%, convert to dB-like: 100% = 0dB, 0% = -40dB
    var volFinalPct = finalVolEl ? parseFloat(finalVolEl.value) : 100;
    var volFinalDB = volFinalPct <= 0 ? -60 : Math.round(((volFinalPct / 100) - 1) * 40);
    if (volFinalPct >= 100) volFinalDB = 0;
    // safead-vol-noise is -40..0 dB directly
    var volNoiseSVal = noiseVolEl ? parseFloat(noiseVolEl.value) : -25;

    var params = JSON.stringify({
        pluginPath: pluginPath,
        bgArquivo: SAFEAD_BG_ARQUIVO,
        finalCategoria: SAFEAD_FINAL_CATEGORIA,
        finalArquivo: SAFEAD_FINAL_ARQUIVO,
        noiseArquivo: SAFEAD_NOISE_ARQUIVO,
        segundosFinais: SAFEAD_DURACAO_ALVO,
        opacidade: SAFEAD_BG_OPACIDADE,
        noiseVolume: volNoiseSVal,
        finalVolume: volFinalDB,
        useFinal: (document.getElementById('safead-use-final') || {checked: true}).checked,
        useOverlay: (document.getElementById('safead-use-overlay') || {checked: true}).checked,
        useNoise: (document.getElementById('safead-use-noise') || {checked: true}).checked
    });

    csInterface.evalScript(
        '$._nexxt.montarFundoLoop(' + JSON.stringify(JSON.stringify(params)) + ')',
        function (res) {
            _safeAdBtnsSetDisabled(false);
            if (res && res.indexOf('SUCESSO') === 0) {
                safeAdSetStatus(' ' + res.replace('SUCESSO|', ''), '#4ade80');
            } else {
                safeAdSetStatus(' ' + (res || 'Erro desconhecido').replace('ERRO|', ''), '#f87171');
            }
        }
    );
}

function safeAdAplicarAleatorio() {
    try {
        var fs = require('fs');
        var path = require('path');
        var pluginPath = _safeAdGetPluginPath();
        var vaDir = path.join(pluginPath, 'vari-assets');

        // Categorias disponíveis para o VIDEO FINAL (cenas de preenchimento)
        var finalCats = [];
        ['beachs', 'landscape', 'rains', 'waterfalls', 'timers'].forEach(function (c) {
            if (fs.existsSync(path.join(vaDir, c))) finalCats.push(c);
        });

        if (finalCats.length === 0) {
            safeAdSetStatus(' Nenhum pack de vídeo instalado. Baixe um pack primeiro.', '#f87171');
            return;
        }

        // Escolher categoria aleatória para o VIDEO FINAL
        var catFinal = finalCats[Math.floor(Math.random() * finalCats.length)];
        SAFEAD_FINAL_CATEGORIA = catFinal;
        SAFEAD_FINAL_ARQUIVO = null;
        SAFEAD_BG_ARQUIVO = null; // overlay também aleatório de backgrounds/
        SAFEAD_NOISE_ARQUIVO = null; // noise aleatório

        // Highlight do botão da categoria final selecionada
        document.querySelectorAll('.safead-cat-btn').forEach(function (btn) {
            var active = btn.getAttribute('data-cat') === catFinal;
            btn.style.background = active ? 'rgba(120,86,255,0.2)' : 'rgba(255,255,255,0.04)';
            btn.style.borderColor = active ? 'rgba(120,86,255,0.5)' : 'rgba(255,255,255,0.1)';
            btn.style.color = active ? '#c4b0ff' : 'var(--text-secondary)';
        });

        // Reset displays
        var selFinal = document.getElementById('safead-final-selecionado');
        if (selFinal) selFinal.textContent = ' Aleatório';
        var selOverlay = document.getElementById('safead-overlay-selecionado');
        if (selOverlay) selOverlay.textContent = ' Aleatório';
        var noiseSel = document.getElementById('safead-noise-selecionado');
        if (noiseSel) noiseSel.textContent = ' Aleatório';

        _safeAdMontarInterno();
    } catch (e) {
        _safeAdMontarInterno();
    }
}

function safeAdMontarComSelecao() {
    _safeAdMontarInterno();
}

function safeAdRemover() {
    safeAdSetStatus('Removendo clips Safe Ad...', '#9b7cff');
    _safeAdBtnsSetDisabled(true);
    csInterface.evalScript('$._nexxt.removerFundoLoop()', function (res) {
        _safeAdBtnsSetDisabled(false);
        if (res && res.indexOf('SUCESSO') === 0) {
            var n = res.replace('SUCESSO|', '') || '0';
            safeAdSetStatus(' ' + n + ' clip(s) Safe Ad removidos.', '#4ade80');
        } else {
            safeAdSetStatus(' ' + (res || 'Erro').replace('ERRO|', ''), '#f87171');
        }
    });
}

function safeAdTogglePacks(headerEl) {
    var content = document.getElementById('safead-packs-content');
    if (!content) return;
    var isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    var arrow = isHidden ? '' : '';
    headerEl.innerHTML = '<span style="font-size:12px;"></span> ASSET PACKS ' + arrow;
}

// BLOCO C: ASSET PACKS 

var SAFEAD_MANIFEST_URL = 'https://raw.githubusercontent.com/editnexxt-code/Releases/main/assets-manifest.json';

// Detecta e corrige estrutura aninhada no ZIP (ex: vaDir/Variabilizador Assets/beachs/ Æ vaDir/beachs/)
function _safeAdNormalizarPasta(vaDir, doneCb) {
    try {
        var fs = require('fs');
        var path = require('path');
        if (fs.existsSync(path.join(vaDir, 'beachs'))) { doneCb(true); return; }
        var entries;
        try { entries = fs.readdirSync(vaDir); } catch (e) { doneCb(false); return; }
        var nestedRoot = null;
        for (var i = 0; i < entries.length; i++) {
            if (/^_dl_/.test(entries[i])) continue;
            var candidate = path.join(vaDir, entries[i]);
            try {
                if (fs.statSync(candidate).isDirectory() && fs.existsSync(path.join(candidate, 'beachs'))) {
                    nestedRoot = candidate;
                    break;
                }
            } catch (e2) { }
        }
        if (!nestedRoot) { doneCb(false); return; }
        // Mover conteúdo para cima
        var execFile = require('child_process').execFile;
        if (process.platform === 'darwin' || process.platform === 'linux') {
            execFile('sh', ['-c', 'mv "' + nestedRoot + '"/* "' + vaDir + '/"'], { timeout: 60000 }, function (err) {
                try { fs.rmdirSync(nestedRoot); } catch (e3) { }
                doneCb(fs.existsSync(path.join(vaDir, 'beachs')));
            });
        } else {
            var psCmd = 'Get-ChildItem -LiteralPath "' + nestedRoot + '" | ForEach-Object { Move-Item -LiteralPath $_.FullName -Destination "' + vaDir + '" -Force }';
            execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psCmd], { timeout: 60000 }, function (err) {
                try { fs.rmdirSync(nestedRoot); } catch (e3) { }
                doneCb(fs.existsSync(path.join(vaDir, 'beachs')));
            });
        }
    } catch (e) { doneCb(false); }
}

function safeAdVerificarPacks() {
    try {
        var fs = require('fs');
        var path = require('path');
        var pluginPath = _safeAdGetPluginPath();
        var vaDir = path.join(pluginPath, 'vari-assets');

        // Pack completo instalado: precisa de 'beachs' (vídeos) E 'noises' (íudios)
        var temVideos = fs.existsSync(path.join(vaDir, 'beachs'));
        var temNoises = fs.existsSync(path.join(vaDir, 'noises'));
        var instalado = temVideos && temNoises;

        var dlBtn = document.getElementById('safead-dl-complete');
        if (dlBtn) {
            if (instalado) {
                dlBtn.textContent = ' Instalado';
                dlBtn.disabled = true;
                dlBtn.style.background = 'rgba(74,222,128,0.1)';
                dlBtn.style.borderColor = 'rgba(74,222,128,0.3)';
                dlBtn.style.color = '#4ade80';
            } else {
                dlBtn.textContent = '↓ Baixar';
                dlBtn.disabled = false;
                dlBtn.style.background = 'rgba(120,86,255,0.15)';
                dlBtn.style.borderColor = 'rgba(120,86,255,0.35)';
                dlBtn.style.color = '#c4b0ff';
            }
        }

        document.querySelectorAll('.safead-cat-btn').forEach(function (btn) {
            btn.style.opacity = instalado ? '1' : '0.4';
            btn.style.cursor = instalado ? 'pointer' : 'not-allowed';
            btn.title = instalado ? '' : 'Baixe o Pack Completo primeiro';
        });

        // Category buttons are enabled/disabled gallery opens on demand when pack is installed

    } catch (e) {
        console.warn('[Nexxt] safeAdVerificarPacks error:', e);
    }
}

function safeAdBaixarPack() {
    safeAdSetDlStatus('Abrindo link de download...', '#9b7cff');
    setTimeout(function() {
        var url = "https://github.com/editnexxt-code/Releases/releases/download/v1.7.2/vari-assets-pack.zip";
        if (typeof csInterface !== 'undefined') csInterface.openURLInDefaultBrowser(url);
        safeAdSetDlStatus(' Download aberto no navegador. Após baixar, use o botão ôé para instalar.', '#4ade80');
    }, 500);
}

function safeAdInstalarLocal() {
    var input = document.getElementById('safead-file-input');
    if (input) { input.value = ''; input.click(); }
}

function safeAdInstalarDoArquivo(input) {
    var file = input && input.files && input.files[0];
    if (!file) return;

    // No CEP (Node.js integrado), file.path contém o caminho real no disco
    var zipPath = file.path;
    if (!zipPath) {
        safeAdSetDlStatus(' Não foi possível ler o caminho do arquivo.', '#f87171');
        return;
    }

    safeAdSetDlStatus('Extraindo ' + file.name + '...', '#9b7cff');

    try {
        var path = require('path');
        var fs = require('fs');
        var pluginPath = _safeAdGetPluginPath();
        var vaDir = path.join(pluginPath, 'vari-assets');
        if (!fs.existsSync(vaDir)) fs.mkdirSync(vaDir, { recursive: true });

        // Usa tar nativo (suporta ZIP64 ~1GB) — adm-zip NÃO funciona com ZIP64
        var execFile = require('child_process').execFile;
        var tarExe = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : '/usr/bin/tar';
        execFile(tarExe, ['-xf', zipPath, '-C', vaDir],
            { timeout: 600000 },
            function (err, stdout, stderr) {
                if (err) {
                    safeAdSetDlStatus(' Erro ao extrair: ' + (stderr || err.message), '#f87171');
                    return;
                }
                safeAdSetDlStatus('Verificando estrutura...', '#9b7cff');
                _safeAdNormalizarPasta(vaDir, function (ok) {
                    safeAdSetDlStatus(ok ? ' Pack instalado com sucesso!' : ' Extraído, mas estrutura de pastas não reconhecida.', ok ? '#4ade80' : '#f87171');
                    safeAdVerificarPacks();
                });
            }
        );
    } catch (e) {
        safeAdSetDlStatus(' Erro ao extrair: ' + e.message, '#f87171');
    }
}

// INIT 
setTimeout(function () {
    try { variTabSwitch('lumetri'); } catch (e) { }
    try { safeAdVerificarPacks(); } catch (e) { }
    var ytBtn = document.getElementById('safead-preset-yt');
    if (ytBtn) safeAdAplicarPreset(150, ytBtn);
}, 800);

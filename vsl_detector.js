/**
 * VSL Product Detector v6 — Batch Vision
 * Visual: Groq Llama-4-Scout Vision — 8 frames per API call (batching)
 * Audio:  Whisper MP3 (64kbps) via Nexxt proxy → stays under proxy 25MB limit
 *
 * Rate math: 30 frames ÷ 8 per batch = 4 API calls × ~4s each = ~22s total → 10 RPM (limit: 30)
 * Rate limit is practically impossible: 4 requests vs 30 RPM limit.
 * Coverage: 30min video → 1 frame/min | 10min video → 1 frame/20s
 */
(function () {
    'use strict';

    var GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
    var BATCH_SIZE        = 4;    // Llama 4 Scout: máx 4 imagens por chamada
    var BATCH_DELAY_MS    = 1500; // delay entre batches
    var MAX_FRAMES        = 90;   // cobertura total — 90 frames / vídeo
    var MIN_INTERVAL_SEC  = 5;    // mínimo 1 frame a cada 5s

    function getGroqKey() {
        var stored = localStorage.getItem('groq_api_key');
        if (stored && stored.trim()) return stored.trim();
        return (typeof groqKey !== 'undefined' && groqKey) ? groqKey : '';
    }
    function getReplicateKey() {
        return localStorage.getItem('nexxt_replicate_key') || '';
    }

    // ── MAIN ENTRY POINT ────────────────────────────────────────────────────────

    window.detectVSLProducts = async function () {
        var logEl     = document.getElementById('vsl-detector-log');
        var resultsEl = document.getElementById('vsl-detector-results');
        var btn       = document.getElementById('btn-detect-products');
        if (!logEl || !resultsEl) return;

        var gKey = getGroqKey();
        if (!gKey) {
            logEl.innerHTML = '<span style="color:#ef4444;">Chave Groq nao encontrada. Configure nas Configuracoes.</span>';
            return;
        }

        if (btn) btn.disabled = true;
        resultsEl.innerHTML = '';

        function log(msg) {
            logEl.innerHTML = msg;
            console.log('[VSL]', msg.replace(/<[^>]+>/g, ''));
        }

        var framesDir = null;

        try {
            log('Obtendo informacoes do clipe...');
            csInterface.evalScript('$._nexxt.obterCaminhoAudioSelecionadoIA()', async function (res) {
                try {
                    if (!res || res.indexOf('ERRO|') === 0) {
                        log('<span style="color:#ef4444;">Selecione um clipe de video na timeline.</span>');
                        if (btn) btn.disabled = false;
                        return;
                    }
                    var data = JSON.parse(res);
                    if (data.status !== 'SUCESSO') {
                        log('<span style="color:#ef4444;">Erro: ' + escHtml(data.status || 'falhou') + '</span>');
                        if (btn) btn.disabled = false;
                        return;
                    }

                    var videoPath = data.mediaPath;
                    var inPoint   = data.inPoint  || 0;
                    var duration  = data.duration || 0;
                    var clipStart = data.clipStart || 0;

                    if (duration <= 0) {
                        log('<span style="color:#ef4444;">Duracao invalida.</span>');
                        if (btn) btn.disabled = false;
                        return;
                    }

                    var maxDur  = Math.min(duration, 3600);
                    var interval = Math.max(MIN_INTERVAL_SEC, Math.ceil(maxDur / MAX_FRAMES));
                    var estFrames = Math.ceil(maxDur / interval);
                    var estSec    = Math.ceil((estFrames / BATCH_SIZE) * 6);
                    log('Video: ' + fmtDur(maxDur) + ' · ' + estFrames + ' frames · ~' + estSec + 's · Groq Vision');

                    // ── STEP 1: Extract frames ───────────────────────────────
                    log('Extraindo frames...');
                    try {
                        var result = await extractFrames(videoPath, inPoint, maxDur, interval);
                        framesDir = result.dir;
                        var frames = result.frames;
                        var totalBatches = Math.ceil(frames.length / BATCH_SIZE);
                        log('Extraidos ' + frames.length + ' frames → ' + totalBatches + ' lotes de ' + BATCH_SIZE + ' · ~' + Math.round(totalBatches * 4) + 's total');

                        // ── STEP 2: Batch Groq Vision (8 frames per call → ~4 calls total) ──
                        var visualDetections = [];
                        for (var bi = 0; bi < frames.length; bi += BATCH_SIZE) {
                            var batch = frames.slice(bi, bi + BATCH_SIZE);
                            var batchNum = Math.floor(bi / BATCH_SIZE) + 1;
                            var pct = Math.round((bi + batch.length) / frames.length * 100);

                            if (bi > 0) await sleep(BATCH_DELAY_MS);

                            log('Lote ' + batchNum + '/' + totalBatches + ' (' + pct + '%) — ' + batch.length + ' frames...');

                            try {
                                var answers = await groqVisionBatch(batch.map(function(f) { return f.path; }), gKey);

                                for (var j = 0; j < batch.length; j++) {
                                    var frame   = batch[j];
                                    var absTime = clipStart + frame.timeOffset;
                                    var name    = parseProductName(answers[j] || '');
                                    if (name) {
                                        var isDup = visualDetections.some(function (v) {
                                            return v.name.toLowerCase() === name.toLowerCase() && Math.abs(v.time - absTime) < 12;
                                        });
                                        if (!isDup) {
                                            visualDetections.push({ name: name, time: absTime, type: 'visual', framePath: frame.path });
                                            log('&#10003; <strong>' + escHtml(name) + '</strong> em ' + fmtTime(absTime));
                                        }
                                    }
                                }
                            } catch (vErr) {
                                console.warn('[VSL] batch error:', vErr.message);
                                if (vErr.message && (vErr.message.indexOf('429') !== -1 || vErr.message.indexOf('rate') !== -1)) {
                                    var raMatch = vErr.message.match(/retry-after:\s*(\d+)/i);
                                    var waitSec = raMatch ? (parseInt(raMatch[1]) + 5) : 70;
                                    log('Rate limit. Aguardando ' + waitSec + 's...');
                                    await sleep(waitSec * 1000);
                                    bi -= BATCH_SIZE; // retry this batch
                                }
                                // other errors: skip batch, continue
                            }
                        }

                        // ── STEP 3: Whisper audio (MP3 to avoid 413) ────────
                        log('Transcrevendo audio (MP3)...');
                        var transcript = { text: '', words: [] };
                        try { transcript = await transcribeWithWords(videoPath, inPoint, duration); }
                        catch (tErr) { console.warn('[VSL] transcription error:', tErr.message); }

                        // ── STEP 4: LLaMA text extraction ────────────────────
                        var textDetections = [];
                        if (transcript.text) {
                            log('Identificando produtos na transcricao...');
                            try {
                                var names = await extractProductNamesFromText(transcript.text);
                                textDetections = findProductMentions(transcript.words, names, clipStart);
                            } catch (lErr) { console.warn('[VSL] LLaMA:', lErr.message); }
                        }

                        var allDetections = mergeDetections(visualDetections.concat(textDetections));

                        // Encode frame thumbnails as base64 NOW — before finally{} deletes framesDir
                        var fsThumb = require('fs');
                        allDetections.forEach(function (d) {
                            if (d.framePath) {
                                try { d.thumb = 'data:image/jpeg;base64,' + fsThumb.readFileSync(d.framePath).toString('base64'); } catch (e) {}
                                delete d.framePath;
                            }
                        });

                        if (allDetections.length === 0) {
                            log('<span style="color:#f59e0b;">Nenhum produto detectado.</span>');
                            resultsEl.innerHTML = '<p style="color:rgba(255,255,255,0.35);font-size:11px;margin:0;">Nenhum produto encontrado.</p>';
                            if (btn) btn.disabled = false;
                            return;
                        }

                        log('Inserindo ' + allDetections.length + ' marcadores...');
                        // Strip thumbnails from the payload sent to JSX (base64 would bloat the evalScript string)
                        var slimDetections = allDetections.map(function (d) { return { name: d.name, time: d.time, type: d.type }; });
                        var b64 = btoa(unescape(encodeURIComponent(JSON.stringify({ detections: slimDetections }))));
                        csInterface.evalScript("$._nexxt.inserirMarcadoresProdutos('" + b64 + "')", function (mRes) {
                            var mMsg = (mRes && mRes.indexOf('SUCESSO|') === 0)
                                ? mRes.split('|')[1]
                                : (mRes || 'Marcadores inseridos');
                            log('<span style="color:#10b981;">' + escHtml(mMsg) + '</span>');
                            renderResults(resultsEl, allDetections);
                            if (btn) btn.disabled = false;
                        });

                    } catch (fErr) {
                        log('<span style="color:#ef4444;">Erro ffmpeg: ' + escHtml(fErr.message) + '</span>');
                        if (btn) btn.disabled = false;
                    }

                } catch (err) {
                    log('<span style="color:#ef4444;">Erro: ' + escHtml(err.message) + '</span>');
                    console.error('[VSL] fatal:', err);
                    if (btn) btn.disabled = false;
                } finally {
                    if (framesDir) {
                        try { require('fs').rmSync(framesDir, { recursive: true }); } catch (e) { /* ignore */ }
                    }
                }
            });
        } catch (e) {
            logEl.innerHTML = '<span style="color:#ef4444;">Erro: ' + escHtml(e.message) + '</span>';
            if (btn) btn.disabled = false;
        }
    };

    // ── Groq Vision — batch call: N frames in ONE request ───────────────────────
    // Rate limit: 1 request = 1 RPM unit, regardless of how many images are inside.
    // 30 frames ÷ 8 per batch = 4 requests total → ~10 RPM, impossible to rate-limit.

    async function groqVisionBatch(imagePaths, gKey) {
        var fs = require('fs');
        var n  = imagePaths.length;

        // Formato intercalado: label → imagem → label → imagem (padrão Llama 4 Scout)
        var content = [];
        for (var i = 0; i < imagePaths.length; i++) {
            var imageData = fs.readFileSync(imagePaths[i]).toString('base64');
            content.push({ type: 'text', text: 'Frame ' + (i + 1) + ':' });
            content.push({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + imageData } });
        }
        content.push({ type: 'text', text:
            'Look at each of the ' + n + ' frames above.\n' +
            'For EACH frame: if any physical product (bottle, jar, pote, box, pouch, sachet, pill bottle, tube) ' +
            'has a readable brand name or label visible — write that name exactly as it appears.\n' +
            'If no product with a readable label is present, write NONE.\n\n' +
            'Reply with EXACTLY ' + n + ' lines, no extra text:\n' +
            Array.from({length: n}, function(_, k) { return 'Frame ' + (k+1) + ': [brand name or NONE]'; }).join('\n')
        });

        var response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + gKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: GROQ_VISION_MODEL,
                max_tokens: Math.max(n * 60, 512),
                temperature: 0.1,
                messages: [{ role: 'user', content: content }]
            })
        });

        if (response.status === 429) {
            var retryAfter = response.headers.get('retry-after') || '65';
            throw new Error('429 rate limit, retry-after: ' + retryAfter + 's');
        }
        if (!response.ok) {
            var errData = await response.json().catch(function () { return {}; });
            throw new Error('Groq ' + response.status + ': ' + JSON.stringify(errData.error || errData).substring(0, 100));
        }

        var result = await response.json();
        var text   = (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content || '').trim();
        console.log('[VSL] batch response:', text.substring(0, 200));

        // Parse "Frame N: answer" lines into array indexed by frame position
        var answers = new Array(n).fill('NONE');
        var lines   = text.split('\n');
        for (var li = 0; li < lines.length; li++) {
            var m = lines[li].replace(/\*/g, '').match(/(?:Frame|Quadro)\s*(\d+)\s*[:-]\s*(.+)/i);
            if (m) {
                var idx = parseInt(m[1], 10) - 1; // 0-based
                if (idx >= 0 && idx < n) answers[idx] = m[2].trim();
            }
        }
        return answers;
    }

    // ── Parse the product name from Groq response ────────────────────────────────

    function parseProductName(text) {
        if (!text) return null;
        var t = text.trim();

        // Explicit NO
        if (/^(none|no|nenhum|not visible|no supplement|no product|there is no|i don|i can)/i.test(t)) return null;

        // Strip common prefixes
        t = t.replace(/^(yes[,:]?\s*|the (product|brand) name is\s*|it (says|reads)\s*|label (reads|says)\s*)/i, '').trim();
        t = t.replace(/[.!?,;:]+$/, '').trim();

        // Too long = probably a description, not a name
        if (t.length < 2 || t.length > 80) return null;

        // Still a no
        if (/^(no\b|none|the image|the photo|this image|there is|i see no|not a|cannot)/i.test(t)) return null;

        return t;
    }

    // ── Frame extraction ─────────────────────────────────────────────────────────

    async function extractFrames(videoPath, inPoint, duration, interval) {
        var path = require('path');
        var fs   = require('fs');
        var cp   = require('child_process');
        var os   = require('os');

        var _ffmpegLocal = typeof PLUGIN_TOOLS_DIR !== 'undefined' && PLUGIN_TOOLS_DIR 
                           ? path.join(PLUGIN_TOOLS_DIR, 'ffmpeg' + (process.platform === 'win32' ? '.exe' : '')) 
                           : path.join(csInterface.getSystemPath(SystemPath.EXTENSION), 'tools', 'ffmpeg' + (process.platform === 'win32' ? '.exe' : ''));
        var ffmpegExe = fs.existsSync(_ffmpegLocal) ? _ffmpegLocal : 'ffmpeg';
        var dir       = path.join(os.tmpdir(), 'vsl_frames_' + Date.now());
        fs.mkdirSync(dir, { recursive: true });

        var args = [
            '-y', '-ss', String(inPoint),
            '-i', videoPath,
            '-t', String(duration),
            '-vf', 'fps=1/' + interval + ',scale=640:-1',
            '-q:v', '3',
            path.join(dir, 'frame_%06d.jpg')
        ];

        var stderr = '';
        await new Promise(function (resolve, reject) {
            var child = cp.spawn(ffmpegExe, args);
            child.stderr.on('data', function (d) { stderr += d.toString(); });
            child.on('close', function (c) {
                if (c === 0) resolve();
                else reject(new Error('ffmpeg exit ' + c + ': ' + stderr.slice(-200)));
            });
            child.on('error', reject);
        });

        var frames = fs.readdirSync(dir)
            .filter(function (f) { return f.endsWith('.jpg'); })
            .sort()
            .map(function (f, i) { return { path: path.join(dir, f), timeOffset: i * interval }; });

        return { frames: frames, dir: dir };
    }

    // ── Whisper transcription — MP3 to stay under proxy 25MB limit ───────────────

    async function transcribeWithWords(videoPath, inPoint, duration) {
        var path = require('path');
        var fs   = require('fs');
        var cp   = require('child_process');
        var os   = require('os');

        var _ffmpegLocal = typeof PLUGIN_TOOLS_DIR !== 'undefined' && PLUGIN_TOOLS_DIR 
                           ? path.join(PLUGIN_TOOLS_DIR, 'ffmpeg' + (process.platform === 'win32' ? '.exe' : '')) 
                           : path.join(csInterface.getSystemPath(SystemPath.EXTENSION), 'tools', 'ffmpeg' + (process.platform === 'win32' ? '.exe' : ''));
        var ffmpegExe = fs.existsSync(_ffmpegLocal) ? _ffmpegLocal : 'ffmpeg';
        var outMp3    = path.join(os.tmpdir(), 'vsl_audio_' + Date.now() + '.mp3');

        // MP3 64kbps mono: ~8MB for 17min (vs 32MB WAV) — stays under proxy limit
        var args = [
            '-y', '-ss', String(inPoint),
            '-i', videoPath,
            '-t', String(Math.min(duration, 1800)), // max 30min
            '-vn', '-acodec', 'libmp3lame', '-ar', '16000', '-ac', '1', '-b:a', '64k',
            outMp3
        ];

        await new Promise(function (resolve, reject) {
            var child = cp.spawn(ffmpegExe, args);
            child.on('close', function (c) { c === 0 ? resolve() : reject(new Error('ffmpeg audio exit ' + c)); });
            child.on('error', reject);
        });

        var sizeMB = Math.round(require('fs').statSync(outMp3).size / 1024 / 1024 * 10) / 10;
        console.log('[VSL] Audio MP3:', sizeMB, 'MB');

        var buffer = await fs.promises.readFile(outMp3);
        var fd     = new FormData();
        fd.append('file', new Blob([new Uint8Array(buffer).buffer], { type: 'audio/mpeg' }), 'audio.mp3');
        fd.append('model', 'whisper-large-v3-turbo');
        fd.append('response_format', 'verbose_json');
        fd.append('timestamp_granularities[]', 'word');

        var gKey = getGroqKey();
        if (!gKey) throw new Error('Chave Groq não configurada. Acesse Configurações e insira sua chave Groq.');
        var resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + gKey }, body: fd
        });
        var d = await resp.json();

        try { fs.unlinkSync(outMp3); } catch (e) { /* ignore */ }

        if (!resp.ok) throw new Error('Whisper: ' + JSON.stringify(d.error || d).substring(0, 150));
        return { text: d.text || '', words: d.words || [] };
    }

    // ── LLaMA text extraction (Replicate) ───────────────────────────────────────

    async function extractProductNamesFromText(text) {
        if (!text) return [];
        var gKey = getGroqKey();
        if (!gKey) return [];
        var sys  = 'You identify health supplement and consumer product brand names in VSL transcripts. These are invented brand names: 1-4 words combining health concepts, body parts, actions, colors, or exotic words. Examples: "NeuroPrime", "Sugar Defender", "QuietumPlus", "Mitolyn", "ProstaVive", "HunterPower", "Slim Jara", "Slimberry", "HunterBurn", "Biofit", "Ignite", "Alpilean". Brazilian/Portuguese products often combine English roots with Portuguese-style endings. Reply ONLY with a JSON array: ["Name1","Name2"]. If none found: []';
        var msg  = 'Transcript: "' + text.replace(/"/g, "'").substring(0, 40000) + '"\n\nList all supplement brand names:';

        try {
            var response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + gKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    temperature: 0.1,
                    messages: [
                        { role: 'system', content: sys },
                        { role: 'user', content: msg }
                    ]
                })
            });
            var d = await response.json();
            if (!response.ok) return [];
            
            var outText = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
            var match = outText.match(/\[[\s\S]*?\]/);
            if (!match) return [];
            
            var arr = JSON.parse(match[0]);
            return Array.isArray(arr) ? arr.filter(function (n) { return typeof n === 'string' && n.trim(); }) : [];
        } catch (e) {
            console.warn('[VSL Text Extraction Error]', e);
            return [];
        }
    }

    function findProductMentions(words, names, clipStart) {
        if (!words.length || !names.length) return [];
        var out = [];
        names.forEach(function (name) {
            var first = name.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '');
            if (first.length < 2) return;
            words.forEach(function (w) {
                if ((w.word || '').toLowerCase().replace(/[^a-z0-9]/g, '').indexOf(first) !== -1) {
                    out.push({ name: name, time: clipStart + (w.start || 0), type: 'mention' });
                }
            });
        });
        return out;
    }

    function mergeDetections(detections) {
        var sorted = detections.slice().sort(function (a, b) { return a.time - b.time; });
        var result = [];
        sorted.forEach(function (d) {
            if (!result.some(function (r) {
                return r.name.toLowerCase().trim() === d.name.toLowerCase().trim() && Math.abs(r.time - d.time) < 10;
            })) result.push(d);
        });
        return result;
    }

    function renderResults(container, detections) {
        if (!detections.length) {
            container.innerHTML = '<p style="color:rgba(255,255,255,0.35);font-size:11px;margin:0;">Nenhum produto encontrado.</p>';
            return;
        }
        var wrapper = document.createElement('div');
        wrapper.innerHTML =
            '<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);margin-bottom:8px;">' + detections.length + ' produto(s) detectado(s)</div>' +
            '<div id="vsl-items" style="display:flex;flex-direction:column;gap:5px;"></div>';
        container.innerHTML = '';
        container.appendChild(wrapper);

        var listEl = wrapper.querySelector('#vsl-items');
        detections.forEach(function (d) {
            var bc       = d.type === 'visual' ? 'rgba(34,211,238,0.3)' : 'rgba(250,204,21,0.3)';
            var dotColor = d.type === 'visual' ? '#22d3ee' : '#facc15';
            var label    = d.type === 'visual' ? 'Visual' : 'Mencionado';
            var item     = document.createElement('div');
            item.title   = 'Clique para ir para ' + fmtTime(d.time);
            item.style.cssText = 'display:flex;align-items:stretch;gap:0;background:rgba(255,255,255,0.04);border-radius:6px;border:1px solid ' + bc + ';cursor:pointer;overflow:hidden;';

            // Thumbnail (only for visual detections that have a captured frame)
            var thumbHtml = d.thumb
                ? '<img src="' + d.thumb + '" style="width:72px;min-width:72px;object-fit:cover;display:block;">'
                : '<div style="width:10px;min-width:10px;background:' + dotColor + ';opacity:0.5;"></div>';

            item.innerHTML =
                thumbHtml +
                '<div style="flex:1;min-width:0;padding:8px 10px;display:flex;flex-direction:column;justify-content:center;gap:3px;">' +
                '<div style="font-size:12px;font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(d.name) + '</div>' +
                '<div style="display:flex;align-items:center;gap:6px;">' +
                '<span style="font-size:10px;font-weight:600;color:' + dotColor + ';">' + label + '</span>' +
                '<span style="font-size:10px;color:rgba(255,255,255,0.35);">·</span>' +
                '<span style="font-size:10px;color:rgba(255,255,255,0.5);font-variant-numeric:tabular-nums;">' + fmtTime(d.time) + '</span>' +
                '</div>' +
                '</div>';

            item.addEventListener('click', function () {
                csInterface.evalScript('$._nexxt.moverPlayhead(' + d.time + ')');
            });
            listEl.appendChild(item);
        });
    }

    function fmtTime(sec) {
        var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
        return (h > 0 ? h + 'h ' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    function fmtDur(sec) {
        var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
        if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'min';
        if (m > 0) return m + 'min ' + String(s).padStart(2, '0') + 's';
        return s + 's';
    }
    function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function sleep(ms)  { return new Promise(function (r) { setTimeout(r, ms); }); }

})();

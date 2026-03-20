/**
 * SRT AI REVIEW — NEXXT EFFECTS
 * Architecture: Separation & Reconstruction
 *   1. parseSrt()           → [{id, start, end, text}]
 *   2. callGroq()           → send only text[] as JSON, receive corrected text[] as JSON
 *   3. parseOllamaResponse() → safely extract the JSON array (3-layer fallback)
 *   4. reconstructSrt()     → merge corrected texts back with original timestamps
 *   5. importSrtToPremiere() → save to %TEMP% and push to Premiere Project panel
 */
(function () {
    /* ------------------------------------------------------------------
       CONFIG
    ------------------------------------------------------------------ */
    const CHUNK_SIZE = 50; // subtitle blocks per Groq call (8K ctx handles 50+ easily)

    const SYSTEM_PROMPT =
        'You are a JSON text corrector. ' +
        'You receive a JSON array of subtitle strings and return a JSON array of the same strings ' +
        'with corrected grammar and spelling. ' +
        'You MUST preserve all HTML tags (e.g. <font color=...>, <b>, <i>). ' +
        'You MUST return ONLY a valid JSON array — no explanation, no markdown, no extra text. ' +
        'If a string needs no correction, return it unchanged. ' +
        'The output array MUST have exactly the same number of elements as the input array.';

    /* ------------------------------------------------------------------
       STATE
    ------------------------------------------------------------------ */
    let _parsedBlocks = [];   // [{id, start, end, text}]
    let _correctedSrt = '';   // final reconstructed SRT string
    let _originalName = '';   // original file name for saving
    let _contextMemory = '';   // last 3 corrected texts for style consistency
    let _cancelled = false;
    let _initialized = false;

    /* ------------------------------------------------------------------
       DOM HELPERS
    ------------------------------------------------------------------ */
    const $ = id => document.getElementById(id);

    function setStatus(msg, type = 'info') {
        const el = $('srt-status');
        if (!el) return;

        el.innerHTML = msg;

        if (!msg) {
            el.style.display = 'none';
            return;
        }

        el.style.display = 'flex';

        if (type === 'error') {
            el.style.background = 'rgba(239, 68, 68, 0.1)';
            el.style.border = '1px solid rgba(239, 68, 68, 0.3)';
            el.style.color = '#EF4444';
            el.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.2)';
        } else if (type === 'success') {
            el.style.background = 'rgba(16, 185, 129, 0.1)';
            el.style.border = '1px solid rgba(16, 185, 129, 0.3)';
            el.style.color = '#10B981';
            el.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.2)';
        } else {
            el.style.background = 'rgba(255, 255, 255, 0.05)';
            el.style.border = '1px solid rgba(255, 255, 255, 0.1)';
            el.style.color = 'rgba(255, 255, 255, 0.7)';
            el.style.boxShadow = 'none';
        }
    }

    function updateProgress(pct, text) {
        const fill = $('srt-progress-fill');
        const textEl = $('srt-progress-text');
        const pctEl = $('srt-progress-pct');
        if (fill) fill.style.width = `${Math.min(pct, 100)}%`;
        if (textEl && text) textEl.textContent = text;
        if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
    }

    function setLoading(isLoading) {
        const btnReplicate = $('btn-srt-review-replicate');
        const btnCancel = $('btn-srt-cancel');
        const progContainer = $('srt-progress-container');
        if (btnReplicate) { btnReplicate.disabled = isLoading; btnReplicate.style.opacity = isLoading ? '0.6' : '1'; }
        if (btnCancel) btnCancel.style.display = isLoading ? 'block' : 'none';
        if (progContainer) progContainer.style.display = isLoading ? 'flex' : 'none';
        if (isLoading) updateProgress(0, 'Iniciando...');
        _cancelled = !isLoading;
    }

    function showResultPanel(show) {
        const panel = $('srt-result-panel');
        if (panel) panel.style.display = show ? 'flex' : 'none';
    }

    /* ------------------------------------------------------------------
       1. PARSER — parseSrt(srtString)
       Converts raw SRT text to [{id, start, end, text}]
       Robust regex handles both \r\n and \n line endings.
    ------------------------------------------------------------------ */
    function parseSrt(srtString) {
        // Normalize line endings
        const normalized = srtString.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

        // Split into blocks separated by one or more blank lines
        const rawBlocks = normalized.split(/\n\n+/);
        const blocks = [];

        const TS_RE = /^(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/;
        const ID_RE = /^\d+$/;

        for (const block of rawBlocks) {
            const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length < 3) continue; // id + timestamp + text minimum

            const idLine = lines[0];
            const tsLine = lines[1];
            const tsMatch = TS_RE.exec(tsLine);

            if (!ID_RE.test(idLine) || !tsMatch) continue; // skip malformed blocks

            blocks.push({
                id: parseInt(idLine, 10),
                start: tsMatch[1],
                end: tsMatch[2],
                text: lines.slice(2).join('\n') // preserve multi-line text + HTML tags
            });
        }

        return blocks;
    }

    /* ------------------------------------------------------------------
       2. VALIDATE SRT (for the raw loaded file)
    ------------------------------------------------------------------ */
    function validateSrt(text) {
        return /\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}/.test(text);
    }

    /* ------------------------------------------------------------------
       3. CALL GROQ — send only text[], get back corrected text[]
       Uses Groq chat completions (LLaMA 3.1 8B Instant).
       The LLM NEVER sees timestamps or index numbers.
    ------------------------------------------------------------------ */
    async function callGroq(textsArray, contextMemory) {
        const apiKey = (localStorage.getItem('groq_api_key') || '').trim();
        if (!apiKey) throw new Error('Chave Groq não configurada. Acesse Configurações e insira sua chave Groq.');

        const systemWithContext = contextMemory
            ? `[STYLE CONTEXT — do NOT correct, use only for style/name consistency]: ${contextMemory}\n\n${SYSTEM_PROMPT}`
            : SYSTEM_PROMPT;

        const MAX_RETRIES = 3;
        const BACKOFF_DELAYS = [3000, 6000, 12000];
        let lastError = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (_cancelled) throw new Error('Cancelado pelo usuário.');

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
                    messages: [
                        { role: 'system', content: systemWithContext },
                        { role: 'user', content: 'Correct ONLY grammar and spelling. Return ONLY a raw JSON array of strings (no markdown, no explanation).\nINPUT:\n' + JSON.stringify(textsArray) }
                    ],
                    max_tokens: 4096,
                    temperature: 0.05
                })
            });

            const data = await response.json();

            if (!response.ok) {
                const errMsg = data.error?.message || `HTTP ${response.status}`;
                if (response.status === 429) {
                    lastError = new Error('Groq rate limit. Tentando novamente...');
                    if (attempt < MAX_RETRIES) {
                        const delay = BACKOFF_DELAYS[attempt];
                        updateProgress(-1, `⏳ Rate limit Groq — nova tentativa em ${delay / 1000}s... (${attempt + 1}/${MAX_RETRIES})`);
                        await new Promise(r => setTimeout(r, delay));
                        continue;
                    }
                    throw new Error('Groq rate limit após 3 tentativas. Tente novamente em instantes.');
                }
                throw new Error(`Groq (${response.status}): ${errMsg}`);
            }

            return data.choices?.[0]?.message?.content || '';
        }

        throw lastError || new Error('Erro desconhecido no Groq.');
    }



    /* ------------------------------------------------------------------
       4. PARSE OLLAMA RESPONSE — 3-layer JSON extraction
       Layer 1: Direct JSON.parse
       Layer 2: Regex extraction of first [...] array
       Layer 3: Fallback to original texts (never crashes the plugin)
    ------------------------------------------------------------------ */
    function parseOllamaResponse(rawResponse, originalTexts) {
        const cleaned = rawResponse.trim();

        // Layer 1: Direct parse (ideal case — model returned clean JSON)
        try {
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed)) {
                console.log('[SRT Review] JSON parse: Layer 1 success');
                return parsed;
            }
        } catch (_) { /* fall through */ }

        // Layer 2: Extract first [...] array with regex (model added prose around it)
        try {
            const match = cleaned.match(/\[[\s\S]*\]/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                if (Array.isArray(parsed)) {
                    console.log('[SRT Review] JSON parse: Layer 2 success (regex extraction)');
                    return parsed;
                }
            }
        } catch (_) { /* fall through */ }

        // Layer 3: Fallback — return originals unchanged, log for debugging
        console.warn('[SRT Review] JSON parse: All layers failed. Raw response preview:', cleaned.substring(0, 300));
        return originalTexts;
    }

    /* ------------------------------------------------------------------
       5. RECONSTRUCT SRT — merge corrected texts with original timestamps
       If arrays differ in size (parse error), falls back per-index.
    ------------------------------------------------------------------ */
    function reconstructSrt(parsedBlocks, correctedTexts) {
        return parsedBlocks.map((block, idx) => {
            const corrected = correctedTexts[idx] !== undefined
                ? correctedTexts[idx]
                : block.text; // per-index fallback if correction is missing

            return `${block.id}\n${block.start} --> ${block.end}\n${corrected}`;
        }).join('\n\n');
    }

    /* ------------------------------------------------------------------
       6. SAVE & IMPORT TO PREMIERE
       Saves to %TEMP% via Node.js, then imports via ExtendScript.
    ------------------------------------------------------------------ */
    function importSrtToPremiere(srtString, originalName) {
        if (!srtString) { setStatus('⚠️ Nenhum resultado para salvar', 'error'); return; }

        try {
            const os = require('os');
            const path = require('path');
            const fs = require('fs');

            const baseName = (originalName || 'nexxt_srt').replace(/\.srt$/i, '');
            const fileName = `${baseName}_corrigido_${Date.now()}.srt`;
            const savedPath = path.join(os.tmpdir(), fileName);

            fs.writeFileSync(savedPath, srtString, 'utf-8');
            setStatus(`💾 Salvo: ${fileName}`, 'success');

            if (!window.csInterface) {
                setStatus(`✅ Arquivo salvo em: ${savedPath}`, 'success');
                return;
            }

            const safePath = savedPath.replace(/\\/g, '/');
            const importScript = `(function(){
                try {
                    var f = new File("${safePath}");
                    if (!f.exists) return "ERRO: arquivo nao encontrado: " + f.fsName;

                    var imported = app.project.importFiles([f.fsName], true, app.project.rootItem, false);
                    if (!imported) return "ERRO: Premiere recusou importacao: " + f.fsName;

                    // Find the item just imported
                    var item = null;
                    for (var i = 0; i < app.project.rootItem.children.numItems; i++) {
                        var c = app.project.rootItem.children[i];
                        if (c.name === f.name || (c.getMediaPath && c.getMediaPath() === f.fsName)) {
                            item = c; break;
                        }
                    }
                    if (!item) return "ERRO: item importado nao localizado no Project panel";

                    var seq = app.project.activeSequence;
                    if (!seq) return "OK_PROJECT_ONLY";

                    if (typeof seq.createCaptionTrack === "function") {
                        seq.createCaptionTrack(item, 0, 3);
                        return "OK_CAPTION_TRACK";
                    } else {
                        seq.videoTracks[0].insertClip(item, 0);
                        return "OK_LEGACY";
                    }
                } catch(e) { return "ERRO EXCEPTION: " + e.message; }
            })()`;

            window.csInterface.evalScript(importScript, (result) => {
                if (['OK_CAPTION_TRACK', 'OK_LEGACY', 'OK_PROJECT_ONLY', 'undefined', ''].includes(result)) {
                    setStatus('✅ SRT corrigido importado para o Premiere!', 'success');
                } else if (result === 'OK_PROJECT_ONLY') {
                    setStatus('✅ SRT salvo no painel Project (sem sequência ativa).', 'info');
                } else {
                    setStatus('⚠️ Salvo em disco. Falha no Premiere: ' + result, 'error');
                }
            });

        } catch (err) {
            setStatus(`❌ Erro ao salvar: ${err.message}`, 'error');
        }
    }

    /* ------------------------------------------------------------------
       7. MAIN ORCHESTRATION — reviewWithIA(provider)
       Chunks of CHUNK_SIZE blocks, carries contextMemory between chunks.
    ------------------------------------------------------------------ */
    async function reviewWithIA(provider = 'local') {
        if (!_parsedBlocks || _parsedBlocks.length === 0) {
            setStatus('❌ Nenhum SRT carregado.', 'error');
            return;
        }

        setLoading(true);
        _correctedSrt = '';
        _contextMemory = '';
        _cancelled = false;

        const groqKey = (localStorage.getItem('groq_api_key') || '').trim();
        if (!groqKey) {
            setLoading(false);
            setStatus('❌ Chave Groq não configurada. Acesse Configurações e insira sua chave Groq.', 'error');
            return;
        }

        // Build chunks of block indices
        const allCorrectedTexts = new Array(_parsedBlocks.length);

        const currentChunkSize = CHUNK_SIZE;
        const numChunks = Math.ceil(_parsedBlocks.length / currentChunkSize);

        try {
            for (let c = 0; c < numChunks; c++) {
                if (_cancelled) break;

                const start = c * currentChunkSize;
                const end = Math.min(start + currentChunkSize, _parsedBlocks.length);
                const chunkBlocks = _parsedBlocks.slice(start, end);
                const chunkTexts = chunkBlocks.map(b => b.text);

                const pct = Math.round(5 + (c / numChunks) * 88);
                updateProgress(pct, `🚀 Corrigindo bloco ${start + 1}–${end} de ${_parsedBlocks.length}...`);

                // Dynamic dispatch based on provider
                let rawResponse = '';
                rawResponse = await callGroq(chunkTexts, _contextMemory);

                const correctedTexts = parseOllamaResponse(rawResponse, chunkTexts);

                // Store corrected texts back at correct global indices
                for (let i = 0; i < chunkBlocks.length; i++) {
                    allCorrectedTexts[start + i] = correctedTexts[i] !== undefined
                        ? correctedTexts[i]
                        : chunkTexts[i];
                }

                // Save last 3 corrected texts as context for next chunk
                _contextMemory = correctedTexts.slice(-3).join(' | ');

                updateProgress(
                    Math.round(5 + ((c + 1) / numChunks) * 88),
                    `✅ Bloco ${c + 1}/${numChunks} concluído.`
                );
            }

            if (!_cancelled) {
                updateProgress(100, 'Reconstruindo SRT...');
                _correctedSrt = reconstructSrt(_parsedBlocks, allCorrectedTexts);

                // Show preview
                const resultEl = $('srt-result-preview');
                if (resultEl) {
                    const preview = _correctedSrt.split('\n').slice(0, 14).join('\n');
                    resultEl.textContent = preview + (_correctedSrt.split('\n').length > 14 ? '\n...' : '');
                }
                showResultPanel(true);
                setLoading(false);
                setStatus('✅ Revisão concluída! Importando para o Premiere...', 'success');
                setTimeout(() => importSrtToPremiere(_correctedSrt, _originalName), 300);
            }

        } catch (err) {
            console.error('[SRT Review] Error:', err);
            setStatus(`❌ Erro: ${err.message}`, 'error');
            setLoading(false);
        }
    }



    /* ------------------------------------------------------------------
       FILE LOADING
    ------------------------------------------------------------------ */
    function loadSrtFile(file) {
        const reader = new FileReader();
        reader.onload = e => {
            const text = e.target.result;
            if (!validateSrt(text)) {
                setStatus('❌ Arquivo inválido — não é um .srt com timestamps.', 'error');
                return;
            }

            _parsedBlocks = parseSrt(text);
            _correctedSrt = '';
            _contextMemory = '';
            _originalName = file.name;
            showResultPanel(false);

            if (_parsedBlocks.length === 0) {
                setStatus('❌ Nenhum bloco SRT válido encontrado.', 'error');
                return;
            }

            setStatus(`✅ "${file.name}" — ${_parsedBlocks.length} blocos carregados. Escolha o método de revisão.`, 'success');
        };
        reader.onerror = () => setStatus('❌ Falha ao ler o arquivo.', 'error');
        reader.readAsText(file, 'UTF-8');
    }

    function cancelReview() {
        _cancelled = true;
        setLoading(false);
        setStatus('🚫 Revisão cancelada.', 'error');
    }

    /* ------------------------------------------------------------------
       INIT
    ------------------------------------------------------------------ */
    function init() {
        if (_initialized) return;

        const dropZone = $('srt-dropzone');
        const fileInput = $('srt-file-input');

        if (!dropZone) return;
        _initialized = true;

        dropZone.addEventListener('click', (e) => {
            if (e.target === fileInput) return;
            fileInput && fileInput.click();
        });

        if (fileInput) {
            fileInput.addEventListener('click', e => e.stopPropagation());
            fileInput.addEventListener('change', e => {
                if (e.target.files && e.target.files[0]) loadSrtFile(e.target.files[0]);
                e.target.value = '';
            });
        }

        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) loadSrtFile(file);
        });

        const btnReplicate = $('btn-srt-review-replicate');
        const btnApply = $('btn-srt-apply');
        const btnSave = $('btn-srt-save');
        const btnCancel = $('btn-srt-cancel');

        if (btnReplicate) btnReplicate.addEventListener('click', () => reviewWithIA('local'));
        if (btnApply) btnApply.addEventListener('click', () => importSrtToPremiere(_correctedSrt, _originalName));
        if (btnSave) btnSave.addEventListener('click', () => importSrtToPremiere(_correctedSrt, _originalName));
        if (btnCancel) btnCancel.addEventListener('click', cancelReview);

        const btnSrtPath = $('btn-settings-path-srt');
        if (btnSrtPath) btnSrtPath.addEventListener('click', () => window.escolherPastaSRT && window.escolherPastaSRT());

        console.log('[SRT Review] Initialized — Separation & Reconstruction Architecture v2');
    }

    window.initSrtReview = init;
    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);

})();

(function () {
    'use strict';

    // AI Director Logic 
    window.testAIDirectorAudio = function () {
        var logEl = document.getElementById('ai-director-log');
        if (!logEl) return;
        logEl.innerHTML = 'Analisando timeline...';

        if (!window.csInterface) {
            logEl.innerHTML = 'Erro: csInterface não disponível.';
            return;
        }

        csInterface.evalScript('$._nexxt.obterCaminhoAudioSelecionadoIA()', function (res) {
            if (!res || res.indexOf('ERRO|') === 0) {
                logEl.innerHTML = '<span style="color:#ef4444;">' + (res || 'Erro desconhecido') + '</span>';
                return;
            }

            try {
                var data = JSON.parse(res);
                if (data.status !== "SUCESSO") {
                    logEl.innerHTML = '<span style="color:#ef4444;">Erro na extração.</span>';
                    return;
                }

                logEl.innerHTML = 'Áudio encontrado. Extraindo trecho de ' + data.duration.toFixed(2) + 's...';

                var path = require('path');
                var fs = require('fs');
                var cp = require('child_process');
                var os = require('os');

                var extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
                var _ffmpegLocal = path.join(extPath, 'tools', 'ffmpeg' + (process.platform === 'win32' ? '.exe' : ''));
                var ffmpegExe = fs.existsSync(_ffmpegLocal) ? _ffmpegLocal : 'ffmpeg';
                
                var tmpDir = os.tmpdir();
                var outWav = path.join(tmpDir, 'ai_director_test_' + Date.now() + '.wav');

                var args = [
                    '-y',
                    '-i', data.mediaPath,
                    '-ss', data.inPoint.toString(),
                    '-t', data.duration.toString(),
                    '-vn',
                    '-acodec', 'pcm_s16le',
                    '-ar', '44100',
                    '-ac', '2',
                    outWav
                ];

                var child = cp.spawn(ffmpegExe, args);
                
                child.on('close', async function (code) {
                    if (code === 0 && fs.existsSync(outWav)) {
                        logEl.innerHTML = '<span style="color:#10b981;">Extração Concluída! Iniciando Transcrição...</span>';
                        console.log("Audio extraído em: " + outWav);
                        try {
                            logEl.innerHTML = '<span style="color:#10b981;">Extração Concluída! Iniciando Transcrição...</span>';
                            const transcript = await transcribeAudio(outWav);
                            
                            logEl.innerHTML = '<span style="color:#10b981;">Transcrição Concluída!</span><br/><em>"' + transcript + '"</em><br/><br/>Gerando Direção Criativa...';
                            const aiResponse = await generateArtDirection(transcript);
                            
                            logEl.innerHTML = '<span style="color:#10b981;">Direção Gerada com Sucesso!</span>';
                            
                            // Renderizar na UI
                            if (window.renderAIDirectorUI) {
                                window.renderAIDirectorUI(aiResponse, transcript);
                            }
                        } catch (apiErr) {
                            logEl.innerHTML = '<span style="color:#ef4444;">Erro: ' + apiErr.message + '</span>';
                        }
                        
                    } else {
                        logEl.innerHTML = '<span style="color:#ef4444;">Erro FFMPEG (código ' + code + ')</span>';
                    }
                });

                child.on('error', function(err) {
                    logEl.innerHTML = '<span style="color:#ef4444;">Falha ao iniciar FFMPEG: ' + err.message + '</span>';
                });

            } catch (err) {
                logEl.innerHTML = '<span style="color:#ef4444;">Erro ao processar JSON: ' + err.message + '<br/>Raw: ' + res + '</span>';
            }
        });
    };

    // API: Whisper via Groq Proxy
    async function transcribeAudio(audioPath) {
        const fs = require('fs');
        
        // Ler como ArrayBuffer para o FormData
        const buffer = await fs.promises.readFile(audioPath);
        const arrayBuffer = new Uint8Array(buffer).buffer;
        const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
        
        const formData = new FormData();
        formData.append("file", blob, "audio.wav");
        formData.append("model", "whisper-large-v3-turbo");
        formData.append("response_format", "verbose_json");
        formData.append("timestamp_granularities[]", "word");

        // NEXXT_PROXY_URL e NEXXT_ANON_KEY vêm do auth.js/main.js
        if (typeof NEXXT_PROXY_URL === 'undefined' || typeof NEXXT_ANON_KEY === 'undefined') {
            throw new Error("Proxy de transcrição não carregado (auth.js ausente).");
        }

        const response = await fetch(NEXXT_PROXY_URL, {
            method: "POST",
            headers: { "Authorization": "Bearer " + NEXXT_ANON_KEY },
            body: formData
        });

        const data = await response.json();
        
        if (!response.ok || data.error) {
            throw new Error(data.error?.message || (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)) || "Erro API Groq Whisper");
        }

        return data.text || ''; // Groq verbose_json returns text in .text
    }

    // API: Direção de Arte via Groq (LLaMA-3)
    async function generateArtDirection(transcript) {
        const apiKey = (localStorage.getItem('groq_api_key') || '').trim();
        if (!apiKey) throw new Error('Chave Groq não configurada. Acesse Configurações e insira sua chave Groq.');

        const systemPrompt = `You are a Senior Art Director specialized in modern video editing (VSLs, YouTube, TikTok).
Based on the user's audio transcript, suggest powerful editing elements to maximize attention.
ALL keywords_en values MUST be in English — this is critical for TikTok and YouTube searches.
Reply ONLY with raw valid JSON, no markdown, no code blocks, no extra text. Use this exact structure:
{"stock_video":{"keywords_en":["keyword1 no text","keyword2 raw footage","keyword3 aesthetic","keyword4 background"],"description":"Short description of what to show on screen."},"sound_design":{"style":"music/sound style","reason":"why this sound fits"},"animation_idea":{"fx_name":"effect name (e.g. zoom in, glitch, pop-up text)","description":"exactly how to animate it"}}`;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: 'A locução extraída deste trecho é: "' + transcript + '"\nMande o JSON com a direção de arte.' }
                ],
                max_tokens: 1024,
                temperature: 0.5
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Erro na API Groq');

        const rawOutput = data.choices?.[0]?.message?.content || '';
        try {
            // find first { and last } to extract complete JSON block
            const start = rawOutput.indexOf('{');
            const end = rawOutput.lastIndexOf('}');
            if (start === -1 || end === -1) throw new Error('no braces');
            return JSON.parse(rawOutput.substring(start, end + 1));
        } catch (e) {
            throw new Error('Modelo não retornou JSON válido: ' + rawOutput.substring(0, 300));
        }
    }

    // UI: Renderizar Resultados 
    window.renderAIDirectorUI = function(data, transcript) {
        var resultsContainer = document.getElementById('ai-director-results');
        if (!resultsContainer) return;

        let html = `
            <div style="margin-top: 15px; padding: 15px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                <h4 style="margin: 0 0 10px 0; color: #fff; font-size: 14px;"> Locução Detectada</h4>
                <p style="margin: 0; color: #aaa; font-size: 13px; font-style: italic;">"${transcript}"</p>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 15px;">
                <!-- STOCK VIDEO CARD -->
                <div style="padding: 15px; background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(99, 102, 241, 0.05)); border-radius: 8px; border: 1px solid rgba(99, 102, 241, 0.2);">
                    <h4 style="margin: 0 0 5px 0; color: #818cf8; font-size: 14px;"> Sugestão de Vídeo (Stock)</h4>
                    <p style="margin: 0 0 8px 0; color: #fff; font-size: 13px; font-weight: bold;">Buscas: ${(data.stock_video?.keywords_en || []).join(', ')}</p>
                    <p style="margin: 0; color: #cbd5e1; font-size: 12px;">${data.stock_video?.description || ''}</p>
                </div>

                <!-- SOUND DESIGN CARD -->
                <div style="padding: 15px; background: linear-gradient(135deg, rgba(14, 165, 233, 0.1), rgba(14, 165, 233, 0.05)); border-radius: 8px; border: 1px solid rgba(14, 165, 233, 0.2);">
                    <h4 style="margin: 0 0 5px 0; color: #38bdf8; font-size: 14px;"> Trilha & Efeitos</h4>
                    <p style="margin: 0 0 8px 0; color: #fff; font-size: 13px; font-weight: bold;">Estilo: ${data.sound_design?.style || ''}</p>
                    <p style="margin: 0; color: #cbd5e1; font-size: 12px;">${data.sound_design?.reason || ''}</p>
                </div>

                <!-- ANIMATION CARD -->
                <div style="padding: 15px; background: linear-gradient(135deg, rgba(217, 70, 239, 0.1), rgba(217, 70, 239, 0.05)); border-radius: 8px; border: 1px solid rgba(217, 70, 239, 0.2);">
                    <h4 style="margin: 0 0 5px 0; color: #e879f9; font-size: 14px;"> Ideia de Animação/Efeito</h4>
                    <p style="margin: 0 0 8px 0; color: #fff; font-size: 13px; font-weight: bold;">Efeito: ${data.animation_idea?.fx_name || ''}</p>
                    <p style="margin: 0; color: #cbd5e1; font-size: 12px;">${data.animation_idea?.description || ''}</p>
                </div>
            </div>
        `;

        resultsContainer.innerHTML = html;
        resultsContainer.style.display = 'block';

        // FETCH WEB GALLERY (TIKTOK + YOUTUBE) 
        if (data.stock_video && data.stock_video.keywords_en && data.stock_video.keywords_en.length > 0) {
            fetchAndRenderWebGallery(data.stock_video.keywords_en);
        }
    };

    // Helper: Multi-Platform Gallery (TikTok + YouTube) 
    async function fetchAndRenderWebGallery(keywords) {
        if (!Array.isArray(keywords)) keywords = [keywords];
        
        const galleryContainer = document.getElementById('tk-gallery-container');
        const emptyState = document.getElementById('tk-empty-state');
        if (!galleryContainer || !emptyState) return;

        emptyState.style.display = 'none';
        galleryContainer.style.display = 'flex';
        
        if (typeof window.switchAiDirectorTab === 'function') {
            window.switchAiDirectorTab('tiktok');
        }

        const skeletonId = 'web-skeleton-' + Date.now();
        galleryContainer.innerHTML = `
            <div id="${skeletonId}" style="margin-top:0px;">
                <div style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.5); letter-spacing:1px; text-transform:uppercase; margin-bottom:10px; display:flex; align-items:center; gap:8px;">
                    <div style="width:12px; height:12px; border:2px solid rgba(255,255,255,0.2); border-top-color:#818cf8; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                    Carregando referências Web (TikTok + YouTube)...
                </div>
                <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">
                    ${[...Array(6)].map(() => `<div style="aspect-ratio:9/16; background:rgba(255,255,255,0.05); border-radius:8px;"></div>`).join('')}
                </div>
            </div>`;

        try {
            // Dispara buscas em paralelo
            const [tiktokResults, youtubeResults] = await Promise.all([
                fetchTikTokVideos(keywords),
                fetchYouTubeVideos(keywords)
            ]);

            const skeleton = document.getElementById(skeletonId);
            if (skeleton) skeleton.remove();

            // Normalizar e Juntar
            let allItems = [...tiktokResults, ...youtubeResults];

            // Embaralhar (Fisher-Yates)
            for (let i = allItems.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allItems[i], allItems[j]] = [allItems[j], allItems[i]];
            }

            if (allItems.length > 0) {
                let html = `
                    <div style="margin-top:0px;">
                        <div style="font-size:11px; font-weight:700; color:rgba(255,255,255,0.5); letter-spacing:1px; text-transform:uppercase; margin-bottom:10px;">
                             ${allItems.length} Referências encontradas (TikTok & YouTube)
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;">
                `;

                allItems.forEach((item, idx) => {
                    const cardId = `web-card-${idx}-${Date.now()}`;
                    const isYT = item.platform === 'youtube';
                    const platformColor = isYT ? '#FF0000' : '#25F4EE';
                    const platformLabel = isYT ? 'YouTube' : 'TikTok';
                    
                    html += `
                        <div id="${cardId}"
                             data-video-url="${encodeURIComponent(item.videoUrl)}"
                             data-filename="${platformLabel}_${idx}.mp4"
                             data-platform="${item.platform}"
                             style="position:relative; aspect-ratio:9/16; background:#000; border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.08); cursor:pointer; transition:all 0.2s;"
                             onmouseover="this.style.borderColor='${platformColor}'; this.style.transform='scale(1.03)';"
                             onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'; this.style.transform='scale(1)';">
                            
                            <img src="${item.thumbUrl}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'">
                            
                            <!-- Platform Badge -->
                            <span style="position:absolute; top:6px; left:6px; background:${platformColor}; color:${isYT?'#fff':'#000'}; font-size:8px; font-weight:900; padding:2px 5px; border-radius:4px; text-transform:uppercase;">${platformLabel}</span>
                            
                            ${item.duration ? `<span style="position:absolute; bottom:6px; right:6px; background:rgba(0,0,0,0.75); color:#fff; font-size:9px; font-weight:700; padding:2px 5px; border-radius:4px;">${item.duration}</span>` : ''}
                            <span style="position:absolute; bottom:6px; left:6px; background:rgba(0,0,0,0.4); color:#fff; font-size:8px; padding:2px 4px; border-radius:3px; max-width:50%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">@${item.author}</span>
                            
                            <div style="position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%); display:flex; align-items:flex-end; padding:8px; opacity:0; transition:opacity 0.2s;" class="web-import-overlay">
                                <span style="color:${isYT?'#fff':'#000'}; font-size:9px; font-weight:700; background:${platformColor}; padding:3px 8px; border-radius:4px; box-shadow: 0 0 10px ${platformColor}88;">Importar ${platformLabel}</span>
                            </div>
                        </div>
                    `;
                });

                html += `</div>
                    <p style="margin:12px 0 0 0; font-size:9px; color:rgba(255,255,255,0.3); text-align:center;">Busca Multi-Plataforma &middot; Clique para importar no Premiere</p>
                </div>`;

                galleryContainer.innerHTML = html;

                galleryContainer.querySelectorAll('[id^="web-card-"]').forEach(card => {
                    const overlay = card.querySelector('.web-import-overlay');
                    card.addEventListener('mouseenter', () => { if (overlay) overlay.style.opacity = '1'; });
                    card.addEventListener('mouseleave', () => { if (overlay) overlay.style.opacity = '0'; });
                    card.addEventListener('click', () => {
                        const videoUrl = decodeURIComponent(card.dataset.videoUrl || '');
                        const filename = card.dataset.filename || 'video.mp4';
                        const platform = card.dataset.platform || 'tiktok';
                        if (videoUrl) window.downloadAndImportStock(videoUrl, filename, card.id, platform);
                    });
                });

            } else {
                galleryContainer.innerHTML = `<div style="margin-top:14px; padding:10px 14px; background:rgba(255,255,255,0.03); border-radius:8px; font-size:11px; color:rgba(255,255,255,0.4);">Nenhum vídeo encontrado para as palavras-chave sugeridas.</div>`;
            }

        } catch (err) {
            console.error("Web Gallery error:", err);
            galleryContainer.innerHTML = `<div style="margin-top:14px; padding:10px 14px; background:rgba(239,68,68,0.07); border-radius:8px; border:1px solid rgba(239,68,68,0.2); font-size:11px; color:#f87171;">Erro na galeria: ${err.message}</div>`;
        }
    }

    // Helper: Fetch TikTok (Internal) 
    async function fetchTikTokVideos(keywords) {
        const _kParts = ['15ee','6ac0','d4ms','hb10','edf9','9a73','3f2a','p14f','fbbj','sndc','3222','8d23','64'];
        const RAPID_API_KEY = _kParts.join('');
        const RAPID_API_HOST = 'tiktok-scraper7.p.rapidapi.com'; 
        const https = require('https');

        const fetchSingle = (kw) => {
            return new Promise((resolve) => {
                const url = `https://${RAPID_API_HOST}/feed/search?keywords=${encodeURIComponent(kw)}&region=us&count=8&cursor=0&publish_time=0&sort_type=0`;
                const req = https.get(url, {
                    headers: { 'X-RapidAPI-Key': RAPID_API_KEY, 'X-RapidAPI-Host': RAPID_API_HOST }
                }, (res) => {
                    let rawData = '';
                    res.on('data', chunk => rawData += chunk);
                    res.on('end', () => {
                        try { 
                            const parsed = JSON.parse(rawData);
                            const list = parsed.data?.videos || parsed.videos || parsed.itemList || [];
                            resolve(list.map(v => {
                                const videoObj = v.video || v.aweme_info?.video || v;
                                const authorObj = v.author || v.aweme_info?.author || {};
                                
                                let videoUrl = videoObj.playAddr || videoObj.play || videoObj.play_addr?.url_list?.[0] || videoObj.downloadAddr || videoObj.url || '';
                                let thumbUrl = (typeof videoObj.cover === 'string' ? videoObj.cover : videoObj.cover?.url_list?.[0]) || videoObj.origin_cover?.url_list?.[0] || '';
                                
                                let durationSecs = videoObj.duration > 1000 ? (videoObj.duration / 1000) : videoObj.duration;
                                const duration = durationSecs ? Math.floor(durationSecs / 60).toString().padStart(2,'0') + ':' + Math.floor(durationSecs % 60).toString().padStart(2,'0') : '';

                                return {
                                    platform: 'tiktok',
                                    videoUrl: videoUrl,
                                    thumbUrl: thumbUrl,
                                    duration: duration,
                                    author: authorObj.unique_id || authorObj.nickname || 'tiktok',
                                    raw: v
                                };
                            }));
                        } catch(e) { resolve([]); }
                    });
                });
                req.on('error', () => resolve([]));
            });
        };

        const nestedResults = await Promise.all(keywords.map(kw => fetchSingle(kw)));
        return nestedResults.flat();
    }

    // Helper: Fetch YouTube (Internal) 
    async function fetchYouTubeVideos(keywords) {
        const _kParts = ['15ee','6ac0','d4ms','hb10','edf9','9a73','3f2a','p14f','fbbj','sndc','3222','8d23','64'];
        const RAPID_API_KEY = _kParts.join('');
        const RAPID_API_HOST = 'youtube138.p.rapidapi.com'; 
        const https = require('https');

        const fetchSingle = (kw) => {
            return new Promise((resolve) => {
                const url = `https://${RAPID_API_HOST}/search/?q=${encodeURIComponent(kw)}&hl=en&gl=US`;
                const req = https.get(url, {
                    headers: { 'X-RapidAPI-Key': RAPID_API_KEY, 'X-RapidAPI-Host': RAPID_API_HOST }
                }, (res) => {
                    let rawData = '';
                    res.on('data', chunk => rawData += chunk);
                    res.on('end', () => {
                        try { 
                            const parsed = JSON.parse(rawData);
                            const list = parsed.contents || [];
                            const results = [];
                            
                            list.forEach(item => {
                                if (item.video) {
                                    const v = item.video;
                                    // Filter <= 120s (2 mins)
                                    if (v.lengthSeconds && v.lengthSeconds > 120) return;

                                    const duration = v.lengthSeconds ? Math.floor(v.lengthSeconds / 60).toString().padStart(2,'0') + ':' + Math.floor(v.lengthSeconds % 60).toString().padStart(2,'0') : v.accessibility?.title?.match(/\d+ minutes?, \d+ seconds?/)?.[0] || '';

                                    results.push({
                                        platform: 'youtube',
                                        videoUrl: `https://www.youtube.com/watch?v=${v.videoId}`,
                                        thumbUrl: v.thumbnails?.[0]?.url || '',
                                        duration: duration,
                                        author: v.author?.title || 'youtube',
                                        raw: v
                                    });
                                }
                            });
                            resolve(results);
                        } catch(e) { resolve([]); }
                    });
                });
                req.on('error', () => resolve([]));
            });
        };

        const nestedResults = await Promise.all(keywords.map(kw => fetchSingle(kw)));
        return nestedResults.flat();
    }

    // Helper: Download e Importação no Premiere 
    window.downloadAndImportStock = function(url, filename, cardId, platform) {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const https = require('https');
        const cp = require('child_process');
        
        const tempDir = os.tmpdir();
        const destPath = path.join(tempDir, filename);
        
        var logEl = document.getElementById('ai-director-log');
        var cardEl = cardId ? document.getElementById(cardId) : null;

        // Visual feedback no card clicado
        if (cardEl) {
            cardEl.style.pointerEvents = 'none';
            cardEl.innerHTML += `<div style="position:absolute; inset:0; background:rgba(0,0,0,0.75); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;">
                <div style="width:24px; height:24px; border:2px solid rgba(255,255,255,0.2); border-top-color:#818cf8; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                <span style="color:#fff; font-size:9px; font-weight:700;">${platform === 'youtube' ? 'Processando YT...' : 'Baixando...'}</span>
            </div>`;
        }

        if (logEl) {
            logEl.innerText = platform === 'youtube' ? "⏳ Processando download do YouTube (yt-dlp)..." : "⏳ Baixando vídeo de stock...";
            logEl.style.color = "#38bdf8";
        }

        if (platform === 'youtube') {
            // USAR YT-DLP
            const extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
            const ytdlpExe = path.join(extPath, 'tools', 'yt-dlp' + (process.platform === 'win32' ? '.exe' : ''));
            
            // Argumentos para baixar o melhor mp4 disponível até 1080p ou similar
            const args = [
                '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                '--no-playlist',
                '-o', destPath,
                url
            ];

            const process = cp.spawn(ytdlpExe, args);
            process.on('close', (code) => {
                if (code === 0 && fs.existsSync(destPath)) {
                    onSuccess();
                } else {
                    onError('Falha no yt-dlp (código ' + code + ')');
                }
            });
            process.on('error', (err) => onError(err.message));
        } else {
            // DOWNLOAD DIRETO (TikTok)
            doDownload(url, 0);
        }

        function doDownload(targetUrl, attempts) {
            if (attempts > 5) {
                onError('Muitos redirecionamentos.');
                return;
            }
            https.get(targetUrl, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                    doDownload(response.headers.location, attempts + 1);
                    return;
                }
                const file = fs.createWriteStream(destPath);
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    onSuccess();
                });
                file.on('error', (err) => onError(err.message));
            }).on('error', (err) => onError(err.message));
        }

        function onSuccess() {
            if (cardEl) {
                cardEl.style.pointerEvents = 'auto';
                var overlay = cardEl.querySelector('div[style*="position:absolute"]');
                if (overlay) overlay.innerHTML = `<span style="color:#4ade80; font-size:22px;">&#x2713;</span><span style="color:#4ade80;font-size:9px;font-weight:700;">Importado!</span>`;
                setTimeout(() => {
                    if (overlay) overlay.remove();
                }, 2500);
            }
            if (logEl) {
                logEl.innerText = " Vídeo importado no Premiere!";
                logEl.style.color = "#4ade80";
                setTimeout(() => { logEl.innerText = ""; }, 3000);
            }
            const paramPath = JSON.stringify(destPath.replace(/\\/g, '/'));
            csInterface.evalScript(`app.project.importFiles([${paramPath}])`, () => {});
        }

        function onError(msg) {
            if (cardEl) cardEl.style.pointerEvents = 'auto';
            if (logEl) {
                logEl.innerText = " Erro no download: " + msg;
                logEl.style.color = "#f87171";
            }
            console.error("Stock download error:", msg);
        }
    }

})();

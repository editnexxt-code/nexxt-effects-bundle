/**
 * ═══════════════════════════════════════════════════════════════
 * NEXXT EFFECTS — HEYGEN AI STUDIO MODULE (Isolated)
 * ═══════════════════════════════════════════════════════════════
 */
(function (Nexxt) {
    if (!Nexxt) { console.error('[Nexxt.HeyGen] Namespace global não encontrado!'); return; }

    // Namespace do Módulo
    Nexxt.HeyGen = {
        scenes: [],
        activeIndex: 0,
        allVoices: [],
        myVoices: [],
        previewAudio: null,
        applyToAll: false,
        vozTab: 'library',
        langFilter: '',

        // Delivery styles compatíveis com HeyGen V2 API
        DELIVERY_STYLES: [
            { id: 'Friendly' },
            { id: 'Serious' },
            { id: 'Excited' },
            { id: 'Soothing' },
            { id: 'Broadcaster' },
            { id: 'Angry' }
        ],

        // Idiomas/sotaques
        LANG_FILTERS: [
            { id: '', label: 'Todos' },
            { id: 'en', label: '🇺🇸 English' },
            { id: 'pt', label: '🇧🇷 Português' },
            { id: 'es', label: '🇪🇸 Español' },
            { id: 'fr', label: '🇫🇷 Français' },
            { id: 'de', label: '🇩🇪 Deutsch' },
            { id: 'it', label: '🇮🇹 Italiano' },
            { id: 'ja', label: '🇯🇵 Japanese' },
            { id: 'ko', label: '🇰🇷 Korean' },
            { id: 'zh', label: '🇨🇳 Chinese' }
        ],

        init: function () {
            try {
                const screen = Nexxt.Utils.safeEl('heygen-studio-screen');
                if (!screen) this.injectHTML();
                this.bindEvents();
            } catch (e) { console.error('[Nexxt.HeyGen] init:', e); }
        },

        getKey: function () {
            return localStorage.getItem('heygen_api_key') || "";
        },

        abrirEstudio: function () {
            this.scenes = [this.novaCena(1)];
            this.activeIndex = 0;
            this.applyToAll = false;

            // Hide header + gallery, show studio fullscreen
            const header = document.querySelector('#view-heygen > .ai-studio-header');
            const loginScreen = Nexxt.Utils.safeEl('heygen-login-screen');
            const galleryScreen = Nexxt.Utils.safeEl('heygen-gallery-screen');
            const studio = Nexxt.Utils.safeEl('heygen-studio-screen');

            if (header) header.style.display = 'none';
            if (loginScreen) loginScreen.style.display = 'none';
            if (galleryScreen) galleryScreen.style.display = 'none';
            if (studio) { studio.style.display = 'flex'; studio.style.position = 'absolute'; studio.style.inset = '0'; studio.style.background = 'var(--app-bg, #101115)'; }

            this.renderCenas();
            this.carregarVozes();
        },

        voltarGaleria: function () {
            const studio = Nexxt.Utils.safeEl('heygen-studio-screen');
            const header = document.querySelector('#view-heygen > .ai-studio-header');
            const galleryScreen = Nexxt.Utils.safeEl('heygen-gallery-screen');

            if (studio) { studio.style.display = 'none'; studio.style.position = ''; studio.style.inset = ''; }
            if (header) header.style.display = '';
            // Show gallery or login based on key
            const key = localStorage.getItem('heygen_api_key') || '';
            if (galleryScreen) galleryScreen.style.display = key ? 'flex' : 'none';
            const loginScreen = Nexxt.Utils.safeEl('heygen-login-screen');
            if (loginScreen) loginScreen.style.display = key ? 'none' : 'flex';

            this.pararPreviewVoz();
        },

        novaCena: function (id) {
            return { id: id || Date.now(), text: '', voice: null, style: 'Friendly', speed: 1.0, volume: 1.0 };
        },

        renderCenas: function () {
            const list = Nexxt.Utils.safeEl('hgstudio-scene-list');
            if (!list) return;
            list.innerHTML = '';
            this.scenes.forEach((sc, idx) => {
                const div = document.createElement('div');
                div.className = 'hgs-scene-item' + (idx === this.activeIndex ? ' active' : '');
                div.innerHTML = `
                    <div class="hgs-scene-num">Cena ${idx + 1}</div>
                    <div class="hgs-scene-preview">${sc.text ? sc.text.slice(0, 40) + (sc.text.length > 40 ? '...' : '') : 'Sem texto'}</div>
                    ${this.scenes.length > 1 ? `<button class="hgs-scene-del">✕</button>` : ''}
                `;
                div.onclick = (e) => {
                    if (e.target.classList.contains('hgs-scene-del')) {
                        this.removerCena(idx);
                        return;
                    }
                    this.selecionarCena(idx);
                };
                list.appendChild(div);
            });
            this.renderPainelVoz();
            this.renderDeliveryStyle();
        },

        selecionarCena: function (idx) {
            const textarea = Nexxt.Utils.safeEl('hgstudio-text');
            if (textarea && this.scenes[this.activeIndex]) this.scenes[this.activeIndex].text = textarea.value;
            this.activeIndex = idx;
            this.renderCenas();
            const sc = this.scenes[idx];
            if (textarea) textarea.value = sc.text;
        },

        adicionarCena: function () {
            const textarea = Nexxt.Utils.safeEl('hgstudio-text');
            if (textarea && this.scenes[this.activeIndex]) this.scenes[this.activeIndex].text = textarea.value;
            const nova = this.novaCena(Date.now());
            const curVoz = this.scenes[this.activeIndex] ? this.scenes[this.activeIndex].voice : null;
            if (curVoz) nova.voice = curVoz;
            this.scenes.push(nova);
            this.activeIndex = this.scenes.length - 1;
            this.renderCenas();
            if (textarea) textarea.value = '';
        },

        removerCena: function (idx) {
            if (this.scenes.length <= 1) return;
            this.scenes.splice(idx, 1);
            if (this.activeIndex >= this.scenes.length) this.activeIndex = this.scenes.length - 1;
            this.renderCenas();
            const textarea = Nexxt.Utils.safeEl('hgstudio-text');
            if (textarea) textarea.value = this.scenes[this.activeIndex].text;
        },

        renderDeliveryStyle: function () {
            const bar = Nexxt.Utils.safeEl('hgstudio-delivery-bar');
            if (!bar) return;
            const sc = this.scenes[this.activeIndex];
            if (!sc) return;
            bar.innerHTML = '';
            this.DELIVERY_STYLES.forEach(s => {
                const btn = document.createElement('button');
                btn.className = "hgs-style-pill" + (sc.style === s.id ? " active" : "");
                btn.textContent = s.id;
                btn.onclick = () => {
                    sc.style = s.id;
                    this.renderDeliveryStyle();
                };
                bar.appendChild(btn);
            });
        },

        renderPainelVoz: function () {
            const sc = this.scenes[this.activeIndex];
            if (!sc) return;

            const nameEl = Nexxt.Utils.safeEl('hgstudio-voice-name');
            const tagsEl = Nexxt.Utils.safeEl('hgstudio-voice-tags');
            const speedEl = Nexxt.Utils.safeEl('hgstudio-speed');
            const speedLbl = Nexxt.Utils.safeEl('hgstudio-speed-lbl');
            const volEl = Nexxt.Utils.safeEl('hgstudio-vol');
            const volLbl = Nexxt.Utils.safeEl('hgstudio-vol-lbl');
            const applyEl = Nexxt.Utils.safeEl('hgstudio-apply-all');

            if (nameEl) nameEl.textContent = sc.voice ? (sc.voice.display_name || sc.voice.name || 'Voz Selecionada') : 'Nenhuma voz';
            if (tagsEl && sc.voice) {
                tagsEl.textContent = [sc.voice.gender, sc.voice.language?.toUpperCase(), sc.voice.accent].filter(Boolean).join(' · ');
            }
            if (speedEl) { speedEl.value = sc.speed; if (speedLbl) speedLbl.textContent = sc.speed + 'x'; }
            if (volEl) { volEl.value = Math.round(sc.volume * 100); if (volLbl) volLbl.textContent = Math.round(sc.volume * 100) + '%'; }
            if (applyEl) applyEl.checked = this.applyToAll;
        },

        carregarVozes: async function () {
            const key = this.getKey();
            if (!key) return;

            const grid = Nexxt.Utils.safeEl('hgv-grid');
            if (grid) grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;opacity:0.5;">Carregando vozes...</div>';

            try {
                // Step 1: Load personal/cloned voices first
                const myRes = await fetch('https://api.heygen.com/v2/voices?type=personal', {
                    headers: { 'x-api-key': key, 'accept': 'application/json' }
                });
                if (myRes.ok) {
                    const d = await myRes.json();
                    this.myVoices = (d.data?.voices || d.data || []).filter(v => v.voice_id);
                } else {
                    this.myVoices = []; // Endpoint may not exist on all plans
                }

                // Step 2: Load ALL voices, then filter out the personal ones so Library = default HeyGen only
                const personalIds = new Set(this.myVoices.map(v => v.voice_id));
                const allRes = await fetch('https://api.heygen.com/v2/voices', {
                    headers: { 'x-api-key': key, 'accept': 'application/json' }
                });
                if (allRes.ok) {
                    const d = await allRes.json();
                    const allFetched = (d.data?.voices || d.data || []).filter(v => v.voice_id);
                    // Library = all voices minus the personal/cloned ones
                    this.allVoices = allFetched.filter(v => !personalIds.has(v.voice_id));
                }

                if (Nexxt.Utils.safeEl('hgstudio-voice-modal')?.style.display === 'flex') this.renderVozes();
            } catch (e) { console.warn('[Nexxt.HeyGen] carregarVozes:', e); }
        },

        abrirSeletorVoz: function () {
            const modal = Nexxt.Utils.safeEl('hgstudio-voice-modal');
            if (!modal) return;
            this.vozTab = 'library';
            this.langFilter = '';
            modal.style.display = 'flex';
            setTimeout(() => modal.style.opacity = '1', 10);

            // Reset tab button visual state to Library
            document.querySelectorAll('.hgv-tab').forEach(b => {
                const isLib = b.dataset.tab === 'library';
                b.style.color = isLib ? 'var(--text-primary)' : 'var(--text-secondary)';
                b.style.borderBottom = isLib ? '2px solid var(--accent-primary)' : '2px solid transparent';
                b.style.fontWeight = isLib ? '700' : '600';
            });

            if (this.allVoices.length === 0) {
                this.carregarVozes(); // this calls renderVozes when done
            } else {
                this.renderVozes();
            }
        },

        fecharSeletorVoz: function () {
            const modal = Nexxt.Utils.safeEl('hgstudio-voice-modal');
            if (!modal) return;
            modal.style.opacity = '0';
            setTimeout(() => modal.style.display = 'none', 250);
            this.pararPreviewVoz();
        },

        renderVozes: function () {
            const grid = Nexxt.Utils.safeEl('hgv-grid');
            if (!grid) return;

            const list = this.vozTab === 'mine' ? this.myVoices : this.allVoices;
            const q = (Nexxt.Utils.safeEl('hgv-search')?.value || '').toLowerCase();

            let filtered = list.filter(v => {
                const name = (v.display_name || v.name || '').toLowerCase();
                const vlang = (v.language || '').toLowerCase();
                return (!q || name.includes(q)) && (!this.langFilter || vlang.startsWith(this.langFilter));
            });

            grid.innerHTML = filtered.slice(0, 200).map(v => `
                <div class="hgv-card">
                    <div class="hgv-card-top">
                        <div class="hgv-avatar">${(v.display_name || v.name || 'V').charAt(0)}</div>
                        <div style="flex:1; min-width:0;">
                            <div class="hgv-name">${v.display_name || v.name}</div>
                            <div class="hgv-tags">${[v.gender, v.language?.toUpperCase(), v.accent].filter(Boolean).join(' · ')}</div>
                        </div>
                        ${v.preview_audio ? `<button class="hgv-play" onclick="Nexxt.HeyGen.playVoz(event,'${v.preview_audio}')">▶</button>` : ''}
                    </div>
                    <button class="hgv-select-btn" onclick="Nexxt.HeyGen.selecionarVoz('${v.voice_id}')">Usar esta voz</button>
                </div>
            `).join('') || '<div style="grid-column:1/-1; text-align:center; padding:20px; opacity:0.5;">Nenhuma voz encontrada</div>';
        },

        playVoz: function (e, url) {
            if (e) e.stopPropagation();
            this.pararPreviewVoz();
            this.previewAudio = new Audio(url);
            this.previewAudio.play();
        },

        pararPreviewVoz: function () {
            if (this.previewAudio) { this.previewAudio.pause(); this.previewAudio = null; }
        },

        selecionarVoz: function (id) {
            const v = [...this.allVoices, ...this.myVoices].find(x => x.voice_id === id);
            if (!v) return;
            if (this.applyToAll) this.scenes.forEach(s => s.voice = v);
            else if (this.scenes[this.activeIndex]) this.scenes[this.activeIndex].voice = v;
            this.renderCenas();
            this.fecharSeletorVoz();
        },

        gerarVideo: async function () {
            const key = this.getKey();
            if (!key) return Nexxt.Utils.notify('Conecte HeyGen API nas configurações.', 'error');

            // Verifica quota de vídeos antes de gerar
            const usageCheck = await nexxtCheckUsage('video');
            if (!usageCheck.allowed) {
                const msg = usageCheck.reason === 'quota_exceeded'
                    ? `Limite atingido! Você usou todos os ${usageCheck.limit} vídeos do plano ${usageCheck.plan} este mês.`
                    : 'Não foi possível verificar sua quota. Tente novamente.';
                return Nexxt.Utils.notify(msg, 'error');
            }

            for (let i = 0; i < this.scenes.length; i++) {
                if (!this.scenes[i].text.trim() || !this.scenes[i].voice) {
                    return Nexxt.Utils.notify(`Cena ${i + 1} incompleta!`, 'error');
                }
            }

            const btn = Nexxt.Utils.safeEl('btn-hg-gerar');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Gerando...'; }

            // Omitting the 'character' object entirely triggers HeyGen's default
            // white background / audio-only rendering mode per their API design.
            // NOTE: 'emotion' and 'volume' are premium API features that consume credits
            // even on Team plans, so they are omitted to avoid the "Insufficient credit" error.
            const inputs = this.scenes.map(s => ({
                voice: { type: 'text', voice_id: s.voice.voice_id, input_text: s.text.trim(), speed: s.speed },
                background: { type: 'color', value: '#FFFFFF' }
            }));

            try {
                const res = await fetch('https://api.heygen.com/v2/video/generate', {
                    method: 'POST',
                    headers: { 'x-api-key': key, 'accept': 'application/json', 'content-type': 'application/json' },
                    body: JSON.stringify({ video_inputs: inputs, dimension: { width: 1920, height: 1080 } })
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error?.message || json.message || 'Erro HeyGen');

                Nexxt.Utils.notify('Vídeo enviado para processamento!', 'info');
                this.aguardarVideo(json.data.video_id, btn);
            } catch (e) {
                Nexxt.Utils.notify('Erro: ' + e.message, 'error');
                if (btn) { btn.disabled = false; btn.textContent = '▶ Gerar Vídeo'; }
            }
        },

        aguardarVideo: function (id, btn) {
            const status = Nexxt.Utils.safeEl('hgstudio-status');
            if (status) status.style.display = 'flex';
            let t = 0;
            const poll = setInterval(async () => {
                t++;
                if (t > 120) { clearInterval(poll); this.resetBtn(btn, status); return; }
                if (status) status.textContent = `Processando... (${t * 5}s)`;

                const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${id}`, {
                    headers: { 'x-api-key': this.getKey() }
                });
                const d = (await res.json()).data;
                if (d?.status === 'completed') {
                    clearInterval(poll);
                    this.baixarEImportar(d.video_url, id);
                    this.resetBtn(btn, status);
                } else if (d?.status === 'failed' || d?.status === 'error') {
                    clearInterval(poll);
                    const errMsg = d?.error?.message || d?.error?.detail || JSON.stringify(d?.error || 'Render failure');
                    Nexxt.Utils.notify('Render falhou: ' + errMsg, 'error');
                    console.error('[Nexxt.HeyGen] falha no render:', d);
                    this.resetBtn(btn, status);
                }
            }, 5000);
        },

        resetBtn: function (btn, status) {
            if (btn) { btn.disabled = false; btn.textContent = '▶ Gerar Vídeo'; }
            if (status) status.style.display = 'none';
        },

        baixarEImportar: async function (url, id) {
            const fs = require('fs');
            const path = require('path');
            const https = require('https');
            const dest = path.join(localStorage.getItem('nexxt_save_path') || require('os').tmpdir(), `HeyGen_${id}.mp4`);

            const file = fs.createWriteStream(dest);
            https.get(url, r => {
                if (r.headers.location) return this.baixarEImportar(r.headers.location, id);
                r.pipe(file);
                file.on('finish', () => {
                    file.close();
                    Nexxt.Utils.safeEval(`$._nexxt.importarEAdicionarNaTimeline("${dest.replace(/\\/g, '/')}")`);
                    Nexxt.Utils.notify('🎬 Importado com sucesso!', 'success');
                });
            });
        },

        bindEvents: function () {
            const btnOpen = Nexxt.Utils.safeEl('btn-heygen-studio'); // No menu principal
            if (btnOpen) btnOpen.onclick = () => this.abrirEstudio();

            const txt = Nexxt.Utils.safeEl('hgstudio-text');
            if (txt) txt.oninput = () => { if (this.scenes[this.activeIndex]) this.scenes[this.activeIndex].text = txt.value; };

            const apply = Nexxt.Utils.safeEl('hgstudio-apply-all');
            if (apply) apply.onchange = () => { this.applyToAll = apply.checked; if (this.applyToAll) this.selecionarVoz(this.scenes[this.activeIndex]?.voice?.voice_id); };

            const speed = Nexxt.Utils.safeEl('hgstudio-speed');
            const speedLbl = Nexxt.Utils.safeEl('hgstudio-speed-lbl');
            if (speed) speed.oninput = () => {
                if (this.scenes[this.activeIndex]) this.scenes[this.activeIndex].speed = parseFloat(speed.value);
                if (speedLbl) speedLbl.textContent = speed.value + 'x';
            };

            const vol = Nexxt.Utils.safeEl('hgstudio-vol');
            const volLbl = Nexxt.Utils.safeEl('hgstudio-vol-lbl');
            if (vol) vol.oninput = () => {
                if (this.scenes[this.activeIndex]) this.scenes[this.activeIndex].volume = parseFloat(vol.value) / 100;
                if (volLbl) volLbl.textContent = vol.value + '%';
            };

            // Live voice search: filter as user types
            const voiceSearch = Nexxt.Utils.safeEl('hgv-search');
            if (voiceSearch) voiceSearch.oninput = () => this.renderVozes();
        },

        injectHTML: function () {
            // Reaproveita lógica de injeção se necessário, mas idealmente estaria no main.js ou index.html
            console.warn('[Nexxt.HeyGen] HTML do Studio deve estar no index.html');
        }
    };

    // Auto-init
    Nexxt.HeyGen.init();

    // Exporta para escopo global legado se necessário para botões HTML inline
    window.abrirEstudio = () => Nexxt.HeyGen.abrirEstudio();
    window.voltarGaleria = () => Nexxt.HeyGen.voltarGaleria();
    window.hgAdicionarCena = () => Nexxt.HeyGen.adicionarCena();
    window.hgGerarVideo = () => Nexxt.HeyGen.gerarVideo();
    window.hgAbrirSeletorVoz = () => Nexxt.HeyGen.abrirSeletorVoz();
    window.hgFecharSeletorVoz = () => Nexxt.HeyGen.fecharSeletorVoz();
    window.hgSetVozTab = (tab, btn) => {
        Nexxt.HeyGen.vozTab = tab;
        // Update visual state of tab buttons — must use inline styles since button styles are inline
        document.querySelectorAll('.hgv-tab').forEach(b => {
            const isActive = b.dataset.tab === tab;
            b.style.color = isActive ? 'var(--text-primary)' : 'var(--text-secondary)';
            b.style.borderBottom = isActive ? '2px solid var(--accent-primary)' : '2px solid transparent';
            b.style.fontWeight = isActive ? '700' : '600';
        });
        // Load voices if this is the first time opening
        if (tab === 'mine' && Nexxt.HeyGen.myVoices.length === 0) {
            Nexxt.HeyGen.carregarVozes();
        } else {
            Nexxt.HeyGen.renderVozes();
        }
    };

})(window.Nexxt);

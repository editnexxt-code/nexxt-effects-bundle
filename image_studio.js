/**
 * IMAGE STUDIO - NEXXT EFFECTS
 * Integration with Google Nano Banana Pro via Replicate API
 */
(function () {
    // Replicate Model Details - uses model name endpoint (no version pinning)
    const API_URL = "https://api.replicate.com/v1/models/google/nano-banana-pro/predictions";

    // State
    let selectedImages = []; // Array of { id, dataUri, name }

    // DOM Elements
    const elements = {
        prompt: document.getElementById('is-prompt'),
        aspectRatio: document.getElementById('is-aspect-ratio'),
        resolution: document.getElementById('is-resolution'),
        outputFormat: document.getElementById('is-output-format'),
        safetyFilter: document.getElementById('is-safety-filter'),
        imageGrid: document.getElementById('is-image-grid'),
        imgInput: document.getElementById('is-img-input-hidden'),
        btnGenerate: document.getElementById('btn-is-generate'),
        status: document.getElementById('is-status'),
        historyList: document.getElementById('is-history-list')
    };

    /**
     * Initialization
     */
    function init() {
        if (!elements.btnGenerate) return;

        elements.btnGenerate.onclick = startGeneration;
        elements.imgInput.onchange = handleImageSelect;

        // Add button in the UI
        const btnAdd = document.getElementById('btn-is-add-img');
        if (btnAdd) btnAdd.onclick = () => elements.imgInput.click();

        console.log('[Image Studio] Initialized');
    }

    /**
     * UI Helpers
     */
    function setStatus(msg, type = 'info') {
        if (!elements.status) return;
        elements.status.innerText = msg;
        elements.status.style.color = type === 'error' ? '#ef4444' : 'var(--text-secondary)';
    }

    function toggleLoading(isLoading) {
        if (!elements.btnGenerate) return;
        elements.btnGenerate.disabled = isLoading;
        elements.btnGenerate.classList.toggle('loading', isLoading);
    }

    /**
     * Image Handling
     */
    async function handleImageSelect(e) {
        const files = Array.from(e.target.files);
        if (selectedImages.length + files.length > 14) {
            notify('Max 14 images allowed', 'error');
            return;
        }

        for (const file of files) {
            try {
                const dataUri = await fileToBase64(file);
                const id = Date.now() + Math.random().toString(36).substr(2, 5);
                selectedImages.push({ id, dataUri, name: file.name });
            } catch (err) {
                console.error('Error processing image:', err);
            }
        }

        renderImageGrid();
        elements.imgInput.value = ''; // Reset input
    }

    function removeImage(id) {
        selectedImages = selectedImages.filter(img => img.id !== id);
        renderImageGrid();
    }

    function renderImageGrid() {
        if (!elements.imageGrid) return;

        // Keep the "Add" placeholder
        const placeholder = `<div style="flex-shrink:0; width:50px; height:50px; border:1px dashed rgba(255,255,255,0.2); border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer;" onclick="document.getElementById('is-img-input-hidden').click()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </div>`;

        let html = placeholder;
        selectedImages.forEach(img => {
            html += `
                <div style="position:relative; flex-shrink:0; width:50px; height:50px; border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.1);">
                    <img src="${img.dataUri}" style="width:100%; height:100%; object-fit:cover;">
                    <div onclick="window.removeISImage('${img.id}')" style="position:absolute; top:2px; right:2px; background:rgba(0,0,0,0.6); color:#fff; width:14px; height:14px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; cursor:pointer;">×</div>
                </div>
            `;
        });

        elements.imageGrid.innerHTML = html;
    }
    window.removeISImage = removeImage; // Global exposure for onclick

    /**
     * Generation Logic
     */
    async function startGeneration() {
        const prompt = elements.prompt.value.trim();
        if (!prompt) {
            notify('Please enter a prompt', 'error');
            return;
        }

        // Verifica quota de imagens antes de gerar
        const usageCheck = await nexxtCheckUsage('image');
        if (!usageCheck.allowed) {
            const msg = usageCheck.reason === 'quota_exceeded'
                ? `Limite atingido! Você usou todas as ${usageCheck.limit} imagens do plano ${usageCheck.plan} este mês.`
                : 'Não foi possível verificar sua quota. Tente novamente.';
            notify(msg, 'error');
            return;
        }

        const key = "REPLICATE_API_KEY_HERE";

        toggleLoading(true);
        setStatus('Starting generation...');

        try {
            const input = {
                prompt: prompt,
                aspect_ratio: elements.aspectRatio.value,
                resolution: elements.resolution.value,
                output_format: elements.outputFormat.value,
                safety_filter_level: elements.safetyFilter.value,
                image_input: selectedImages.map(img => img.dataUri)
            };

            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${key}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'wait'
                },
                body: JSON.stringify({
                    input: input
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            // With Prefer:wait the prediction may already be succeeded
            if (data.status === 'succeeded') {
                setStatus('Success! Saving image...');
                handleResult(data.output);
                return;
            }

            setStatus('Processing on Replicate...');
            // Always use the standard predictions endpoint for polling
            const predId = data.id;
            pollPrediction(predId, key);

        } catch (err) {
            console.error('[Image Studio] API Error:', err);
            setStatus('Error: ' + err.message, 'error');
            toggleLoading(false);
            notify('Generation failed', 'error');
        }
    }

    async function pollPrediction(id, key) {
        // ALWAYS use the standard predictions polling endpoint
        const POLL_URL = 'https://api.replicate.com/v1/predictions/' + id;
        let maxPolls = 60;
        const doPoll = async () => {
            try {
                const response = await fetch(POLL_URL, {
                    headers: { 'Authorization': `Token ${key}` }
                });
                const data = await response.json();

                if (data.status === 'succeeded') {
                    setStatus('Success! Saving image...');
                    handleResult(data.output);
                } else if (data.status === 'failed' || data.status === 'canceled') {
                    throw new Error('Prediction ' + data.status + (data.error ? ': ' + data.error : ''));
                } else if (--maxPolls > 0) {
                    setTimeout(doPoll, 2500);
                } else {
                    throw new Error('Timeout: a geração demorou mais de 2.5min.');
                }
            } catch (err) {
                setStatus('Polling Error: ' + err.message, 'error');
                toggleLoading(false);
            }
        };
        doPoll();
    }

    async function handleResult(output) {
        // Output for nano-banana-pro is usually a string URL or array
        const imageUrl = Array.isArray(output) ? output[0] : output;
        if (!imageUrl) {
            setStatus('No output image found', 'error');
            toggleLoading(false);
            return;
        }

        try {
            const outputFormat = (elements.outputFormat && elements.outputFormat.value) || 'jpg';
            const fileName = `nexxt_img_${Date.now()}.${outputFormat}`;

            // Robust save path with fallback to OS downloads
            let savePath = localStorage.getItem('nexxt_save_path');
            if (!savePath || savePath.trim() === '') {
                const os = require('os');
                savePath = require('path').join(os.homedir(), 'Downloads');
            }

            const fs = require('fs');
            const path = require('path');

            if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });

            const fullPath = path.join(savePath, fileName);

            setStatus('Downloading image from Replicate...');
            const imgRes = await fetch(imageUrl);
            if (!imgRes.ok) throw new Error(`Download failed: HTTP ${imgRes.status}`);

            const buffer = Buffer.from(await imgRes.arrayBuffer());
            fs.writeFileSync(fullPath, buffer);

            // Show preview inside history panel
            addToHistory(imageUrl, fullPath);

            // Import to Premiere
            setStatus('Importing to Premiere Pro...');
            importToPremiere(fullPath);

            toggleLoading(false);
            setStatus(`Saved: ${fileName}`, 'info');
            notify('Image saved to ' + savePath + ' and imported!', 'success');

        } catch (err) {
            console.error('[Image Studio] Download Error:', err);
            setStatus('Error saving: ' + err.message, 'error');
            toggleLoading(false);
            notify('Image generated but save failed: ' + err.message, 'error');
        }
    }

    function importToPremiere(filePath) {
        const script = `$._nexxt.importarEAdicionarNaTimeline(${JSON.stringify(filePath.replace(/\\/g, '/'))})`;
        if (window.csInterface) {
            window.csInterface.evalScript(script);
        }
    }

    function addToHistory(url, localPath) {
        if (!elements.historyList) return;

        // Remove placeholder text on first item
        const placeholder = elements.historyList.querySelector('div');
        if (placeholder && (placeholder.innerText.includes('Nenhuma') || placeholder.innerText.includes('Empty'))) {
            elements.historyList.innerHTML = '';
        }

        const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const item = document.createElement('div');
        item.style.cssText = [
            'flex-shrink:0',
            'width:80px',
            'cursor:pointer',
            'border-radius:10px',
            'overflow:hidden',
            'background:rgba(255,255,255,0.04)',
            'border:1px solid rgba(255,255,255,0.08)',
            'transition:0.2s',
            'position:relative'
        ].join(';');

        item.innerHTML = `
            <img src="${url}" style="width:80px; height:64px; object-fit:cover; display:block; transition:0.3s;" onerror="this.style.background='rgba(255,255,255,0.05)'">
            <div style="padding:3px 4px; font-size:8px; color:rgba(255,255,255,0.5); text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${time}</div>
            <div style="position:absolute;inset:0;background:rgba(99,102,241,0);transition:0.2s;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:700;opacity:0;" class="is-hist-hover">↓ Importar</div>
        `;

        item.addEventListener('mouseenter', () => {
            item.style.borderColor = 'rgba(99,102,241,0.5)';
            item.style.transform = 'scale(1.04)';
            const hover = item.querySelector('.is-hist-hover');
            if (hover) { hover.style.background = 'rgba(0,0,0,0.6)'; hover.style.opacity = '1'; }
        });
        item.addEventListener('mouseleave', () => {
            item.style.borderColor = 'rgba(255,255,255,0.08)';
            item.style.transform = '';
            const hover = item.querySelector('.is-hist-hover');
            if (hover) { hover.style.background = 'rgba(99,102,241,0)'; hover.style.opacity = '0'; }
        });
        item.onclick = () => importToPremiere(localPath);

        // Newest first (prepend)
        elements.historyList.prepend(item);
    }

    /**
     * Data Helpers
     */
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    // Run init
    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);

})();

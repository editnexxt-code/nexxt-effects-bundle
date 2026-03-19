// ================================================================================
// ´©Å PREMIERE.JSX  CONTëM SEçòES BLINDADAS  ´©Å
// Versúo estível homologada em: 2026-02-25 14:55
//
// FUNçòES CRìTICAS PROTEGIDAS (NâO EDITAR):
// Ô£à gerarLegendasMogrt()   Æ Linhas ~380540
// - Decodifica base64 dos chunks de legenda
// - Detecta track vazia para inserºúo de MOGRTs
// - Insere via seq.importMGT(path, ticks, trackIdx, 0)
// - Injeta texto no componente AL.ADBE.Capsule Æ prop "Text" (type=6)
//
// Ô£à prepararAudioIA()      Æ Itera TODOS os clipes selecionados (video+audio)
// - Retorna "SUCESSO||path|inPoint|duration|clipStart||..." para cada clipe
//
// Ô£à diagnosticarMogrt()    Æ Funºúo de diagnstico de componentes MOGRT
//
// BACKUP: C:\Users\Willi\Downloads\NEXXT_CAPTIONS_BACKUP_2026-02-25\
// ================================================================================

if (typeof ($) === 'undefined') {
    $ = {};
}

$._nexxt = {
    keepPanelLoaded: function () {
        app.setExtensionPersistent("com.nexxt.effects", 0);
    },

    getProjectPath: function () {
        if (!app.project) return "";
        return app.project.path;
    },

    importarEApplyMogrt: function (mogrtPath, tempoEmSegundos, trackLegenda) {
        if (!app.project) return "Erro: Nenhum projeto aberto.";

        var seq = app.project.activeSequence;
        if (!seq) return "Erro: Nenhuma sequ¬ncia ativa.";

        var timeInTicks = tempoEmSegundos * 254016000000;
        var pTime = new Time();
        pTime.ticks = String(Math.floor(timeInTicks));

        try {
            // Algoritmo: Procurar a primeira trilha de v¡deo vazia (acima da V1)
            var targetTrackIndex = 1; // Default
            var numTracks = seq.videoTracks.numTracks;
            var novoMogrt = null;

            for (var i = 1; i < numTracks; i++) {
                var track = seq.videoTracks[i];
                var conflito = false;

                for (var j = 0; j < track.clips.numItems; j++) {
                    var clip = track.clips[j];
                    if (clip.start.seconds < (tempoEmSegundos + 5) && clip.end.seconds > tempoEmSegundos) {
                        conflito = true;
                        break;
                    }
                }

                if (!conflito) {
                    targetTrackIndex = i;
                    novoMogrt = track.insertClip(new File(mogrtPath), pTime);
                    break;
                }
            }

            // Failsafe se todas as trilhas estiverem cheias
            if (!novoMogrt) {
                novoMogrt = seq.videoTracks[numTracks - 1].insertClip(new File(mogrtPath), pTime);
            }

            return "Sucesso";
        } catch (e) {
            return "Erro ao importar: " + e.toString();
        }
    },

    // Nova Funºúo: Corte cirrgico (Word-Level Sync)
    importarEApplyMogrtComCorte: function (mogrtPath, timeIn, timeOut) {
        if (!app.project) return "Erro: Nenhum projeto aberto.";

        var seq = app.project.activeSequence;
        if (!seq) return "Erro: Nenhuma sequ¬ncia ativa.";

        var timeInTicks = timeIn * 254016000000;
        var timeOutTicks = timeOut * 254016000000;

        var pTimeIn = new Time();
        pTimeIn.ticks = String(Math.floor(timeInTicks));

        var pTimeOut = new Time();
        pTimeOut.ticks = String(Math.floor(timeOutTicks));

        try {
            var targetTrackIndex = 1;
            var numTracks = seq.videoTracks.numTracks;
            var novoMogrt = null;
            var targetTrack = seq.videoTracks[1]; // Fallback

            for (var i = 1; i < numTracks; i++) {
                var track = seq.videoTracks[i];
                var conflito = false;

                for (var j = 0; j < track.clips.numItems; j++) {
                    var clip = track.clips[j];
                    if (clip.start.seconds < timeOut && clip.end.seconds > timeIn) {
                        conflito = true;
                        break;
                    }
                }

                if (!conflito) {
                    targetTrackIndex = i;
                    targetTrack = track;
                    novoMogrt = track.insertClip(new File(mogrtPath), pTimeIn);
                    break;
                }
            }

            if (!novoMogrt) {
                targetTrack = seq.videoTracks[numTracks - 1];
                novoMogrt = targetTrack.insertClip(new File(mogrtPath), pTimeIn);
            }

            // Corta a cauda do MOGRT para sincronizar com a prxima palavra exatamente
            if (novoMogrt) {
                novoMogrt.end = pTimeOut;
            }

            return "Sucesso";
        } catch (e) {
            return "Erro ao importar: " + e.toString();
        }
    },

    importarDownloadParaProjeto: function (caminhoArquivo) {
        if (!app.project) return "Erro: Nenhum projeto aberto.";

        var proj = app.project;
        var rootBin = proj.rootItem;
        var dlBin = null;

        for (var i = 0; i < rootBin.children.numItems; i++) {
            if (rootBin.children[i].name === "Nexxt Downloads" && rootBin.children[i].type === ProjectItemType.BIN) {
                dlBin = rootBin.children[i];
                break;
            }
        }

        if (!dlBin) {
            dlBin = rootBin.createBin("Nexxt Downloads");
        }

        try {
            proj.importFiles([caminhoArquivo], true, dlBin, false);

            // Find the imported item in the bin
            var mediaItem = null;
            for (var j = 0; j < dlBin.children.numItems; j++) {
                var child = dlBin.children[j];
                try {
                    if (child.getMediaPath && child.getMediaPath() === caminhoArquivo) {
                        mediaItem = child;
                        break;
                    }
                } catch (e2) { }
            }

            // If we found the item and there is an active sequence, insert into empty video track
            var seq = app.project.activeSequence;
            if (!mediaItem || !seq) {
                return "Sucesso: M¡dia importada para a Bin (sem sequ¬ncia ativa para inserir na timeline).";
            }

            // Verifica track vazia com base no Playhead (Current Time Indicator)
            var insertTime = seq.getPlayerPosition();
            var emptyTrackIdx = -1;

            for (var t = 0; t < seq.videoTracks.numTracks; t++) {
                var vTrack = seq.videoTracks[t];
                var ocupadoNaAgulha = false;

                for (var c = 0; c < vTrack.clips.numItems; c++) {
                    var clip = vTrack.clips[c];
                    if (clip.start.seconds <= insertTime.seconds && clip.end.seconds >= insertTime.seconds) {
                        ocupadoNaAgulha = true;
                        break;
                    }
                }

                if (!ocupadoNaAgulha) {
                    emptyTrackIdx = t;
                    break;
                }
            }

            // If no empty video track found at playhead, add a new one
            if (emptyTrackIdx === -1) {
                try {
                    seq.videoTracks.addTrack();
                } catch (e) { } // Ignora se a versao do Premiere nao suportar addTrack via API API JS
                emptyTrackIdx = seq.videoTracks.numTracks - 1; // Pega a ultima (mais alta/nova)
            }

            // Insert at the playhead time on the empty track
            seq.videoTracks[emptyTrackIdx].insertClip(mediaItem, insertTime);

            return "Sucesso: M¡dia importada e inserida na Track V" + (emptyTrackIdx + 1) + " da timeline.";
        } catch (e) {
            return "Erro ao importar: " + e.toString();
        }
    },

    importarAudioGeradoParaTimeline: function (caminhoAudio) {
        if (!app.project) return "Erro: Nenhum projeto aberto.";

        var seq = app.project.activeSequence;
        if (!seq) return "Erro: Nenhuma sequ¬ncia ativa.";

        var proj = app.project;
        var rootBin = proj.rootItem;
        var iaBin = null;

        for (var i = 0; i < rootBin.children.numItems; i++) {
            if (rootBin.children[i].name === "Nexxt Studio IA" && rootBin.children[i].type === ProjectItemType.BIN) {
                iaBin = rootBin.children[i];
                break;
            }
        }

        if (!iaBin) {
            iaBin = rootBin.createBin("Nexxt Studio IA");
        }

        var audioItem = null;
        try {
            proj.importFiles([caminhoAudio], true, iaBin, false);

            // Encontra o item rec®m importado na Bin
            for (var j = 0; j < iaBin.children.numItems; j++) {
                var child = iaBin.children[j];
                if (child.getMediaPath() === caminhoAudio) {
                    audioItem = child;
                    break;
                }
            }

            if (audioItem) {
                // Insere logo na Playhead
                var playheadTime = seq.getPlayerPosition();

                // Procura trilha de íudio vazia
                var audioTrackIdx = 0;
                for (var a = 0; a < seq.audioTracks.numTracks; a++) {
                    var aTrack = seq.audioTracks[a];
                    var conflito = false;
                    for (var c = 0; c < aTrack.clips.numItems; c++) {
                        var clip = aTrack.clips[c];
                        // Estimativa crua, o ideal seria ler duration, mas playerPosition jí ajuda
                        if (clip.start.seconds <= playheadTime.seconds && clip.end.seconds >= playheadTime.seconds) {
                            conflito = true; break;
                        }
                    }
                    if (!conflito) {
                        audioTrackIdx = a; break;
                    }
                }

                seq.audioTracks[audioTrackIdx].overwriteClip(audioItem, playheadTime);
            }

            return "Sucesso";
        } catch (e) {
            return "Erro ao importar íudio IA: " + e.toString();
        }
    },

    aplicarEfeito: function (nomeEfeito, categoria) {
        try {
            app.enableQE();
            var qeSeq = qe.project.getActiveSequence();
            if (!qeSeq) return "Erro QE: Nenhuma sequ¬ncia ativa.";

            var seq = app.project.activeSequence;
            var numVideoTracks = qeSeq.numVideoTracks;
            var numAudioTracks = qeSeq.numAudioTracks;
            var aplicado = false;

            if (categoria === "video") {
                var qeEffect = qe.project.getVideoEffectByName(nomeEfeito);
                if (!qeEffect) return "Efeito núo encontrado. O Premiere estí em outro idioma? (" + nomeEfeito + ")";

                for (var i = 0; i < numVideoTracks; i++) {
                    var qeTrack = qeSeq.getVideoTrackAt(i);
                    var stdTrack = seq.videoTracks[i];
                    var qeIndex = 0;
                    for (var c = 0; c < stdTrack.clips.numItems; c++) {
                        var stdClip = stdTrack.clips[c];
                        // Avanºa o qeIndex pelo QE DOM (ignorando gaps e "ru¡dos") at® encontrar o par
                        while (qeIndex < qeTrack.numItems) {
                            var qeItem = qeTrack.getItemAt(qeIndex);
                            qeIndex++; // Jí avanºamos pra núo repetir o mesmo clipe

                            if (qeItem && qeItem.name === stdClip.name) {
                                if (stdClip.isSelected()) {
                                    qeItem.addVideoEffect(qeEffect);
                                    aplicado = true;
                                }
                                break; // Encontrou e processou o par, desiste do while e vai pro prximo clipe standard
                            }
                        }
                    }
                }
            } else {
                var qeEffectAudio = qe.project.getAudioEffectByName(nomeEfeito);
                if (!qeEffectAudio) return "Efeito núo encontrado. O Premiere estí em outro idioma? (" + nomeEfeito + ")";

                for (var a = 0; a < numAudioTracks; a++) {
                    var qeTrackA = qeSeq.getAudioTrackAt(a);
                    var stdTrackA = seq.audioTracks[a];
                    var qeIndexA = 0;
                    for (var c = 0; c < stdTrackA.clips.numItems; c++) {
                        var stdClipA = stdTrackA.clips[c];
                        while (qeIndexA < qeTrackA.numItems) {
                            var qeItemA = qeTrackA.getItemAt(qeIndexA);
                            qeIndexA++;

                            if (qeItemA && qeItemA.name === stdClipA.name) {
                                if (stdClipA.isSelected()) {
                                    qeItemA.addAudioEffect(qeEffectAudio);
                                    aplicado = true;
                                }
                                break;
                            }
                        }
                    }
                }
            }
            return aplicado ? "Sucesso" : "Nenhum clipe selecionado.";
        } catch (e) {
            return "Erro ao aplicar efeito: " + e.toString();
        }
    },

    // VARIABILIZADOR DE COR 

    // Helper: busca efeito QE tentando mltiplos nomes (para mltiplos idiomas do Premiere)
    _getEffectMultiLang: function (names) {
        for (var i = 0; i < names.length; i++) {
            try {
                var e = qe.project.getVideoEffectByName(names[i]);
                if (e) return e;
            } catch (ex) { }
        }
        return null;
    },

    // Helper: define valor de propriedade por displayName (recursivo, funciona em qualquer idioma do Premiere)
    // Aceita array de nomes alternativos para suportar mltiplos idiomas
    _setPropByDisplayName: function (props, names, value) {
        if (typeof names === 'string') names = [names];
        for (var p = 0; p < props.numItems; p++) {
            try {
                var dName = props[p].displayName;
                for (var n = 0; n < names.length; n++) {
                    if (dName === names[n]) {
                        props[p].setValue(value, true);
                        return true;
                    }
                }
                var sub = null;
                try { sub = props[p].properties; } catch (e) { }
                if (sub && sub.numItems > 0) {
                    if ($._nexxt._setPropByDisplayName(sub, names, value)) return true;
                }
            } catch (e) { }
        }
        return false;
    },

    // Helper: define valor de propriedade por matchName (idioma-independente)
    _setPropByMatchName: function (props, matchName, value) {
        for (var p = 0; p < props.numItems; p++) {
            try {
                if (props[p].matchName === matchName) {
                    props[p].setValue(value, true);
                    return true;
                }
                var sub = null;
                try { sub = props[p].properties; } catch (e) { }
                if (sub && sub.numItems > 0) {
                    if ($._nexxt._setPropByMatchName(sub, matchName, value)) return true;
                }
            } catch (e) { }
        }
        return false;
    },

    // Aplica Lumetri Color com micro-ajustes nos clips selecionados
    variabilizarCores: function (paramsJSON) {
        try {
            app.enableQE();
            var params = JSON.parse(paramsJSON);
            var seq = app.project.activeSequence;
            if (!seq) return "ERRO|Sem sequencia ativa";

            // Nomes do efeito Lumetri Color em todos os idiomas suportados pela Adobe
            var lumetriNames = [
                "Lumetri Color",          // EN
                "Lumetri-Farbe",          // DE
                "Color Lumetri",          // ES
                "Lumetri Colour",         // EN-GB / FR antigas
                "Cor de Lumetri",         // PT-BR newer
                "Cor Lumetri",            // PT-BR older
                "Colore Lumetri",         // IT
                "Lumetriカラー",           // JA
                "Lumetri 색상",            // KO
                "Lumetri 颜色",            // ZH-CN
                "Lumetri 顏色",            // ZH-TW
                "Цвет Lumetri",           // RU
                "Lumetri-kleur",          // NL
                "Lumetri-färg",           // SV
                "Kolor Lumetri",          // PL
                "Lumetri Renk"            // TR
            ];
            var lumetriMatchName = "AE.ADBE Lumetri";
            // displayName-based property map todos os idiomas Adobe suportados
            var propMap = {
                brightness: ["Exposure", "Exposição", "Belichtung", "Exposición", "Esposizione", "Exposition", "露出", "노출", "曝光", "曝光度", "Экспозиция", "Belichting", "Exponering", "Ekspozycja", "Pozlama"],
                contrast: ["Contrast", "Contraste", "Kontrast", "Contrasto", "コントラスト", "대비", "对比度", "Контраст"],
                highlights: ["Highlights", "Realces", "Lichter", "Iluminaciones", "Alte luci", "Tons clairs", "ハイライト", "밝은 영역", "高光", "Света", "Hoge lichten", "Ljusa delar", "Jasne obszary", "Parlak Işıklar"],
                shadows: ["Shadows", "Sombras", "Schatten", "Ombre", "Ombres", "シャドウ", "シャドー", "어두운 영역", "阴影", "Тени", "Schaduwen", "Skuggor", "Cienie", "Gölgeler"],
                saturation: ["Saturation", "Saturação", "Sättigung", "Saturación", "Saturazione", "彩度", "채도", "饱和度", "Насыщенность", "Verzadiging", "Mättnad", "Nasycenie", "Doygunluk"],
                sharpness: ["Sharpen", "Nitidez", "Schärfen", "Sharpening", "Enfocar", "Nitidezza", "Netteté", "シャープ", "선명도", "锐化", "Резкость", "Verscherpen", "Skärpa", "Wyostrzenie", "Keskinleştir"],
                vignette: ["Vignette Amount", "Quantidade de vinheta", "Vignettierungsstärke", "Amount", "Vignette", "Cantidad de viñeta", "Quantità vignettatura", "Quantité de vignette", "ビネット量", "비네팅 양", "晕影数量", "Количество виньетки", "Vignetbedrag", "Vignettmängd", "Ilość winiety", "Vignette Miktarı"]
            };

            // Passo 1: Validação de seleção via API padrão
            var totalClips = 0;
            var numSelected = 0;
            for (var i = 0; i < seq.videoTracks.numTracks; i++) {
                var track = seq.videoTracks[i];
                for (var c = 0; c < track.clips.numItems; c++) {
                    totalClips++;
                    try { if (track.clips[c].isSelected()) numSelected++; } catch (e) { }
                }
            }

            if (totalClips === 0) return "ERRO|Nenhum clip de video na timeline";
            if (numSelected === 0) return "ERRO|0 de " + totalClips + " clips selecionados. Clique nos clips no timeline antes de Aplicar.";

            // Passo 2: inicializa QE com retry
            var qeSeq = null;
            for (var _r = 0; _r < 3 && !qeSeq; _r++) {
                try { qeSeq = qe.project.getActiveSequence(); } catch (e) { }
                if (!qeSeq && _r < 2) $.sleep(400);
            }
            var aplicado = 0;

            var lumetriEfx = null;
            var noiseEfx = null;
            if (qeSeq) {
                lumetriEfx = $._nexxt._getEffectMultiLang(lumetriNames);
                if (params.grain !== undefined && params.grain > 0) {
                    var noiseNames = ["Noise", "Ruído", "Rauschen", "Ruido", "Bruit", "Disturbo", "ノイズ", "노이즈", "杂色", "雜色", "Шум", "Ruis", "Brus", "Szum", "Gürültü"];
                    noiseEfx = $._nexxt._getEffectMultiLang(noiseNames);
                }
            }

            // Loop paralelo otimizado
            for (var i = 0; i < seq.videoTracks.numTracks; i++) {
                var stdTrack = seq.videoTracks[i];
                var qeTrack = qeSeq ? qeSeq.getVideoTrackAt(i) : null;
                var qeIndex = 0;

                for (var c = 0; c < stdTrack.clips.numItems; c++) {
                    var stdClip = stdTrack.clips[c];
                    
                    var matchedQeItem = null;
                    if (qeTrack) {
                        while (qeIndex < qeTrack.numItems) {
                            var qeItem = qeTrack.getItemAt(qeIndex);
                            qeIndex++;
                            if (qeItem && qeItem.name === stdClip.name) {
                                matchedQeItem = qeItem;
                                break;
                            }
                        }
                    }

                    if (!stdClip.isSelected()) continue;

                    // Verifica se Lumetri já existe
                    var comps = stdClip.components;
                    var hasLumetri = false;
                    for (var ci = 0; ci < comps.numItems; ci++) {
                        try {
                            var cmn = comps[ci].matchName;
                            if (cmn === lumetriMatchName || cmn === "AE.ADBE Lumetri Color") { hasLumetri = true; break; }
                        } catch (e) { }
                    }

                    // Adiciona via QE se necessário
                    if (!hasLumetri && matchedQeItem && lumetriEfx) {
                        try {
                            matchedQeItem.addVideoEffect(lumetriEfx);
                            $.sleep(400); // Aguarda o Premiere registrar
                            comps = stdClip.components; 
                        } catch (e) { }
                    }

                    // Define propriedades Lumetri
                    var lumetriAplicado = false;
                    for (var ci2 = 0; ci2 < comps.numItems; ci2++) {
                        try {
                            var cmn2 = comps[ci2].matchName;
                            if (cmn2 === lumetriMatchName || cmn2 === "AE.ADBE Lumetri Color") {
                                var props = comps[ci2].properties;
                                if (params.brightness !== undefined) $._nexxt._setPropByDisplayName(props, propMap.brightness, (params.brightness - 1) * 5);
                                if (params.contrast !== undefined) $._nexxt._setPropByDisplayName(props, propMap.contrast, (params.contrast - 1) * 100);
                                if (params.highlights !== undefined) $._nexxt._setPropByDisplayName(props, propMap.highlights, (params.highlights - 1) * 100);
                                if (params.shadows !== undefined) $._nexxt._setPropByDisplayName(props, propMap.shadows, (params.shadows - 1) * 100);
                                if (params.saturation !== undefined) $._nexxt._setPropByDisplayName(props, propMap.saturation, 100 + (params.saturation - 1) * 100);
                                if (params.sharpness !== undefined) $._nexxt._setPropByDisplayName(props, propMap.sharpness, (params.sharpness - 1) * 50);
                                if (params.vignette !== undefined) $._nexxt._setPropByDisplayName(props, propMap.vignette, params.vignette);
                                lumetriAplicado = true;
                                break;
                            }
                        } catch (e) { }
                    }

                    // Aplica Noise separadamente
                    if (params.grain !== undefined && params.grain > 0 && matchedQeItem && noiseEfx) {
                        try {
                            matchedQeItem.addVideoEffect(noiseEfx);
                            $.sleep(300);
                            var compsN = stdClip.components;
                            for (var ciN = 0; ciN < compsN.numItems; ciN++) {
                                try {
                                    var nMN = ""; try { nMN = compsN[ciN].matchName; } catch (e) { }
                                    var dn = ""; try { dn = compsN[ciN].displayName; } catch (e) { }
                                    var isNoise = (nMN === "AE.ADBE Noise") ||
                                        (dn === "Noise" || dn === "Ruído" || dn === "Rauschen" || dn === "Ruido" ||
                                            dn === "Bruit" || dn === "Disturbo" || dn === "ノイズ" || dn === "노이즈" ||
                                            dn === "杂色" || dn === "雜色" || dn === "Шум" || dn === "Ruis" ||
                                            dn === "Brus" || dn === "Szum" || dn === "Gürültü");
                                    if (isNoise) {
                                        var noiseProps = compsN[ciN].properties;
                                        var noiseAmtNames = ["Amount of Noise", "Quantidade de Ruído", "Rauschmenge",
                                            "Cantidad de ruido", "Amount", "Quantità disturbo", "Quantité de bruit",
                                            "ノイズ量", "노이즈 양", "杂色数量", "Количество шума",
                                            "Hoeveelheid ruis", "Brusomfång", "Ilość szumu", "Gürültü Miktarı"];
                                        if (!$._nexxt._setPropByDisplayName(noiseProps, noiseAmtNames, params.grain)) {
                                            $._nexxt._setPropByMatchName(noiseProps, "ADBE Noise Amount", params.grain);
                                        }
                                        break;
                                    }
                                } catch (e) { }
                            }
                        } catch (e) { }
                    }

                    if (lumetriAplicado) aplicado++;
                }
            }

            if (aplicado === 0) {
                if (!qeSeq) return "ERRO|QE não inicializou. Feche e reabra o painel do plugin e tente novamente.";
                return "ERRO|Lumetri Color não pôde ser adicionado. Verifique se o efeito está disponível no seu Premiere (Effects > Video Effects > Color Correction > Lumetri Color).";
            }
            return "SUCESSO|" + aplicado;
        } catch (e) {
            return "ERRO|" + e.toString();
        }
    },

    // DIAGNôSTICO VARIABILIZADOR 
    // Retorna info real do clip selecionado: nome QE, componentes, props Lumetri

    diagnosticarVariabilizador: function () {
        try {
            app.enableQE();
            var seq = app.project.activeSequence;
            if (!seq) return "ERRO|Sem sequencia ativa";

            var out = [];

            // 1. Testa quais nomes do Lumetri o QE reconhece neste Premiere
            var testNames = [
                "Lumetri Color", "Lumetri-Farbe", "Color Lumetri", "Lumetri Colour",
                "Cor Lumetri", "Lumetri", "Lumetri Color (Rec.709)", "Lumetri colour"
            ];
            out.push("=== TESTE DE NOMES LUMETRI (QE) ===");
            for (var n = 0; n < testNames.length; n++) {
                try {
                    var efx = qe.project.getVideoEffectByName(testNames[n]);
                    out.push("  \"" + testNames[n] + "\" => " + (efx ? "ENCONTRADO!" : "nao encontrado"));
                } catch (e2) {
                    out.push("  \"" + testNames[n] + "\" => ERRO: " + e2);
                }
            }

            // 2. Info do clip selecionado
            var qeSeq = qe.project.getActiveSequence();
            for (var i = 0; i < seq.videoTracks.numTracks; i++) {
                var track = seq.videoTracks[i];
                for (var c = 0; c < track.clips.numItems; c++) {
                    var clip = track.clips[c];
                    try { if (!clip.isSelected()) continue; } catch (e) { continue; }

                    out.push("\n=== CLIP: " + clip.name + " (track " + i + ") ===");

                    // QE items desta track
                    if (qeSeq) {
                        var qeTrack = qeSeq.getVideoTrackAt(i);
                        for (var qi = 0; qi < qeTrack.numItems; qi++) {
                            var qeItem = qeTrack.getItemAt(qi);
                            if (qeItem) out.push("  QE[" + qi + "].name=\"" + qeItem.name + "\"");
                        }
                    }

                    // Componentes do clip
                    var comps = clip.components;
                    out.push("Componentes (" + comps.numItems + "):");
                    for (var ci = 0; ci < comps.numItems; ci++) {
                        try {
                            var comp = comps[ci];
                            out.push("  [" + ci + "] " + comp.displayName + " | " + comp.matchName);
                            if (comp.matchName === "AE.ADBE Lumetri" || comp.matchName === "AE.ADBE Lumetri Color") {
                                var props = comp.properties;
                                out.push("  >> Props Lumetri (" + props.numItems + "):");
                                for (var pi = 0; pi < props.numItems; pi++) {
                                    try {
                                        var prop = props[pi];
                                        out.push("    [" + pi + "] " + prop.displayName + " | " + prop.matchName);
                                        try {
                                            var sub = prop.properties;
                                            if (sub && sub.numItems > 0) {
                                                for (var si = 0; si < sub.numItems; si++) {
                                                    try { out.push("      sub[" + si + "] " + sub[si].displayName + " | " + sub[si].matchName); } catch (e3) { }
                                                }
                                            }
                                        } catch (e3) { }
                                    } catch (e2) { }
                                }
                            }
                        } catch (e2) { out.push("  [" + ci + "] ERRO: " + e2); }
                    }
                }
            }

            if (out.length <= 1) return "Nenhum clip selecionado. Selecione um clip e execute novamente.";
            return out.join("\n");
        } catch (e) {
            return "ERRO|" + e.toString();
        }
    },

    // FIM VARIABILIZADOR 

    // Nova funºúo: importa MOGRTs jí com texto pr®-baked no definition.json
    inserirMogrtsPreBaked: function (base64Data) {
        if (!app.project) return "ERRO|Nenhum projeto aberto.";
        var seq = app.project.activeSequence;
        if (!seq) return "ERRO|Nenhuma sequ¬ncia ativa.";

        if (seq.videoTracks.numTracks < 2) return "ERRO_TRILHA";

        try {
            var decodeBase64 = function (s) {
                var e = {}, i, b = 0, c, x, l = 0, a, r = '', w = String.fromCharCode, L = s.length;
                var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                for (i = 0; i < 64; i++) e[A.charAt(i)] = i;
                for (x = 0; x < L; x++) {
                    c = e[s.charAt(x)]; b = (b << 6) + c; l += 6;
                    while (l >= 8) { ((a = (b >>> (l -= 8)) & 0xff) || (x < (L - 2))) && (r += w(a)); }
                }
                return r;
            };

            var jsonString = decodeURIComponent(escape(decodeBase64(base64Data)));
            var chunks = eval("(" + jsonString + ")");

            if (!chunks || chunks.length === 0) return "SUCESSO";

            for (var i = 0; i < chunks.length; i++) {
                var chunk = chunks[i];
                var startTicks = String(Math.floor(chunk.start * 254016000000));
                var mogrtFile = new File(chunk.mogrtPath);

                if (!mogrtFile.exists) continue;

                var moItem = seq.importMGT(chunk.mogrtPath, startTicks, 1, 0);
                if (moItem) {
                    var endTime = new Time();
                    endTime.seconds = chunk.end;
                    moItem.end = endTime;
                }
            }

            return "SUCESSO";
        } catch (e) {
            return "Erro ao inserir MOGRTs: " + e.toString();
        }
    },

    diagnosticarMogrt: function (caminhoMogrt) {
        if (!app.project) return "ERRO|Sem projeto";
        var seq = app.project.activeSequence;
        if (!seq) return "ERRO|Sem sequencia";

        try {
            var fileObj = new File(caminhoMogrt);
            if (!fileObj.exists) return "ERRO|Arquivo nao existe: " + caminhoMogrt;

            // Insere o MOGRT na V2 no ponto zero da timeline para diagnstico
            var tempMogrt = new File(Folder.temp.fsName + "/nxt_diag_" + new Date().getTime() + ".mogrt");
            fileObj.copy(tempMogrt.fsName);

            var moItem = seq.importMGT(tempMogrt.fsName, "0", 1, 0);
            if (tempMogrt.exists) tempMogrt.remove();

            if (!moItem) return "DIAGNOSTICO|importMGT retornou null";

            var report = "DIAGNOSTICO|moItem OK|";
            report += "type=" + (moItem.type || "?") + "|";

            // Verifica components
            var comps = null;
            try { comps = moItem.components; } catch (e) { report += "components=EXCECAO:" + e + "|"; }

            if (!comps) {
                report += "components=NULL|";
            } else {
                report += "components.numItems=" + comps.numItems + "|";
                for (var c = 0; c < comps.numItems; c++) {
                    var comp = comps[c];
                    report += "comp[" + c + "].matchName=" + (comp.matchName || "?") + "|";
                    report += "comp[" + c + "].displayName=" + (comp.displayName || "?") + "|";
                    var props = null;
                    try { props = comp.properties; } catch (e) { props = null; }
                    if (props) {
                        report += "comp[" + c + "].props.numItems=" + props.numItems + "|";
                        for (var p = 0; p < Math.min(props.numItems, 5); p++) {
                            try {
                                report += "prop[" + p + "]=" + (props[p].displayName || "?") + "(type=" + (props[p].propertyType || "?") + ")|";
                            } catch (pe) { report += "prop[" + p + "]=ERR|"; }
                        }
                    }
                }
            }

            return report;
        } catch (e) {
            return "DIAGNOSTICO|EXCECAO: " + e.toString();
        }
    },

    gerarLegendasMogrt: function (base64Data, caminhoMogrt, useV2, extensionPath) {
        if (!app.project) return "ERRO|Nenhum projeto aberto.";
        var seq = app.project.activeSequence;
        if (!seq) return "ERRO|Nenhuma sequ¬ncia ativa.";

        // NOTE: We no longer gate on numTracks < 2.
        // If V2 doesn't exist yet, we create it inside the function.

        try {
            // === DECODE BASE64 ===
            var decodeBase64 = function (s) {
                var e = {}, i, b = 0, c, x, l = 0, a, r = '', w = String.fromCharCode, L = s.length;
                var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                for (i = 0; i < 64; i++) e[A.charAt(i)] = i;
                for (x = 0; x < L; x++) {
                    c = e[s.charAt(x)]; b = (b << 6) + c; l += 6;
                    while (l >= 8) { ((a = (b >>> (l -= 8)) & 0xff) || (x < (L - 2))) && (r += w(a)); }
                }
                return r;
            };

            var jsonString = decodeURIComponent(escape(decodeBase64(base64Data)));
            var payload = eval("(" + jsonString + ")");

            // Backward compatibility para quando enviívamos direto o array de chunks:
            var chunks = payload.chunks ? payload.chunks : payload;
            var globalGapFrames = payload.gapFrames !== undefined ? payload.gapFrames : 2;
            var linesMode = payload.linesMode || 2;

            if (!chunks || chunks.length === 0) return "SUCESSO";

            var fileObj = new File(caminhoMogrt);
            if (!fileObj.exists) return "Erro|Arquivo MOGRT nao encontrado: " + caminhoMogrt;

            // === INJEçâO DE TEXTO ===
            // matchName = "AL.ADBE.Capsule", displayName = "Graphic Parameters"
            // prop texto: displayName="Text", type=6
            // linesMode: 1 = Single line, 2 = Double line
            function injetarTexto(stdItem, textStr, linesMode) {
                if (!stdItem) return false;
                var comps = null;
                try { comps = stdItem.components; } catch (e) { return false; }
                if (!comps) return false;

                for (var c = 0; c < comps.numItems; c++) {
                    var mName = "";
                    try { mName = comps[c].matchName || ""; } catch (e) { continue; }

                    // Prioridade 1: Componente espec¡fico dos MOGRTs Adobe (AL.ADBE.Capsule)
                    if (mName === "AL.ADBE.Capsule" || mName === "ADBE MOGRT") {
                        var props = null;
                        try { props = comps[c].properties; } catch (e) { continue; }
                        if (!props) continue;

                        // Busca prop chamada "Text" ou com type=6 (tipo texto do MOGRT)
                        for (var p = 0; p < props.numItems; p++) {
                            try {
                                var dName = String(props[p].displayName).toLowerCase();
                                var pType = props[p].propertyType;
                                if (dName === "text" || dName === "texto" || pType === 6) {
                                    // Handle linesMode by replacing line breaks if Single Line
                                    var finalText = linesMode === 1 ? textStr.replace(/\n/g, ' ') : textStr;
                                    props[p].setValue(finalText);
                                    return true;
                                }
                            } catch (e) { }
                        }

                        // Fallback dentro do componente: tenta qualquer prop
                        for (var p2 = 0; p2 < props.numItems; p2++) {
                            try {
                                var ft = linesMode === 1 ? textStr.replace(/\n/g, ' ') : textStr;
                                props[p2].setValue(ft);
                                return true;
                            } catch (e) { }
                        }
                    }
                }

                // Fallback global: tenta todos os componentes
                for (var c2 = 0; c2 < comps.numItems; c2++) {
                    var props2 = null;
                    try { props2 = comps[c2].properties; } catch (e) { continue; }
                    if (!props2) continue;

                    for (var p3 = 0; p3 < props2.numItems; p3++) {
                        try {
                            var dName2 = String(props2[p3].displayName).toLowerCase();
                            if (dName2.indexOf("text") !== -1 || dName2 === "subtitle" || dName2 === "legenda" || dName2 === "caption" || props2[p3].propertyType === 6) {
                                var ft2 = linesMode === 1 ? textStr.replace(/\n/g, ' ') : textStr;
                                props2[p3].setValue(ft2);
                                return true;
                            }
                        } catch (e) { }
                    }
                }

                return false;
            }

            // ================================================================
            // FRAME-ACCURATE TICK MATH DROP-FRAME SAFE
            // ================================================================
            // Premiere Pro: 1 second = 254,016,000,000 ticks (fixed constant).
            //
            // Drop-Frame handling (NTSC 29.97fps):
            // - seq.frameDuration.ticks returns the EXACT ticks-per-frame
            // for this specific sequence, including DF timebases.
            // - For 29.97 NDF:  ticksPerFrame = 254016000000 / 30000 * 1001
            // - For 29.97 DF:   same value  DF only affects timecode display,
            // not the underlying tick representation.
            // - So reading ticksPerFrame from the sequence is ALWAYS correct.
            //
            // Conversion: seconds Æ frame# (Math.round) Æ ticks
            // This SNAPS every timestamp to the nearest frame boundary,
            // eliminating cumulative floating-point drift over long sequences.
            // ================================================================
            var TICKS_PER_SEC = 254016000000;
            var ticksPerFrame = 0;

            // Method 1: seq.frameDuration.ticks (most reliable, Premiere 2020+)
            try {
                if (seq.frameDuration && seq.frameDuration.ticks) {
                    ticksPerFrame = parseInt(String(seq.frameDuration.ticks), 10);
                }
            } catch (e) { }

            // Method 2: Calculate from videoFrameRate setting
            if (!ticksPerFrame || ticksPerFrame <= 0) {
                try {
                    var settings = seq.getSettings();
                    if (settings && settings.videoFrameRate) {
                        var frSec = parseFloat(String(settings.videoFrameRate.seconds));
                        if (frSec > 0) ticksPerFrame = Math.round(frSec * TICKS_PER_SEC);
                    }
                } catch (e) { }
            }

            // Method 3: Fallback 30fps
            if (!ticksPerFrame || ticksPerFrame <= 0) {
                ticksPerFrame = Math.round(TICKS_PER_SEC / 30);
            }

            var frameRate = TICKS_PER_SEC / ticksPerFrame;

            // snapToFrameTicks: the core frame-snap function.
            // seconds Æ nearest frame number Æ exact tick position
            function snapToFrameTicks(sec) {
                return Math.round(sec * frameRate) * ticksPerFrame;
            }

            // === ENCONTRAR TRACK DE LEGENDAS (V2 ou acima) ===
            var minStart = chunks[0].start;
            var maxEnd = chunks[chunks.length - 1].end;

            // Auto-create V2 if the sequence only has V1
            if (seq.videoTracks.numTracks < 2) {
                try { seq.videoTracks.addTrack(); } catch (e) { }
            }

            var legendaTrackIndex = -1;

            // Search V2+ for a track with no clips in [minStart, maxEnd]
            for (var ti = 1; ti < seq.videoTracks.numTracks; ti++) {
                var track = seq.videoTracks[ti];
                var temConflito = false;
                for (var ci = 0; ci < track.clips.numItems; ci++) {
                    var cl = track.clips[ci];
                    if (cl.start.seconds < maxEnd && cl.end.seconds > minStart) {
                        temConflito = true;
                        break;
                    }
                }
                if (!temConflito) { legendaTrackIndex = ti; break; }
            }

            // All tracks from V2+ are busy add a new one
            if (legendaTrackIndex === -1) {
                try {
                    seq.videoTracks.addTrack();
                    legendaTrackIndex = seq.videoTracks.numTracks - 1;
                } catch (e) {
                    legendaTrackIndex = Math.max(1, seq.videoTracks.numTracks - 1);
                }
            }

            var stdTrack = seq.videoTracks[legendaTrackIndex];
            var insertedCount = 0; // contador para diagnostico

            // === LOOP: inserir via seq.importMGT ===
            // Usa snapToFrameTicks() definida acima para posiºúo e trim frame-accurate.
            // Cada chunk jí foi processado pelo chunking JS com sil¬ncio/pausa detectado.

            for (var i = 0; i < chunks.length; i++) {
                var chunk = chunks[i];

                // TRIM CIRÜRGICO POR TICKS 
                // Converte segundos Æ nmero de frames Æ ticks exatos (sem drift)
                var startFrame = Math.round(chunk.start * (TICKS_PER_SEC / ticksPerFrame));
                var endFrame = Math.round(chunk.end * (TICKS_PER_SEC / ticksPerFrame));

                var startTicksNum = startFrame * ticksPerFrame;
                var endTicks = endFrame * ticksPerFrame;
                // Cria objeto Time para importMGT (evita offsets por passar String)
                var startTime = new Time();
                startTime.ticks = String(startTicksNum);

                // Guard: end deve ser pelo menos a quantidade de gapFrames á frente do start
                // (por padrúo 1 frame, mas pode ser mais de acordo com a configuraºúo do gap)
                var gapTicksMinimo = globalGapFrames * ticksPerFrame;
                if (gapTicksMinimo <= 0) gapTicksMinimo = ticksPerFrame; // m¡nimo 1 frame pra núo corromper AE

                if (endTicks <= startTicksNum) {
                    endTicks = startTicksNum + gapTicksMinimo;
                }
                // 

                // PRE-INSERTION CONFLICT CHECK (ticks-based) 
                // Compara em TICKS (inteiros), nao em segundos (float).
                // Razao: apos frame-snap o end.seconds do clip anterior pode ficar
                // alguns microsegundos acima do chunk.start seguinte (erro de arredondamento),
                // causando falsos conflitos e pulando legendas.
                // Clips consecutivos que COMPARTILHAM a mesma fronteira de frame nao conflitam.
                var hasConflict = false;
                var trkCheck = seq.videoTracks[legendaTrackIndex];
                for (var ci2 = 0; ci2 < trkCheck.clips.numItems; ci2++) {
                    var existClip = trkCheck.clips[ci2];
                    var existStartT, existEndT;
                    try { existStartT = parseInt(existClip.start.ticks, 10); } catch(eTk) { continue; }
                    try { existEndT   = parseInt(existClip.end.ticks,   10); } catch(eTk) { continue; }
                    // Overlap real: intervalo do clip existente intersecta o novo chunk.
                    // Clips que terminam exatamente onde o novo começa NAO conflitam (>).
                    if (existStartT < endTicks && existEndT > startTicksNum) {
                        hasConflict = true;
                        break;
                    }
                }
                if (hasConflict) continue; // Pula este chunk evita overlap real
                // 

                // Cria cpia nica do MOGRT para evitar diílogo "arquivo jí existe"
                var tempMogrt = new File(Folder.temp.fsName + "/nxt_" + new Date().getTime() + "_" + i + ".mogrt");
                fileObj.copy(tempMogrt.fsName);

                // seq.importMGT(path, startTime, videoTrackIndex, audioTrackIndex)
                var moItem = seq.importMGT(tempMogrt.fsName, startTime, legendaTrackIndex, 0);

                if (tempMogrt.exists) { tempMogrt.remove(); }

                var inserted = null;
                if (moItem) {
                    inserted = moItem;
                } else {
                    // Backward scan: localiza o clipe recem inserido por proximidade de start
                    for (var j = stdTrack.clips.numItems - 1; j >= 0; j--) {
                        try {
                            var clipTicks = parseInt(stdTrack.clips[j].start.ticks, 10);
                            if (Math.abs(clipTicks - startTicksNum) < ticksPerFrame * 2) {
                                inserted = stdTrack.clips[j];
                                break;
                            }
                        } catch (e) { }
                    }
                }

                if (inserted) {
                    // Trim frame-accurate; se ambos fallbacks falharem, remove o clipe
                    // para evitar que ele bloqueie as legendas seguintes via conflict check
                    var trimOk = false;
                    try {
                        var endTime = new Time();
                        endTime.ticks = String(endTicks);
                        inserted.end = endTime;
                        trimOk = true;
                    } catch (e) {
                        try {
                            var endTimeFallback = new Time();
                            endTimeFallback.seconds = chunk.end;
                            inserted.end = endTimeFallback;
                            trimOk = true;
                        } catch (e2) { }
                    }
                    if (!trimOk) {
                        try { inserted.remove(false, false); } catch (eRm) { }
                        continue;
                    }

                    // Trata line breaks enviados pela UI substituindo '\\n' pelo caractere \r
                    var tStr = chunk.text.replace(/\\n/g, '\r');
                    injetarTexto(inserted, tStr, linesMode);
                    insertedCount++;
                }
            }

            // ================================================================
            // FEATURE 3: AUTO-BLEEP (CENSORSHIP) AUDIO INJECTION
            // ================================================================
            var bleeps = payload.bleepsData || [];
            var debugBleep = "";

            if (bleeps.length > 0) {
                // 1. Locate the bleep.wav bundled with the extension using explicit CEP path
                var safePath = extensionPath.replace(/\\/g, "/");
                var bleepFile = new File(safePath + "/bleep.wav");

                if (!bleepFile.exists) {
                    return "ERRO|Arquivo bleep.wav nao encontrado em: " + bleepFile.fsName;
                }

                // 2. Import bleep.wav into the project
                var proj = app.project;
                var rootBin = proj.rootItem;
                var nexxtBin = null;

                for (var x = 0; x < rootBin.children.numItems; x++) {
                    if (rootBin.children[x].name === "Nexxt Captions Assets" && rootBin.children[x].type === ProjectItemType.BIN) {
                        nexxtBin = rootBin.children[x];
                        break;
                    }
                }
                if (!nexxtBin) nexxtBin = rootBin.createBin("Nexxt Captions Assets");

                var bleepProjItem = null;
                for (var y = 0; y < nexxtBin.children.numItems; y++) {
                    var child = nexxtBin.children[y];
                    if (child.name.indexOf("bleep") !== -1 || child.name.indexOf("beep") !== -1) {
                        bleepProjItem = child;
                        break;
                    }
                }

                if (!bleepProjItem) {
                    try {
                        proj.importFiles([bleepFile.fsName], true, nexxtBin, false);

                        // Search again after import
                        for (var y = 0; y < nexxtBin.children.numItems; y++) {
                            var child = nexxtBin.children[y];
                            if (child.name.indexOf("bleep") !== -1 || child.name.indexOf("beep") !== -1) {
                                bleepProjItem = child;
                                break;
                            }
                        }
                    } catch (impErr) {
                        return "ERRO|Falha ao importar bleep.mp3: " + impErr.toString();
                    }
                }

                if (bleepProjItem) {
                    // 3. Find an available Audio Track
                    var audioTrackIndex = -1;

                    // Precisa procurar track vazia
                    for (var at = 1; at < seq.audioTracks.numTracks; at++) {
                        var aTrack = seq.audioTracks[at];
                        var aConflict = false;
                        for (var b = 0; b < bleeps.length; b++) {
                            var bleepStart = bleeps[b].start;
                            var bleepEnd = bleeps[b].end;
                            for (var ac = 0; ac < aTrack.clips.numItems; ac++) {
                                var acClip = aTrack.clips[ac];
                                if (acClip.start.seconds < bleepEnd && acClip.end.seconds > bleepStart) {
                                    aConflict = true;
                                    break;
                                }
                            }
                            if (aConflict) break;
                        }
                        if (!aConflict) { audioTrackIndex = at; break; }
                    }

                    if (audioTrackIndex === -1) {
                        try {
                            seq.audioTracks.addTrack(); // Add fails silently sometimes in older PPRO, but we try
                            audioTrackIndex = seq.audioTracks.numTracks - 1;
                        } catch (e) {
                            return "ERRO|Falha ao criar track de audio para o Bleep: " + e.toString();
                        }
                    }

                    var targetAudioTrack = seq.audioTracks[audioTrackIndex];
                    debugBleep += "Inserindo em Track: " + audioTrackIndex + " | ";

                    // 4. Inject the bleep cuts
                    for (var b2 = 0; b2 < bleeps.length; b2++) {
                        var bData = bleeps[b2];
                        var playheadTime = new Time();
                        playheadTime.seconds = bData.start;

                        try {
                            // overwriteClip is safer than insertClip
                            targetAudioTrack.overwriteClip(bleepProjItem, playheadTime);

                            // Fetch the just inserted clip to trim its END time
                            var insertedBleep = null;
                            for (var cx = targetAudioTrack.clips.numItems - 1; cx >= 0; cx--) {
                                var chkClip = targetAudioTrack.clips[cx];
                                if (Math.abs(chkClip.start.seconds - bData.start) < 0.1) {
                                    insertedBleep = chkClip;
                                    break;
                                }
                            }

                            if (insertedBleep) {
                                var outTime = new Time();
                                outTime.seconds = bData.end;
                                insertedBleep.end = outTime;
                                debugBleep += "Bleep OK: " + bData.start + " ";
                            } else {
                                debugBleep += "Bleep Inserted but not found to trim | ";
                            }
                        } catch (insertErr) {
                            return "ERRO|Falha no overwriteClip do Bleep: " + insertErr.toString();
                        }
                    }
                } else {
                    return "ERRO|BleepProjItem nao encontrado mesmo apos importacao.";
                }
            }
            // ================================================================

            var skipped = chunks.length - insertedCount;
            var diagMsg = insertedCount + "/" + chunks.length + " inseridas";
            if (skipped > 0) diagMsg += " (" + skipped + " puladas por conflito)";
            return "SUCESSO|" + diagMsg + (debugBleep ? " | Bleep: " + debugBleep : "");
        } catch (e) {
            return "Erro ao processar legendas: " + e.toString();
        }
    },

    prepararAudioIA: function () {
        if (!app.project) return "ERRO|Nenhum projeto aberto.";
        var seq = app.project.activeSequence;
        if (!seq) return "ERRO|Nenhuma sequ¬ncia ativa.";

        // =================================================================
        // IMPORTANT: Collect ONLY from videoTracks to avoid duplicates.
        // A linked video+audio clip appears on BOTH videoTracks AND
        // audioTracks. Collecting from both causes the same clip to be
        // transcribed twice, placing overlapping MOGRTs at wrong positions.
        // =================================================================
        var selectedClips = [];
        var seenPaths = {}; // Deduplication by media path

        for (var i = 0; i < seq.videoTracks.numTracks; i++) {
            var track = seq.videoTracks[i];
            for (var j = 0; j < track.clips.numItems; j++) {
                var c = track.clips[j];
                if (!c.isSelected()) continue;
                var mp = "";
                try { mp = c.projectItem ? c.projectItem.getMediaPath() : ""; } catch (e) { }
                if (!mp || seenPaths[mp]) continue;
                seenPaths[mp] = true;
                selectedClips.push(c);
            }
        }

        // Fallback: audio-only clips (e.g. podcast with no video track)
        if (selectedClips.length === 0) {
            for (var i2 = 0; i2 < seq.audioTracks.numTracks; i2++) {
                var aTrack = seq.audioTracks[i2];
                for (var j2 = 0; j2 < aTrack.clips.numItems; j2++) {
                    var ac = aTrack.clips[j2];
                    if (!ac.isSelected()) continue;
                    var amp = "";
                    try { amp = ac.projectItem ? ac.projectItem.getMediaPath() : ""; } catch (e) { }
                    if (!amp || seenPaths[amp]) continue;
                    seenPaths[amp] = true;
                    selectedClips.push(ac);
                }
            }
        }

        if (selectedClips.length === 0) return "ERRO|Nenhum clipe selecionado na timeline.";

        // Sort chronologically by timeline position
        selectedClips.sort(function (a, b) { return a.start.seconds - b.start.seconds; });

        var result = "SUCESSO";
        for (var k = 0; k < selectedClips.length; k++) {
            var clip = selectedClips[k];
            var mediaPath = "";
            try { mediaPath = clip.projectItem ? clip.projectItem.getMediaPath() : ""; } catch (e) { }
            if (!mediaPath) continue;
            var inPoint = clip.inPoint.seconds;
            var duration = clip.end.seconds - clip.start.seconds;
            var clipStart = clip.start.seconds; // absolute timeline position
            result += "||" + mediaPath + "|" + inPoint + "|" + duration + "|" + clipStart;
        }

        return result;
    },

    // Retorna o start.seconds do primeiro clipe selecionado na timeline.
    // Usado pelo SRT import para calcular o offset correto.
    obterOffsetClipeSelecionado: function () {
        if (!app.project) return "0";
        var seq = app.project.activeSequence;
        if (!seq) return "0";
        for (var i = 0; i < seq.videoTracks.numTracks; i++) {
            var track = seq.videoTracks[i];
            for (var j = 0; j < track.clips.numItems; j++) {
                if (track.clips[j].isSelected()) return String(track.clips[j].start.seconds);
            }
        }
        for (var i2 = 0; i2 < seq.audioTracks.numTracks; i2++) {
            var aTrack = seq.audioTracks[i2];
            for (var j2 = 0; j2 < aTrack.clips.numItems; j2++) {
                if (aTrack.clips[j2].isSelected()) return String(aTrack.clips[j2].start.seconds);
            }
        }
        return "0";
    },

    obterDadosParaClonagem: function () {
        if (!app.project) return "ERRO||Nenhum projeto aberto.";
        var seq = app.project.activeSequence;
        if (!seq) return "ERRO||Nenhuma sequ¬ncia ativa.";

        var selectedClip = null;
        // Search audio preferred for clone
        for (var i = 0; i < seq.audioTracks.numTracks; i++) {
            var track = seq.audioTracks[i];
            for (var j = 0; j < track.clips.numItems; j++) {
                if (track.clips[j].isSelected()) {
                    selectedClip = track.clips[j];
                    break;
                }
            }
            if (selectedClip) break;
        }

        if (!selectedClip) {
            for (var i = 0; i < seq.videoTracks.numTracks; i++) {
                var track = seq.videoTracks[i];
                for (var j = 0; j < track.clips.numItems; j++) {
                    if (track.clips[j].isSelected()) {
                        selectedClip = track.clips[j];
                        break;
                    }
                }
                if (selectedClip) break;
            }
        }

        if (!selectedClip) return "ERRO||Nenhum clipe selecionado na timeline.";

        var mediaPath = selectedClip.projectItem.getMediaPath();
        var inPoint = selectedClip.inPoint.seconds;
        var duration = selectedClip.end.seconds - selectedClip.start.seconds;

        return "SUCESSO||" + mediaPath + "||" + inPoint + "||" + duration;
    },

    importarEAdicionarNaTimeline: function (caminhoArquivo) {
        if (!app.project) return "Erro: Nenhum projeto aberto.";
        var seq = app.project.activeSequence;
        if (!seq) return "Erro: Nenhuma sequ¬ncia ativa.";

        var proj = app.project;
        var rootBin = proj.rootItem;
        var dlBin = null;

        // Find or create "Nexxt Downloads" bin
        for (var i = 0; i < rootBin.children.numItems; i++) {
            if (rootBin.children[i].name === "Nexxt Downloads" && rootBin.children[i].type === ProjectItemType.BIN) {
                dlBin = rootBin.children[i];
                break;
            }
        }
        if (!dlBin) dlBin = rootBin.createBin("Nexxt Downloads");

        try {
            // Count items before import
            var countBefore = dlBin.children.numItems;

            proj.importFiles([caminhoArquivo], true, dlBin, false);

            // Find the newly imported item (last added)
            var importedItem = null;

            // Method 1: compare count the new item is the last one
            if (dlBin.children.numItems > countBefore) {
                importedItem = dlBin.children[dlBin.children.numItems - 1];
            }

            // Method 2: fallback path match (normalize slashes)
            if (!importedItem) {
                var normalPath = caminhoArquivo.replace(/\\\\/g, '/');
                for (var j = 0; j < dlBin.children.numItems; j++) {
                    var child = dlBin.children[j];
                    try {
                        var childPath = child.getMediaPath().replace(/\\\\/g, '/');
                        if (childPath === normalPath) {
                            importedItem = child;
                            break;
                        }
                    } catch (e) { }
                }
            }

            if (importedItem) {
                var playheadTime = seq.getPlayerPosition();

                // Detect audio-only by file extension first (most reliable for freshly imported items).
                // hasAudio()/hasVideo() can throw or return incorrect values before PPro finishes indexing.
                var ext = caminhoArquivo.replace(/^.*\./, '').toLowerCase();
                var audioExts = { mp3:1, wav:1, aac:1, ogg:1, m4a:1, flac:1, aiff:1, aif:1 };
                var isAudioOnly = !!audioExts[ext];
                if (!isAudioOnly) {
                    try { isAudioOnly = importedItem.hasAudio() && !importedItem.hasVideo(); } catch (e) {}
                }

                var trackList = isAudioOnly ? seq.audioTracks : seq.videoTracks;
                var numTracks  = 0;
                try { numTracks = trackList.numTracks; } catch (e) { numTracks = 0; }

                // Find the first track with ZERO clips — A1 ocupada → A2 → A3 etc.
                var targetTrackIndex = -1;
                for (var t = 0; t < numTracks; t++) {
                    var isEmpty = false;
                    try { isEmpty = (trackList[t].clips.numItems === 0); } catch (e) { isEmpty = false; }
                    if (isEmpty) { targetTrackIndex = t; break; }
                }

                // All tracks occupied — fall back to last track
                if (targetTrackIndex === -1) targetTrackIndex = (numTracks > 0 ? numTracks - 1 : 0);

                trackList[targetTrackIndex].overwriteClip(importedItem, playheadTime);
                return "Sucesso|A" + (targetTrackIndex + 1) + " isAudio=" + isAudioOnly + " tracks=" + numTracks;
            }
            return "Importado na pasta, mas núo foi poss¡vel localizar o item para inserir na timeline.";
        } catch (e) {
            return "Erro ao importar: " + e.toString();
        }
    },

    // Captura o frame atual da timeline e salva como JPG no temp 
    capturarFrameTimeline: function () {
        if (!app.project) return "ERRO|Nenhum projeto aberto.";
        var seq = app.project.activeSequence;
        if (!seq) return "ERRO|Nenhuma sequ¬ncia ativa.";

        try {
            var outPath = Folder.temp.fsName + "/nexxt_kling_frame_" + new Date().getTime() + ".jpg";

            // Usa exportFramePNG se dispon¡vel (Premiere 2022+), senúo tenta exportFrameJPEG
            var playerPos = seq.getPlayerPosition();
            var exported = false;

            // M®todo 1: exportFrameJPEG (mais compat¡vel)
            try {
                if (seq.exportFrameJPEG) {
                    seq.exportFrameJPEG(playerPos, outPath);
                    exported = new File(outPath).exists;
                }
            } catch (e1) { }

            // M®todo 2: QE export frame
            if (!exported) {
                try {
                    app.enableQE();
                    var qeSeq = qe.project.getActiveSequence();
                    if (qeSeq) {
                        // exportFrame(path, frameIndex, scale, open)
                        var fps = 25;
                        try {
                            var settings = seq.getSettings();
                            if (settings && settings.videoFrameRate && settings.videoFrameRate.seconds > 0) {
                                fps = Math.round(1 / settings.videoFrameRate.seconds);
                            }
                        } catch (e) { }
                        var frameIdx = Math.round(playerPos.seconds * fps);
                        qeSeq.exportFrame(outPath, String(frameIdx), "1", false);
                        exported = new File(outPath).exists;
                    }
                } catch (e2) { }
            }

            if (exported) {
                return outPath;
            }
            return "ERRO|Nao foi possivel exportar o frame. Verifique se ha uma sequencia com clipes ativa.";
        } catch (e) {
            return "ERRO|" + e.toString();
        }
    },

    // EXTENSâO DE FUNDO (adaptado de Nicktrix) 

    _makeTimeN: function (sec) {
        var t = new Time();
        t.seconds = parseFloat(sec);
        return t;
    },

    _findInProjectN: function (nome, pasta) {
        if (!pasta) return null;
        for (var i = 0; i < pasta.children.numItems; i++) {
            var filho = pasta.children[i];
            if (filho.name === nome) return filho;
            if (filho.children && filho.children.numItems > 0) {
                var found = $._nexxt._findInProjectN(nome, filho);
                if (found) return found;
            }
        }
        return null;
    },

    // _importarAssetN: follows Nicktrix pattern returns true/false.
    // Items are retrieved AFTER importing via _findInProjectN(nome, binTarget).
    _importarAssetN: function (nome, caminhoArquivo, binTarget) {
        // 1) Normalize path: handles file:/// URIs with %20 encoding 
        // When the user selects a file in the gallery, the path may be stored as
        // a file:/// URI (e.g. "file:///C:/path%20with%20spaces/file.mp3").
        // new File(uri).name returns URL-encoded text, breaking the rename comparison.
        var caminho = caminhoArquivo;
        if (caminho && (caminho.indexOf('file:///') === 0 || caminho.indexOf('file://') === 0)) {
            caminho = caminho.replace(/^file:\/\/\//i, '').replace(/\//g, '\\');
            try { caminho = decodeURIComponent(caminho); } catch (e) { }
        }

        // 2) If already in bin with correct SAFEAD_ name, skip re-import 
        if ($._nexxt._findInProjectN(nome, binTarget)) return true;

        var f = new File(caminho);
        if (!f.exists) return false;

        app.project.importFiles([caminho], false, binTarget, false);

        // 3) Retry rename  importFiles in PP2024+ is async 
        // The new item appears in binTarget.children after a short delay.
        // We try matching with and without extension (Premiere strips .mp3 in some versions).
        var fnameWithExt = "";
        try { fnameWithExt = decodeURIComponent(f.name); } catch (e) { fnameWithExt = f.name; }

        var dotIdx = fnameWithExt.lastIndexOf(".");
        var fnameNoExt = (dotIdx > 0) ? fnameWithExt.substring(0, dotIdx) : fnameWithExt;

        var renamed = false;
        for (var retry = 0; retry < 5 && !renamed; retry++) {
            for (var i = 0; i < binTarget.children.numItems; i++) {
                var child = binTarget.children[i];
                if (child.name === fnameWithExt || child.name === fnameNoExt) {
                    try { child.name = nome; renamed = true; } catch (e) { }
                    break;
                }
            }
            if (!renamed && retry < 4) $.sleep(150); // max 600ms total wait
        }
        // Even if rename failed for timing reasons, return true so Phase 2 can report
        // the actual bin state via _binItemNamesN for further debugging.
        return true;
    },

    // Diagnostic helper: returns comma-separated list of all item names in a bin
    _binItemNamesN: function (bin) {
        var names = [];
        try {
            for (var i = 0; i < bin.children.numItems; i++) {
                names.push('"' + bin.children[i].name + '"');
            }
        } catch (e) { names.push('ERR:' + e); }
        return '[' + names.join(', ') + ']';
    },

    _setOpacityN: function (clip, valor) {
        try {
            var comps = clip.components;
            for (var c = 0; c < comps.numItems; c++) {
                var props = comps[c].properties;
                for (var p = 0; p < props.numItems; p++) {
                    if (props[p].displayName === "Opacity") {
                        props[p].setValue(parseFloat(valor), true);
                        return;
                    }
                }
            }
        } catch (e) { }
    },

    _lastVolDiag: "",

    // Premiere display: displayedDB = 20*log10(val) + 15
    // Inverso: val = Math.pow(10, (displayedDB - 15) / 20)
    // 0dB -> 0.1778 | -25dB -> 0.01 | -40dB -> 0.001778
    _dbToPremiereVal: function (db) {
        var d = parseFloat(db);
        if (d <= -100) return 0;
        return Math.pow(10, (d - 15) / 20);
    },

    _setVolumeN: function (clip, db) {
        try {
            var internalVal = $._nexxt._dbToPremiereVal(db);
            $._nexxt._lastVolDiag = "db=" + db + "->val=" + internalVal.toFixed(4);
            var comps = clip.components;
            for (var c = 0; c < comps.numItems; c++) {
                var cName = "";
                try { cName = comps[c].displayName; } catch (e) { continue; }
                if (cName === "Volume") {
                    var props = comps[c].properties;
                    for (var p = 0; p < props.numItems; p++) {
                        var pName = "";
                        try { pName = props[p].displayName; } catch (e) { continue; }
                        if (pName === "Level") {
                            try { if (props[p].isTimeVarying()) props[p].setTimeVarying(false); } catch (ek) { }
                            props[p].setValue(internalVal, true);
                            var afterVal = "";
                            try { afterVal = String(props[p].getValue()); } catch (e) { afterVal = "ERR"; }
                            $._nexxt._lastVolDiag += "|OK:" + afterVal;
                            return;
                        }
                    }
                }
            }
            $._nexxt._lastVolDiag += "|NOT_FOUND";
        } catch (e) { $._nexxt._lastVolDiag += "|ERR:" + e; }
    },

    // Diagnóstico: chamar via console do Premiere ou evalScript
    diagAudioVolume: function () {
        var seq = app.project.activeSequence;
        if (!seq) return "DIAG|No sequence";
        var result = "";
        for (var a = 0; a < seq.audioTracks.numTracks; a++) {
            var tk = seq.audioTracks[a];
            for (var c = 0; c < tk.clips.numItems; c++) {
                var clip = tk.clips[c];
                if (!clip || !clip.name) continue;
                if (clip.name.indexOf("SAFEAD_") === -1) continue;
                result += "Track A" + (a + 1) + " clip=" + clip.name + " | ";
                try {
                    var comps = clip.components;
                    result += "comps=" + comps.numItems + " | ";
                    for (var ci = 0; ci < comps.numItems; ci++) {
                        var dn = "", mn = "";
                        try { dn = comps[ci].displayName; } catch (e) { dn = "?"; }
                        try { mn = comps[ci].matchName; } catch (e) { mn = "?"; }
                        result += "C" + ci + ":{" + dn + "/" + mn + "} ";
                        if (dn === "Volume") {
                            var ps = comps[ci].properties;
                            for (var pi = 0; pi < ps.numItems; pi++) {
                                var pd = "", pm = "", pv = "";
                                try { pd = ps[pi].displayName; } catch (e) { }
                                try { pm = ps[pi].matchName; } catch (e) { }
                                try { pv = String(ps[pi].getValue()); } catch (e) { pv = "ERR"; }
                                result += "  P" + pi + ":{" + pd + "/" + pm + "=" + pv + "} ";
                            }
                        }
                    }
                } catch (e) { result += "ERR:" + e; }
                result += "\n";
                if (result.length > 500) return "DIAG|" + result; // Limit output
            }
        }
        return "DIAG|" + (result || "No SAFEAD_ audio found") + " || lastDiag=" + $._nexxt._lastVolDiag;
    },

    tempClipsForNest: [],

    _setScaleN: function (clip, scaleVal) {
        try {
            var comps = clip.components;
            for (var c = 0; c < comps.numItems; c++) {
                if (comps[c].displayName === "Motion") {
                    var props = comps[c].properties;
                    for (var p = 0; p < props.numItems; p++) {
                        if (props[p].displayName === "Scale") {
                            props[p].setValue(parseFloat(scaleVal), true);
                            return;
                        }
                    }
                }
            }
        } catch (e) { }
    },

    _applyGaussianN: function (vTrackIdx, clipIdx, clip, blurLevel) {
        try {
            // Método Primário: QE DOM (comprovado funcionando neste codebase)
            app.enableQE();
            var blurNames = ["Gaussian Blur (Legacy)", "Desfoque Gaussiano (Herdado)",
                "Desfoque Gaussiano (Legado)", "Gaussian Blur", "Desfoque Gaussiano",
                "Fast Blur", "Desfoque R\u00e1pido"];
            var blurEfx = null;
            for (var bn = 0; bn < blurNames.length; bn++) {
                try {
                    var tryEfx = qe.project.getVideoEffectByName(blurNames[bn]);
                    if (tryEfx) { blurEfx = tryEfx; break; }
                } catch (e) { }
            }

            if (blurEfx) {
                var qeSeq = qe.project.getActiveSequence();
                var qeTrack = qeSeq.getVideoTrackAt(vTrackIdx);
                // O clip que acabamos de inserir é o último da track
                var qeClip = qeTrack.getItemAt(clipIdx);
                if (qeClip) {
                    qeClip.addVideoEffect(blurEfx);
                    $.sleep(300); // Premiere precisa processar
                }
            }

            // Agora setar o valor do Blurriness na propriedade
            var comps = clip.components;
            for (var c = 0; c < comps.numItems; c++) {
                var cn = comps[c].displayName.toLowerCase();
                var mn = comps[c].matchName ? comps[c].matchName.toLowerCase() : "";
                if (cn.indexOf("gaussian") > -1 || cn.indexOf("fast blur") > -1 || cn.indexOf("desfoque") > -1 || mn.indexOf("gaussian") > -1 || mn.indexOf("fast blur") > -1) {
                    var props = comps[c].properties;
                    for (var p = 0; p < props.numItems; p++) {
                        var pn = props[p].displayName.toLowerCase();
                        if (pn.indexOf("blurriness") > -1 || pn.indexOf("desfoque") > -1 || pn.indexOf("blur") > -1) {
                            props[p].setValue(blurLevel, true);
                            return;
                        }
                    }
                }
            }
        } catch (e) { }
    },

    // Ler dimensões do clip via XMP metadata do ProjectItem
    _getClipDimsN: function (item) {
        try {
            var md = item.getProjectMetadata();
            if (!md) return null;

            // Método 1: XMP stDim tags (formato padrão do Premiere Pro)
            // <stDim:w>1920</stDim:w> <stDim:h>1080</stDim:h>
            var wTag = md.match(/<stDim:w>(\d+)<\/stDim:w>/i);
            var hTag = md.match(/<stDim:h>(\d+)<\/stDim:h>/i);
            if (wTag && hTag) {
                var wt = parseInt(wTag[1]), ht = parseInt(hTag[1]);
                if (wt > 0 && ht > 0) return { w: wt, h: ht };
            }

            // Método 2: Atributos XML como stDim:w="1920"
            var wAttr = md.match(/stDim:w=["']?(\d+)["']?/i);
            var hAttr = md.match(/stDim:h=["']?(\d+)["']?/i);
            if (wAttr && hAttr) {
                var wa = parseInt(wAttr[1]), ha = parseInt(hAttr[1]);
                if (wa > 0 && ha > 0) return { w: wa, h: ha };
            }

            // Método 3: Busca por padrão NxM pega o maior par válido de dimensões de vídeo
            var re = /(\d{3,5})\s*[x\u00d7X]\s*(\d{3,5})/g;
            var match, bestW = 0, bestH = 0;
            while ((match = re.exec(md)) !== null) {
                var w = parseInt(match[1]), h = parseInt(match[2]);
                // Filtrar: só dimensões realistas de vídeo (100..7680 x 100..4320)
                if (w >= 100 && h >= 100 && w <= 7680 && h <= 4320 && w * h > bestW * bestH) {
                    bestW = w; bestH = h;
                }
            }
            if (bestW > 0) return { w: bestW, h: bestH };
        } catch (e) { }
        return null;
    },

    // Calcular Fill Scale dinâmico baseado em dimensões reais
    _calcFillScaleN: function (clipW, clipH, seqW, seqH) {
        var rW = seqW / clipW;
        var rH = seqH / clipH;
        return Math.ceil(Math.max(rW, rH) * 100);
    },

    // Calcular Fit Scale dinâmico
    _calcFitScaleN: function (clipW, clipH, seqW, seqH) {
        var rW = seqW / clipW;
        var rH = seqH / clipH;
        return Math.ceil(Math.min(rW, rH) * 100);
    },

    // Sweep: deletar áudio linkado que vazou de tracks de vídeo
    _sweepLeakedAudioN: function (seq, namePrefix) {
        for (var a = 0; a < seq.audioTracks.numTracks; a++) {
            var tk = seq.audioTracks[a];
            for (var c = tk.clips.numItems - 1; c >= 0; c--) {
                try {
                    var cl = tk.clips[c];
                    if (cl && cl.name && cl.name.toUpperCase().indexOf(namePrefix) > -1) {
                        cl.remove(false, true);
                    }
                } catch (e) { }
            }
        }
    },

    // Loop de vídeo puro (SÓ vTrack, nunca aTrack)
    _loopVideoN: function (item, vTrack, vTrackIdx, startSec, endSec, opacidade, fillScale, fitScale, scaleMethod, blurLevel) {
        var cur = startSec;
        var maxIter = 2000;
        var iter = 0;
        while (cur < endSec && iter < maxIter) {
            iter++;
            vTrack.overwriteClip(item, $._nexxt._makeTimeN(cur));
            var clipIdx = vTrack.clips.numItems - 1;
            var lastClip = vTrack.clips[clipIdx];
            if (!lastClip) break;

            if (opacidade !== undefined && opacidade !== null && opacidade < 100) {
                $._nexxt._setOpacityN(lastClip, opacidade);
            }
            if (scaleMethod === "fill" && fillScale > 0) {
                $._nexxt._setScaleN(lastClip, fillScale);
            } else if (scaleMethod === "fit" && fitScale > 0) {
                $._nexxt._setScaleN(lastClip, fitScale);
            }
            if (blurLevel && blurLevel > 0) {
                $._nexxt._applyGaussianN(vTrackIdx, clipIdx, lastClip, blurLevel);
            }

            var clipDur = lastClip.duration.seconds;
            if (clipDur <= 0) break;
            
            var fReal = lastClip.start.seconds + clipDur;
            if (fReal >= endSec) {
                try { lastClip.end = $._nexxt._makeTimeN(endSec); } catch (e) { }
                break;
            }
            cur = fReal;
        }
    },

    // Loop de áudio puro (SÓ aTrack, para Noise sem leak de vídeo)
    _loopAudioN: function (item, aTrack, startSec, endSec, volumeDb) {
        var cur = startSec;
        var maxIter = 2000;
        var iter = 0;
        while (cur < endSec && iter < maxIter) {
            iter++;
            aTrack.overwriteClip(item, $._nexxt._makeTimeN(cur));
            $.sleep(50); // Dar tempo ao Premiere de inicializar o clip
            var lastClip = aTrack.clips[aTrack.clips.numItems - 1];
            if (!lastClip) break;

            if (volumeDb !== undefined && volumeDb !== null) {
                $._nexxt._setVolumeN(lastClip, volumeDb);
            }

            var clipDur = lastClip.duration.seconds;
            if (clipDur <= 0) break;
            
            var fReal = lastClip.start.seconds + clipDur;
            if (fReal >= endSec) {
                try { lastClip.end = $._nexxt._makeTimeN(endSec); } catch (e) { }
                break;
            }
            cur = fReal;
        }
    },

    _calcDurOriginalN: function (seq) {
        var maxEnd = 0;
        var v, a, c, clipEnd;
        for (v = 0; v < seq.videoTracks.numTracks; v++) {
            var vTrack = seq.videoTracks[v];
            for (c = 0; c < vTrack.clips.numItems; c++) {
                var vClip = vTrack.clips[c];
                if (vClip.name && vClip.name.indexOf("SAFEAD_") > -1) continue;
                try { clipEnd = vClip.end.seconds; if (clipEnd > maxEnd) maxEnd = clipEnd; } catch (e) { }
            }
        }
        for (a = 0; a < seq.audioTracks.numTracks; a++) {
            var aTrack = seq.audioTracks[a];
            for (c = 0; c < aTrack.clips.numItems; c++) {
                var aClip = aTrack.clips[c];
                if (aClip.name && aClip.name.indexOf("SAFEAD_") > -1) continue;
                try { clipEnd = aClip.end.seconds; if (clipEnd > maxEnd) maxEnd = clipEnd; } catch (e) { }
            }
        }
        return maxEnd;
    },

    // Normalizes a file path: converts file:/// URIs to plain OS paths and decodes %20 etc.
    _normalizePathN: function (p) {
        if (!p) return p;
        if (p.indexOf('file:///') === 0 || p.indexOf('file://') === 0) {
            p = p.replace(/^file:\/\/\//i, '').replace(/\//g, '\\');
            try { p = decodeURIComponent(p); } catch (e) { }
        }
        return p;
    },

    _randomFileN: function (folderPath, ext) {
        try {
            var folder = new Folder(folderPath);
            if (!folder.exists) return null;
            var files = folder.getFiles("*." + ext);
            if (!files || files.length === 0) return null;
            var idx = Math.floor(Math.random() * files.length);
            return files[idx].fsName;
        } catch (e) { return null; }
    },

    getDuracaoTimeline: function () {
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "0";
            return String($._nexxt._calcDurOriginalN(seq));
        } catch (e) { return "0"; }
    },

    montarFundoLoop: function (paramsJSON) {
        try {
            var p = JSON.parse(paramsJSON);
            if (typeof p === "string") p = JSON.parse(p);

            var seq = app.project.activeSequence;
            if (!seq) return "ERRO|Sem sequência ativa";

            var segundosFinais = parseFloat(p.segundosFinais);
            if (!segundosFinais || segundosFinais <= 0) return "ERRO|Duração alvo inválida";

            var pluginPath = p.pluginPath || "";
            var sep = (pluginPath.indexOf("/") >= 0) ? "/" : "\\";
            var assetsBase = pluginPath + sep + "vari-assets" + sep;

            // Flags condicionais (default: true para compatibilidade com chamadas antigas)
            var useOverlay = (p.useOverlay !== undefined) ? !!p.useOverlay : true;
            var useFinal = (p.useFinal !== undefined) ? !!p.useFinal : true;
            var useNoise = (p.useNoise !== undefined) ? !!p.useNoise : true;

            // Helper: resolve any asset reference to a full OS path 
            function resolveAsset(rawVal, folder) {
                if (!rawVal) return null;
                var v = rawVal;
                if (v.indexOf('file:///') === 0 || v.indexOf('file://') === 0) {
                    v = v.replace(/^file:\/\/\//i, '').replace(/\//g, '\\');
                    try { v = decodeURIComponent(v); } catch (e) { }
                }
                if (/^\/[A-Za-z]:/.test(v)) v = v.slice(1);
                if (v.indexOf('\\') < 0 && v.indexOf('/') < 0) {
                    var folderSep = (folder.indexOf('/') >= 0) ? '/' : '\\';
                    if (folder[folder.length - 1] !== folderSep) folder += folderSep;
                    v = folder + v;
                }
                return v;
            }

            // Resolve asset paths
            var catPathOverlay = assetsBase + "backgrounds" + sep;
            var catFinal = p.finalCategoria || p.categoria || "beachs";
            var catPathFinal = assetsBase + catFinal + sep;
            var noisePath = assetsBase + "noises" + sep;

            var bgFile = useOverlay ? (resolveAsset(p.bgArquivo, catPathOverlay) || $._nexxt._randomFileN(catPathOverlay, "mp4")) : null;
            var finalFile = useFinal ? (resolveAsset(p.finalArquivo, catPathFinal) || $._nexxt._randomFileN(catPathFinal, "mp4")) : null;
            var noiseFile = useNoise ? (resolveAsset(p.noiseArquivo, noisePath) || $._nexxt._randomFileN(noisePath, "mp3")) : null;

            if (useOverlay && !bgFile) return "ERRO|Nenhum vídeo (overlay) encontrado em: " + catPathOverlay + "  Baixe o pack primeiro.";
            if (useFinal && !finalFile) return "ERRO|Nenhum vídeo (final) encontrado em: " + catPathFinal + "  Baixe o pack primeiro.";
            if (useNoise && !noiseFile) return "ERRO|Nenhum noise encontrado em: " + noisePath + "  Baixe o pack Noises.";

            var durOriginal = $._nexxt._calcDurOriginalN(seq);
            if (durOriginal <= 0) return "ERRO|Sem conteúdo na timeline. Adicione vídeos antes.";
            if (segundosFinais <= durOriginal) {
                var mmO = Math.floor(durOriginal / 60), ssO = Math.round(durOriginal % 60);
                return "ERRO|Duração alvo deve ser maior que o vídeo original (" + mmO + ":" + (ssO < 10 ? "0" : "") + ssO + ").";
            }

            // Calcular quantas tracks vazias precisamos 
            var needVideos = (useOverlay ? 1 : 0) + (useFinal ? 2 : 0);
            var needAudios = (useNoise ? 1 : 0) + (useFinal ? 1 : 0);

            // Bug 1+4 Fix: Scan de cima pra baixo (indice alto = track visual mais alta)
            // Assim Overlay vai pra V3, FinalBg pra V4, FinalFg pra V5 (acima do video original)
            var emptyVideos = [];
            for (var v = seq.videoTracks.numTracks - 1; v >= 0; v--) {
                if (seq.videoTracks[v].clips.numItems === 0) {
                    emptyVideos.unshift(seq.videoTracks[v]);
                    if (emptyVideos.length === needVideos) break;
                }
            }

            // Audio: mesma logica, scan de cima pra baixo para pegar A2, A3 (logo abaixo de A1)
            var emptyAudios = [];
            for (var a = seq.audioTracks.numTracks - 1; a >= 0; a--) {
                if (seq.audioTracks[a].clips.numItems === 0) {
                    emptyAudios.unshift(seq.audioTracks[a]);
                    if (emptyAudios.length === needAudios) break;
                }
            }

            if (emptyVideos.length < needVideos || emptyAudios.length < needAudios) {
                return "ERRO|Adicione pelo menos " + needVideos + " tracks de vídeo e " + needAudios + " de áudio vazias na timeline.";
            }

            var root = app.project.rootItem;
            var binFundo = $._nexxt._findInProjectN("Safe Ad Nexxt", root);
            if (!binFundo) binFundo = root.createBin("Safe Ad Nexxt");

            var nomeOverlay = useOverlay ? "SAFEAD_OV_" + decodeURI(new File(bgFile).name).replace(/\./g, "_") : null;
            var nomeFinal = useFinal ? "SAFEAD_FINAL_" + decodeURI(new File(finalFile).name).replace(/\./g, "_") : null;
            var nomeNoise = useNoise ? "SAFEAD_NOISE_" + decodeURI(new File(noiseFile).name).replace(/\./g, "_") : null;

            if (useOverlay && !$._nexxt._importarAssetN(nomeOverlay, bgFile, binFundo)) return "ERRO|Falha ao importar overlay.";
            if (useFinal && !$._nexxt._importarAssetN(nomeFinal, finalFile, binFundo)) return "ERRO|Falha ao importar vídeo final.";
            if (useNoise && !$._nexxt._importarAssetN(nomeNoise, noiseFile, binFundo)) return "ERRO|Falha ao importar noise.";

            var itemOverlay = useOverlay ? $._nexxt._findInProjectN(nomeOverlay, binFundo) : null;
            var itemFinal = useFinal ? $._nexxt._findInProjectN(nomeFinal, binFundo) : null;
            var itemNoise = useNoise ? $._nexxt._findInProjectN(nomeNoise, binFundo) : null;

            if (useOverlay && !itemOverlay) return "ERRO|Overlay não achado após importar.";
            if (useFinal && !itemFinal) return "ERRO|Vídeo final não achado após importar.";
            if (useNoise && !itemNoise) return "ERRO|Noise não achado após importar.";

            var vTrackOverlay = useOverlay ? emptyVideos[0] : null;
            var vTrackFinalBg = useFinal ? (useOverlay ? emptyVideos[1] : emptyVideos[0]) : null;
            var vTrackFinalFg = useFinal ? (useOverlay ? emptyVideos[2] : emptyVideos[1]) : null;
            var aTrackNoise = useNoise ? emptyAudios[0] : null;

            var overlayOpacity = (p.opacidade !== undefined && p.opacidade !== null) ? parseFloat(p.opacidade) : 10;
            var noiseVolumeDb = (p.noiseVolume !== undefined && p.noiseVolume !== null) ? parseFloat(p.noiseVolume) : 0;
            var finalVolumeDb = (p.finalVolume !== undefined && p.finalVolume !== null) ? parseFloat(p.finalVolume) : 0;

            // Calcular escalas dinâmicas 
            var seqW = parseInt(seq.frameSizeHorizontal);
            var seqH = parseInt(seq.frameSizeVertical);
            var fillScale = 156; // fallback seguro
            var fitScale = 100;  // fallback seguro

            // Ler dimensões do clipe para fillScale/fitScale (lógica original inalterada)
            var dimsItem = useFinal ? $._nexxt._getClipDimsN(itemFinal) : (useOverlay ? $._nexxt._getClipDimsN(itemOverlay) : null);
            if (!dimsItem && useOverlay) dimsItem = $._nexxt._getClipDimsN(itemOverlay);
            if (dimsItem && dimsItem.w > 0 && dimsItem.h > 0) {
                fillScale = $._nexxt._calcFillScaleN(dimsItem.w, dimsItem.h, seqW, seqH);
                fitScale = $._nexxt._calcFitScaleN(dimsItem.w, dimsItem.h, seqW, seqH);
            } else {
                fillScale = Math.ceil(Math.max(seqW, seqH) / Math.min(seqW, seqH) * 100);
                fitScale = Math.ceil(Math.min(seqW, seqH) / Math.max(seqW, seqH) * 100);
            }

            // Escala EXCLUSIVA da overlay calculada com as dimensões do próprio overlay
            // Isso foi pedido: a overlay sempre deve cobrir 100% da tela independente do formato
            var overlayFillScale = fillScale; // herda como base se overlay sem dims
            if (useOverlay && seqW > 0 && seqH > 0) {
                var dimsOv = $._nexxt._getClipDimsN(itemOverlay);
                if (dimsOv && dimsOv.w > 0 && dimsOv.h > 0) {
                    overlayFillScale = $._nexxt._calcFillScaleN(dimsOv.w, dimsOv.h, seqW, seqH);
                } else {
                    // Sem dims: margem conservadora para garantir cobertura
                    overlayFillScale = Math.ceil(Math.max(seqW, seqH) / Math.min(seqW, seqH) * 150);
                }
            }

            // Helper: achar indice de uma track na sequencia
            function getVTrackIdx(seq, track) {
                for (var i = 0; i < seq.videoTracks.numTracks; i++) {
                    if (seq.videoTracks[i].id === track.id) return i;
                }
                return 0;
            }

            // ETAPA 1: Overlay (vídeo puro) + sweep áudio vazado 
            if (useOverlay) {
                var idxOverlay = getVTrackIdx(seq, vTrackOverlay);
                $._nexxt._loopVideoN(itemOverlay, vTrackOverlay, idxOverlay, 0, durOriginal, overlayOpacity, overlayFillScale, overlayFillScale, "fill", 0);
                $._nexxt._sweepLeakedAudioN(seq, "SAFEAD_OV_");
            }

            // ETAPA 2: Final Bg (vídeo + blur, sem áudio) + sweep áudio vazado 
            if (useFinal) {
                var idxFinalBg = getVTrackIdx(seq, vTrackFinalBg);
                $._nexxt._loopVideoN(itemFinal, vTrackFinalBg, idxFinalBg, durOriginal, segundosFinais, null, fillScale, fitScale, "fill", 100);
                $._nexxt._sweepLeakedAudioN(seq, "SAFEAD_FINAL_");
            }

            // ETAPA 3: Final Fg (vídeo fit, áudio auto-linkado pelo Premiere) 
            if (useFinal) {
                var idxFinalFg = getVTrackIdx(seq, vTrackFinalFg);
                $._nexxt._loopVideoN(itemFinal, vTrackFinalFg, idxFinalFg, durOriginal, segundosFinais, null, fillScale, fitScale, "fit", 0);
                // O Premiere auto-cria áudio linkado vamos encontrar onde caiu e ajustar volume
                for (var fa = 0; fa < seq.audioTracks.numTracks; fa++) {
                    var faTk = seq.audioTracks[fa];
                    for (var fc = 0; fc < faTk.clips.numItems; fc++) {
                        try {
                            var faClip = faTk.clips[fc];
                            if (faClip && faClip.name && faClip.name.toUpperCase().indexOf("SAFEAD_FINAL_") > -1) {
                                $._nexxt._setVolumeN(faClip, finalVolumeDb);
                            }
                        } catch (e) { }
                    }
                }
            }

            // ETAPA 4: Noise (áudio puro, inserido POR ÚLTIMO para não ser sobrescrito) 
            if (useNoise) {
                $._nexxt._loopAudioN(itemNoise, aTrackNoise, 0, durOriginal, noiseVolumeDb);
            }

            // ETAPA 4b: Trim Final  cortar qualquer clip que ultrapasse os limites 
            // O áudio auto-linkado do Final Fg pode ter duracão maior que segundosFinais
            var limiteSecs = segundosFinais;
            for (var trimV = 0; trimV < seq.videoTracks.numTracks; trimV++) {
                var trkV = seq.videoTracks[trimV];
                for (var tci = trkV.clips.numItems - 1; tci >= 0; tci--) {
                    try {
                        var tcl = trkV.clips[tci];
                        if (tcl && tcl.name && tcl.name.indexOf("SAFEAD_") > -1) {
                            if (tcl.end.seconds > limiteSecs + 0.1) {
                                tcl.end = $._nexxt._makeTimeN(limiteSecs);
                            }
                        }
                    } catch (e) { }
                }
            }
            for (var trimA = 0; trimA < seq.audioTracks.numTracks; trimA++) {
                var trkA = seq.audioTracks[trimA];
                for (var tciA = trkA.clips.numItems - 1; tciA >= 0; tciA--) {
                    try {
                        var tclA = trkA.clips[tciA];
                        if (tclA && tclA.name && tclA.name.indexOf("SAFEAD_") > -1) {
                            // Overlay e Noise param em durOriginal, Final param em segundosFinais
                            var limiteClip = limiteSecs;
                            var nmUp = tclA.name.toUpperCase();
                            if (nmUp.indexOf("SAFEAD_OV_") > -1 || nmUp.indexOf("SAFEAD_NOISE_") > -1) {
                                limiteClip = durOriginal;
                            }
                            if (tclA.end.seconds > limiteClip + 0.1) {
                                tclA.end = $._nexxt._makeTimeN(limiteClip);
                            }
                        }
                    } catch (e) { }
                }
            }

            // ETAPA 4c: Force Volume Sweep  garantir que NENHUM audio fique em -999 
            // O setValue funciona (confirmado por diagnóstico), mas só pega o ÚLTIMO clip do loop.
            // Aqui varremos TODOS os áudios e forçamos volume em qualquer clip com Level < -100
            $.sleep(200);
            for (var fvA = 0; fvA < seq.audioTracks.numTracks; fvA++) {
                var fvTk = seq.audioTracks[fvA];
                for (var fvC = 0; fvC < fvTk.clips.numItems; fvC++) {
                    try {
                        var fvClip = fvTk.clips[fvC];
                        if (!fvClip) continue;

                        // Verificar o Level atual do clip
                        var currentLevel = 0;
                        try {
                            var fvComps = fvClip.components;
                            for (var fvc = 0; fvc < fvComps.numItems; fvc++) {
                                if (fvComps[fvc].displayName === "Volume") {
                                    var fvProps = fvComps[fvc].properties;
                                    for (var fvp = 0; fvp < fvProps.numItems; fvp++) {
                                        if (fvProps[fvp].displayName === "Level") {
                                            currentLevel = fvProps[fvp].getValue();
                                            break;
                                        }
                                    }
                                    break;
                                }
                            }
                        } catch (e) { }

                        // Se o Level está abaixo de -100 (sinalizando -999/-inf), forçar volume correto
                        if (currentLevel < -100) {
                            var fvName = (fvClip.name || "").toUpperCase();
                            if (fvName.indexOf("SAFEAD_NOISE_") > -1) {
                                $._nexxt._setVolumeN(fvClip, noiseVolumeDb);
                            } else {
                                // Qualquer outro audio com -999: tratar como audio do Final
                                $._nexxt._setVolumeN(fvClip, finalVolumeDb);
                            }
                        }
                    } catch (e) { }
                }
            }

            return "SUCESSO|Sucesso";
        } catch (e) { return "ERRO|" + e.toString(); }
    },


    removerFundoLoop: function () {
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "ERRO|Sem sequ¬ncia ativa";
            var removidos = 0;
            for (var v = 0; v < seq.videoTracks.numTracks; v++) {
                var vT = seq.videoTracks[v];
                for (var ci = vT.clips.numItems - 1; ci >= 0; ci--) {
                    var cl = vT.clips[ci];
                    if (cl && cl.name && cl.name.indexOf("SAFEAD_") > -1) {
                        try { cl.remove(false, true); removidos++; } catch (e) { }
                    }
                }
            }
            for (var a = 0; a < seq.audioTracks.numTracks; a++) {
                var aT = seq.audioTracks[a];
                for (var ci2 = aT.clips.numItems - 1; ci2 >= 0; ci2--) {
                    var cl2 = aT.clips[ci2];
                    if (cl2 && cl2.name && cl2.name.indexOf("SAFEAD_") > -1) {
                        try { cl2.remove(false, true); removidos++; } catch (e) { }
                    }
                }
            }
            return "SUCESSO|" + removidos;
        } catch (e) { return "ERRO|" + e.toString(); }
    },

    // AI Director: Extrair Áudio Selecionado
    obterCaminhoAudioSelecionadoIA: function () {
        try {
            var seq = app.project.activeSequence;
            if (!seq) return "ERRO|Nenhuma sequência ativa.";

            var selectedClip = null;

            // Procura primeiro em trilhas de áudio, depois em vídeo
            for (var i = 0; i < seq.audioTracks.numTracks; i++) {
                var track = seq.audioTracks[i];
                for (var j = 0; j < track.clips.numItems; j++) {
                    if (track.clips[j].isSelected()) {
                        selectedClip = track.clips[j];
                        break;
                    }
                }
                if (selectedClip) break;
            }
            if (!selectedClip) {
                for (var iv = 0; iv < seq.videoTracks.numTracks; iv++) {
                    var vtrack = seq.videoTracks[iv];
                    for (var jv = 0; jv < vtrack.clips.numItems; jv++) {
                        if (vtrack.clips[jv].isSelected()) {
                            selectedClip = vtrack.clips[jv];
                            break;
                        }
                    }
                    if (selectedClip) break;
                }
            }

            if (!selectedClip) return "ERRO|Nenhum clipe selecionado na timeline.";

            // Obtém arquivo raiz
            var projItem = selectedClip.projectItem;
            if (!projItem) return "ERRO|Clipe gerado no Premiere (sem arquivo físico associado).";

            var mediaPath = projItem.getMediaPath();
            if (!mediaPath || mediaPath === "") {
                return "ERRO|Arquivo de média não encontrado.";
            }

            var inPoint = selectedClip.inPoint.seconds;
            var outPoint = selectedClip.outPoint.seconds;
            var clipDuration = selectedClip.duration.seconds;
            var clipStart = selectedClip.start.seconds;

            // Criar e retornar string JSON pura (ExtendScript seguro)
            var jsonRes = "{";
            jsonRes += "\"status\":\"SUCESSO\",";
            jsonRes += "\"mediaPath\":\"" + mediaPath.replace(/\\/g, "\\\\") + "\",";
            jsonRes += "\"inPoint\":" + inPoint + ",";
            jsonRes += "\"outPoint\":" + outPoint + ",";
            jsonRes += "\"duration\":" + clipDuration + ",";
            jsonRes += "\"clipStart\":" + clipStart;
            jsonRes += "}";

            return jsonRes;

        } catch (e) {
            return "ERRO|" + e.toString();
        }
    },

    // VSL Product Detector: Insert markers on the active sequence timeline (same as pressing M)
    inserirMarcadoresProdutos: function (base64Data) {
        if (!app.project) return "ERRO|sem projeto";
        var seq = app.project.activeSequence;
        if (!seq) return "ERRO|sem sequencia ativa";

        // Local base64 decoder (same impl as gerarLegendasMogrt)
        var decodeBase64 = function (s) {
            var e = {}, i, b = 0, c, x, l = 0, a, r = '', w = String.fromCharCode, L = s.length;
            var A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            for (i = 0; i < 64; i++) e[A.charAt(i)] = i;
            for (x = 0; x < L; x++) {
                c = e[s.charAt(x)]; b = (b << 6) + c; l += 6;
                while (l >= 8) { ((a = (b >>> (l -= 8)) & 0xff) || (x < (L - 2))) && (r += w(a)); }
            }
            return r;
        };

        // Diagnostic: report API availability
        var apiInfo = seq.markers ? (typeof seq.markers.createMarker) : 'NO_MARKERS';

        var jsonStr;
        try { jsonStr = decodeURIComponent(escape(decodeBase64(base64Data))); }
        catch (e) { return "ERRO|decode: " + e.toString(); }

        var data;
        try { data = eval("(" + jsonStr + ")"); }
        catch (e) { return "ERRO|JSON: " + e.toString(); }

        var detections = data.detections || [];
        var count = 0;
        var lastErr = '';

        for (var i = 0; i < detections.length; i++) {
            var d = detections[i];
            try {
                // Move playhead to the detection time, then insert marker at current position
                var t = new Time();
                t.seconds = parseFloat(d.time);

                // Try creating with ticks (most reliable across PPro versions)
                var marker = seq.markers.createMarker(t.seconds);
                if (marker) {
                    count++;
                    try { marker.name = d.name; } catch(e) {}
                    try { marker.comments = d.type === 'visual' ? 'Produto visivel' : 'Produto mencionado'; } catch(e) {}
                } else {
                    lastErr = 'createMarker returned null at ' + t.seconds + 's';
                }
            } catch (eM) {
                lastErr = eM.toString();
            }
        }

        if (count === 0) {
            return "ERRO|0 markers. API=" + apiInfo + ". " + lastErr;
        }
        return "SUCESSO|" + count + " marcadores inseridos";
    },

    // VSL: Move Premiere playhead to a given time in seconds
    moverPlayhead: function (seconds) {
        if (!app.project) return "ERRO: sem projeto";
        var seq = app.project.activeSequence;
        if (!seq) return "ERRO: sem sequencia ativa";
        try {
            var t = new Time();
            t.seconds = parseFloat(seconds);
            seq.setPlayerPosition(t.ticks);
            return "OK";
        } catch (e) {
            return "ERRO: " + e.toString();
        }
    }
};
#!/usr/bin/env python3
# ============================================================
# NEXXT CAPTIONS — WhisperX Word-Level Transcription
# ============================================================
# Gera timestamps precisos POR PALAVRA usando WhisperX + forced alignment.
# Output: JSON compatível com gerarLegendasMogrt() do Premiere.jsx
#
# DEPENDÊNCIAS:
#   pip install whisperx
#   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
#   (ou versão CPU: pip install torch torchvision torchaudio)
#
# USO:
#   python whisperx_transcribe.py "video.mp4" --language pt --device cpu --max-words 5 --gap 0.35
#   python whisperx_transcribe.py "audio.wav" --language en --device cuda --max-words 3
# ============================================================

import whisperx
import json
import sys
import os
import torch
import argparse


def transcrever_word_level(audio_path, language="en", device="cpu"):
    """
    Gera timestamps precisos por PALAVRA usando WhisperX + forced alignment (wav2vec2).
    Retorna dict com language, audio_file, word_count e array de words.
    """
    # Auto-detect: se pediram CUDA mas não está disponível, fallback para CPU
    if device == "cuda" and not torch.cuda.is_available():
        print("[AVISO] CUDA nao disponivel (PyTorch CPU-only). Usando CPU automaticamente.")
        device = "cpu"

    print(f"[1/4] Carregando modelo Whisper large-v2...")
    model = whisperx.load_model(
        "large-v2",
        device=device,
        compute_type="int8",        # int8 = mais rápido, mínima perda de qualidade
        language=language
    )

    print(f"[2/4] Transcrevendo: {audio_path}")
    audio = whisperx.load_audio(audio_path)
    result = model.transcribe(
        audio,
        batch_size=16,              # reduzir para 8 se memória insuficiente
        language=language
    )

    print(f"[3/4] Executando forced alignment (wav2vec2)...")
    model_a, metadata = whisperx.load_align_model(
        language_code=result["language"],
        device=device
    )
    result_aligned = whisperx.align(
        result["segments"],
        model_a,
        metadata,
        audio,
        device,
        return_char_alignments=False
    )

    print(f"[4/4] Extraindo timestamps por palavra...")
    palavras = []
    for segment in result_aligned["segments"]:
        if "words" not in segment:
            continue
        for w in segment["words"]:
            if "start" not in w or "end" not in w:
                continue
            palavras.append({
                "word":  w["word"].strip(),
                "start": round(w["start"], 4),
                "end":   round(w["end"], 4),
                "score": round(w.get("score", 1.0), 4)
            })

    return {
        "language": result["language"],
        "audio_file": os.path.basename(audio_path),
        "word_count": len(palavras),
        "words": palavras
    }


def agrupar_em_legendas(palavras, max_palavras=3, gap_minimo=0.35, max_chars=42):
    """
    Agrupa palavras individuais em blocos de legenda.
    Cada bloco contém 'words' com timestamps individuais para segmentacao unificada.

    Regras (replicando o Premiere):
    1. Maximo de N palavras por legenda
    2. Maximo de max_chars caracteres por legenda
    3. Se silencio > gap_minimo segundos entre palavras, quebrar legenda
    4. Quebra em pontuacao forte (. ! ?)
    5. Cada legenda comeca quando a 1a palavra comeca e termina quando a ultima termina
    """
    if not palavras:
        return []

    legendas = []
    grupo_atual = []

    for i, palavra in enumerate(palavras):
        if not grupo_atual:
            grupo_atual.append(palavra)
            continue

        ultima_palavra = grupo_atual[-1]
        gap = palavra["start"] - ultima_palavra["end"]
        texto_atual = " ".join([p["word"] for p in grupo_atual])
        texto_potencial = texto_atual + " " + palavra["word"]

        # Condicoes de quebra
        limite_palavras = len(grupo_atual) >= max_palavras
        limite_chars = len(texto_potencial) > max_chars
        silencio = gap > gap_minimo
        pontuacao_forte = texto_atual[-1] in ".!?" if texto_atual else False

        if limite_palavras or limite_chars or silencio or pontuacao_forte:
            legendas.append({
                "text": texto_atual,
                "start": grupo_atual[0]["start"],
                "end": grupo_atual[-1]["end"],
                "words": [{"word": p["word"], "start": p["start"], "end": p["end"]} for p in grupo_atual],
            })
            grupo_atual = [palavra]
        else:
            grupo_atual.append(palavra)

    if grupo_atual:
        legendas.append({
            "text": " ".join([p["word"] for p in grupo_atual]),
            "start": grupo_atual[0]["start"],
            "end": grupo_atual[-1]["end"],
            "words": [{"word": p["word"], "start": p["start"], "end": p["end"]} for p in grupo_atual],
        })

    return legendas


def main():
    parser = argparse.ArgumentParser(
        description="Nexxt Captions — WhisperX Word-Level Transcription"
    )
    parser.add_argument("audio", help="Caminho do arquivo de áudio/vídeo")
    parser.add_argument("--language", "-l", default="pt", help="Código do idioma (pt, en, es, etc.)")
    parser.add_argument("--device", "-d", default="cpu", help="Device: cpu ou cuda")
    parser.add_argument("--max-words", "-w", type=int, default=5, help="Máximo de palavras por legenda")
    parser.add_argument("--max-chars", "-c", type=int, default=42, help="Máximo de caracteres por legenda")
    parser.add_argument("--gap", "-g", type=float, default=0.35, help="Gap mínimo de silêncio para quebrar (segundos)")
    parser.add_argument("--output", "-o", default=None, help="Caminho do JSON de saída")

    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(f"ERRO: Arquivo não encontrado: {args.audio}")
        sys.exit(1)

    # Passo 1: transcrição word-level
    resultado = transcrever_word_level(
        audio_path=args.audio,
        language=args.language,
        device=args.device
    )

    print(f"[OK] {resultado['word_count']} palavras transcritas.")

    # Salvar JSON de palavras brutas
    words_path = args.audio + ".words.json"
    with open(words_path, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)
    print(f"[WORDS] Palavras brutas salvas em: {words_path}")

    # Passo 2: agrupar em blocos de legenda
    legendas = agrupar_em_legendas(
        palavras=resultado["words"],
        max_palavras=args.max_words,
        max_chars=args.max_chars,
        gap_minimo=args.gap
    )

    # Passo 3: salvar JSON para o ExtendScript consumir
    output_path = args.output or (args.audio + ".legendas.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(legendas, f, ensure_ascii=False, indent=2)

    print(f"[OK] {len(legendas)} legendas salvas em: {output_path}")

    # Preview
    print(f"\n--- Primeiras 5 legendas:")
    for leg in legendas[:5]:
        print(f"  [{leg['start']:.3f}s → {leg['end']:.3f}s] {leg['text']}")

    print(f"\n[INFO] Para usar no Premiere, copie o JSON para o plugin ou configure o caminho no captions.js")


if __name__ == "__main__":
    main()

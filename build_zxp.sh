#!/usr/bin/env bash
# =============================================
# build_zxp.sh — Nexxt Effects Bundle ZXP Builder v2
# Uso: bash build_zxp.sh
# =============================================
set -e

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_NAME="NexxtEffectsBundle"
VERSION="2.0.7"
ZXP_NAME="${PLUGIN_NAME}-${VERSION}.zxp"
OUT_DIR="$PLUGIN_DIR"
STAGING_DIR="/tmp/nexxt_zxp_staging_$$"
ZXP_OUT="$OUT_DIR/$ZXP_NAME"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Nexxt Effects Bundle — ZXP Builder v2      ║"
echo "║   Versão: $VERSION                             ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Criar staging area limpa ─────────────────────────────────────────────
echo "📦 Montando estrutura do ZXP..."
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
mkdir -p "$STAGING_DIR/CSXS"
mkdir -p "$STAGING_DIR/tools"

# Copiar arquivos principais do plugin
for f in \
  "index.html" "main.js" "captions.js" "ai_director.js" "auth.js" \
  "heygen_studio.js" "image_studio.js" "srt_review.js" "variabilizador.js" \
  "vsl_detector.js" "Premiere.jsx" "CSInterface.js" "bleep.wav" \
  "version.json" "mimetype"; do
  if [ -f "$PLUGIN_DIR/$f" ]; then
    cp "$PLUGIN_DIR/$f" "$STAGING_DIR/$f"
  else
    echo "   ⚠️  Arquivo não encontrado (ignorado): $f"
  fi
done

# Copiar CSXS/manifest.xml (apenas o arquivo correto — sem subpastas)
cp "$PLUGIN_DIR/CSXS/manifest.xml" "$STAGING_DIR/CSXS/manifest.xml"
echo "   ✓ CSXS/manifest.xml copiado"

# Copiar tools/ (binários + scripts python)
for f in "ffmpeg" "ffprobe" "yt-dlp" "requirements.txt" "whisperx_transcribe.py"; do
  if [ -f "$PLUGIN_DIR/tools/$f" ]; then
    cp "$PLUGIN_DIR/tools/$f" "$STAGING_DIR/tools/$f"
    # Garantir executável nos binários
    case "$f" in ffmpeg|ffprobe|yt-dlp) chmod +x "$STAGING_DIR/tools/$f" ;; esac
    SIZE=$(du -sh "$STAGING_DIR/tools/$f" | cut -f1)
    echo "   ✓ tools/$f ($SIZE)"
  else
    echo "   ⚠️  tools/$f não encontrado"
  fi
done

echo ""

# ── 2. Verificar conteúdo do staging ─────────────────────────────────────────
echo "📋 Estrutura do ZXP:"
find "$STAGING_DIR" | sort | sed "s|$STAGING_DIR|  |"
TOTAL=$(find "$STAGING_DIR" | wc -l | tr -d ' ')
echo "   ── Total: $TOTAL itens"
echo ""

# ── 3. Criar ZXP (= ZIP correto, sem junk) ───────────────────────────────────
echo "🔨 Empacotando ZXP..."
rm -f "$ZXP_OUT"
(cd "$STAGING_DIR" && zip -r -X "$ZXP_OUT" . \
  -x "*.DS_Store" \
  -x "__MACOSX*") > /dev/null

echo "   ✓ ZXP criado: $ZXP_NAME"
echo "   📏 Tamanho: $(du -sh "$ZXP_OUT" | cut -f1)"

# ── 4. Limpar staging ────────────────────────────────────────────────────────
rm -rf "$STAGING_DIR"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅ BUILD CONCLUÍDO COM SUCESSO!            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "📦 ZXP: $ZXP_OUT"
echo "   Instale com ZXP/UXP Installer: https://zxpinstaller.com"
echo ""

#!/usr/bin/env bash
# =====================================================================
# release_mac.sh — Nexxt Effects Bundle — Publicação Mac Automática
# Uso: bash release_mac.sh <versao> "<changelog>"
# =====================================================================
set -e

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION="${1:-2.0.8}"
CHANGELOG="${2:-Correções Mac: instalação MOGRTs, VSL detector, limpeza de bugs}"

PLUGIN_NAME="NexxtEffectsBundle"
ZXP_NAME="${PLUGIN_NAME}_v${VERSION}_mac.zxp"
STAGING_DIR="/tmp/nexxt_staging_$$"
ZXP_OUT="/tmp/${ZXP_NAME}"
CERT="$PLUGIN_DIR/nexxt-cert.p12"
CERT_PASS="nexxt2024"
ZXPSIGNCMD="/opt/homebrew/lib/node_modules/create-zxp/node_modules/zxp-provider/bin/osx/ZXPSignCmd"
GH="/opt/homebrew/bin/gh"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   NEXXT EFFECTS — RELEASE MAC v${VERSION}"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Verificar dependências ──────────────────────────────────────
echo "▶ Verificando dependências..."
for cmd in node "$GH" "$ZXPSIGNCMD"; do
    if [ ! -f "$cmd" ] && ! command -v "$cmd" &>/dev/null; then
        echo "  ✗ Não encontrado: $cmd"
        exit 1
    fi
done
if [ ! -f "$CERT" ]; then echo "  ✗ Certificado não encontrado: $CERT"; exit 1; fi
echo "  ✓ Todas as dependências OK"

# ── 2. Atualizar version.json ──────────────────────────────────────
echo "▶ Atualizando version.json para v${VERSION}..."
node -e "
var v = JSON.parse(require('fs').readFileSync('$PLUGIN_DIR/version.json','utf8'));
v.version = '$VERSION';
v.lastUpdate = '$(date +%Y-%m-%d)';
require('fs').writeFileSync('$PLUGIN_DIR/version.json', JSON.stringify(v, null, 2));
console.log('  ✓ version.json atualizado');
"

# ── 3. Atualizar manifest.xml ──────────────────────────────────────
sed -i '' "s/ExtensionBundleVersion=\"[^\"]*\"/ExtensionBundleVersion=\"$VERSION\"/" "$PLUGIN_DIR/CSXS/manifest.xml"
perl -i '' -pe 's/(Extension Id="com\.nexxt\.effects\.panel" Version=")[^"]+/$1'"$VERSION"'/' "$PLUGIN_DIR/CSXS/manifest.xml"
echo "  ✓ manifest.xml atualizado para v$VERSION"

# ── 4. Criar staging limpo ─────────────────────────────────────────
echo "▶ Criando staging limpo..."
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR/CSXS" "$STAGING_DIR/tools"

# Arquivos principais
for f in index.html main.js captions.js ai_director.js heygen_studio.js \
          image_studio.js srt_review.js variabilizador.js vsl_detector.js \
          Premiere.jsx CSInterface.js bleep.wav version.json mimetype; do
    [ -f "$PLUGIN_DIR/$f" ] && cp "$PLUGIN_DIR/$f" "$STAGING_DIR/$f"
done

cp "$PLUGIN_DIR/CSXS/manifest.xml" "$STAGING_DIR/CSXS/manifest.xml"

# Binários das tools — SEM nexxt-cert.p12, requirements.txt, whisperx_transcribe.py
for f in ffmpeg ffprobe yt-dlp; do
    if [ -f "$PLUGIN_DIR/tools/$f" ]; then
        cp "$PLUGIN_DIR/tools/$f" "$STAGING_DIR/tools/$f"
        chmod +x "$STAGING_DIR/tools/$f"
        echo "  ✓ tools/$f ($(du -sh "$STAGING_DIR/tools/$f" | cut -f1))"
    fi
done

# node_modules — apenas adm-zip (sem duplicatas)
if [ -d "$PLUGIN_DIR/node_modules/adm-zip" ]; then
    mkdir -p "$STAGING_DIR/node_modules"
    cp -r "$PLUGIN_DIR/node_modules/adm-zip" "$STAGING_DIR/node_modules/adm-zip"
    echo "  ✓ node_modules/adm-zip"
fi
[ -f "$PLUGIN_DIR/package.json" ] && cp "$PLUGIN_DIR/package.json" "$STAGING_DIR/package.json"

echo "  ✓ Staging: $(du -sh "$STAGING_DIR" | cut -f1)"

# ── 5. Encriptar código ─────────────────────────────────────────────
echo "▶ Encriptando código fonte (AES-256)..."
node "$PLUGIN_DIR/encrypt_build.js" "$STAGING_DIR"

# ── 6. Assinar e gerar ZXP ─────────────────────────────────────────
echo "▶ Assinando ZXP..."
rm -f "$ZXP_OUT"
"$ZXPSIGNCMD" -sign "$STAGING_DIR" "$ZXP_OUT" "$CERT" "$CERT_PASS" 2>&1 | grep -v "^$" || true
SIZE=$(du -sh "$ZXP_OUT" | cut -f1)
echo "  ✓ ZXP: $ZXP_NAME ($SIZE)"
rm -rf "$STAGING_DIR"

# ── 7. Publicar release no GitHub ──────────────────────────────────
echo "▶ Publicando release no GitHub (editnexxt-code/Releases)..."
TAG="v${VERSION}-mac"
$GH release create "$TAG" "$ZXP_OUT" \
    --repo editnexxt-code/Releases \
    --title "Nexxt Effects v${VERSION} (Mac)" \
    --notes "## Mac — v${VERSION}

${CHANGELOG}

### Instalação
1. Baixe o arquivo \`.zxp\` abaixo
2. Instale com o [ZXP Installer](https://zxpinstaller.com/)
3. Feche e reabra o Premiere Pro → Window → Extensions → Nexxt Effects" 2>&1

ZXP_URL="https://github.com/editnexxt-code/Releases/releases/download/${TAG}/${ZXP_NAME}"
echo "  ✓ Release criada: $TAG"

# ── 8. Atualizar version_mac.json ──────────────────────────────────
echo "▶ Atualizando version_mac.json..."
RELEASES_TMP="/tmp/nexxt_releases_$$"
rm -rf "$RELEASES_TMP"
$GH repo clone editnexxt-code/Releases "$RELEASES_TMP" -- --depth=1 2>/dev/null
cat > "$RELEASES_TMP/version_mac.json" << EOF
{
  "version": "$VERSION",
  "url": "$ZXP_URL",
  "changelog": "$CHANGELOG",
  "date": "$(date +%Y-%m-%d)"
}
EOF
cd "$RELEASES_TMP"
git add version_mac.json
git commit -m "release: Mac v$VERSION" 2>/dev/null || true
git push origin main 2>/dev/null
cd "$PLUGIN_DIR"
rm -rf "$RELEASES_TMP"
echo "  ✓ version_mac.json publicado"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✓ RELEASE MAC v${VERSION} PUBLICADA COM SUCESSO!"
echo "║  ZXP: $ZXP_URL"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

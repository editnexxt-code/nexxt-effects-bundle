#!/usr/bin/env bash
# =============================================
# build_zxp.sh — Nexxt Effects Bundle ZXP Builder
# Uso: bash build_zxp.sh
# =============================================
set -e

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_NAME="NexxtEffectsBundle"
VERSION="2.0.3"
ZXP_NAME="${PLUGIN_NAME}-${VERSION}.zxp"
OUT_DIR="$PLUGIN_DIR"
CERT_FILE="$PLUGIN_DIR/nexxt-cert.p12"
CERT_PASS="nexxt2024"
STAGING_DIR="/tmp/nexxt_zxp_staging_$$"
ZXP_OUT="$OUT_DIR/$ZXP_NAME"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Nexxt Effects Bundle — ZXP Builder         ║"
echo "║   Version: $VERSION                            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Gerar certificado auto-assinado (se não existir) ──────────────────────
if [ ! -f "$CERT_FILE" ]; then
  echo "🔐 Gerando certificado auto-assinado..."
  openssl req -x509 -newkey rsa:2048 -keyout /tmp/nexxt-key.pem \
    -out /tmp/nexxt-cert.pem -days 3650 -nodes \
    -subj "/CN=Nexxt Studio/OU=Nexxt Effects/O=Nexxt Studio/C=BR" 2>/dev/null

  openssl pkcs12 -export \
    -in /tmp/nexxt-cert.pem \
    -inkey /tmp/nexxt-key.pem \
    -out "$CERT_FILE" \
    -passout "pass:$CERT_PASS" 2>/dev/null

  rm -f /tmp/nexxt-key.pem /tmp/nexxt-cert.pem
  echo "   ✓ Certificado gerado: nexxt-cert.p12"
else
  echo "   ✓ Certificado existente encontrado: nexxt-cert.p12"
fi

# ── 2. Criar staging area ────────────────────────────────────────────────────
echo ""
echo "📦 Montando estrutura do ZXP..."
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

# Copiar todos os arquivos do plugin (exceto os que não devem ir)
rsync -a \
  --exclude='.git' \
  --exclude='.gitignore' \
  --exclude='.claude' \
  --exclude='.DS_Store' \
  --exclude='Thumbs.db' \
  --exclude='*.log' \
  --exclude='*.zxp' \
  --exclude='*.p12' \
  --exclude='*.pfx' \
  --exclude='*.key' \
  --exclude='*.pem' \
  --exclude='*.bak' \
  --exclude='build_zxp.sh' \
  --exclude='node_modules' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='dist/' \
  --exclude='build/' \
  --exclude='Nexxt_Downloads/' \
  --exclude='vari-assets/' \
  --exclude='test_*.js' \
  "$PLUGIN_DIR/" "$STAGING_DIR/"

# Garantir permissões corretas nos binários
chmod +x "$STAGING_DIR/tools/ffmpeg" 2>/dev/null || true
chmod +x "$STAGING_DIR/tools/ffprobe" 2>/dev/null || true
chmod +x "$STAGING_DIR/tools/yt-dlp" 2>/dev/null || true

echo "   ✓ Arquivos copiados para staging"

# Listar conteúdo do staging
echo ""
echo "📋 Conteúdo do ZXP:"
find "$STAGING_DIR" -not -path '*/\.*' | sort | sed "s|$STAGING_DIR/||" | head -60
TOTAL=$(find "$STAGING_DIR" | wc -l | tr -d ' ')
echo "   ── Total: $TOTAL itens"
echo ""

# ── 3. Criar ZXP (= ZIP com extensão .zxp) ──────────────────────────────────
echo "🔨 Empacotando ZXP..."
rm -f "$ZXP_OUT"
(cd "$STAGING_DIR" && zip -r -X "$ZXP_OUT" . -x "*.DS_Store" -x "__MACOSX*") > /dev/null
echo "   ✓ ZXP criado: $ZXP_NAME"
echo "   📏 Tamanho: $(du -sh "$ZXP_OUT" | cut -f1)"

# ── 4. Assinar com ZXPSignCmd (se disponível) ────────────────────────────────
echo ""
if command -v ZXPSignCmd &>/dev/null; then
  echo "✍️  Assinando com ZXPSignCmd..."
  SIGNED="$OUT_DIR/${PLUGIN_NAME}-${VERSION}-signed.zxp"
  ZXPSignCmd -sign "$STAGING_DIR" "$SIGNED" "$CERT_FILE" "$CERT_PASS"
  mv "$SIGNED" "$ZXP_OUT"
  echo "   ✓ ZXP assinado com certificado Adobe-compatível"
else
  echo "⚠️  ZXPSignCmd não encontrado — ZXP empacotado sem assinatura Adobe."
  echo "   Para instalar: https://github.com/adobe-CEP/CEP-Resources/tree/master/ZXPSignCMD"
  echo "   O arquivo pode ser instalado via ZXP/UXP Installer."
fi

# ── 5. Limpeza ────────────────────────────────────────────────────────────────
rm -rf "$STAGING_DIR"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅ BUILD CONCLUÍDO COM SUCESSO!            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "📦 Arquivo ZXP: $ZXP_OUT"
echo "   Instale com: ZXP/UXP Installer ou Anastasiy's Extension Manager"
echo ""

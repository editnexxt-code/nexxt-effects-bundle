#!/usr/bin/env bash
# =============================================
# Nexxt_Setup.sh — Instalador para macOS
# Nexxt Effects Bundle v2.0.3
# =============================================
# Uso: bash Nexxt_Setup.sh
# =============================================

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Nexxt Effects Bundle — Setup macOS         ║"
echo "║   v2.0.3                                     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── PASSO 1: PlayerDebugMode ─────────────────────────────────────────────────
echo "🔓 Configurando Adobe CEP para aceitar extensões..."
echo ""

for VER in 9 10 11 12 13; do
  defaults write com.adobe.CSXS.$VER PlayerDebugMode 1
  echo "   ✓ CSXS.$VER PlayerDebugMode = 1"
done

echo ""
echo "   ✅ Adobe CEP configurado para todos os Premiere Pro (2021–2026+)"
echo ""

# ── PASSO 2: Instalar extensão ───────────────────────────────────────────────
INSTALL_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions/Nexxt Effects Bundle"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ZXP_FILE="$SCRIPT_DIR/NexxtEffectsBundle-2.0.3.zxp"

echo "📦 Instalando extensão..."

if [ -f "$ZXP_FILE" ]; then
  # Remover instalação anterior se existir
  if [ -d "$INSTALL_DIR" ]; then
    echo "   Removendo versão anterior..."
    rm -rf "$INSTALL_DIR"
  fi

  mkdir -p "$INSTALL_DIR"
  unzip -q "$ZXP_FILE" -d "$INSTALL_DIR"

  # Garantir permissões nos binários
  chmod +x "$INSTALL_DIR/tools/ffmpeg" 2>/dev/null || true
  chmod +x "$INSTALL_DIR/tools/ffprobe" 2>/dev/null || true
  chmod +x "$INSTALL_DIR/tools/yt-dlp" 2>/dev/null || true

  # Remover quarantine dos binários
  xattr -rd com.apple.quarantine "$INSTALL_DIR/tools/" 2>/dev/null || true
  xattr -rd com.apple.quarantine "$INSTALL_DIR/" 2>/dev/null || true

  echo "   ✅ Extensão instalada em:"
  echo "      $INSTALL_DIR"
else
  echo ""
  echo "   ⚠️  Arquivo ZXP não encontrado: $ZXP_FILE"
  echo "   Baixe o NexxtEffectsBundle-2.0.3.zxp e coloque na mesma"
  echo "   pasta que este script antes de executar."
  echo ""
fi

# ── PASSO 3: Limpar cache do CEP ─────────────────────────────────────────────
echo ""
echo "🧹 Limpando cache do CEP..."
rm -rf "$HOME/Library/Caches/CSXS" 2>/dev/null || true
rm -rf "$HOME/Library/Caches/Adobe/CSXS" 2>/dev/null || true
echo "   ✅ Cache limpo"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅ INSTALAÇÃO CONCLUÍDA!                   ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "📋 Próximos passos:"
echo "   1. Abra (ou reinicie) o Adobe Premiere Pro"
echo "   2. Vá em: Window > Extensions > Nexxt Effects"
echo "   3. O painel abrirá automaticamente"
echo ""
echo "❓ Problemas? Contato: @nexxtedit no Instagram"
echo ""

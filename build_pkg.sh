#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
#  NEXXT EFFECTS — BUILD PKG INSTALLER + UPDATE ZIP  (Mac)
#  Uso: bash build_pkg.sh <VERSION> "<CHANGELOG>"
#  Ex:  bash build_pkg.sh 2.0.9 "AI Director corrigido; VSL melhorado"
# ═══════════════════════════════════════════════════════════════════════════════
set -e

VERSION="${1:?Informe a versão: bash build_pkg.sh 2.0.9 'changelog'}"
CHANGELOG="${2:-Melhorias e correções de bugs}"
PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
STAGING="/tmp/nexxt_pkg_$$"
GH_REPO="editnexxt-code/Releases"
CERT_P12="$HOME/Library/Application Support/Adobe/CEP/extensions/Nexxt Effects Bundle/tools/nexxt_cert.p12"
MOGRTS_URL="https://github.com/editnexxt-code/Releases/releases/download/v1.1.1/Nexxt_Mogrts.zip"
TODAY=$(date +%Y-%m-%d)

# Cores
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'; BOLD='\033[1m'
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
info() { echo -e "  ${YELLOW}▶${NC} $1"; }
die()  { echo -e "  ${RED}✗ ERRO:${NC} $1"; exit 1; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   NEXXT EFFECTS — BUILD PKG v${VERSION}${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── VERIFICAR DEPENDÊNCIAS ────────────────────────────────────────────────────
info "Verificando dependências..."
command -v node      >/dev/null 2>&1 || die "node não encontrado"
command -v pkgbuild  >/dev/null 2>&1 || die "pkgbuild não encontrado (nativo no Mac)"
command -v productbuild >/dev/null 2>&1 || die "productbuild não encontrado"
command -v /opt/homebrew/bin/gh >/dev/null 2>&1 || die "gh CLI não encontrado (brew install gh)"
ok "Todas as dependências OK"

# ── CRIAR STAGING ─────────────────────────────────────────────────────────────
info "Criando staging limpo..."
mkdir -p "$STAGING/plugin_root"
mkdir -p "$STAGING/mogrts"
mkdir -p "$STAGING/pkg_scripts"
mkdir -p "$STAGING/pkg_resources"
mkdir -p "$STAGING/pkg_payload/plugin"
mkdir -p "$STAGING/pkg_payload/mogrts"

# Copiar arquivos do plugin (excluir dev/build artifacts)
rsync -a \
  --exclude='.git' \
  --exclude='.claude' \
  --exclude='.editorconfig' \
  --exclude='.debug' \
  --exclude='.gitignore' \
  --exclude='*.zxp' \
  --exclude='*.pkg' \
  --exclude='vari-assets' \
  --exclude='node_modules' \
  --exclude='nexxt-cert.p12' \
  --exclude='tools/nexxt_cert.p12' \
  --exclude='tools/requirements.txt' \
  --exclude='tools/whisperx_transcribe.py' \
  --exclude='release_mac.sh' \
  --exclude='build_pkg.sh' \
  --exclude='encrypt_build.js' \
  --exclude='installer' \
  --exclude='Nexxt_Setup.sh' \
  "$PLUGIN_DIR/" "$STAGING/plugin_root/"

# Copiar node_modules apenas adm-zip
mkdir -p "$STAGING/plugin_root/node_modules"
cp -r "$PLUGIN_DIR/node_modules/adm-zip" "$STAGING/plugin_root/node_modules/"

ok "Staging base criado"

# ── ATUALIZAR VERSÃO ──────────────────────────────────────────────────────────
info "Atualizando versões para v${VERSION}..."
# version.json
node -e "
const fs = require('fs');
const f = '$STAGING/plugin_root/version.json';
const v = JSON.parse(fs.readFileSync(f,'utf8'));
v.version = '$VERSION'; v.lastUpdate = '$TODAY';
fs.writeFileSync(f, JSON.stringify(v,null,2));
"
# manifest.xml
sed -i '' "s/ExtensionBundleVersion=\"[^\"]*\"/ExtensionBundleVersion=\"$VERSION\"/g" "$STAGING/plugin_root/CSXS/manifest.xml"
sed -i '' "s/Extension Id=\"com.nexxt.effects.panel\" Version=\"[^\"]*\"/Extension Id=\"com.nexxt.effects.panel\" Version=\"$VERSION\"/g" "$STAGING/plugin_root/CSXS/manifest.xml"
ok "Versões atualizadas"

# ── ENCRIPTAR CÓDIGO ──────────────────────────────────────────────────────────
info "Encriptando código fonte (AES-256)..."
node "$PLUGIN_DIR/encrypt_build.js" "$STAGING/plugin_root"
ok "Código encriptado — .js removidos, .jsc gerados"

# ── COPIAR VARI-ASSETS ────────────────────────────────────────────────────────
info "Copiando vari-assets (~1GB, aguarde)..."
cp -r "$PLUGIN_DIR/vari-assets" "$STAGING/plugin_root/vari-assets"
ASSETS_SIZE=$(du -sh "$STAGING/plugin_root/vari-assets" 2>/dev/null | awk '{print $1}')
ok "vari-assets copiados ($ASSETS_SIZE)"

# ── BAIXAR E EXTRAIR MOGRTs ───────────────────────────────────────────────────
info "Baixando Nexxt_Mogrts.zip..."
curl -L --progress-bar "$MOGRTS_URL" -o "/tmp/nexxt_mogrts_$$.zip" || die "Falha no download dos MOGRTs"
unzip -o -q "/tmp/nexxt_mogrts_$$.zip" -d "$STAGING/mogrts/"
rm -f "/tmp/nexxt_mogrts_$$.zip"
MOGRT_COUNT=$(find "$STAGING/mogrts" -name "*.mogrt" | wc -l | tr -d ' ')
ok "MOGRTs extraídos ($MOGRT_COUNT arquivos)"

# ── MONTAR PAYLOAD DO PKG ─────────────────────────────────────────────────────
info "Montando payload do PKG..."
cp -r "$STAGING/plugin_root/." "$STAGING/pkg_payload/plugin/"
cp -r "$STAGING/mogrts/."     "$STAGING/pkg_payload/mogrts/"
PAYLOAD_SIZE=$(du -sh "$STAGING/pkg_payload" 2>/dev/null | awk '{print $1}')
ok "Payload montado ($PAYLOAD_SIZE)"

# ── CRIAR POSTINSTALL SCRIPT ──────────────────────────────────────────────────
info "Criando script postinstall..."
cat > "$STAGING/pkg_scripts/postinstall" << 'POSTINSTALL_EOF'
#!/usr/bin/env bash
set -e

# Detectar usuário logado no console
CURRENT_USER=$(stat -f '%Su' /dev/console 2>/dev/null || echo "${SUDO_USER:-$USER}")
USER_HOME=$(dscl . -read /Users/$CURRENT_USER NFSHomeDirectory 2>/dev/null | awk '{print $2}')
[ -z "$USER_HOME" ] && USER_HOME="/Users/$CURRENT_USER"

DEST="$USER_HOME/Library/Application Support/Adobe/CEP/extensions/Nexxt Effects Bundle"
MOGRT_DEST="$USER_HOME/Documents/Nexxt_Mogrts"
PAYLOAD="/private/tmp/nexxt_pkg_payload"

# Remover instalação anterior
rm -rf "$DEST"
mkdir -p "$DEST"

# Instalar plugin
cp -r "$PAYLOAD/plugin/." "$DEST/"

# Instalar MOGRTs (não sobrescreve se já existir e não estiver vazio)
mkdir -p "$MOGRT_DEST"
if [ -z "$(ls -A "$MOGRT_DEST" 2>/dev/null)" ]; then
    cp -r "$PAYLOAD/mogrts/." "$MOGRT_DEST/"
fi

# Remover quarantine (evita "app não verificada")
xattr -cr "$DEST" 2>/dev/null || true
xattr -cr "$MOGRT_DEST" 2>/dev/null || true

# Permissões dos binários
chmod +x "$DEST/tools/ffmpeg" "$DEST/tools/ffprobe" "$DEST/tools/yt-dlp" 2>/dev/null || true

# Proteger .jsc (usuário não consegue abrir)
find "$DEST" -name "*.jsc" -exec chmod 400 {} \; 2>/dev/null || true

# PlayerDebugMode (obrigatório para CEP sem assinatura Adobe)
for v in 9 10 11 12 13; do
    sudo -u "$CURRENT_USER" defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 2>/dev/null || true
done

# Limpar cache CEP (força reload)
rm -rf "$USER_HOME/Library/Caches/CSXS" 2>/dev/null || true
rm -rf "$USER_HOME/Library/Caches/Adobe/CSXS" 2>/dev/null || true

# Ajustar ownership para o usuário
chown -R "$CURRENT_USER" "$DEST" "$MOGRT_DEST" 2>/dev/null || true

# Limpar payload temporário
rm -rf "$PAYLOAD" 2>/dev/null || true

exit 0
POSTINSTALL_EOF
chmod +x "$STAGING/pkg_scripts/postinstall"
ok "Script postinstall criado"

# ── COPIAR RECURSOS DO INSTALADOR ────────────────────────────────────────────
info "Copiando recursos visuais do instalador..."
cp "$PLUGIN_DIR/installer/welcome.html"    "$STAGING/pkg_resources/"
cp "$PLUGIN_DIR/installer/conclusion.html" "$STAGING/pkg_resources/"
cp "$PLUGIN_DIR/installer/license.txt"    "$STAGING/pkg_resources/"
# Background: usar imagem da pasta se existir, senão cria placeholder
if [ -f "$PLUGIN_DIR/installer/background.png" ]; then
    cp "$PLUGIN_DIR/installer/background.png" "$STAGING/pkg_resources/"
fi
ok "Recursos visuais copiados"

# ── ATUALIZAR DISTRIBUTION.XML COM VERSÃO ────────────────────────────────────
cp "$PLUGIN_DIR/installer/distribution.xml" "$STAGING/pkg_resources/"

# ── PKGBUILD — COMPONENTE ─────────────────────────────────────────────────────
info "Rodando pkgbuild (componente)..."
pkgbuild \
  --root "$STAGING/pkg_payload" \
  --scripts "$STAGING/pkg_scripts" \
  --identifier "com.nexxt.effects.installer" \
  --version "$VERSION" \
  --install-location "/private/tmp/nexxt_pkg_payload" \
  "$STAGING/component.pkg" \
  2>&1 | grep -v "^$" || true
ok "Componente PKG criado"

# ── PRODUCTBUILD — INSTALADOR FINAL COM UI ────────────────────────────────────
info "Rodando productbuild (instalador final com UI)..."
PKG_NAME="NexxtEffects_v${VERSION}_mac.pkg"
productbuild \
  --distribution "$STAGING/pkg_resources/distribution.xml" \
  --resources "$STAGING/pkg_resources" \
  --package-path "$STAGING" \
  "$PLUGIN_DIR/$PKG_NAME" \
  2>&1 | grep -v "^$" || true

PKG_SIZE=$(du -sh "$PLUGIN_DIR/$PKG_NAME" 2>/dev/null | awk '{print $1}')
ok "PKG final: $PKG_NAME ($PKG_SIZE)"

# ── CRIAR ZIP LEVE PARA AUTO-UPDATE ──────────────────────────────────────────
info "Criando ZIP leve para auto-update (sem assets)..."
UPDATE_ZIP_NAME="NexxtUpdate_v${VERSION}_mac.zip"
UPDATE_STAGING="/tmp/nexxt_update_staging_$$"
mkdir -p "$UPDATE_STAGING"

rsync -a \
  --exclude='vari-assets' \
  --exclude='tools/ffmpeg' \
  --exclude='tools/ffprobe' \
  --exclude='tools/yt-dlp' \
  "$STAGING/plugin_root/" "$UPDATE_STAGING/"

cd "$UPDATE_STAGING"
zip -r -q "$PLUGIN_DIR/$UPDATE_ZIP_NAME" . --exclude "*.DS_Store"
cd - > /dev/null

UPDATE_SIZE=$(du -sh "$PLUGIN_DIR/$UPDATE_ZIP_NAME" 2>/dev/null | awk '{print $1}')
ok "ZIP de update: $UPDATE_ZIP_NAME ($UPDATE_SIZE)"

# ── ATUALIZAR version.json LOCAL ──────────────────────────────────────────────
info "Atualizando version.json local..."
node -e "
const fs = require('fs');
const f = '$PLUGIN_DIR/version.json';
const v = JSON.parse(fs.readFileSync(f,'utf8'));
v.version = '$VERSION'; v.lastUpdate = '$TODAY';
fs.writeFileSync(f, JSON.stringify(v,null,2));
"
sed -i '' "s/ExtensionBundleVersion=\"[^\"]*\"/ExtensionBundleVersion=\"$VERSION\"/g" "$PLUGIN_DIR/CSXS/manifest.xml"
sed -i '' "s/Extension Id=\"com.nexxt.effects.panel\" Version=\"[^\"]*\"/Extension Id=\"com.nexxt.effects.panel\" Version=\"$VERSION\"/g" "$PLUGIN_DIR/CSXS/manifest.xml"
ok "Arquivos locais atualizados"

# ── PUBLICAR NO GITHUB ────────────────────────────────────────────────────────
info "Publicando release no GitHub (${GH_REPO})..."
TAG="v${VERSION}-mac"

# Deletar release anterior com mesmo tag se existir
/opt/homebrew/bin/gh release delete "$TAG" --repo "$GH_REPO" --yes 2>/dev/null || true
/opt/homebrew/bin/gh api -X DELETE "/repos/${GH_REPO}/git/refs/tags/${TAG}" 2>/dev/null || true

RELEASE_NOTES="## Nexxt Effects v${VERSION} (Mac)

${CHANGELOG}

### Instalação (primeira vez)
1. Baixe o arquivo \`.pkg\` abaixo
2. Dê duplo clique e siga o assistente de instalação
3. Abra o Premiere Pro → Window → Extensions → Nexxt Effects

### Atualização automática
Se você já tem o plugin instalado, ele se atualiza automaticamente dentro do Premiere Pro."

/opt/homebrew/bin/gh release create "$TAG" \
  --repo "$GH_REPO" \
  --title "Nexxt Effects v${VERSION} (Mac)" \
  --notes "$RELEASE_NOTES" \
  "$PLUGIN_DIR/$PKG_NAME" \
  "$PLUGIN_DIR/$UPDATE_ZIP_NAME"

RELEASE_URL=$(/opt/homebrew/bin/gh release view "$TAG" --repo "$GH_REPO" --json url --jq '.url' 2>/dev/null)
PKG_DOWNLOAD_URL="https://github.com/${GH_REPO}/releases/download/${TAG}/${PKG_NAME}"
UPDATE_DOWNLOAD_URL="https://github.com/${GH_REPO}/releases/download/${TAG}/${UPDATE_ZIP_NAME}"
ok "Release publicada: $TAG"

# ── ATUALIZAR version_mac.json NO REPO DE RELEASES ───────────────────────────
info "Atualizando version_mac.json no repositório de releases..."
RELEASES_CLONE="/tmp/nexxt_releases_clone_$$"
/opt/homebrew/bin/gh repo clone "$GH_REPO" "$RELEASES_CLONE" -- --quiet 2>/dev/null || git clone "https://github.com/${GH_REPO}.git" "$RELEASES_CLONE" --quiet

node -e "
const fs = require('fs');
const path = '$RELEASES_CLONE/version_mac.json';

// Ler version.json completo e atualizar seção mac
let full = {};
try { full = JSON.parse(fs.readFileSync(path, 'utf8')); } catch(e) { }

// Suporte ao formato { mac: {...}, windows: {...} } e formato legado
if (full.mac) {
  full.mac = {
    version: '$VERSION',
    url: '$PKG_DOWNLOAD_URL',
    update_url: '$UPDATE_DOWNLOAD_URL',
    changelog: ['$CHANGELOG'],
    date: '$TODAY'
  };
} else {
  full = {
    version: '$VERSION',
    url: '$PKG_DOWNLOAD_URL',
    update_url: '$UPDATE_DOWNLOAD_URL',
    changelog: ['$CHANGELOG'],
    date: '$TODAY'
  };
}
fs.writeFileSync(path, JSON.stringify(full, null, 2));
console.log('version_mac.json atualizado');
"

cd "$RELEASES_CLONE"
git add version_mac.json
git commit -m "release: Mac v${VERSION} (PKG + update ZIP)" 2>/dev/null || true
git push origin main --quiet 2>/dev/null || git push --quiet 2>/dev/null
cd - > /dev/null
ok "version_mac.json publicado"

# ── LIMPAR STAGING ────────────────────────────────────────────────────────────
rm -rf "$STAGING" "$UPDATE_STAGING" "$RELEASES_CLONE" 2>/dev/null || true

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║  ✓ PKG v${VERSION} PUBLICADO COM SUCESSO!${NC}"
echo -e "${GREEN}${BOLD}║  PKG:    ${PKG_DOWNLOAD_URL}${NC}"
echo -e "${GREEN}${BOLD}║  UPDATE: ${UPDATE_DOWNLOAD_URL}${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

#!/usr/bin/env node
/**
 * encrypt_build.js — AES-256-CBC encryptor (sem dependências externas)
 * Uso: node encrypt_build.js <staging_dir>
 */
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const SALT = 'nx3ff3cts-s4lt-v2';
const KEY  = crypto.scryptSync('nexxt-effects-bundle-v2-secure-key-2024', SALT, 32);

const MODULES = [
    'main.js', 'captions.js', 'ai_director.js', 'vsl_detector.js',
    'variabilizador.js', 'srt_review.js', 'heygen_studio.js',
    'image_studio.js'
];

const stagingDir = process.argv[2];
if (!stagingDir || !fs.existsSync(stagingDir)) {
    console.error('Uso: node encrypt_build.js <staging_dir>');
    process.exit(1);
}

console.log('\n🔐 Nexxt Effects — Encriptando código fonte (AES-256)...\n');

const encryptedNames = [];

for (const mod of MODULES) {
    const src = path.join(stagingDir, mod);
    if (!fs.existsSync(src)) {
        console.log(`  ⚠  ${mod} não encontrado, ignorado`);
        continue;
    }
    const code = fs.readFileSync(src, 'utf8');
    const iv   = crypto.randomBytes(16);
    const ciph = crypto.createCipheriv('aes-256-cbc', KEY, iv);
    const enc  = Buffer.concat([iv, ciph.update(code, 'utf8'), ciph.final()]);
    const outName = mod.replace('.js', '.jsc');
    fs.writeFileSync(path.join(stagingDir, outName), enc);
    fs.unlinkSync(src);
    encryptedNames.push(outName);
    const sz = Math.round(enc.length / 1024);
    console.log(`  ✓  ${mod} → ${outName}  (${sz}KB)`);
}

// Gerar _loader.js ofuscado
const kHex = KEY.toString('hex');
const mid  = Math.floor(kHex.length / 2);
const k1   = kHex.substring(0, mid);
const k2   = kHex.substring(mid);

const loaderSrc = `(function(){
var _fs=require('fs'),_p=require('path'),_cr=require('crypto');
var _d=(function(){try{return __dirname;}catch(e){return _p.dirname(decodeURI(window.location.pathname).replace(/^\//,''));}})();
var _k=Buffer.from('${k1}'+'${k2}','hex');
var _m=${JSON.stringify(encryptedNames)};
_m.forEach(function(m){
  try{
    var _b=_fs.readFileSync(_p.join(_d,m));
    var _iv=_b.slice(0,16),_enc=_b.slice(16);
    var _dc=_cr.createDecipheriv('aes-256-cbc',_k,_iv);
    var _code=Buffer.concat([_dc.update(_enc),_dc.final()]).toString('utf8');
    new Function(_code)();
  }catch(e){console.error('[Nexxt] Erro ao carregar '+m+':',e.message);}
});
})();`;

fs.writeFileSync(path.join(stagingDir, '_loader.js'), loaderSrc);
console.log('\n  ✓  _loader.js gerado');

// Patch index.html — substitui <script src="./mod.js..."> por um único <script src="./_loader.js">
const htmlPath = path.join(stagingDir, 'index.html');
if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    // Remove todas as tags dos módulos criptografados
    html = html.replace(/<script src="\.\/(?:main|captions|heygen_studio|image_studio|srt_review|variabilizador|ai_director|vsl_detector)\.js[^"]*"><\/script>\n?/g, '');
    // Injeta o loader antes de </body>
    if (!html.includes('_loader.js')) {
        html = html.replace('</body>', '    <script src="./_loader.js"></script>\n</body>');
    }
    fs.writeFileSync(htmlPath, html);
    console.log('  ✓  index.html patchado → _loader.js');
}

console.log('\n✅ Encriptação concluída.\n');

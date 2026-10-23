#!/usr/bin/env node
// Publica um CRX assinado com o PEM original, sem copiar a chave para a distribuicao.
// Uso: npm run release -- --version 0.9.6
// Windows/PowerShell: $env:EDEN_PEM='C:\\ChavesSeguras\\extension.pem'
import { existsSync, readFileSync, writeFileSync, cpSync, mkdirSync, mkdtempSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, isAbsolute, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, createHash } from 'node:crypto';

const EXPECTED_ID = 'gnilmagafphoflioefljpklfppejmhho';
const BASE_URL = (process.env.EDEN_RELEASE_URL ?? 'https://10.33.0.7:7777').replace(/\/+$/, '');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'extension');
const OUT_DIR = join(ROOT, 'extension-distribution');
const MANIFEST = join(SOURCE, 'manifest.json');
const PEM = process.env.EDEN_PEM ? resolve(process.env.EDEN_PEM) : null;

function fail(message) { console.error(`ERRO: ${message}`); process.exit(1); }
function versionParts(version) {
  if (!/^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,3}$/.test(version)) fail(`Versao invalida: ${version}`);
  const parts = version.split('.').map(Number);
  if (parts.some(n => n > 65535)) fail('Cada parte da versao deve ser <= 65535.');
  return parts;
}
function compare(a, b) {
  const x = versionParts(a), y = versionParts(b);
  for (let i = 0; i < 4; i++) { let d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return Math.sign(d); }
  return 0;
}
function chromeBinary() {
  const candidates = [process.env.CHROME_BIN,
    process.platform === 'win32' ? join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    process.platform === 'win32' ? join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : null,
    process.platform === 'linux' ? '/usr/bin/google-chrome' : null,
    process.platform === 'linux' ? '/usr/bin/chromium' : null,
  ].filter(Boolean);
  const path = candidates.find(p => existsSync(p));
  if (!path) fail('Chrome nao encontrado. Defina CHROME_BIN com o caminho completo do navegador.');
  return path;
}
function findPreviousVersion() {
  const file = join(OUT_DIR, 'updates.xml');
  if (!existsSync(file)) return null;
  const xml = readFileSync(file, 'utf8');
  const m = xml.match(/<updatecheck\b[^>]*\bversion=["']([^"']+)["']/);
  return m?.[1] ?? null;
}
function assertSafePem(pemPath) {
  if (!pemPath || !existsSync(pemPath)) fail('Defina EDEN_PEM com o caminho do .pem ORIGINAL e existente.');
  const rel = relative(ROOT, pemPath);
  if (rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))) {
    fail('Por seguranca, guarde o PEM FORA do repositorio Git.');
  }
  const key = createPrivateKey(readFileSync(pemPath));
  const pubDer = createPublicKey(key).export({type: 'spki', format: 'der'});
  const hex = createHash('sha256').update(pubDer).digest('hex').slice(0, 32);
  const id = [...hex].map(d => String.fromCharCode(97 + parseInt(d, 16))).join('');
  if (id !== EXPECTED_ID) fail(`PEM de outra extensao! ID calculado: ${id}; esperado: ${EXPECTED_ID}`);
  return id;
}
function parseArgs() {
  const args = process.argv.slice(2);
  let version;
  for (let i=0; i<args.length; i++) {
    if (args[i]==='--version') version=args[++i];
    else fail(`Argumento nao reconhecido: ${args[i]}`);
  }
  if (!version) fail('Informe a versao: npm run release -- --version 0.9.6');
  versionParts(version);
  return version;
}
const version = parseArgs();
if (!existsSync(MANIFEST)) fail(`Manifest nao encontrado: ${MANIFEST}`);
if (!BASE_URL.startsWith('https://')) fail('Use HTTPS para URL de distribuicao do CRX.');
const id = assertSafePem(PEM);
const previousVersion = findPreviousVersion();
if (previousVersion && compare(version, previousVersion) <= 0) {
  fail(`Versao ${version} precisa ser MAIOR que a ja publicada: ${previousVersion}.`);
}
const original = JSON.parse(readFileSync(MANIFEST, 'utf8'));
if (original.manifest_version !== 3) fail('Manifest V3 esperado.');
const desired = {...original, version, update_url: `${BASE_URL}/eden-voice/updates.xml`};
const temp = mkdtempSync(join(tmpdir(), 'eden-release-'));
try {
  const stage = join(temp, 'extension');
  const ignored = new Set(['.git', '.DS_Store', '__MACOSX', 'node_modules', 'test-results', '__pycache__']);
  cpSync(SOURCE, stage, {recursive:true, filter: (p) => {
    const last = p.split(/[\\/]/).at(-1);
    if (ignored.has(last) || /\.(?:pem|key)$/i.test(last) || last === '.env') return false;
    return true;
  }});
  writeFileSync(join(stage,'manifest.json'), JSON.stringify(desired,null,2)+'\n');
  const chrome = chromeBinary();
  const args = [`--pack-extension=${stage}`, `--pack-extension-key=${PEM}`, '--no-message-box', '--no-first-run', `--user-data-dir=${join(temp,'chrome-profile')}`];
  if (process.platform === 'linux') args.push('--headless=new', '--disable-gpu');
  try { execFileSync(chrome,args,{stdio:'pipe',timeout:120000}); }
  catch (e) { if (!existsSync(join(temp, 'extension.crx'))) fail(`Chrome nao gerou o CRX: ${String(e.stderr ?? e.message).slice(0,1000)}`); }
  const built = join(temp, 'extension.crx');
  if (!existsSync(built)) fail('Chrome nao gerou o arquivo .crx.');
  const header = readFileSync(built).subarray(0,8);
  if (header.subarray(0,4).toString('ascii')!=='Cr24' || header.readUInt32LE(4)!==3) fail('O artefato produzido nao e CRX3.');
  mkdirSync(OUT_DIR,{recursive:true});
  copyFileSync(built, join(OUT_DIR, 'extension.crx'));
  writeFileSync(join(OUT_DIR, 'updates.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">\n  <app appid="${id}">\n    <updatecheck codebase="${BASE_URL}/eden-voice/extension.crx" version="${version}"/>\n  </app>\n</gupdate>\n`);
  writeFileSync(MANIFEST, JSON.stringify(desired,null,2)+'\n');
  console.log(`OK: Eden Voice ${version} | ID ${id}`);
  console.log(`CRX: ${join(OUT_DIR,'extension.crx')}`);
  console.log(`XML: ${join(OUT_DIR,'updates.xml')}`);
  console.log('PEM original preservado; nao foi copiado nem alterado.');
  console.log('Proximo passo: revisar o diff e executar git add, commit e push.');
} finally { rmSync(temp,{recursive:true,force:true}); }

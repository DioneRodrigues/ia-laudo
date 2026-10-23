# Eden Voice — Distribuicao corporativa sem DNS externo

Projeto: ia-laudo / Servidor Easypanel IP interno `10.33.0.7` / porta externa `7777`.

## 1) Copiar arquivos para o seu repositório

Coloque `scripts/` e `package.json` na raiz do repositório, e `extension-distribution/` ao lado de `extension/` e `backend/`.
Se já existir um `package.json` na raiz, preserve o arquivo e adicione somente a entrada:
`"release": "node scripts/release-extension.mjs"` em `scripts`.
Se já existir `.gitignore`, mescle as regras de proteção; não substitua um .gitignore já existente.

O CRX incluído é a versão 0.9.5 fornecida na conversa. O pacote NÃO inclui a chave de assinatura.

## 2) Configurar NPM (estação de desenvolvimento)

Requer Node.js, Chrome instalado e o arquivo `extension.pem` original em local SEGURO FORA do Git.

Windows PowerShell:
```powershell
$env:EDEN_PEM="C:\\ChavesSeguras\\extension.pem"
# Opcional se Chrome nao estiver no caminho padrao:
# $env:CHROME_BIN="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
npm run release -- --version 0.9.6
```

Linux/macOS:
```bash
export EDEN_PEM="$HOME/.secrets/eden-voice/extension.pem"
# export CHROME_BIN="/usr/bin/google-chrome"
npm run release -- --version 0.9.6
```

A rotina:
- confere o ID do PEM (gnilmagafphoflioefljpklfppejmhho);
- recusa publicar versao igual ou inferior ao XML atual;
- monta temporariamente a extensao e coloca `update_url` nela;
- gera e valida o cabecalho CRX3 com Chrome usando o PEM original;
- atualiza `extension/manifest.json`, `extension-distribution/extension.crx` e `updates.xml`;
- apaga os arquivos temporarios e nunca copia o PEM para a distribuicao.

Revisar e publicar no GitHub:
```bash
git add extension/manifest.json extension-distribution/extension.crx extension-distribution/updates.xml
git commit -m "release: eden voice 0.9.6"
git push origin main
```
Se o Easypanel tiver Auto Deploy, o servico de distribuicao fara o redeploy. Nada altera o backend nem implanta automaticamente antes do push.

## 3) Servico novo no Easypanel

- Tipo: App
- Fonte: GitHub / mesmo repo e branch do backend
- Build Path: `/extension-distribution`
- Construcao: Dockerfile; arquivo `Dockerfile`
- Advanced > Ports (nao 'Dominios'):
  - Published: `7777` (porta no SERVIDOR)
  - Target: `443` (porta no CONTAINER)
- Adicionar arquivos dos certificados em Storage > File:
  - `/etc/nginx/certs/server.crt` (certificado do servidor assinado pela CA interna)
  - `/etc/nginx/certs/server.key` (chave privada do certificado de servidor)
- Implantar o serviço; não precisa adicionar domínio no Easypanel.

OBS: Porta Docker publicada pode estar acessivel em TODAS as interfaces do servidor. Restrinja no firewall perimetral ou regras adequadas do Docker/host o acesso a 7777 apenas a sub-redes autorizadas. Nao confunda IP privado na URL com garantia de isolamento.

## 4) HTTPS diretamente no IP sem DNS

Para o Chrome confiar no host, emita certificado TLS com SAN `IP:10.33.0.7` utilizando CA interna.

Um exemplo de emissao em maquina administrativa com OpenSSL (arquivos privados nunca vao para Git):
```bash
openssl genrsa -out eden-ca.key 3072
openssl req -x509 -new -sha256 -days 3650 -key eden-ca.key -out eden-ca.crt -subj "/CN=Clinica da Mama CA interna" -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -subj "/CN=10.33.0.7"
cat > san.cnf <<'SAN'
subjectAltName = IP:10.33.0.7
basicConstraints = critical,CA:FALSE
keyUsage = critical,digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
SAN
openssl x509 -req -in server.csr -CA eden-ca.crt -CAkey eden-ca.key -CAcreateserial -out server.crt -days 365 -sha256 -extfile san.cnf
```
Distribua SOMENTE `eden-ca.crt` via GPO `Configuracao do Computador > Politicas > Configuracoes do Windows > Configuracoes de Seguranca > Politicas de Chave Publica > Autoridades de Certificacao Raiz Confiaveis`.
Guarde `eden-ca.key` offline e com acesso extremamente restrito; a chave `server.key` so deve existir nos locais de execucao seguros. O `.pem` da extensao e outra chave privada independente.

## 5) Testes Windows

```powershell
Test-NetConnection 10.33.0.7 -Port 7777
curl.exe -I https://10.33.0.7:7777/eden-voice/updates.xml
curl.exe -I https://10.33.0.7:7777/eden-voice/extension.crx
curl.exe https://10.33.0.7:7777/eden-voice/updates.xml
```
Os arquivos precisam responder 200; CRX deve ter MIME application/x-chrome-extension e XML application/xml; nao utilize `-k` para validar a confianca do Chrome.

## 6) GPO Chrome ExtensionSettings

```json
{
  "gnilmagafphoflioefljpklfppejmhho": {
    "installation_mode": "force_installed",
    "update_url": "https://10.33.0.7:7777/eden-voice/updates.xml",
    "override_update_url": true
  }
}
```

Apos aplicar GPO, verificar `chrome://policy` e `chrome://extensions` nas estacoes.

## 7) Cuidados operacionais

- Guardar PEM original fora de Git/Docker e em backup seguro. Nunca gerar novo PEM a cada versao.
- O backend ja existente em `http://10.33.0.7/` NAO muda de porta nem de container.
- O `update_url` no manifest empacotado e colocado pelo script de release; GPO usa override_update_url para manter URL de politica nas atualizacoes.
- Chrome verifica atualizacoes periodicamente: push nao significa atualizacao instantanea em todos PCs.
- Usar controle de mudancas/piloto antes do deploy em producao.

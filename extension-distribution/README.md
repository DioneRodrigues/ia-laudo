# Eden Voice — distribuição da extensão via Easypanel

Este diretório é um serviço Docker **separado** do backend da IA.

## Estrutura esperada

```text
ia-laudo/
  backend/                  # app existente do Easypanel, sem alteração
  extension/                # código da extensão (manifest.json na raiz)
  extension-distribution/   # esta pasta
    Dockerfile
    nginx.conf
    extension.crx
    updates.xml
    publish.py
```

## Antes do primeiro deploy

1. Substitua `extensoes.seu-dominio.com.br` em `updates.xml` pelo DNS real com HTTPS.
2. Garanta que `extension.crx` corresponde ao `manifest.json` da extensão. O pacote entregue está na versão **0.9.5** e foi assinado com a chave fornecida na conversa.
3. Coloque a pasta `extension-distribution` na raiz do repositório Git, ao lado de `backend` e `extension`.
4. **NUNCA** inclua `extension.pem` no repositório ou Docker.

## Easypanel: novo serviço App

- Fonte: GitHub
- Repositório: `DioneRodrigues/ia-laudo`
- Branch: `main`
- Build Path: `/extension-distribution`
- Builder: Dockerfile
- Arquivo do Dockerfile: `Dockerfile`
- Porta de destino do domínio: `80`
- Dominio do Easypanel: `https://extensoes.seu-dominio.com.br`
- Auto Deploy: habilite depois de testar o primeiro release

## URLs de teste

- `/health` deve responder `ok`.
- `/eden-voice/updates.xml` deve responder HTTP 200 `application/xml`.
- `/eden-voice/extension.crx` deve responder HTTP 200 `application/x-chrome-extension`.

Certifique-se de que os PCs de destino resolvem o DNS e confiam no certificado TLS. Não exija cookies nem login interativo para buscar o XML e o CRX. Restrinja a rota por rede, VPN ou firewall se o acesso precisar ser somente interno.

## GPO: ExtensionSettings

```json
{
  "gnilmagafphoflioefljpklfppejmhho": {
    "installation_mode": "force_installed",
    "update_url": "https://extensoes.seu-dominio.com.br/eden-voice/updates.xml",
    "override_update_url": true
  }
}
```

## Como publicar a próxima versão

1. Atualize o `version` em `extension/manifest.json` e altere o código necessário.
2. Use a **mesma** chave PEM original para preservar o ID.
3. Execute `publish.py` na sua máquina de desenvolvimento com Python 3.9+ e Chrome/Chromium instalado:

```powershell
python extension-distribution/publish.py --pem "C:\\ChavesSeguras\\extension.pem" --chrome "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --base-url "https://extensoes.seu-dominio.com.br"
```

No macOS, forneça o caminho do binário do Chrome em `--chrome`, por exemplo `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

4. Revise os arquivos gerados em `extension-distribution/`, faça commit/push da `main`.
5. Com Auto Deploy, o Easypanel recria somente o contêiner de publicação quando acionado. **Se ambos os serviços estiverem com auto deploy no mesmo webhook, um push pode disparar build de ambos.** Avalie filtros de caminho ou acionamento seletivo na sua automação GitHub.
6. O Chrome verifica periodicamente `updates.xml` e instala uma versão mais nova assinada com o mesmo PEM.

Observação: o script automatiza empacotamento e XML localmente, mas não executa sozinho em cada push. Para automatizar também a assinatura, use CI/CD com o PEM em GitHub Actions Secrets e controles de aprovação; nunca como ARG do Docker ou arquivo Git.

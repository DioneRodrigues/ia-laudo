#!/usr/bin/env python3
"""Empacota a extensao com Chrome + PEM privado LOCAL e prepara release.

Exemplo:
  python extension-distribution/publish.py --pem /caminho/seguro/extension.pem \
    --chrome /caminho/do/chrome --base-url https://extensoes.exemplo.com.br

A chave PEM nunca e copiada nem adicionada a imagem Docker.
"""
from __future__ import annotations
import argparse
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

APP_ID = "gnilmagafphoflioefljpklfppejmhho"


def main() -> None:
    parser = argparse.ArgumentParser(description="Gerar um release CRX para o Easypanel")
    parser.add_argument("--pem", required=True, type=Path, help="Caminho LOCAL do extension.pem original")
    parser.add_argument("--chrome", required=True, type=Path, help="Caminho do Chrome/Chromium para empacotamento")
    parser.add_argument("--base-url", required=True, help="Exemplo: https://extensoes.exemplo.com.br")
    args = parser.parse_args()

    distribution = Path(__file__).resolve().parent
    repo = distribution.parent
    source = repo / "extension"
    source_manifest = source / "manifest.json"
    pem = args.pem.expanduser().resolve()
    chrome = args.chrome.expanduser().resolve()
    if not source_manifest.is_file():
        parser.error(f"Nao encontrei {source_manifest}. Coloque extension-distribution/ ao lado de extension/.")
    if not pem.is_file():
        parser.error(f"Chave PEM nao encontrada: {pem}")
    if not chrome.is_file():
        parser.error(f"Executavel do Chrome nao encontrado: {chrome}")
    base_url = args.base_url.rstrip("/")
    if not base_url.startswith("https://"):
        parser.error("Use --base-url com HTTPS")

    manifest = json.loads(source_manifest.read_text(encoding="utf-8"))
    version = manifest["version"]
    # Para pasta extension/, Chrome grava extension.crx na raiz do repositorio.
    generated = repo / "extension.crx"
    if generated.exists():
        generated.unlink()  # evita confundir release novo com artefato antigo

    cmd = [str(chrome), f"--pack-extension={source}", f"--pack-extension-key={pem}", "--no-first-run"]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if not generated.is_file():
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        raise RuntimeError("Chrome nao gerou extension.crx. Feche o Chrome e confira o executavel informado.")

    # CRX3 e um contêiner com ZIP embutido; zipfile sabe ler o ZIP ao final do arquivo.
    with zipfile.ZipFile(generated) as archive:
        packed_manifest = json.loads(archive.read("manifest.json"))
    if packed_manifest["version"] != version:
        raise RuntimeError("Versao do CRX nao corresponde ao manifest.json de origem")

    target = distribution / "extension.crx"
    shutil.copy2(generated, target)

    namespace = "http://www.google.com/update2/response"
    ET.register_namespace("", namespace)
    update = ET.Element(f"{{{namespace}}}gupdate", {"protocol": "2.0"})
    app = ET.SubElement(update, f"{{{namespace}}}app", {"appid": APP_ID})
    ET.SubElement(app, f"{{{namespace}}}updatecheck", {
        "codebase": f"{base_url}/eden-voice/extension.crx",
        "version": version,
    })
    tree = ET.ElementTree(update)
    ET.indent(tree, space="  ")
    tree.write(distribution / "updates.xml", encoding="utf-8", xml_declaration=True)
    generated.unlink()  # remove copia auxiliar na raiz do repositorio
    print(f"Release gerado: versao {version}")
    print(f"CRX: {target}")
    print(f"XML: {distribution / 'updates.xml'}")
    print("Agora revise o diff, commit e push dos dois arquivos.")


if __name__ == "__main__":
    main()

from __future__ import annotations

import json
import shutil
from pathlib import Path

import markdown
import yaml

ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT / "docs" / "help"
OUT_DIR = ROOT / "frontend" / "help"
RENDERED_DIR = OUT_DIR / "rendered"
ASSETS_SRC = DOCS_DIR / "assets"
ASSETS_DST = OUT_DIR / "assets"


def parse_markdown_file(path: Path) -> tuple[dict, str]:
    raw = path.read_text(encoding="utf-8")
    if raw.startswith("---"):
        _, fm, body = raw.split("---", 2)
        meta = yaml.safe_load(fm) or {}
        return meta, body.strip()
    return {}, raw


def rewrite_asset_paths(html: str) -> str:
    return html.replace('src="assets/', 'src="/help/assets/')


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    RENDERED_DIR.mkdir(parents=True, exist_ok=True)

    if ASSETS_DST.exists():
        shutil.rmtree(ASSETS_DST)

    if ASSETS_SRC.exists():
        shutil.copytree(ASSETS_SRC, ASSETS_DST)
    else:
        ASSETS_DST.mkdir(parents=True, exist_ok=True)

    manifest = []

    for md_file in sorted(DOCS_DIR.glob("*.md")):
        meta, body = parse_markdown_file(md_file)

        slug = meta.get("slug") or md_file.stem
        section = meta.get("section", "General")
        title = meta.get("title", slug.replace("-", " ").title())
        order = int(meta.get("order", 999))

        html = markdown.markdown(
            body,
            extensions=["extra", "tables", "fenced_code", "toc"],
        )
        html = rewrite_asset_paths(html)

        out_file = RENDERED_DIR / f"{slug}.html"
        out_file.write_text(html, encoding="utf-8")

        manifest.append(
            {
                "slug": slug,
                "title": title,
                "section": section,
                "order": order,
                "htmlPath": f"/help/rendered/{slug}.html",
            }
        )

    manifest.sort(key=lambda x: (x["section"], x["order"], x["title"]))

    (OUT_DIR / "manifest.json").write_text(
        json.dumps({"docs": manifest}, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Generates public/licenses.html by running `pnpm licenses ls -P --json`."""

import html
import http.client
import json
import re
import shutil
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "public" / "licenses.html"
LICENSE_DIR = ROOT / "public" / "licenses"
SPDX_URL = "https://spdx.org/licenses/{}.html"

LICENSE_FILENAMES = [
	"license",
	"license.txt",
	"license.md",
	"licence",
	"licence.txt",
	"licence.md",
	"copying",
	"copying.txt",
]

EXTRA_PACKAGES = {
	"Apache-2.0": [
		{
			"name": "Material Design Icons",
			"versions": [],
			"homepage": "https://fonts.google.com/icons",
			"licenseUrl": "https://www.apache.org/licenses/LICENSE-2.0.txt",
		}
	]
}

LICENSE_URL_OVERRIDES = {
	"@next/env": "https://github.com/vercel/next.js/raw/refs/heads/canary/license.md",
	"@next/swc-win32-x64-msvc": "https://github.com/vercel/next.js/raw/refs/heads/canary/license.md",
	"client-only": "https://github.com/react/react/raw/refs/heads/main/LICENSE",
	"drizzle-orm": "https://www.apache.org/licenses/LICENSE-2.0.txt",
	# i am hosting these on github gist since these are in the readme not the repo root
	"pgpass": "https://gist.githubusercontent.com/vtf6259/e8e7332954dc2e2921b11c381f867b98/raw/e027994b17e520d8569d8ab11bf432eafb802db5/license.pgpass.txt",
	"pg-types": "https://gist.githubusercontent.com/vtf6259/e8e7332954dc2e2921b11c381f867b98/raw/e027994b17e520d8569d8ab11bf432eafb802db5/license.node-pg.types.txt",
}


def fetch_licenses() -> dict:
	pnpm = shutil.which("pnpm")
	if not pnpm:
		sys.exit("error: pnpm not found on PATH")
	result = subprocess.run(
		[pnpm, "licenses", "ls", "-P", "--json"],
		cwd=ROOT,
		capture_output=True,
		text=True,
		encoding="utf-8",
	)
	if result.returncode != 0:
		sys.exit(f"error: pnpm exited {result.returncode}\n{result.stderr}")
	try:
		return json.loads(result.stdout)
	except json.JSONDecodeError as exc:
		sys.exit(f"error: could not parse pnpm output: {exc}")


def spdx_ids(license_name: str) -> list[str]:
	return [p for p in re.split(r"\s+AND\s+|\s+OR\s+", license_name.strip()) if p]


def slugify(name: str) -> str:
	return re.sub(r"[^a-z0-9.]+", "-", name.lower()).strip("-")


def find_license_file(pkg_dir: Path) -> Path | None:
	try:
		entries = [entry for entry in pkg_dir.iterdir() if entry.is_file()]
	except OSError:
		return None
	by_lower = {entry.name.lower(): entry for entry in entries}
	for candidate in LICENSE_FILENAMES:
		if candidate in by_lower:
			return by_lower[candidate]
	for lower_name in sorted(by_lower):
		if lower_name.startswith("license") or lower_name.startswith("licence"):
			return by_lower[lower_name]
	return None


def download_license(url: str, destination: Path) -> bool:
	try:
		with urllib.request.urlopen(url, timeout=30) as response:
			destination.write_bytes(response.read())
	except (OSError, http.client.HTTPException):
		return False
	return True


def collect_license_texts(data: dict) -> dict[str, str]:
	if LICENSE_DIR.exists():
		shutil.rmtree(LICENSE_DIR)
	LICENSE_DIR.mkdir(parents=True, exist_ok=True)
	urls = {}
	for packages in data.values():
		for pkg in packages:
			name = pkg.get("name")
			if not name or name in urls:
				continue
			filename = f"LICENSE.{slugify(name)}.txt"
			override_url = LICENSE_URL_OVERRIDES.get(name)
			if override_url:
				if download_license(override_url, LICENSE_DIR / filename):
					urls[name] = f"/licenses/{filename}"
				continue
			for pkg_path in pkg.get("paths", []):
				source = find_license_file(Path(pkg_path))
				if source:
					shutil.copyfile(source, LICENSE_DIR / filename)
					urls[name] = f"/licenses/{filename}"
					break
			else:
				remote_url = pkg.get("licenseUrl")
				if remote_url and download_license(remote_url, LICENSE_DIR / filename):
					urls[name] = f"/licenses/{filename}"
	return urls


def render(data: dict, license_texts: dict[str, str]) -> str:
	package_count = 0
	sections = []

	for license_name in sorted(data, key=str.casefold):
		packages = sorted(data[license_name], key=lambda pkg: pkg["name"].casefold())
		package_count += len(packages)

		id_links = ", ".join(
			f'<a href="{SPDX_URL.format(html.escape(sid, quote=True))}" target="_blank" rel="noopener">{html.escape(sid)}</a>'
			for sid in spdx_ids(license_name)
		)

		items = []
		for pkg in packages:
			raw_name = pkg.get("name", "unknown")
			name = html.escape(raw_name)
			version = ", ".join(pkg.get("versions", []))
			version_html = f'<span class="version">{html.escape(version)}</span>' if version else ""
			homepage = pkg.get("homepage")
			name_html = (
				f'<a href="{html.escape(homepage, quote=True)}" target="_blank" rel="noopener">{name}</a>'
				if homepage
				else name
			)
			text_url = license_texts.get(raw_name)
			if text_url:
				text_html = f'<a class="text-link" href="{html.escape(text_url, quote=True)}">license text</a>'
			else:
				text_html = ""
			description = pkg.get("description")
			description_html = f"<small>{html.escape(description)}</small>" if description else ""
			items.append(f"<li>{name_html}{version_html}{text_html}{description_html}</li>")

		sections.append(f"<section><h2>{id_links}</h2><ul>{''.join(items)}</ul></section>")

	generated = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

	return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Licenses</title>
<style>
	:root {{ color-scheme: dark; }}
	body {{
		font-family: system-ui, sans-serif;
		max-width: 50rem;
		margin: 2rem auto;
		padding: 0 1rem;
		color: #c0caf5;
		background: #24283b;
	}}
	h1 {{
		color: #7aa2f7;
		border-bottom: 2px solid #2f3549;
		padding-bottom: .5rem;
	}}
	h2 {{ margin-top: 2rem; font-size: 1.15rem; }}
	h2 a {{ color: #bb9af7; }}
	p {{ color: #7982a9; }}
	ul {{ list-style: none; padding-left: 0; }}
	li {{
		padding: .4rem 0;
		border-bottom: 1px solid #2f3549;
		line-height: 1.5;
	}}
	small {{ display: block; color: #7982a9; }}
	.version {{
		margin-left: .5rem;
		color: #ff9e64;
		font-family: ui-monospace, monospace;
		font-size: .85em;
	}}
	.text-link {{
		margin-left: .5rem;
		font-size: .85em;
		color: #9ece6a;
	}}
	a {{ color: #7dcfff; text-decoration-color: #565f89; }}
	a:hover {{ color: #c0caf5; }}
	a:visited {{ color: #7dcfff; }}
	::selection {{ background: #7aa2f7; color: #1f2335; }}
</style>
</head>
<body>
<h1>Licenses</h1>
<p>{package_count} packages across {len(data)} license(s). Generated {generated}.</p>
{''.join(sections)}
</body>
</html>
"""


def _strip_timestamp(text: str) -> str:
	return "\n".join(
		line for line in text.splitlines() if "Generated " not in line or not line.strip().startswith("<p>")
	)


def main():
	data = fetch_licenses()
	for license_name, packages in EXTRA_PACKAGES.items():
		data.setdefault(license_name, []).extend(packages)
	license_texts = collect_license_texts(data)
	OUTPUT.parent.mkdir(parents=True, exist_ok=True)
	new_content = render(data, license_texts)
	if OUTPUT.exists():
		old_content = OUTPUT.read_text(encoding="utf-8")
		if _strip_timestamp(old_content) == _strip_timestamp(new_content):
			print(f"{OUTPUT} unchanged ({len(license_texts)} license texts)")
			return
	OUTPUT.write_text(new_content, encoding="utf-8", newline="\n")
	print(f"wrote {OUTPUT} ({len(license_texts)} license texts copied)")


if __name__ == "__main__":
	main()

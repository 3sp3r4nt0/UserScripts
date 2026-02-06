# UserScripts Collection

Eine Sammlung von Userscripts für verschiedene Plattformen und Anwendungsfälle.

**Voraussetzung:** Ein Userscript-Manager wie [Tampermonkey](https://www.tampermonkey.net/), [Violentmonkey](https://violentmonkey.github.io/) oder [Greasemonkey](https://www.greasespot.net/).

---

## Inhaltsverzeichnis

- [Eigene Scripts](#eigene-scripts)
  - [FSint](#fsint)
  - [GitHub](#github)
  - [LLM-Frontends](#llm-frontends)
  - [MediaWiki](#mediawiki)
  - [ShopWare](#shopware)
  - [YouTube](#youtube)
- [Empfohlene Community Scripts](#empfohlene-community-scripts)
- [Installation](#installation)
- [Ressourcen](#ressourcen)

---

## Eigene Scripts

### FSint

WebSocket-basierte Spider-Tools für automatisierte Web-Interaktionen.

| Script | Beschreibung |
|--------|-------------|
| [WSSpider.js](https://github.com/3sp3r4nt0/UserScripts/blob/main/FSint/WSSpider.js) | WebSocket Spider Client für Browser-Automatisierung |
| [WSServer.py](https://github.com/3sp3r4nt0/UserScripts/blob/main/FSint/WSServer.py) | Python WebSocket Server Backend |
| [WSSpiderCommander.py](https://github.com/3sp3r4nt0/UserScripts/blob/main/FSint/WSSPiderCommander.py) | Commander-Tool zur Steuerung des Spiders |

---

### GitHub

| Script | Beschreibung |
|--------|-------------|
| [GithubMalewareDetector.js](https://github.com/3sp3r4nt0/UserScripts/blob/main/Github/GithubMalewareDetector.js) | Erkennt und markiert potenzielle AI-generierte Malware-Repositories mit geteilter Blocklist |
| [GithubZipFileCheckerPoC.js](https://github.com/3sp3r4nt0/UserScripts/blob/main/Github/GithubZipFileCheckerPoC.js) | Proof-of-Concept für ZIP-Datei-Überprüfung auf GitHub |
| [ToolChacyDelete.js](https://github.com/3sp3r4nt0/UserScripts/blob/main/Github/ToolChacyDelete.js) | Hilfstool für Chacy-Löschungen |

---

### LLM-Frontends

Scripts zur Erweiterung von KI-Chat-Interfaces.

| Script | Beschreibung | Plattformen |
|--------|-------------|-------------|
| [ArenaTOC.js](https://github.com/3sp3r4nt0/UserScripts/blob/main/LLM-Frontends/ArenaTOC.js) | Inhaltsverzeichnis mit Favoriten, Kopier-Funktion und Navigation | Arena.ai, chat.lmsys.org |
| [lmfrontendPlotly.js](https://github.com/3sp3r4nt0/UserScripts/blob/main/LLM-Frontends/Plotly/lmfrontendPlotly.js) | Live-Rendering von Plotly JSON-Blöcken und System Prompt Management | ChatGPT, DeepSeek, Arena.ai |
| [PlotlyExampleTerminal.js](https://github.com/3sp3r4nt0/UserScripts/blob/main/LLM-Frontends/Plotly/PlotlyExampleTerminal.js) | Interaktive Plotly-Dokumentation mit Live-Beispielen | ChatGPT, DeepSeek, Arena.ai |

---

### MediaWiki

| Script | Beschreibung | Plattformen |
|--------|-------------|-------------|
| [MediaWikiEditor.js](https://github.com/3sp3r4nt0/UserScripts/blob/main/MediaWiki/MediaWikiEditor.js) | Editor mit HTML-Templates, Code-Highlighter, Visual Table Builder und Autocomplete | MediaWiki, Wikipedia, Fandom |
| [MediaWikiGallery.js](https://github.com/3sp3r4nt0/UserScripts/blob/main/MediaWiki/MediaWikiGallery.js) | Bild-Galerie mit Zoom, Metadaten und Keyboard-Shortcuts | MediaWiki, Wikipedia |

---

### ShopWare

| Script | Beschreibung |
|--------|-------------|
| [ShopWareFilterDork.js](https://github.com/3sp3r4nt0/UserScripts/blob/main/ShopWare/ShopWareFilterDork.js) | Multi-Tag Filter mit Dork Query Syntax, Export und Tabellen-Ansicht für Shopware 6 Admin |

---

### YouTube

| Script | Beschreibung |
|--------|-------------|
| [YoutubeDownloader.js](https://github.com/3sp3r4nt0/UserScripts/blob/main/Youtube/YoutubeDownloader.js) | Playlist Downloader mit Queue-Management (benötigt lokales Backend auf localhost) |

---

## Empfohlene Community Scripts

### Seitennavigation

| Script | Beschreibung | Link |
|--------|-------------|------|
| Pagetual | Automatisches Laden und Einfügen von paginierten Inhalten ohne Konfiguration | [Greasyfork](https://greasyfork.org/scripts/438684-pagetual) |

### GitHub Erweiterungen

| Script | Beschreibung | Link |
|--------|-------------|------|
| GitHub Userscripts | Umfangreiche Sammlung von GitHub-Erweiterungen | [GitHub](https://github.com/Mottie/GitHub-userscripts) |

### AI und LLM Tools

| Script | Beschreibung | Plattformen | Link |
|--------|-------------|-------------|------|
| Arena.ai Model Manager | Model Pinning, Reordering und persistente Auto-Auswahl | Arena.ai | [Greasyfork](https://greasyfork.org/scripts/560796) |
| UTags | Benutzerdefinierte Tags und Notizen für User, Posts und Videos | Twitter, Reddit, GitHub, YouTube u.v.m. | [Greasyfork](https://greasyfork.org/scripts/460718) |
| Ophel Atlas | Chat-Strukturierung mit Outline, Ordnern und Prompt-Bibliothek | Gemini, ChatGPT, Claude, Grok, AI Studio | [Greasyfork](https://greasyfork.org/scripts/563646) |
| TexCopyer | LaTeX-Formeln per Doppelklick kopieren | Wikipedia, ChatGPT, DeepSeek | [Greasyfork](https://greasyfork.org/scripts/499346) |
| My Prompt | Zentrale Prompt-Bibliothek mit Dynamic Prompt Mode | ChatGPT, Gemini, DeepSeek, Claude | [Greasyfork](https://greasyfork.org/scripts/549921) |
| KeepChatGPT | Auto-Refresh, Activity Preservation und Effizienz-Verbesserungen | ChatGPT | [GitHub](https://github.com/xcanwin/KeepChatGPT) |

---

## Installation

1. Userscript-Manager installieren (Tampermonkey, Violentmonkey oder Greasemonkey)
2. Auf den Script-Link klicken oder die `.js`-Datei öffnen
3. Installation im Userscript-Manager bestätigen

Für Scripts mit Python-Backend (FSint) werden zusätzlich Python 3.x und die entsprechenden Dependencies benötigt.

---

## Ressourcen

- [Greasyfork](https://greasyfork.org/) - Userscript-Repository
- [OpenUserJS](https://openuserjs.org/) - Alternative Plattform
- [Tampermonkey Dokumentation](https://www.tampermonkey.net/documentation.php)
- [Greasemonkey Wiki](https://wiki.greasespot.net/)

---

**Autor:** 3sp3r4nt0
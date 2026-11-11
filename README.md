# @toolbox/widgets

Shared widget core and portable bundle format for the Toolbox family of apps:

| App | Repo | Role |
| --- | --- | --- |
| Toolbox (desktop) | `toolbox-desktop` | Electron app — already ships the three widgets natively |
| NAS companion | `toolbox-nas` | Local NAS daemon + web UI |
| MCP server | `toolbox-mcp` | Local MCP server + ops panel |

## Widgets

- **crypto-watch** — CoinGecko market data: watchlist validation, price refresh, 1/3/6-month price series with downsampling.
- **gmail-announcer** — read-only Gmail IMAP checks (unread count, recent messages) with friendly error messages. Never stores credentials.
- **resource-monitor** — CPU, memory and disk stats plus a Windows top-process list.

## Model Farm

The `llamafarm` module powers the Model Farm feature in the CLI, MCP panel and
desktop app:

- **Machine detection** (`detectMachine`) — RAM, cores, GPU VRAM and the local
  Ollama runtime, with injected probes for testing.
- **HuggingFace catalog** (`fetchCatalog`, `fetchModelById`) — top models per
  pipeline task, measured by their real GGUF/safetensors file size.
- **Fit scoring** (`scoreModels`) — green/yellow/red against a `now` (93% of free
  RAM) or `total` budget, with GPU offload hints.
- **Numeric grading** (`gradeMachine`, `gradeSetup`) — the PC and each model rated
  0–100 on memory, GPU, compute and storage against fixed reference ceilings;
  the setup grade is weakest-link weighted and names the bottleneck.
  `gradeLetter` / `gradeLabel` map scores to A+…F and plain-language labels.
- **Ollama install** (`planOllamaInstall`, `pullIntoOllama`, Modelfile helpers) —
  a single `ollama pull hf.co/owner/repo:quant`, or a GPU-split Modelfile.

## Portable bundle format

Any app can export its widget setup and another can import it. Bundles are plain,
versioned JSON — settings only, **secrets are never included**. Widgets that need
credentials carry a `credentialsRef`: a vault key name that the importing app
resolves against its own local vault.

```json
{
  "format": "toolbox-widgets",
  "formatVersion": 1,
  "exportedAt": "2026-11-09T00:00:00.000Z",
  "widgets": [
    { "widget": "crypto-watch", "settings": { "watchlist": ["bitcoin", "ethereum"] } },
    {
      "widget": "gmail-announcer",
      "settings": { "email": "me@example.com", "notifications": true },
      "credentialsRef": "gmail/app-password"
    },
    { "widget": "resource-monitor", "settings": { "diskPath": "C:\\", "showProcesses": true } }
  ]
}
```

```ts
import { parseBundleJson, serializeBundle } from '@toolbox/widgets'

const json = serializeBundle(entries)       // export
const bundle = parseBundleJson(json)        // import (validates everything)
```

## Development

Requires Node.js 22+.

```bash
npm install    # also builds dist/ via the prepare script
npm test       # build + node:test suite
npm run typecheck
```

## License

MIT — see [LICENSE](LICENSE).

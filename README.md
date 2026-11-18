# token-radar-01-nurz2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/JACKETAGENT-ID/token-radar-01-nurz2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/JACKETAGENT-ID/token-radar-01-nurz2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A strict-value token launch radar. It ranks the pre-token protocols of the sealed DefiLlama snapshot by an implied value derived only from the snapshot's own figures — TVL, seven-day growth, time run without a token, category and chain breadth — with every component shown per row so the ranking can be audited. Protocols whose token already trades are kept apart at market value, never ranked by implied value. Each protocol carries a concrete farm plan with costs and durations.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18+, standard library only, no network. Writes board.json, data.js, dashboard/, screenshots/ and dossier.json into the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

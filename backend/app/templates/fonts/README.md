# IBM Plex Sans

Report typeface. Variable fonts, version 3.201 (2019–2026 IBM Corp.), SIL Open
Font License 1.1 — see `OFL.txt`.

| File | SHA-256 |
|---|---|
| `IBMPlexSans[wdth,wght].ttf` | `3b031aa4216174205bd8471f88a49b91f093169e9e87bd5262242bc5967fe2e3` |
| `IBMPlexSans-Italic[wdth,wght].ttf` | `0b94c5e981993764db32bf9c610ecc60cbd34ad77ec2f10ba03c64ab75124d8e` |
| `OFL.txt` | `7e6b2818edbd8f6a01ae80641cc8f16a51080d08fb4e532be3a0b6f74adb07da` |

Source: <https://github.com/google/fonts/tree/main/ofl/ibmplexsans>.

Compile with `--font-path backend/app/templates/fonts --ignore-system-fonts` so a
system copy can never stand in; the render tests assert the family resolves from
this path. The report render key hashes this set as `fontset_hash`; changing a
file changes the key.

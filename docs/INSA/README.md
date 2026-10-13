# INSA Asset Submission Package — `transport` API

Complete package for registering the Transport Management System Backend API as an
asset in the INSA "Add Asset" form (spec: `InsaForm.txt`).

## Form values

See [`asset-info.md`](asset-info.md) for copy-paste values
(Name `transport`, Type `API`, Code `TRANSPORT-API-001`, Version `1.0.0`, Asset Detail).

## Required uploads

| # | Form field | Attach | Build command (run from repo root) |
|---|---|---|---|
| 1 | Request/Response File (ZIP) | `RequestResponse.zip` | `cd docs/INSA && ./build.sh` |
| 2 | API Requirements Documentation — SRS (PDF) | `SRS.pdf` | `cd docs/INSA && ./build.sh` (mmdc SVGs + headless Chrome) |
| 3 | API System & Architecture Design — SDD (PDF) | `SDD.pdf` | `cd docs/INSA && ./build.sh` |
| 4 | API Technical Specifications — TDD/LLD (ZIP) | `API-Technical-Specifications-TDD-LLD.zip` | `cd docs/INSA && ./build.sh` |

All four files are generated in `docs/INSA/`. Only PDF/ZIP files are accepted by the
form; do not upload Markdown/HTML sources.

## Package contents

```
docs/INSA/
├── InsaForm.txt                          original form specification
├── asset-info.md                         form field values + Asset Detail text
├── README.md                             this file
├── build.sh                              regenerates PDFs and ZIPs
├── SRS.pdf                               requirements specification (upload #2)
├── SDD.pdf                               system & architecture design (upload #3)
├── RequestResponse.zip                   request/response examples + endpoint inventory (upload #1)
├── API-Technical-Specifications-TDD-LLD.zip   low-level technical design (upload #4)
└── sources/
    ├── srs.html                          SRS source (renders to SRS.pdf, 18 pages)
    ├── sdd.html                          SDD source (renders to SDD.pdf, 18 pages)
    ├── assets/                           diagram sources + rendered SVGs
    │   ├── dfd0.mmd / dfd0.svg           Level 0 context (SRS Fig 2.1, SDD Fig 3.1)
    │   ├── architecture.mmd / .svg       layered request path (SDD Fig 2.1)
    │   └── journey.mmd / .svg            journey status machine (SRS Fig 7.1, SDD Fig 4.1)
    ├── request-response/
    │   ├── README.md                     how to read the captures
    │   ├── endpoints.md                  204 routes / 285 operations, probe-validated
    │   └── examples/                     6 real captured request/response files (JSON)
    └── tdd/
        ├── README.md                     document index
        ├── endpoints.md                  same validated inventory
        ├── api-conventions.md            envelope, errors, pagination, validation
        ├── auth-and-security.md          JWT, OTP, middleware stack
        ├── data-model.md                 103 tables, core entities, relations
        ├── journey-status-machine.md     20 statuses + transition rules
        ├── socket-events.md              WebSocket protocol
        └── examples/                     shared capture set (same as request-response)
```

## Regenerating

```bash
cd docs/INSA
./build.sh          # refreshes diagram SVGs (if mermaid-cli cached),
                    # renders SRS.pdf + SDD.pdf, (re)builds both ZIPs
```

Diagram refresh needs the cached mermaid-cli
(`~/.npm/_npx/d62b6517736c1e35/node_modules/.bin/mmdc`) and falls back to the
committed SVGs when absent; edit `sources/assets/*.mmd` then re-run `build.sh`.

## Verification checklist (before submitting)

- [ ] `SRS.pdf` opens, non-empty (18 pages; `pdfinfo docs/INSA/SRS.pdf`), Title metadata `SRS — Transport Management System API v1.0.0`
- [ ] `SDD.pdf` opens, non-empty (18 pages), Title metadata `SDD — …`, 3 figures render (`pdfimages` shows none — diagrams are vector; captions `Figure 2.1/3.1/4.1` present in `pdftotext`)
- [ ] `RequestResponse.zip` contains `sources/request-response/README.md`, `endpoints.md`, `examples/01…06*.json`
- [ ] `API-Technical-Specifications-TDD-LLD.zip` contains `sources/tdd/` with `README.md`, `endpoints.md`, 5 topic docs and `examples/`
- [ ] `unzip -t` passes for both ZIPs
- [ ] All four uploads are PDF or ZIP (form rejects other formats)
- [ ] Asset Detail pasted from `asset-info.md`; code `TRANSPORT-API-001`, version `1.0.0`
- [ ] Examples contain no real secrets (tokens redacted as `<TOKEN_REDACTED>`, phones/addresses masked with `XXXXXX`)

## Notes

- Endpoint counts come from static extraction of the route definitions **plus** a live
  preflight probe against a running instance: only routes that answered (anything but
  `404`) are listed. See `sources/request-response/endpoints.md`.
- Auth labels are probe-derived: `[A]` routes returned `401 Invalid token` without a
  valid JWT; `[P]` routes are the public surface (login, OTP, health, webhooks).

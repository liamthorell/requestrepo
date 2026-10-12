> **KebabEngineers fork:** the customized Request Lab is on the `kebab-lab` branch.
> See [KEBAB.md](KEBAB.md) for features, development, verification and deployment.

# requestrepo.com

<img src="https://i.imgur.com/RIl2c1C.png" width="420">

[![CI/CD](https://github.com/adrgs/requestrepo/actions/workflows/quality-checks.yml/badge.svg)](https://github.com/adrgs/requestrepo/actions/workflows/quality-checks.yml)

A tool for analyzing HTTP, DNS, and SMTP requests with custom DNS records and response files.

## Features

- **Multi-protocol logging**: Capture HTTP, DNS, and SMTP requests in real-time
- **Custom DNS records**: Create A, AAAA, CNAME, and TXT records for your subdomain
- **Custom response files**: Define custom HTTP responses with headers and body
- **Real-time updates**: WebSocket-based live request streaming
- **Auto-TLS**: Automatic HTTPS certificates via Let's Encrypt (DNS-01 for domains, HTTP-01 for IP addresses)
- **IP Geolocation**: Country detection for incoming requests (via DB-IP)
- **Request sharing**: Share individual requests via secure tokens
- **Admin authentication**: Optional password protection for session creation
- **No external dependencies**: In-memory cache with LRU eviction (no Redis required)

## Quick Start

Run RequestRepo with Docker:

```bash
docker run -d \
  --name requestrepo \
  -p 80:80 -p 443:443 -p 53:53/udp -p 53:53/tcp -p 25:25 \
  -e JWT_SECRET=your-secret-key-min-32-chars \
  -e DOMAIN=yourdomain.com \
  -e SERVER_IP=your.server.ip \
  -e TLS_ENABLED=true \
  -e ACME_EMAIL=admin@yourdomain.com \
  -v requestrepo-certs:/app/certs \
  ghcr.io/adrgs/requestrepo:latest
```

This starts all services: HTTP (80), HTTPS (443), DNS (53), SMTP (25).

## Using Docker Compose

### Production (Pull from Registry)

```sh
git clone --depth 1 https://github.com/adrgs/requestrepo.git
cd requestrepo
cp .env.example .env  # Edit .env with your settings

# Use production image from ghcr.io
docker compose -f docker-compose.yml up -d
```

### Development (Build Locally)

```sh
git clone https://github.com/adrgs/requestrepo.git
cd requestrepo
cp .env.example .env

# Build and run locally (uses docker-compose.override.yml automatically)
docker compose up -d --build
```

This starts all services:
- HTTP server on port 80
- HTTPS server on port 443 (with auto-TLS)
- DNS server on port 53
- SMTP server on port 25

## DNS Configuration

For DNS logging to work, configure your domain's nameserver to point to your server.

### Root Domain Setup

Dedicate the entire domain to requestrepo (e.g., `requestrepo.com`):

| Record Type | Name  | Value             |
| ----------- | ----- | ----------------: |
| NS          | `@`   | `ns1.example.com` |
| A           | `ns1` | `<SERVER_IP>`     |

### Subdomain Setup

Run requestrepo on a subdomain (e.g., `rr.example.com`):

| Record Type | Name  | Value             |
| ----------- | ----- | ----------------: |
| NS          | `rr`  | `ns1.example.com` |
| A           | `ns1` | `<SERVER_IP>`     |

For subdomain setups behind a reverse proxy, ensure:
1. The `Host` header is preserved
2. WebSocket support is enabled for `/api/v2/ws`

## IP Geolocation

The Docker image includes the [DB-IP](https://db-ip.com/db/download/ip-to-country-lite) country database by default. For local development without Docker, download manually:

```sh
mkdir -p ip2country/vendor
curl -o ip2country/vendor/dbip-country-lite.csv.gz \
  "https://download.db-ip.com/free/dbip-country-lite-$(date +%Y-%m).csv.gz"
```

## Development

### Prerequisites

- [Rust](https://rustup.rs/) 1.75+
- [Bun](https://bun.sh/) 1.0+
- Docker (optional, for deployment)

### Installation

```sh
make install
```

### Starting Services

```sh
# Start backend (Rust)
make start-backend

# Start frontend (React/Vite)
make start-frontend
```

### Available Commands

| Command | Description |
|---------|-------------|
| `make install` | Install all dependencies and git hooks |
| `make start-backend` | Start Rust backend server |
| `make start-frontend` | Start React development server |
| `make build` | Build Rust backend (release mode) |
| `make test` | Run all tests |
| `make lint` | Run linters (clippy + eslint) |
| `make format` | Format code (rustfmt + prettier) |
| `make docker-build` | Build Docker image |
| `make docker-up` | Start Docker containers |
| `make docker-down` | Stop Docker containers |

## Architecture

```
requestrepo/
├── src/                 # Rust backend
│   ├── cache/          # In-memory LRU cache
│   ├── certs/          # TLS/ACME certificate management
│   ├── dns/            # DNS server
│   ├── http/           # HTTP/HTTPS server + REST API
│   ├── smtp/           # SMTP server
│   └── utils/          # JWT, config, helpers
├── frontend/           # React frontend
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── pages/      # Page components
│   │   ├── stores/     # Zustand state stores
│   │   └── hooks/      # Custom React hooks
│   └── ...
└── ip2country/         # IP geolocation database
```

## Environment Variables

See [.env.example](.env.example) for all available options.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret key for JWT signing (min 32 chars) |
| `DOMAIN` | Yes | - | Base domain (e.g., `requestrepo.com`) |
| `SERVER_IP` | Yes | - | Public IP for DNS responses |
| `SERVER_IPV6` | No | - | Public IPv6 address for AAAA responses (IPv4-only when unset) |
| `ADMIN_TOKEN` | No | - | Password for session creation |
| `TLS_ENABLED` | No | `false` | Enable HTTPS with Let's Encrypt |
| `ACME_EMAIL` | No | - | Email for Let's Encrypt (required if TLS enabled) |
| `IP_CERT_ENABLED` | No | `false` | Enable IP address TLS certificates (HTTP-01) |
| `IP_CERT_CHECK_HOURS` | No | `6` | How often to check IP cert expiry (hours) |
| `IP_CERT_RENEWAL_HOURS` | No | `96` | Renew IP cert when fewer than this many hours remain |
| `HTTP_PORT` | No | `80` | HTTP server port |
| `HTTPS_PORT` | No | `443` | HTTPS server port |
| `DNS_PORT` | No | `53` | DNS server port |
| `SMTP_PORT` | No | `25` | SMTP server port |
| `SENTRY_DSN_BACKEND` | No | - | Sentry DSN for backend error tracking |
| `SENTRY_DSN_FRONTEND` | No | - | Sentry DSN for frontend error tracking |
| `CACHE_MAX_MEMORY_PCT` | No | `0.7` | Max cache memory as % of container limit |
| `MAX_SUBDOMAIN_SIZE_MB` | No | `10` | Max storage per subdomain |
| `MAX_REQUEST_BODY_MB` | No | `10` | Max HTTP request body size |
| `SESSION_RATE_LIMIT` | No | `10` | Max sessions per IP per window |
| `SESSION_RATE_WINDOW_SECS` | No | `60` | Rate limit window in seconds |
| `DANGEROUSLY_ALLOW_SAME_ORIGIN_USER_CONTENT` | No | `false` | Enable `/r/<subdomain>` user content on the dashboard origin (for domainless/IP deployments) |
| `DANGEROUSLY_ALLOW_ALL_HEADERS` | No | `false` | Allow origin-scoped headers such as `Service-Worker-Allowed` and `Alt-Svc` on `/r/` routes |
| `RUST_LOG` | No | `info` | Log level (trace, debug, info, warn, error) |

## Interface

![requestrepo demo](https://i.imgur.com/pzn8O18.png)

## Security Acknowledgments

Thank you to the following researchers for responsibly disclosing security issues:

- [debsec](https://x.com/deb_security) - LFI via improper path handling
- [JaGoTu](https://infosec.exchange/@jagotu) - DoS via unrestricted file upload
- [m0z](https://x.com/LooseSecurity) - LFI via session subdomain
- [Jorian](https://x.com/J0R1AN) - Session hijacking via Service-Worker-Allowed header
- [aisafe.io](https://aisafe.io) - Insecure JWT_SECRET default allowing token forgery

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

If you find this project useful, please consider giving it a star on GitHub.

### DNS rebinding profiles (KebabReq)

Open **DNS → Rebinding** to create a profile from a preset. A profile can contain
up to 128 ordered phases / address values, and a session can have 16 profiles.
Use bulk entry to turn newline/comma-separated IPs into individual phases or one
answer set; reorder phases with the arrow buttons. A, AAAA and CNAME are supported.

- **Switch after N queries:** each phase serves its configured number of qualifying
  queries, then advances; hold the last phase or repeat the complete sequence.
- **Switch after a delay:** each phase has a duration, starting at the first matching
  query. Hold the final phase or repeat the duration cycle.
- **Round robin:** rotate through every phase; phase query counts control dwell time.
- **Weighted random:** select across all phases using the configured weights.
- **Multiple addresses:** return the deduplicated address list in one answer with a
  common TTL. The resolver/client can reorder addresses or choose any destination.
- **Manual:** directly select any applied phase in the Live profile controls.

For example, three phases containing `79.76.62.80`, `127.0.0.1`, and `10.0.0.1`
with count 1 and hold behavior return those addresses for queries 1, 2, and 3;
subsequent queries keep returning `10.0.0.1`. Any phase can also contain several
addresses returned together. TTLs and negative-answer TTLs accept 0–86400 seconds.

`@` matches the session hostname; `*` matches names beneath it, excluding `@`.
Exact enabled profiles win over wildcards and override matching static address
records. CNAME profiles cannot overlap enabled address profiles. Certificate
challenge names and unrelated record types bypass rebinding.

Counter scope is per hostname/query type by default, optionally per resolver IP,
or shared across a profile/query type. A and AAAA counters are independent.
The resolver IP is not the browser's IP. Qualifying authoritative responses include
retransmissions; truncated UDP replies do not advance counters or start clocks,
so a TCP retry can receive the same phase. Inspect actual replies and phase metadata
in the capture history. Capacity is limited to 1024 state keys/session and 65536
server-wide, additionally subject to existing memory quotas; reset frees state keys.

Use **Simulate answer** for a draft-only preview: query index 0 means the first
answer, and simulations never affect live counters. **Save profiles** applies the
configuration and resets counters/clocks. **Reset profile** retains the configuration.
Generation conflicts preserve your draft; reload applied settings before retrying.
Use **Export JSON / Import JSON** to keep settings: captures, configuration and
runtime state remain in memory and disappear on restart. Exports contain no tokens.

For a profile hostname `rebind.SESSION.req.havet.dev`, query the authoritative DNS
server directly to inspect TTLs and answers:

```sh
dig @ns1.havet.dev rebind.SESSION.req.havet.dev A +noall +answer
dig @ns1.havet.dev rebind.SESSION.req.havet.dev A +tcp +noall +answer
```

Low TTLs do not clear browser/resolver caches or guarantee another lookup. DNS
rebinding protection, connection reuse, HTTPS certificates, and browser network
restrictions can still affect the experiment.

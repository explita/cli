# Changelog

All notable changes to `@explita/cli` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-25

### Added

- **Unified CLI Binaries**:
  - `explita`: Core umbrella CLI router delegating to deploy, tunnel, config, and completion workflows.
  - `eta`: Fast-path binary dedicated to reverse tunneling.
  - `eda`: Fast-path binary dedicated to Docker application builds and deployments.

- **Explita Tunnel (`eta`)**:
  - Ephemeral and persistent custom subdomain claims (`-s, --subdomain`).
  - Ephemeral ECDH (P-256) key exchange and authenticated AES-256-GCM inner payload encryption.
  - Built-in zero-dependency local request inspector dashboard (`http://127.0.0.1:39755`) with Server-Sent Events (SSE) live frame streaming.
  - Interactive terminal hotkeys (`r` to replay latest request against localhost, `c` to clear screen, `h` for help).
  - Multi-tenant nested subdomain routing (`tenant--myapp` and `tenant.myapp`) with automated `x-explita-*` context header injection.
  - HTTP Basic Authentication protection (`-a, --auth`) and CIDR/IP firewall filtering (`-i, --allow-ip`).
  - WebSocket and HTTP chunked streaming proxy support.
  - Token verification and email OTP request workflow (`eta token request`, `eta token verify`).

- **Explita Deploy (`eda`)**:
  - Docker container packaging, tarball compression, and remote build orchestration.
  - Zero-downtime rolling traffic cutovers backed by automated HTTP health checks and atomic Caddy reverse proxy reloads.
  - Ephemeral preview branches with automatic production PostgreSQL and MySQL schema/data cloning (`eda --preview --clone-db`).
  - Instant zero-downtime release rollbacks (`eda rollback [id]`).
  - Container promotion pipeline (`eda promote <id>`).
  - Encrypted environment variable management (`eda env set`, `eda env get`, `eda env list`).
  - Database management, scheduled cron jobs, manual dumps, and S3 snapshot uploads (`eda db backup`, `eda s3`).
  - One-command maintenance mode toggle with customizable splash screens (`eda maintenance on/off`).
  - Server and container diagnostic engine (`eda doctor`).

- **Configuration & Developer Experience**:
  - Interactive project initialization (`explita init`, `eda init`, `eta init`) with `$schema` validation in `explita.json`.
  - Global configuration storage (`explita config`) saved at `~/.explita/config.json`.
  - Shell tab-completion generators for Bash, Zsh, and PowerShell (`explita completion <shell>`).

# Explita Infra CLI

Command-line companion for [Explita Infra](https://infra.explita.ng).

## What is Explita Infra?

Explita Infra is a self-hosted developer platform built for privacy, speed, and autonomy.

Instead of juggling fragmented SaaS subscriptions for tunneling (like Ngrok) and hosting (like Vercel or Railway), Explita brings both workflows together on your own infrastructure:

- **Local Development**: Expose localhost, inspect raw wire payloads, and test webhooks without leaking data to third parties.
- **Production Hosting**: Deploy Docker containers, test staging branches with isolated cloned databases, and perform zero-downtime traffic swaps via Caddy.

This CLI is your day-to-day terminal interface for the entire platform.

---

## The Tools

- **`eta`** (Explita Tunnel): Instant, encrypted reverse tunnels. Share local ports or test webhooks in seconds with inner ECDH + AES-256-GCM encryption and a local wire inspector.
- **`eda`** (Explita Deploy): Self-hosted Docker container engine. Ship code from your machine to your VPS with zero-downtime swaps, automatic TLS, and preview databases.
- **`explita`**: Umbrella command for project configuration (`init`), global credentials (`config`), and shell completions.

---

## Install

```bash
pnpm add -g @explita/cli
# or npm install -g @explita/cli
# or bun add -g @explita/cli
```

---

## Quick Start

```bash
# 1. Share a local port securely (launches inspector on 127.0.0.1:39755)
eta 3000

# 2. Initialize project configuration in your repository
eda init

# 3. Ship straight to production
eda

# 4. Or deploy a preview branch with a cloned database
eda --preview --clone-db
```

---

## Documentation

Full step-by-step guides, server setup scripts, and CLI flag references live on our documentation site:

👉 **[infra.explita.ng/docs](https://infra.explita.ng/docs)**

- [Explita Tunnel Guide](https://infra.explita.ng/docs/tunnel)
- [Explita Deploy Guide](https://infra.explita.ng/docs/deploy)
- [CLI Reference](https://infra.explita.ng/docs/cli-reference)

---

## 📄 License

MIT © [Explita](https://explita.ng)

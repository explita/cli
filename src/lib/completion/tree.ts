export interface CommandNode {
  desc: string;
  subcommands?: Record<string, CommandNode>;
  flags?: string[];
}

export const GLOBAL_FLAGS = ["--pass", "--otp", "-h", "--help"];

export const COMPLETION_TREE: Record<string, CommandNode> = {
  deploy: {
    desc: "Deploy application container (alias: eda)",
    flags: [
      "-a",
      "--app",
      "-n",
      "--name",
      "-p",
      "--port",
      "-d",
      "--domain",
      "-s",
      "--subdomain",
      "-t",
      "--tunnel",
      "-c",
      "--health-check",
      "-H",
      "--no-health-check",
      "-P",
      "--pre-deploy",
      "-N",
      "--no-pre-deploy",
      "-v",
      "--volume",
      "-e",
      "--env",
      "--env-file",
      "--preview",
      "--clone-db",
      "--auth",
      "-f",
      "--force",
      "-w",
      "--no-wait",
    ],
  },
  init: {
    desc: "Initialize project configuration (explita.json)",
    flags: ["-n", "--name", "-p", "--port", "-d", "--domain", "-f", "--force"],
  },
  ls: {
    desc: "List applications",
    flags: ["-s", "--search"],
  },
  info: {
    desc: "Get application details",
    flags: ["-a", "--app"],
  },
  set: {
    desc: "Update container resource limits",
    flags: ["-a", "--app", "--memory", "--cpus"],
  },
  rm: {
    desc: "Delete an application",
    flags: ["-a", "--app", "-y", "--yes"],
  },
  sh: {
    desc: "Interactive remote shell inside container",
    flags: ["-a", "--app", "--shell"],
  },
  exec: {
    desc: "Run one-off command inside container",
    flags: ["-a", "--app"],
  },
  domain: {
    desc: "Manage custom domains, SSL certificates & routing",
    flags: ["-a", "--app"],
    subcommands: {
      add: { desc: "Add custom domain", flags: ["-a", "--app"] },
      rm: { desc: "Remove custom domain", flags: ["-a", "--app"] },
      ls: { desc: "List attached domains", flags: ["-a", "--app"] },
      check: { desc: "Verify DNS records for domain", flags: ["-a", "--app"] },
    },
  },
  tunnel: {
    desc: "Manage automated public HTTPS tunnel",
    flags: ["-a", "--app", "-s", "--subdomain"],
    subcommands: {
      enable: {
        desc: "Enable automated tunnel",
        flags: ["-a", "--app", "-s", "--subdomain"],
      },
      disable: { desc: "Disable automated tunnel", flags: ["-a", "--app"] },
    },
  },
  env: {
    desc: "Manage encrypted environment variables & secrets",
    flags: ["-a", "--app", "--show-values", "-s", "-f", "--file", "--apply"],
    subcommands: {
      set: {
        desc: "Set environment variables",
        flags: ["-a", "--app", "-f", "--file", "--apply"],
      },
      ls: {
        desc: "List environment variables",
        flags: ["-a", "--app", "--show-values", "-s"],
      },
      rm: {
        desc: "Remove an environment variable",
        flags: ["-a", "--app", "--apply"],
      },
      apply: {
        desc: "Reload container to apply pending environment variables",
        flags: ["-a", "--app"],
      },
      pull: {
        desc: "Export environment to local .env file",
        flags: ["-a", "--app", "-f", "--file"],
      },
      diff: {
        desc: "Compare local env file with server variables",
        flags: ["-a", "--app", "--show-values", "-s"],
      },
    },
  },
  start: {
    desc: "Start stopped application container",
    flags: ["-a", "--app"],
  },
  stop: {
    desc: "Stop running application container",
    flags: ["-a", "--app"],
  },
  restart: {
    desc: "Restart application container",
    flags: ["-a", "--app"],
  },
  logs: {
    desc: "View or stream container runtime logs",
    flags: ["-a", "--app", "--live", "-l", "--tail", "-n"],
  },
  rollback: {
    desc: "Roll back to a previous successful deployment",
    flags: ["-p", "--purge"],
  },
  promote: {
    desc: "Promote preview deployment to production",
    flags: ["-y", "--yes"],
  },
  cancel: {
    desc: "Cancel active deployment and clean up resources",
    flags: [],
  },
  history: {
    desc: "View deployment history and audit trail",
    flags: ["-a", "--app"],
  },
  stats: {
    desc: "Container resource usage snapshot or stream",
    flags: ["-a", "--app", "--all", "-A", "-l", "--live"],
  },
  top: {
    desc: "Live container resource dashboard",
    flags: ["-a", "--app", "--all", "-A"],
  },
  cron: {
    desc: "Scheduled background jobs (cron)",
    flags: ["-a", "--app"],
    subcommands: {
      ls: { desc: "List registered crons", flags: ["-a", "--app"] },
      run: { desc: "Trigger immediate cron job run", flags: ["-a", "--app"] },
      history: { desc: "View cron execution history", flags: ["-a", "--app"] },
    },
  },
  db: {
    desc: "Manage PostgreSQL databases, credentials & backups",
    flags: ["-a", "--app", "-k", "--key"],
    subcommands: {
      create: {
        desc: "Provision managed database",
        flags: [
          "-a",
          "--app",
          "-k",
          "--key",
          "-n",
          "--name",
          "-u",
          "--user",
          "-p",
          "--pass",
        ],
      },
      url: {
        desc: "View connection string (DATABASE_URL)",
        flags: ["-a", "--app", "-k", "--key"],
      },
      dump: {
        desc: "Export SQL dump of database",
        flags: ["-a", "--app", "-k", "--key", "-f", "--file"],
      },
      restore: {
        desc: "Restore database from SQL dump",
        flags: ["-a", "--app", "-k", "--key", "-f", "--file"],
      },
      seed: {
        desc: "Seed database from SQL file",
        flags: ["-a", "--app", "-k", "--key", "-f", "--file"],
      },
      backup: {
        desc: "Automated database backup schedules and snapshots",
        flags: ["-a", "--app", "-k", "--key"],
        subcommands: {
          schedule: {
            desc: "Configure backup schedule & retention",
            flags: [
              "-a",
              "--app",
              "-k",
              "--key",
              "--daily",
              "--hourly",
              "--weekly",
              "--cron",
              "--keep",
              "--s3",
              "--no-s3",
              "--disable",
            ],
          },
          ls: {
            desc: "List automated backups",
            flags: ["-a", "--app", "-k", "--key"],
          },
          create: {
            desc: "Trigger immediate backup snapshot",
            flags: ["-a", "--app", "-k", "--key", "--s3"],
          },
          restore: {
            desc: "Restore from server backup archive",
            flags: ["-a", "--app", "-k", "--key", "-y", "--yes"],
          },
          rm: { desc: "Delete a backup archive", flags: ["-a", "--app"] },
        },
      },
      rm: {
        desc: "Drop database and user",
        flags: ["-a", "--app", "-k", "--key"],
      },
    },
  },
  redis: {
    desc: "Manage isolated Redis instances",
    flags: ["-a", "--app"],
    subcommands: {
      create: {
        desc: "Provision dedicated Redis instance",
        flags: ["-a", "--app"],
      },
      url: { desc: "View Redis connection URL", flags: ["-a", "--app"] },
      rm: { desc: "Remove Redis instance", flags: ["-a", "--app"] },
    },
  },
  dump: {
    desc: "Export compressed full-system or app backup",
    flags: [
      "-a",
      "--app",
      "-A",
      "--all",
      "-d",
      "--db",
      "-f",
      "--files",
      "-e",
      "--env",
      "-s",
      "--reveal-secrets",
      "--s3",
      "-o",
      "--output",
    ],
    subcommands: {
      schedule: {
        desc: "Configure automated full dump schedule",
        flags: [
          "-a",
          "--app",
          "--daily",
          "--weekly",
          "--monthly",
          "--cron",
          "--keep",
          "--s3",
          "--no-s3",
          "--disable",
        ],
      },
    },
  },
  s3: {
    desc: "Off-site S3 / Cloudflare R2 backup & dump replication",
    flags: ["-a", "--app"],
    subcommands: {
      status: { desc: "View S3 replication status", flags: ["-a", "--app"] },
      set: {
        desc: "Configure S3 bucket credentials",
        flags: [
          "-a",
          "--app",
          "--bucket",
          "--access-key",
          "--secret-key",
          "--endpoint",
          "--region",
          "--prefix",
          "--force-path-style",
          "--disable",
        ],
      },
      test: { desc: "Verify S3 bucket permissions", flags: ["-a", "--app"] },
      rm: { desc: "Remove custom S3 configuration", flags: ["-a", "--app"] },
    },
  },
  notify: {
    desc: "Incident & health alerts (Discord/Telegram/Slack)",
    flags: ["-a", "--app"],
    subcommands: {
      ls: { desc: "List notification channels", flags: ["-a", "--app"] },
      set: {
        desc: "Configure notification destinations",
        flags: [
          "-a",
          "--app",
          "--discord",
          "--telegram",
          "--slack",
          "--events",
        ],
      },
      rm: { desc: "Remove notification destinations", flags: ["-a", "--app"] },
      test: { desc: "Send test alert", flags: ["-a", "--app"] },
    },
  },
  maintenance: {
    desc: "Instant 503 maintenance mode",
    flags: ["-a", "--app"],
    subcommands: {
      on: {
        desc: "Enable maintenance mode",
        flags: ["-a", "--app", "-m", "--message", "--custom"],
      },
      off: { desc: "Disable maintenance mode", flags: ["-a", "--app"] },
      status: { desc: "Check maintenance mode status", flags: ["-a", "--app"] },
    },
  },
  prune: {
    desc: "VPS disk hygiene & Docker maintenance",
    flags: ["--all", "-y", "--yes"],
  },
  volume: {
    desc: "Inspect persistent Docker volumes & storage mounts",
    flags: ["-a", "--app"],
    subcommands: {
      ls: { desc: "List persistent Docker volumes", flags: ["-a", "--app"] },
      inspect: { desc: "Show detailed volume configuration" },
      rm: {
        desc: "Remove a persistent Docker volume",
        flags: ["-y", "--yes", "-f", "--force"],
      },
    },
  },
  config: {
    desc: "Manage CLI global configuration and settings",
    subcommands: {
      ls: { desc: "List configured settings" },
      get: { desc: "Get specific configuration value" },
      set: { desc: "Set configuration value (server, token)" },
      path: { desc: "Print path to config file" },
    },
  },
  doctor: {
    desc: "Pre-flight system diagnostics & project validation",
    flags: [],
  },
  completion: {
    desc: "Generate shell tab-completion script",
    subcommands: {
      bash: { desc: "Generate Bash completion script" },
      zsh: { desc: "Generate Zsh completion script" },
      pwsh: { desc: "Generate PowerShell completion script" },
    },
  },
};

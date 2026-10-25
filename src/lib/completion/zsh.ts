import { COMPLETION_TREE } from "./tree.js";

export function generateZshCompletion(binNames = ["eda", "explita"]): string {
  const topCommandEntries = Object.entries(COMPLETION_TREE)
    .map(([cmd, node]) => `'${cmd}:${node.desc.replace(/'/g, "")}'`)
    .join("\n    ");

  const cmdCases: string[] = [];
  for (const [cmd, node] of Object.entries(COMPLETION_TREE)) {
    if (node.subcommands) {
      const subEntries = Object.entries(node.subcommands)
        .map(([sub, subNode]) => `'${sub}:${subNode.desc.replace(/'/g, "")}'`)
        .join("\n        ");

      const nestedCases: string[] = [];
      for (const [sub, subNode] of Object.entries(node.subcommands)) {
        if (subNode.subcommands) {
          const nestedEntries = Object.entries(subNode.subcommands)
            .map(
              ([nested, nestedNode]) =>
                `'${nested}:${nestedNode.desc.replace(/'/g, "")}'`,
            )
            .join("\n            ");
          nestedCases.push(`
        ${sub})
          local -a ${cmd}_${sub}_cmds=(
            ${nestedEntries}
          )
          _describe '${cmd} ${sub} command' ${cmd}_${sub}_cmds
          ;;`);
        }
      }

      cmdCases.push(`
      ${cmd})
        if (( CURRENT == 3 )); then
          local -a ${cmd}_cmds=(
            ${subEntries}
          )
          _describe '${cmd} command' ${cmd}_cmds
          return 0
        fi

        case "$words[3]" in
          ${nestedCases.join("\n")}
        esac
        ;;`);
    }
  }

  const compdefHeader = `#compdef ${binNames.join(" ")}`;

  return `${compdefHeader}
# zsh completion for eda / explita

_eda() {
  local curcontext="$curcontext" state line
  typeset -A opt_args

  local -a top_commands=(
    ${topCommandEntries}
  )

  local -a top_flags=(
    '-a:Target application ID'
    '--app:Target application ID'
    '-n:Application name'
    '--name:Application name'
    '-p:Container port'
    '--port:Container port'
    '-d:Custom domain'
    '--domain:Custom domain'
    '-s:Custom subdomain'
    '--subdomain:Custom subdomain'
    '-t:Enable automated public HTTPS tunnel'
    '--tunnel:Enable automated public HTTPS tunnel'
    '--preview:Deploy to preview tunnel'
    '--clone-db:Clone database for preview'
    '-y:Auto-promote preview'
    '--yes:Auto-confirm action'
    '-f:Force re-deploy'
    '--force:Force action'
    '--pass:Passcode / PIN for server authentication'
    '--otp:6-digit TOTP 2FA code'
    '-h:Show help'
    '--help:Show help'
  )

  if (( CURRENT == 2 )); then
    if [[ "$words[2]" == -* ]]; then
      _values 'options' $top_flags
    else
      _describe 'command' top_commands
    fi
    return 0
  fi

  case "$words[2]" in
    ${cmdCases.join("\n")}
    *)
      if [[ "$words[CURRENT]" == -* ]]; then
        _values 'options' $top_flags
      fi
      ;;
  esac
}

_eda "$@"
`;
}

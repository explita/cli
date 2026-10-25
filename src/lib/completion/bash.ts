import { COMPLETION_TREE, GLOBAL_FLAGS } from "./tree.js";

export function generateBashCompletion(binNames = ["eda", "explita"]): string {
  const topCommands = Object.keys(COMPLETION_TREE).join(" ");
  const topFlags = [
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
    "--preview",
    "--clone-db",
    "--auth",
    "-y",
    "--yes",
    "--purge",
    "-f",
    "--force",
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
    "-w",
    "--no-wait",
    ...GLOBAL_FLAGS,
  ].join(" ");

  // Build cases for subcommands
  const subcommandCases: string[] = [];
  for (const [cmd, node] of Object.entries(COMPLETION_TREE)) {
    if (node.subcommands) {
      const subs = Object.keys(node.subcommands).join(" ");
      const cmdFlags = [...(node.flags || []), ...GLOBAL_FLAGS].join(" ");

      const nestedCases: string[] = [];
      for (const [sub, subNode] of Object.entries(node.subcommands)) {
        if (subNode.subcommands) {
          const nestedSubs = Object.keys(subNode.subcommands).join(" ");
          const nestedFlags = [...(subNode.flags || []), ...GLOBAL_FLAGS].join(
            " ",
          );
          nestedCases.push(`
            ${sub})
              if [[ "$cur" == -* ]]; then
                COMPREPLY=( $(compgen -W "${nestedFlags}" -- "$cur") )
              else
                COMPREPLY=( $(compgen -W "${nestedSubs}" -- "$cur") )
              fi
              return 0
              ;;`);
        } else {
          const subFlags = [...(subNode.flags || []), ...GLOBAL_FLAGS].join(
            " ",
          );
          nestedCases.push(`
            ${sub})
              if [[ "$cur" == -* ]]; then
                COMPREPLY=( $(compgen -W "${subFlags}" -- "$cur") )
              fi
              return 0
              ;;`);
        }
      }

      subcommandCases.push(`
        ${cmd})
          if [[ $cword -eq 2 ]]; then
            if [[ "$cur" == -* ]]; then
              COMPREPLY=( $(compgen -W "${cmdFlags}" -- "$cur") )
            else
              COMPREPLY=( $(compgen -W "${subs}" -- "$cur") )
            fi
            return 0
          fi

          case "\${words[2]}" in
            ${nestedCases.join("\n")}
          esac
          ;;`);
    } else {
      const cmdFlags = [...(node.flags || []), ...GLOBAL_FLAGS].join(" ");
      subcommandCases.push(`
        ${cmd})
          if [[ "$cur" == -* ]]; then
            COMPREPLY=( $(compgen -W "${cmdFlags}" -- "$cur") )
          fi
          return 0
          ;;`);
    }
  }

  const registerLines = binNames
    .map((name) => `complete -F _eda_completions ${name}`)
    .join("\n");

  return `# bash completion for eda / explita -*- shell-script -*-

_eda_completions() {
  local cur prev words cword
  _init_completion || return

  if [[ $cword -eq 1 ]]; then
    if [[ "$cur" == -* ]]; then
      COMPREPLY=( $(compgen -W "${topFlags}" -- "$cur") )
    else
      COMPREPLY=( $(compgen -W "${topCommands}" -- "$cur") )
    fi
    return 0
  fi

  case "\${words[1]}" in
    ${subcommandCases.join("\n")}
    *)
      if [[ "$cur" == -* ]]; then
        COMPREPLY=( $(compgen -W "${topFlags}" -- "$cur") )
      fi
      ;;
  esac
}

${registerLines}
`;
}

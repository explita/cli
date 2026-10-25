import { COMPLETION_TREE, GLOBAL_FLAGS } from "./tree.js";

export function generatePwshCompletion(binNames = ["eda", "explita"]): string {
  // Serialize the tree to JSON so PowerShell can inspect it natively
  const treeJson = JSON.stringify(COMPLETION_TREE, null, 2);
  const globalFlagsJson = JSON.stringify(GLOBAL_FLAGS);

  const commandNames = binNames.map((n) => `'${n}'`).join(", ");

  return `# PowerShell completion for eda / explita

$edaCompletionTree = @'
${treeJson}
'@ | ConvertFrom-Json

$edaGlobalFlags = @'
${globalFlagsJson}
'@ | ConvertFrom-Json

Register-ArgumentCompleter -Native -CommandName ${commandNames} -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $elements = $commandAst.Elements | Select-Object -Skip 1 | ForEach-Object { $_.Value }
    # Remove flags from element sequence to follow command path
    $words = @($elements | Where-Object { $_ -and -not $_.StartsWith("-") })

    $results = [System.Collections.Generic.List[System.Management.Automation.CompletionResult]]::new()

    if ($words.Count -eq 0 -or ($words.Count -eq 1 -and -not $wordToComplete.StartsWith("-") -and $elements.Count -le 1)) {
        # Top-level commands
        foreach ($prop in $edaCompletionTree.PSObject.Properties) {
            $cmd = $prop.Name
            $desc = $prop.Value.desc
            if ($cmd -like "$wordToComplete*") {
                $results.Add([System.Management.Automation.CompletionResult]::new($cmd, $cmd, 'Command', $desc))
            }
        }
        foreach ($flag in $edaGlobalFlags) {
            if ($flag -like "$wordToComplete*") {
                $results.Add([System.Management.Automation.CompletionResult]::new($flag, $flag, 'ParameterName', $flag))
            }
        }
        return $results
    }

    $topCmd = $words[0]
    $node = $edaCompletionTree.$topCmd

    if (-not $node) {
        return $results
    }

    if ($wordToComplete.StartsWith("-")) {
        # Suggest flags for current node
        $flags = @($node.flags) + $edaGlobalFlags
        if ($words.Count -ge 2 -and $node.subcommands) {
            $sub = $words[1]
            if ($node.subcommands.$sub) {
                $flags += @($node.subcommands.$sub.flags)
            }
        }
        foreach ($f in ($flags | Select-Object -Unique)) {
            if ($f -and $f -like "$wordToComplete*") {
                $results.Add([System.Management.Automation.CompletionResult]::new($f, $f, 'ParameterName', $f))
            }
        }
        return $results
    }

    # Suggest subcommands
    if ($words.Count -eq 1 -and $node.subcommands) {
        foreach ($subProp in $node.subcommands.PSObject.Properties) {
            $subName = $subProp.Name
            $subDesc = $subProp.Value.desc
            if ($subName -like "$wordToComplete*") {
                $results.Add([System.Management.Automation.CompletionResult]::new($subName, $subName, 'ParameterValue', $subDesc))
            }
        }
    }
    elseif ($words.Count -eq 2 -and $node.subcommands) {
        $sub = $words[1]
        $subNode = $node.subcommands.$sub
        if ($subNode -and $subNode.subcommands) {
            foreach ($nestedProp in $subNode.subcommands.PSObject.Properties) {
                $nestedName = $nestedProp.Name
                $nestedDesc = $nestedProp.Value.desc
                if ($nestedName -like "$wordToComplete*") {
                    $results.Add([System.Management.Automation.CompletionResult]::new($nestedName, $nestedName, 'ParameterValue', $nestedDesc))
                }
            }
        }
    }

    return $results
}
`;
}

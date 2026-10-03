#!/usr/bin/env pwsh
# Runs a command with the repo's GitHub token, resolved at call time.
#
# WHY THIS EXISTS (next to gh.ps1)
# `gh.ps1` resolves the token from the process or the persisted user env.
# This wrapper adds one more source the agent actually owns: the root
# `.env.local`, where the current token lives as `OPENCODE_GITHUB_TOKEN`.
# Same guarantees: never stored, never printed, exported for one invocation.
#
# USAGE
#   powershell -File tools\with-github-token.ps1 gh auth status
#   powershell -File tools\with-github-token.ps1 gh pr list --state open
#
# Everything after the script name is forwarded untouched to the child command.

[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $CmdArgs
)

$ErrorActionPreference = 'Stop'

function Resolve-RepoToken {
    # The repo file is the authority for THIS wrapper (that is its whole job:
    # "use the repo's token"). Process env is only a fallback when the file
    # has no key. This order is deliberate and opposite to gh.ps1: a stale
    # persisted GITHUB_TOKEN in the OS user env would otherwise shadow the
    # live repo token in every fresh shell, exactly the failure this script
    # was built to eliminate.

    $root = Split-Path -Parent $PSScriptRoot
    $envFile = Join-Path $root '.env.local'
    if (Test-Path $envFile) {
        $found = @{}
        foreach ($line in (Get-Content $envFile)) {
            $t = $line.Trim()
            if (-not $t -or $t.StartsWith('#') -or -not ($t -match '=')) { continue }
            $k, $v = $t.Split('=', 2)
            $found[$k.Trim()] = $v.Trim().Trim('"').Trim("'")
        }
        foreach ($key in @('OPENCODE_GITHUB_TOKEN', 'GITHUB_TOKEN')) {
            if ($found[$key]) { return $found[$key] }
        }
    }

    # Fallback: explicit process env, for one-off overrides when the file
    # has neither key.
    if ($env:GITHUB_TOKEN) { return $env:GITHUB_TOKEN }

    if (Test-Path $envFile) {
        Write-Error ".env.local has neither OPENCODE_GITHUB_TOKEN nor GITHUB_TOKEN."
    } else {
        Write-Error "No token in process env and no .env.local at repo root."
    }
    exit 1
}

if ($CmdArgs.Count -eq 0) {
    Write-Error "Nothing to run. Example: powershell -File tools\with-github-token.ps1 gh auth status"
    exit 1
}

$token = Resolve-RepoToken
if (-not $token) { exit 1 }

# Child-process only. Never persisted, never printed.
$env:GITHUB_TOKEN = $token
$env:GH_TOKEN = $token

$prog = $CmdArgs[0]
$rest = @()
if ($CmdArgs.Count -gt 1) { $rest = $CmdArgs[1..($CmdArgs.Count - 1)] }
& $prog @rest
exit $LASTEXITCODE

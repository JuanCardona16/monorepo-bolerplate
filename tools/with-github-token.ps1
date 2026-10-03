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
    # Explicit process env always wins over the file.
    if ($env:GITHUB_TOKEN) { return $env:GITHUB_TOKEN }

    $root = Split-Path -Parent $PSScriptRoot
    $envFile = Join-Path $root '.env.local'
    if (-not (Test-Path $envFile)) {
        Write-Error "No token in process env and no .env.local at repo root."
        exit 1
    }

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
    Write-Error ".env.local has neither OPENCODE_GITHUB_TOKEN nor GITHUB_TOKEN."
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

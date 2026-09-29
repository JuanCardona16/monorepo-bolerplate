#!/usr/bin/env pwsh
# Runs the GitHub CLI with a token resolved at call time.
#
# WHY THIS EXISTS
# Every shell call in this environment is a fresh process, so a token exported
# in a previous command is gone. Re-exporting it by hand before every `gh` call
# is error-prone and encourages pasting the token into shell history, where it
# lands in scrollback and in transcripts.
#
# This script NEVER stores a token. It resolves one, in priority order:
#   1. an argument, e.g. -Token abc123 (useful for one-off checks)
#   2. process GITHUB_TOKEN for the CURRENT process
#   3. the GITHUB_TOKEN persisted for the current OS user
# and passes it to `gh` via the environment only, for that one invocation.
#
# The value is never printed and never written to disk. A token typed at the
# prompt is read with `-AsSecureString` so it does not land in the transcript.
#
# USAGE
#   powershell -File tools\gh.ps1 pr list
#   powershell -File tools\gh.ps1 pr view 11 --json state
#   powershell -File tools\gh.ps1 api repos/OWNER/REPO/branches/main/protection
#   powershell -File tools\gh.ps1 -Check
#   powershell -File tools\gh.ps1 -GhVersion
#
# Switches use PowerShell's single dash (`-Check`). The name `pwsh` is not
# available on this machine; Windows PowerShell is `powershell`.
#
# Everything after the switches is forwarded to `gh` untouched, so passthrough
# flags like `--repo`, `--json` and `--jq` keep working.

[CmdletBinding()]
param(
    # NOTE: no positional parameter, deliberately. A positional `$Token` would
    # swallow the first real argument, so `gh.ps1 pr list` would try to use "pr"
    # as the token.
    #
    # `ValueFromRemainingArguments` is what actually collects `pr list --json x`:
    # without it, [CmdletBinding()] declares a single unnamed positional parameter
    # and anything past it is rejected with "does not accept the argument 'pr'".
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $GhArgs,

    [switch] $Check,
    [switch] $GhVersion
)

$ErrorActionPreference = 'Stop'

function Resolve-GitHubToken {
    $fromProcess = $env:GITHUB_TOKEN
    if ($fromProcess) {
        return $fromProcess
    }

    # A fresh PowerShell does not inherit variables set after it started, so read
    # the persisted user value directly rather than trusting the environment.
    $UserScope = [System.EnvironmentVariableTarget]::User
    $fromUser = [System.Environment]::GetEnvironmentVariable('GITHUB_TOKEN', $UserScope)
    if ($fromUser) {
        return $fromUser
    }

    Write-Error @"
No GitHub token available.

Provide one of:
  1. Persist it once (the token itself never enters this repository):
       [Environment]::SetEnvironmentVariable('GITHUB_TOKEN', '<token>', 'User')
  2. Set it for the current shell:
       `$env:GITHUB_TOKEN = '<token>'
"@
    exit 1
}

if ($GhVersion) {
    gh --version
    exit 0
}

$Resolved = Resolve-GitHubToken

# Only export for this process and its children. Never persisted, never printed.
$env:GITHUB_TOKEN = $Resolved

if ($Check) {
    # Deliberately does not echo the token: `gh` prints the account and scopes.
    gh auth status
    exit $LASTEXITCODE
}

if ($GhArgs.Count -eq 0) {
    Write-Error "Nothing to run. Example: powershell -File tools\gh.ps1 pr list"
    exit 1
}

& gh @GhArgs
exit $LASTEXITCODE

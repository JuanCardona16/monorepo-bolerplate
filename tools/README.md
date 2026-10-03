# tools/

Local developer helpers. Nothing here ships or is imported by the applications.

## `with-github-token.ps1`

Runs any command with the repo's GitHub token from root `.env.local`
(`OPENCODE_GITHUB_TOKEN`, fallback `GITHUB_TOKEN`), resolved per invocation.
Process `GITHUB_TOKEN` wins when set. Never stored, never printed; exported as
`GITHUB_TOKEN`/`GH_TOKEN` for the child call only.

```powershell
powershell -File tools\with-github-token.ps1 gh auth status
powershell -File tools\with-github-token.ps1 gh pr list --state open
```

## `gh.ps1`

Runs the GitHub CLI with a token resolved at call time.

**The problem it solves:** every shell call in an agent session is a fresh
process, so a token exported in a previous command is gone. Re-exporting it by
hand before each `gh` call invites pasting the token into shell history, where it
ends up in scrollback and in transcripts.

**It never stores a token.** Resolution order, per invocation:

1. `GITHUB_TOKEN` in the current process
2. `GITHUB_TOKEN` persisted for the current OS user

The value is passed to `gh` through the environment for that one call only. It
is never printed and never written to disk.

### Setup (once)

```powershell
[Environment]::SetEnvironmentVariable('GITHUB_TOKEN', '<token>', 'User')
```

The token never enters the repository. This is how the GitHub MCP server and the
`gh` CLI both authenticate, so one variable covers both.

### Usage

`pwsh` is not installed on this machine; Windows PowerShell is `powershell`, and
its switches take a single dash.

```powershell
powershell -File tools\gh.ps1 pr list
powershell -File tools\gh.ps1 pr view 11 --json state
powershell -File tools\gh.ps1 pr list --state open --json "number,title"
powershell -File tools\gh.ps1 api repos/OWNER/REPO/branches/main/protection
powershell -File tools\gh.ps1 -Check
powershell -File tools\gh.ps1 -GhVersion
```

`-Check` prints the account and the granted scopes without echoing the token.

### Notes

- `git push`/`git fetch` do not need this script. Git reads the same user-scoped
  variable on its own.
- Comma-separated values must stay quoted: `--json "number,title"`. Quoting is
  lost if you nest the call inside `powershell -Command "..."` and escape it, so
  prefer `-File` for anything with commas.
- Prefer a fine-grained token limited to this repository. The token currently
  configured is a classic `repo` token, which reaches every private repository on
  the account.

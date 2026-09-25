param([string]$Name = 'vocalearn')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Checked {
    param([string]$Exe, [string[]]$Arguments)
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Exe failed. No force push or overwrite will be attempted." }
}
if ($Name -notmatch '^[a-zA-Z0-9._-]+$' -or $Name -in @('.', '..')) { throw 'Invalid repository name' }
Get-Command git -ErrorAction Stop | Out-Null
Get-Command gh -ErrorAction Stop | Out-Null
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Run: gh auth login' }
$Login = & gh api user --jq .login
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve the authenticated account' }
$Top = & git rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -eq 0) {
    if ((Resolve-Path $Top).Path -ne (Get-Location).Path) { throw 'Refusing to use a parent Git project' }
}
if (Test-Path .git) {
    & git remote get-url origin 2>$null
    if ($LASTEXITCODE -eq 0) { throw 'Origin already exists. Review it manually.' }
}
& gh repo view "$Login/$Name" 2>$null
if ($LASTEXITCODE -eq 0) { throw 'Repository already exists. Choose another name.' }
$Answer = Read-Host "Create PRIVATE repository $Login/$Name and push this project? [y/N]"
if ($Answer -notin @('y', 'yes')) { Write-Host 'Cancelled'; exit 0 }
if (-not (Test-Path .git)) { Invoke-Checked git @('init', '-b', 'main') }
$Branch = & git branch --show-current
if ($Branch -ne 'main') { throw 'Expected main branch. Review the repository manually.' }
& git config user.name | Out-Null
if ($LASTEXITCODE -ne 0) { Invoke-Checked git @('config', 'user.name', $Login) }
& git config user.email | Out-Null
if ($LASTEXITCODE -ne 0) { Invoke-Checked git @('config', 'user.email', "$Login@users.noreply.github.com") }
Invoke-Checked git @('add', '.')
Invoke-Checked git @('diff', '--cached', '--stat')
$Answer = Read-Host 'Review files above. Commit and create the PRIVATE repository? [y/N]'
if ($Answer -notin @('y', 'yes')) { Write-Host 'Cancelled; files remain staged locally'; exit 0 }
& git diff --cached --quiet
if ($LASTEXITCODE -eq 1) { Invoke-Checked git @('commit', '-m', 'feat: initial VocaLearn implementation from spec v0.5') }
elseif ($LASTEXITCODE -ne 0) { throw 'Cannot inspect staged files' }
Invoke-Checked gh @('repo', 'create', "$Login/$Name", '--private', '--source=.', '--remote=origin', '--push')
Invoke-Checked gh @('repo', 'view', "$Login/$Name", '--json', 'url,visibility')

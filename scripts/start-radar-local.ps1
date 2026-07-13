param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    Write-Host 'Node.js nao foi encontrado. Instala-o em https://nodejs.org/' -ForegroundColor Red
    exit 1
}

# Reinicia apenas uma instância confirmada do Radar Local. Nunca termina outra aplicação.
$listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
    try {
        $status = Invoke-RestMethod -Uri 'http://localhost:3000/api/status' -TimeoutSec 2
        if ($status.app -ne 'radar-local') { throw 'outra aplicação' }
        Stop-Process -Id $listener.OwningProcess -Force
        Start-Sleep -Milliseconds 400
    } catch {
        Write-Host 'A porta 3000 esta ocupada por outra aplicacao. Fecha-a e tenta novamente.' -ForegroundColor Red
        exit 1
    }
}

$nodeModulesLock = Join-Path $projectRoot 'node_modules\.package-lock.json'
$packageLock = Join-Path $projectRoot 'package-lock.json'
$dependenciesOutdated = -not (Test-Path -LiteralPath $nodeModulesLock) -or
    ((Get-Item -LiteralPath $packageLock).LastWriteTimeUtc -gt (Get-Item -LiteralPath $nodeModulesLock).LastWriteTimeUtc)

if ($dependenciesOutdated) {
    Write-Host 'A instalar ou atualizar dependencias...'
    & npm.cmd install --cache .npm-cache
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$buildId = Join-Path $projectRoot '.next\BUILD_ID'
$sourcePaths = @('app', 'components', 'lib', 'public', 'next.config.ts', 'package.json', 'tsconfig.json') |
    ForEach-Object { Join-Path $projectRoot $_ }
$latestSource = Get-ChildItem -LiteralPath $sourcePaths -Recurse -File |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
$buildOutdated = -not (Test-Path -LiteralPath $buildId) -or
    ($latestSource.LastWriteTimeUtc -gt (Get-Item -LiteralPath $buildId).LastWriteTimeUtc)

if ($buildOutdated) {
    Write-Host 'A preparar a versao atualizada da aplicacao...'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Start-Process -FilePath $env:ComSpec `
    -ArgumentList @('/c', 'npm.cmd start') `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
        $status = Invoke-RestMethod -Uri 'http://localhost:3000/api/status' -TimeoutSec 2
        if ($status.app -eq 'radar-local') {
            $ready = $true
            break
        }
    } catch {
        # O servidor ainda esta a iniciar.
    }
}

if (-not $ready) {
    Write-Host 'A aplicacao nao iniciou na porta 3000.' -ForegroundColor Red
    exit 1
}

if (-not $NoBrowser) {
    Start-Process 'http://localhost:3000'
    Write-Host 'Radar Local aberto no browser.' -ForegroundColor Green
} else {
    Write-Host 'Radar Local iniciado em http://localhost:3000.' -ForegroundColor Green
}

[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$workspace=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$staging=Join-Path $workspace ('printing/.local/installer-build-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $staging
$files=@('AgentConfig.psm1','AgentCore.psm1','AgentDesktop.psm1','AgentReceipt.cs','Run-Agent.ps1','AgentMonitor.ps1','Setup-Agent.ps1')
foreach($name in $files){
    $source=Join-Path $PSScriptRoot $name
    if($name.EndsWith('.ps1') -or $name.EndsWith('.psm1')){[IO.File]::WriteAllText((Join-Path $staging $name),[IO.File]::ReadAllText($source,[Text.Encoding]::UTF8),(New-Object Text.UTF8Encoding($true)))}
    else {Copy-Item -LiteralPath $source -Destination (Join-Path $staging $name)}
}
$package=Join-Path $staging 'RMenu.Package.zip'
Compress-Archive -LiteralPath @($files | ForEach-Object {Join-Path $staging $_}) -DestinationPath $package
$outputDirectory=Join-Path $workspace 'public/printing'
$null=New-Item -ItemType Directory -Path $outputDirectory -Force
$output=Join-Path $outputDirectory 'RMenu-Instalar.exe'
$framework=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
$compiler=Join-Path $framework 'csc.exe'
& $compiler /nologo /target:winexe (('/out:'+ $output)) (('/resource:'+ $package+',RMenu.Package.zip')) /reference:System.Windows.Forms.dll /reference:System.IO.Compression.dll (('/reference:'+ (Join-Path $framework 'System.IO.Compression.FileSystem.dll'))) (Join-Path $PSScriptRoot 'InstallerLauncher.cs')
if($LASTEXITCODE -ne 0){throw 'Compilação do instalador falhou.'}
Get-FileHash -LiteralPath $output -Algorithm SHA256 | Select-Object Hash
Write-Output 'Instalador compilado para revisão. Ainda não possui assinatura digital de distribuição.'

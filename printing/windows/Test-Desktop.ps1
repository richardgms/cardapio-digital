$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'AgentConfig.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AgentCore.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AgentDesktop.psm1') -Force
$script:checks=0
function Assert([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message};$script:checks++}
Assert ($null -ne (Get-Command Read-RMenuConfiguration -ErrorAction SilentlyContinue)) 'Importação do assistente removeu configuração do agente'
Assert ($null -ne (Get-Command Send-RMenuJob -ErrorAction SilentlyContinue)) 'Importação do assistente removeu envio do agente'
foreach($file in @('Run-Agent.ps1','AgentDesktop.psm1','AgentCalibration.psm1','AgentMonitor.ps1','Setup-Agent.ps1','Build-Installer.ps1')){
    $tokens=$null;$errors=$null
    $null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $file),[ref]$tokens,[ref]$errors)
    Assert ($errors.Count -eq 0) ('Sintaxe inválida: '+$file)
}
Assert ((Get-RMenuConnectionStatus @{} {throw 'network_unavailable'}) -eq 'unavailable') 'Falha de rede encerrou a conferência'
Assert ((Get-RMenuConnectionStatus @{} {@{protocol_version=1;authenticated=$true}}) -eq 'connected') 'Conexão válida não reconhecida'
Assert ((Get-RMenuConnectionStatus @{} {@{protocol_version=1;authenticated=$false}}) -eq 'unavailable') 'Resposta sem autenticação aceita'
$loop=@{cycles=0;waits=0;errors=0;recovered=$false}
Invoke-RMenuPolling -MaxCycles 3 -Cycle {$loop.cycles++;if($loop.cycles -eq 1){throw 'offline_at_start'};$loop.recovered=$true} -ShouldStop {$false} -Wait {$loop.waits++} -OnError {$loop.errors++}
Assert ($loop.cycles -eq 3 -and $loop.waits -eq 2 -and $loop.errors -eq 1 -and $loop.recovered) 'Não retomou após conexão indisponível no início'
$pause=@{cycles=0;waits=0;stop=$false}
Invoke-RMenuPolling -Cycle {$pause.cycles++;$pause.stop=$true} -ShouldStop {$pause.stop} -Wait {$pause.waits++}
Assert ($pause.cycles -eq 1 -and $pause.waits -eq 0) 'Pausa não respeitou a fronteira do ciclo'
$paused=@{cycles=0}
Invoke-RMenuPolling -Cycle {$paused.cycles++} -ShouldStop {$true} -Wait {}
Assert ($paused.cycles -eq 0) 'Reservou um ciclo novo após pausa anterior'
$root=Join-Path (Split-Path $PSScriptRoot -Parent) ('.local/desktop-tests-'+[Guid]::NewGuid().ToString('N'))
$startup=Join-Path $root 'startup';$null=New-Item -ItemType Directory -Path $startup -Force
$state=Join-Path $root 'state'
$application=Install-RMenuApplication $PSScriptRoot $state
Assert (@(Get-ChildItem -LiteralPath $application -File).Count -eq @(Get-RMenuApplicationFiles).Count) 'Aplicativo copiou arquivos fora da lista'
Assert (-not (Test-Path -LiteralPath (Join-Path $application 'device.json'))) 'Configuração privada copiada para aplicativo'
$null=Install-RMenuApplication $application $state
Assert (Test-Path -LiteralPath (Join-Path $application 'Run-Agent.ps1')) 'Atualização na mesma pasta falhou'
$sentinel=Join-Path $startup 'Outro aplicativo.txt';[IO.File]::WriteAllText($sentinel,'preservar')
Set-RMenuAutoStart $state $true $startup
$link=Join-Path $startup 'RMenu Impressao.lnk'
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut($link)
Assert ($shortcut.Arguments.Contains('-WindowStyle Hidden') -and $shortcut.Arguments.Contains('AgentMonitor.ps1') -and $shortcut.Arguments.Contains($application)) 'Inicialização aponta para outro aplicativo'
$null=[Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut)
Set-RMenuAutoStart $state $false $startup
Assert (-not (Test-Path -LiteralPath $link) -and (Test-Path -LiteralPath $sentinel)) 'Remoção alterou atalho de outro aplicativo'
$shortcut=$shell.CreateShortcut($link);$shortcut.TargetPath=Join-Path $PSHOME 'powershell.exe';$shortcut.Arguments='-NoProfile -Command exit';$shortcut.Save()
$null=[Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut)
$blocked=$false;try {Set-RMenuAutoStart $state $false $startup}catch{$blocked=$true}
Assert ($blocked -and (Test-Path -LiteralPath $link)) 'Apagou atalho de outra instalação'
$null=[Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
Request-RMenuStop $state
Assert ([IO.File]::ReadAllText((Join-Path $state 'stop-request')) -eq 'stop') 'Pedido de pausa ausente'
$calibrationConfig=@{device_id=[Guid]::NewGuid().ToString('D');queue_name='Impressora fictícia';paper_width_mm=58}
$calibration=@{sends=0}
Assert ((Send-RMenuCalibration $calibrationConfig $state {$true} {} {$calibration.sends++}) -eq 'spooler_submitted') 'Teste fictício não concluiu'
Assert ((Send-RMenuCalibration $calibrationConfig $state {$true} {} {$calibration.sends++}) -eq 'already_requested' -and $calibration.sends -eq 1) 'Repetiu calibração'
Confirm-RMenuCalibration $calibrationConfig $state
Assert ((Get-RMenuCalibrationState $calibrationConfig $state) -eq 'paper_confirmed') 'Confirmação humana não preservada'
$calibrationConfig.device_id=[Guid]::NewGuid().ToString('D')
Assert ((Send-RMenuCalibration $calibrationConfig $state {$true} {} {throw 'partial_send'}) -eq 'uncertain') 'Falha parcial não ficou incerta'
Assert ((Send-RMenuCalibration $calibrationConfig $state {$true} {} {$calibration.sends++}) -eq 'already_requested' -and $calibration.sends -eq 1) 'Falha parcial repetiu envio'
Write-Output ('PASS: '+$script:checks+' verificações do assistente e operação contínua. Sem spool, credencial real ou alteração da inicialização deste Windows.')

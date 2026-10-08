Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'AgentConfig.psm1')
Import-Module (Join-Path $PSScriptRoot 'AgentCore.psm1')

function Get-RMenuApplicationFiles {
    return @('AgentConfig.psm1','AgentCore.psm1','AgentDesktop.psm1','AgentReceipt.cs','Run-Agent.ps1','AgentMonitor.ps1','Setup-Agent.ps1')
}
function Install-RMenuApplication {
    param([string]$SourceDirectory,[string]$StateDirectory)
    $files=Get-RMenuApplicationFiles
    foreach($file in $files){if(-not (Test-Path -LiteralPath (Join-Path $SourceDirectory $file) -PathType Leaf)){throw 'Instalador incompleto.'}}
    Protect-RMenuDirectory $StateDirectory
    $applicationDirectory=Join-Path $StateDirectory 'app'
    Protect-RMenuDirectory $applicationDirectory
    $mutex=$null;$acquired=$false
    try {
        $configurationPath=Join-Path $StateDirectory 'device.json'
        if(Test-Path -LiteralPath $configurationPath){
            $device=Read-RMenuConfiguration $configurationPath
            $mutex=New-Object Threading.Mutex($false,('Global\RMenuPrintAgent_'+$device.device_id))
            try {$acquired=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$acquired=$true}
            if(-not $acquired){throw 'Pause o RMenu Impressão e aguarde a tentativa atual terminar antes de atualizar.'}
        }
        foreach($file in $files){
            $source=[IO.Path]::GetFullPath((Join-Path $SourceDirectory $file))
            $destination=[IO.Path]::GetFullPath((Join-Path $applicationDirectory $file))
            if($source -ine $destination){Copy-Item -LiteralPath $source -Destination $destination -Force}
        }
    } finally {if($acquired){$mutex.ReleaseMutex()};if($mutex){$mutex.Dispose()}}
    return $applicationDirectory
}
function Set-RMenuAutoStart {
    param([string]$StateDirectory,[bool]$Enabled,[string]$StartupDirectory=[Environment]::GetFolderPath('Startup'))
    $applicationDirectory=Join-Path $StateDirectory 'app'
    $monitor=Join-Path $applicationDirectory 'AgentMonitor.ps1'
    if(-not (Test-Path -LiteralPath $monitor -PathType Leaf)){throw 'Instale o aplicativo antes de configurar a inicialização.'}
    $shortcutPath=Join-Path $StartupDirectory 'RMenu Impressao.lnk'
    $shell=New-Object -ComObject WScript.Shell
    try {
        $shortcut=$shell.CreateShortcut($shortcutPath)
        $powershell=Join-Path $PSHOME 'powershell.exe'
        $arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File "'+$monitor+'"'
        if(-not $Enabled){
            if(Test-Path -LiteralPath $shortcutPath){
                if($shortcut.TargetPath -cne $powershell -or $shortcut.Arguments -cne $arguments){throw 'Atalho existente pertence a outra instalação; preserve-o.'}
                Remove-Item -LiteralPath $shortcutPath -Force
            }
            return
        }
        if((Test-Path -LiteralPath $shortcutPath) -and ($shortcut.TargetPath -cne $powershell -or $shortcut.Arguments -cne $arguments)){throw 'Atalho existente pertence a outra instalação; preserve-o.'}
        $shortcut.TargetPath=$powershell
        $shortcut.Arguments=$arguments
        $shortcut.WorkingDirectory=$applicationDirectory
        $shortcut.Description='RMenu: impressão automática após entrar no Windows'
        $shortcut.WindowStyle=7
        $shortcut.Save()
    } finally {if($shortcut){$null=[Runtime.InteropServices.Marshal]::ReleaseComObject($shortcut)};$null=[Runtime.InteropServices.Marshal]::ReleaseComObject($shell)}
}
function Get-RMenuConnectionStatus {
    param([object]$Config,[scriptblock]$Request)
    try {
        if($null -ne $Request){$health=& $Request}
        else {
            [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
            $response=Invoke-WebRequest -UseBasicParsing -Uri $Config.endpoint -Method Post -ContentType 'application/json' -Body '{"operation":"health"}' -TimeoutSec 3 -MaximumRedirection 0 -Headers @{'Authorization'=('Bearer '+$Config.credential);'x-rmenu-device'=$Config.device_id}
            $health=$response.Content | ConvertFrom-Json
        }
        if($health.protocol_version -ne 1 -or -not $health.authenticated){return 'unavailable'}
        return 'connected'
    } catch {
        $responseProperty=$_.Exception.PSObject.Properties['Response']
        if($responseProperty -and $responseProperty.Value -and [int]$responseProperty.Value.StatusCode -eq 401){return 'unauthorized'}
        return 'unavailable'
    }
}
function Request-RMenuStop {
    param([string]$StateDirectory)
    [IO.File]::WriteAllText((Join-Path $StateDirectory 'stop-request'),'stop',[Text.Encoding]::UTF8)
}
function Invoke-RMenuPolling {
    param([scriptblock]$Cycle,[scriptblock]$ShouldStop,[scriptblock]$Wait,[scriptblock]$OnError,[scriptblock]$OnCycle,[int]$MaxCycles=0)
    $cycleNumber=0
    do {
        if(& $ShouldStop){break}
        try {& $Cycle} catch {if($OnError){& $OnError}}
        $cycleNumber++
        if($OnCycle){& $OnCycle $cycleNumber}
        if(($MaxCycles -gt 0 -and $cycleNumber -ge $MaxCycles) -or (& $ShouldStop)){break}
        & $Wait
    } while($true)
}
function Get-RMenuCalibrationPath {
    param([object]$Config,[string]$StateDirectory)
    return Join-Path (Join-Path $StateDirectory 'calibration') (([Guid]::Parse($Config.device_id).ToString('D'))+'.jsonl')
}
function Get-RMenuCalibrationState {
    param([object]$Config,[string]$StateDirectory)
    $path=Get-RMenuCalibrationPath $Config $StateDirectory
    if(-not (Test-Path -LiteralPath $path)){return 'not_requested'}
    $event=Read-RMenuJournal $path
    if($null -eq $event){return 'uncertain'}
    return $event.state
}
function Send-RMenuCalibration {
    param([object]$Config,[string]$StateDirectory,[scriptblock]$PrinterReady,[scriptblock]$Preview,[scriptblock]$Sender)
    $path=Get-RMenuCalibrationPath $Config $StateDirectory
    if(Test-Path -LiteralPath $path){return 'already_requested'}
    if($PrinterReady){$ready=& $PrinterReady}
    else {try {$printer=Get-Printer -Name $Config.queue_name -ErrorAction Stop;$ready=[int]$printer.PrinterStatus -eq 0 -and @(Get-PrintJob -PrinterName $Config.queue_name -ErrorAction Stop).Count -eq 0}catch{$ready=$false}}
    if(-not $ready){throw 'Impressora indisponível ou ocupada.'}
    $lines=@('RMENU - TESTE DE IMPRESSAO','SEM PEDIDO REAL','------------------------------','Texto: ç á é í ó ú ã õ','Uma via de teste.','Confira a largura e o corte.','Este teste não cria um pedido.')
    if(-not $Preview -or -not $Sender){
        Add-Type -AssemblyName System.Drawing
        if(-not ('RMenuAgentReceipt' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'AgentReceipt.cs') -ReferencedAssemblies System.Drawing}
    }
    if($Preview){$null=& $Preview $Config $lines}else{$null=[RMenuAgentReceipt]::Preview($Config.queue_name,[string[]]$lines,$Config.paper_width_mm,$null)}
    Protect-RMenuDirectory (Split-Path $path -Parent)
    # CreateNew e Flush tornam esta calibração única por credencial/dispositivo.
    Write-RMenuJournal $path @{state='dispatch_intent';at=[DateTime]::UtcNow.ToString('o')} -Create
    $outcome='uncertain'
    try {
        if($Sender){$null=& $Sender $Config $lines}else{[RMenuAgentReceipt]::SendOnce($Config.queue_name,[string[]]$lines,$Config.paper_width_mm)}
        $outcome='spooler_submitted'
    } catch { }
    Write-RMenuJournal $path @{state=$outcome;at=[DateTime]::UtcNow.ToString('o')}
    return $outcome
}
function Confirm-RMenuCalibration {
    param([object]$Config,[string]$StateDirectory)
    $state=Get-RMenuCalibrationState $Config $StateDirectory
    if($state -notin @('spooler_submitted','uncertain','paper_confirmed')){throw 'Solicite o teste antes de confirmar o papel.'}
    if($state -ne 'paper_confirmed'){Write-RMenuJournal (Get-RMenuCalibrationPath $Config $StateDirectory) @{state='paper_confirmed';source='operator_checkbox';at=[DateTime]::UtcNow.ToString('o')}}
}
Export-ModuleMember -Function Get-RMenuApplicationFiles,Install-RMenuApplication,Set-RMenuAutoStart,Get-RMenuConnectionStatus,Request-RMenuStop,Invoke-RMenuPolling,Get-RMenuCalibrationState,Send-RMenuCalibration,Confirm-RMenuCalibration

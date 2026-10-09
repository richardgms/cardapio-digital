Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'AgentConfig.psm1')
Import-Module (Join-Path $PSScriptRoot 'AgentCore.psm1')

function Invoke-RMenuCalibrationApi {
    param([object]$Config,[object]$Body,[scriptblock]$Request)
    if($Request){return (& $Request $Body)}
    if(-not (Test-RMenuEndpoint $Config.endpoint)){throw 'Destino de conexão inválido.'}
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $bytes=[Text.Encoding]::UTF8.GetBytes(($Body|ConvertTo-Json -Compress))
    $response=Invoke-WebRequest -UseBasicParsing -Uri $Config.endpoint -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 10 -MaximumRedirection 0 -Headers @{'Authorization'=('Bearer '+$Config.credential);'x-rmenu-device'=$Config.device_id}
    return ($response.Content|ConvertFrom-Json)
}
function Get-RMenuSelfServiceSupport {
    param([object]$Config,[scriptblock]$Request)
    $health=Invoke-RMenuCalibrationApi $Config @{operation='health'} $Request
    if($health.protocol_version -ne 1 -or -not $health.authenticated){throw 'Conexão não confirmada.'}
    $capability=$health.PSObject.Properties['self_service_calibration']
    return ($null -ne $capability -and $capability.Value -eq $true)
}
function Get-RMenuSelfServiceCalibrationPath {
    param([object]$Config,[string]$StateDirectory)
    return Join-Path (Join-Path $StateDirectory 'self-service-calibration') (([Guid]::Parse($Config.device_id).ToString('D'))+'.jsonl')
}
function Get-RMenuSelfServiceCalibrationState {
    param([object]$Config,[string]$StateDirectory)
    $path=Get-RMenuSelfServiceCalibrationPath $Config $StateDirectory
    if(-not (Test-Path -LiteralPath $path)){return 'not_requested'}
    $last=Read-RMenuJournal $path
    if($null -eq $last){return 'uncertain_journal'}
    return $last.state
}
function Send-RMenuSelfServiceCalibration {
    param([object]$Config,[string]$StateDirectory,[scriptblock]$Request,[scriptblock]$PrinterReady,[scriptblock]$Preview,[scriptblock]$Sender)
    $mutex=New-Object Threading.Mutex($false,('Global\RMenuCalibration_'+$Config.device_id));$acquired=$false
    try {
        try{$acquired=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$acquired=$true}
        if(-not $acquired){throw 'Outro teste está em andamento.'}
        $path=Get-RMenuSelfServiceCalibrationPath $Config $StateDirectory
        $last=$null
        if(Test-Path -LiteralPath $path){
            $last=Read-RMenuJournal $path
            if($null -eq $last -or $last.state -notin @('request_pending','requested')){return 'already_requested'}
        }
        if($PrinterReady){$ready=& $PrinterReady}
        else {try{$printer=Get-Printer -Name $Config.queue_name -ErrorAction Stop;$ready=[int]$printer.PrinterStatus -eq 0 -and @(Get-PrintJob -PrinterName $Config.queue_name -ErrorAction Stop).Count -eq 0}catch{$ready=$false}}
        if(-not $ready){throw 'Impressora indisponível ou ocupada.'}
        if($null -eq $last){
            Protect-RMenuDirectory (Split-Path $path -Parent)
            $last=@{state='request_pending';request_id=([Guid]::NewGuid().ToString('D'));at=[DateTime]::UtcNow.ToString('o')}
            Write-RMenuJournal $path $last -Create
        }
        $response=Invoke-RMenuCalibrationApi $Config @{operation='calibration_start';request_id=$last.request_id;queue_name=$Config.queue_name;paper_width_mm=[int]$Config.paper_width_mm} $Request
        $test=$response.test
        $testId=[Guid]::Parse($test.test_id).ToString('D')
        if($test.queue_name -cne $Config.queue_name -or $test.paper_width_mm -ne $Config.paper_width_mm -or $test.state -ne 'requested'){throw 'Perfil ou estado do teste divergente.'}
        $lines=@($response.lines)
        $lineWidth=if($Config.paper_width_mm -eq 80){42}else{32}
        if($lines.Count -lt 1 -or $lines.Count -gt 30){throw 'Teste inválido.'}
        foreach($line in $lines){if($line -isnot [string] -or $line.Length -gt $lineWidth -or $line -match '[\x00-\x1f\x7f]'){throw 'Teste inválido.'}}
        $record=@{state='requested';request_id=$last.request_id;test_id=$testId;at=[DateTime]::UtcNow.ToString('o')}
        Write-RMenuJournal $path $record
        if(-not $Preview -or -not $Sender){
            Add-Type -AssemblyName System.Drawing
            if(-not ('RMenuAgentReceipt' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'AgentReceipt.cs') -ReferencedAssemblies System.Drawing}
        }
        if($Preview){$null=& $Preview $Config $lines}else{$null=[RMenuAgentReceipt]::Preview($Config.queue_name,[string[]]$lines,$Config.paper_width_mm,$null)}
        $record.state='dispatch_intent';Write-RMenuJournal $path $record
        $permit=Invoke-RMenuCalibrationApi $Config @{operation='calibration_dispatch';test_id=$testId} $Request
        if($permit.accepted -ne $true){throw 'Envio do teste não autorizado. Confira o papel e a fila antes de tentar outro teste.'}
        $record.state='uncertain'
        try {
            if($Sender){$null=& $Sender $Config $lines}else{[RMenuAgentReceipt]::SendOnce($Config.queue_name,[string[]]$lines,$Config.paper_width_mm)}
            $record.state='spooler_submitted'
        } catch { }
        $record.at=[DateTime]::UtcNow.ToString('o');Write-RMenuJournal $path $record
        try{$null=Invoke-RMenuCalibrationApi $Config @{operation='calibration_finish';test_id=$testId;outcome=$record.state} $Request}catch{ }
        return $record.state
    } finally {if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
function Confirm-RMenuSelfServiceCalibration {
    param([object]$Config,[string]$StateDirectory,[scriptblock]$Request)
    $path=Get-RMenuSelfServiceCalibrationPath $Config $StateDirectory
    $last=Read-RMenuJournal $path
    if($null -eq $last -or $last.state -notin @('spooler_submitted','uncertain','paper_confirmed')){throw 'Confirme somente o papel do teste enviado por este assistente.'}
    $testId=[Guid]::Parse($last.test_id).ToString('D')
    if($last.state -ne 'paper_confirmed'){
        $finish=Invoke-RMenuCalibrationApi $Config @{operation='calibration_finish';test_id=$testId;outcome=$last.state} $Request
        if($finish.accepted -ne $true){throw 'Registro do envio ainda não confirmado. Confira a conexão e tente concluir novamente.'}
    }
    $confirmation=Invoke-RMenuCalibrationApi $Config @{operation='calibration_confirm';test_id=$testId} $Request
    if($confirmation.accepted -ne $true){throw 'Teste não confirmado no painel. Confira a conexão e o papel.'}
    if($last.state -ne 'paper_confirmed'){
        Write-RMenuJournal $path @{state='paper_confirmed';request_id=$last.request_id;test_id=$testId;source='operator_checkbox';at=[DateTime]::UtcNow.ToString('o')}
    }
}
Export-ModuleMember -Function Get-RMenuSelfServiceSupport,Get-RMenuSelfServiceCalibrationState,Send-RMenuSelfServiceCalibration,Confirm-RMenuSelfServiceCalibration

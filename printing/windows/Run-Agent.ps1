[CmdletBinding()]
param([switch]$Send,[switch]$Once,[string]$ExpectedOrderId,[ValidateRange(0,24)][int]$TestCycles=0,[ValidateRange(1,5)][int]$TestPollSeconds=5)
$ErrorActionPreference='Stop'
if($ExpectedOrderId){
    if(-not $Send -or (-not $Once -and $TestCycles -eq 0)){throw 'O ensaio de um pedido exige -Send e um limite de ciclos.'}
    $expectedGuid=[Guid]::Parse($ExpectedOrderId)
    if($expectedGuid -eq [Guid]::Empty){throw 'Pedido esperado inválido.'}
    $ExpectedOrderId=$expectedGuid.ToString('D')
}
if($TestCycles -gt 0 -and (-not $ExpectedOrderId -or $Once)){throw 'Ciclos de ensaio exigem um pedido esperado e não aceitam -Once.'}
if($PSVersionTable.PSEdition -ne 'Desktop'){throw 'Usar Windows PowerShell 5.1.'}
Import-Module (Join-Path $PSScriptRoot 'AgentConfig.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AgentCore.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AgentDesktop.psm1') -Force
$stateDirectory=Join-Path $env:LOCALAPPDATA 'RMenuPrintAgent'
$config=Read-RMenuConfiguration (Join-Path $stateDirectory 'device.json')
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
function Invoke-AgentApi([object]$Body) {
    $bytes=[Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress))
    # Certificado TLS validado pelo Windows; sem redirects ou token na URL/logs.
    $response=Invoke-WebRequest -UseBasicParsing -Uri $config.endpoint -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 10 -MaximumRedirection 0 -Headers @{'Authorization'=('Bearer '+$config.credential);'x-rmenu-device'=$config.device_id}
    return ($response.Content | ConvertFrom-Json)
}
if(-not $Send){
    try { $health=Invoke-AgentApi @{operation='health'};if($health.protocol_version -ne 1 -or -not $health.authenticated){throw 'protocol_invalid'} }
    catch { Write-Output 'Conexão não confirmada. Confira conexão, liberação do módulo e dispositivo; nenhuma impressão foi iniciada.';exit 1 }
    Write-Output 'Credencial e conexão confirmadas. Modo de conferência: nenhum pedido reservado ou impresso.';return
}
$mutex=New-Object Threading.Mutex($false,('Global\RMenuPrintAgent_'+$config.device_id))
$acquired=$false
try {
    try {$acquired=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$acquired=$true}
    if(-not $acquired){throw 'Outro agente deste dispositivo já está em execução.'}
    Add-Type -AssemblyName System.Drawing
    Add-Type -Path (Join-Path $PSScriptRoot 'AgentReceipt.cs') -ReferencedAssemblies System.Drawing
    $journalDirectory=Join-Path $stateDirectory 'journal'
    $api={param($body) Invoke-AgentApi $body}
    $ready={
        try {
            $printer=Get-Printer -Name $config.queue_name -ErrorAction Stop
            return [int]$printer.PrinterStatus -eq 0 -and @(Get-PrintJob -PrinterName $config.queue_name -ErrorAction Stop).Count -eq 0
        } catch {return $false}
    }
    $validate={param($job)
        if($job.document_version -ne 1 -or $job.lines.Count -lt 2 -or $job.lines.Count -gt 400){throw 'invalid_document'}
        $text=($job.lines -join "`n")+"`n"
        $sha=[Security.Cryptography.SHA256]::Create()
        try {$hash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-','').ToLowerInvariant()} finally {$sha.Dispose()}
        if($hash -cne $job.receipt_sha256){throw 'receipt_hash_mismatch'}
        $null=[RMenuAgentReceipt]::Preview($config.queue_name,[string[]]$job.lines,$config.paper_width_mm,$null)
    }
    $sendReceipt={param($job) [RMenuAgentReceipt]::SendOnce($config.queue_name,[string[]]$job.lines,$config.paper_width_mm)}
    $cycle={
            # Recupera também conexão indisponível ao iniciar com o Windows.
            $health=Invoke-AgentApi @{operation='health'}
            if($health.protocol_version -ne 1 -or -not $health.authenticated){throw 'protocol_invalid'}
            foreach($file in Get-ChildItem -LiteralPath $journalDirectory -Filter '*.jsonl' -File){$null=Sync-RMenuJournal $file.FullName $api}
            if(& $ready){
                $claimed=Invoke-AgentApi @{operation='claim'}
                if($null -ne $claimed.job){
                    if($claimed.protocol_version -ne 1 -or $claimed.device.id -ne $config.device_id -or $claimed.device.queue_name -cne $config.queue_name -or $claimed.device.paper_width_mm -ne $config.paper_width_mm -or $claimed.device.copies -ne 1){throw 'device_configuration_mismatch'}
                    # Um ensaio limitado nunca despacha outro pedido ou reimpressão.
                    # Não finaliza o job divergente; o lease expira normalmente.
                    if($ExpectedOrderId -and ($claimed.job.order_id -ne $ExpectedOrderId -or $claimed.job.purpose -ne 'initial')){
                        throw 'unexpected_test_order'
                    }
                    $outcome=Send-RMenuJob $claimed.job $journalDirectory $api $validate $sendReceipt $ready
                    Write-Output ('Resultado registrado: '+$outcome+'. Submissão não comprova papel. Não reenviar automaticamente.')
                }
            } else {Write-Output 'Fila ocupada ou impressora indisponível. Aguardando sem reservar pedido.'}
    }
    $shouldStop={Test-Path -LiteralPath (Join-Path $stateDirectory 'stop-request')}
    $wait={Start-Sleep -Seconds $(if($TestCycles -gt 0){$TestPollSeconds}else{5})}
    $onError={Write-Output 'Falha de comunicação/configuração. Registros locais preservados; sem repetição de envio iniciado.'}
    $onCycle={param($number) if($TestCycles -gt 0){Write-Output ('Ciclo do ensaio: '+$number)}}
    Invoke-RMenuPolling -Cycle $cycle -ShouldStop $shouldStop -Wait $wait -OnError $onError -OnCycle $onCycle -MaxCycles $(if($Once){1}else{$TestCycles})
} finally {if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()}

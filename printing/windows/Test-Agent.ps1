# Testes locais: transporte/HTTP simulados; nenhum pedido, credencial real ou spool.
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'AgentCore.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AgentConfig.psm1') -Force
$testRoot=Join-Path (Join-Path $PSScriptRoot '..\.local') ('agent-tests-'+[Guid]::NewGuid().ToString('D'))
$null=[IO.Directory]::CreateDirectory($testRoot)
$script:checks=0
function Assert([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message};$script:checks++}
function New-Trial {
    $directory=Join-Path $testRoot ([Guid]::NewGuid().ToString('D'));$null=[IO.Directory]::CreateDirectory($directory)
    $job=[pscustomobject]@{id=[Guid]::NewGuid().ToString('D');lease_token=[Guid]::NewGuid().ToString('D');receipt_sha256=('a'*64)}
    $trial=[pscustomobject]@{directory=$directory;job=$job;send_count=0;remote_state='leased';dispatch_error=$false;send_error=$false;deny_dispatch=$false;invalid_layout=$false;ack_error=$false;operations=(New-Object 'System.Collections.Generic.List[string]')}
    $api={param($body)
        $trial.operations.Add($body.operation)
        switch($body.operation){
            'renew' {return [pscustomobject]@{accepted=$true}}
            'dispatch' {
                if($trial.deny_dispatch){$trial.remote_state='cancelled';return [pscustomobject]@{accepted=$false}}
                $trial.remote_state='dispatching';if($trial.dispatch_error){throw 'connection_lost'}
                return [pscustomobject]@{accepted=$true}
            }
            'finish' {
                if($trial.ack_error){throw 'ack_lost'}
                $accepted=($body.outcome -eq 'failed' -and $trial.remote_state -eq 'leased') -or ($body.outcome -in @('uncertain','spooler_submitted') -and $trial.remote_state -in @('dispatching','uncertain')) -or $trial.remote_state -eq $body.outcome
                if($accepted){$trial.remote_state=$body.outcome};return [pscustomobject]@{accepted=$accepted}
            }
        }
    }.GetNewClosure()
    $validate={param($job) if($trial.invalid_layout){throw 'invalid_layout'}}.GetNewClosure()
    $send={param($job)
        $event=Read-RMenuJournal (Join-Path $trial.directory ($job.id+'.jsonl'))
        if($event.state -ne 'dispatch_authorized'){throw 'journal_not_durable'}
        $trial.send_count++;if($trial.send_error){throw 'spooler_uncertain'}
    }.GetNewClosure()
    $trial | Add-Member -NotePropertyName api -NotePropertyValue $api
    $trial | Add-Member -NotePropertyName validate -NotePropertyValue $validate
    $trial | Add-Member -NotePropertyName send -NotePropertyValue $send
    return $trial
}
function Run-Trial($trial){return Send-RMenuJob $trial.job $trial.directory $trial.api $trial.validate $trial.send {return $true}}
$trial=New-Trial
Assert ((Run-Trial $trial) -eq 'acknowledged') 'ACK ausente'
Assert ($trial.send_count -eq 1 -and $trial.remote_state -eq 'spooler_submitted') 'Submissão inválida'
Assert (($trial.operations -join ',') -eq 'renew,dispatch,finish') 'Ordem inválida'
$null=Run-Trial $trial
Assert ($trial.send_count -eq 1) 'Replay chamou transporte'
$trial=New-Trial;$trial.send_error=$true;$null=Run-Trial $trial
Assert ($trial.send_count -eq 1 -and $trial.remote_state -eq 'uncertain') 'Erro de spooler não virou incerto'
$null=Run-Trial $trial;Assert ($trial.send_count -eq 1) 'Resultado incerto repetiu spool'
$trial=New-Trial;$trial.invalid_layout=$true;$result=Run-Trial $trial
Assert ($result -eq 'failed_before_dispatch' -and $trial.send_count -eq 0 -and $trial.remote_state -eq 'failed') 'Layout inválido chegou ao spool'
Assert ($trial.operations -notcontains 'dispatch') 'Layout inválido iniciou dispatch'
$trial=New-Trial;$trial.dispatch_error=$true;$null=Run-Trial $trial
Assert ($trial.send_count -eq 0 -and $trial.remote_state -eq 'uncertain') 'Resposta perdida autorizou spool'
$trial=New-Trial;$trial.deny_dispatch=$true;$result=Run-Trial $trial
Assert ($result -eq 'dispatch_denied' -and $trial.send_count -eq 0) 'Cancelamento enviou papel'
$trial=New-Trial;$trial.directory=Join-Path $trial.directory 'inexistente';$result=Run-Trial $trial
Assert ($result -eq 'journal_unavailable' -and $trial.operations -notcontains 'dispatch' -and $trial.send_count -eq 0) 'Falha de disco iniciou envio'
$trial=New-Trial;$trial.remote_state='dispatching'
$path=Join-Path $trial.directory ($trial.job.id+'.jsonl')
Write-RMenuJournal $path @{state='dispatch_intent';job_id=$trial.job.id;lease_token=$trial.job.lease_token} -Create
$null=Run-Trial $trial;Assert ($trial.send_count -eq 0 -and $trial.remote_state -eq 'uncertain') 'Reinício após intenção enviou papel'
$trial=New-Trial;$trial.ack_error=$true;$result=Run-Trial $trial
Assert ($result -eq 'ack_pending' -and $trial.send_count -eq 1) 'Falha de ACK incorreta'
$trial.ack_error=$false;$null=Run-Trial $trial
Assert ($trial.send_count -eq 1 -and $trial.remote_state -eq 'spooler_submitted') 'ACK repetiu envio'
$trial=New-Trial;$path=Join-Path $trial.directory ($trial.job.id+'.jsonl');[IO.File]::WriteAllText($path,'corrompido')
$result=Run-Trial $trial;Assert ($result -eq 'uncertain_local_journal' -and $trial.send_count -eq 0 -and $trial.remote_state -eq 'failed') 'Journal corrompido permitiu impressão'
$trial=New-Trial;$trial.remote_state='dispatching';$path=Join-Path $trial.directory ($trial.job.id+'.jsonl')
Write-RMenuJournal $path @{state='dispatch_intent';job_id=$trial.job.id;lease_token=$trial.job.lease_token} -Create
[IO.File]::AppendAllText($path,'{"parcial":')
$null=Run-Trial $trial
Assert ((Read-RMenuJournal $path).state -eq 'acknowledged' -and $trial.send_count -eq 0) 'Journal com último registro parcial não reconciliou'

# DPAPI real, segredo fictício, diretório exclusivo dentro de printing/.local.
$secret='a1'*32;$device=[Guid]::NewGuid().ToString('D')
$provision=Join-Path $testRoot 'provisioning.json'
[IO.File]::WriteAllText($provision,(@{schema_version=1;device_id=$device;endpoint='http://teste1.localhost:3010/api/printing/agent';queue_name='Fila fictícia';paper_width_mm=58;credential=$secret}|ConvertTo-Json),[Text.Encoding]::UTF8)
$saved=Install-RMenuConfiguration $provision (Join-Path $testRoot 'state')
Assert (-not [IO.File]::ReadAllText($saved).Contains($secret)) 'Segredo salvo sem proteção'
Assert ((Read-RMenuConfiguration $saved).credential -ceq $secret) 'DPAPI não recuperou segredo'
$duplicateRejected=$false
try{$null=Install-RMenuConfiguration $provision (Join-Path $testRoot 'state')}catch{$duplicateRejected=$true}
Assert $duplicateRejected 'Instalação sobrescreveu credencial existente'
Assert (-not (Test-RMenuEndpoint 'https://rmenu.com.br.evil.invalid/api/printing/agent')) 'Endpoint de terceiro aceito'
Assert (-not (Test-RMenuEndpoint 'http://rmenu.com.br/api/printing/agent')) 'HTTP remoto aceito'
Assert (-not (Test-RMenuEndpoint 'https://rmenu.com.br/api/printing/agent?credential=x')) 'Credencial em URL aceita'

# Compila o driver sem instanciar PrintDocument ou chamar Print/Preview.
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'AgentReceipt.cs') -ReferencedAssemblies System.Drawing
Assert ($null -ne ('RMenuAgentReceipt' -as [type])) 'Driver não compilou'
Write-Output ("PASS: $script:checks verificações locais; transporte simulado, DPAPI real e C# compilado. Nenhum spool ou pedido real.")

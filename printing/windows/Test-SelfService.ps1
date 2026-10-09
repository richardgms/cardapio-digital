$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'AgentCalibration.psm1') -Force
$script:checks=0
function Assert([bool]$Condition,[string]$Message){if(-not $Condition){throw $Message};$script:checks++}
$root=Join-Path (Split-Path $PSScriptRoot -Parent) ('.local/self-service-tests-'+[Guid]::NewGuid().ToString('N'))
$config=@{device_id=[Guid]::NewGuid().ToString('D');queue_name='Fila ficticia';paper_width_mm=58}
$case=@{sends=0;finishOffline=$true;confirmOffline=$false;dispatchOffline=$false;startOffline=$false;permit=$true;profile='Fila ficticia';test=[Guid]::NewGuid().ToString('D');requests=@()}
$request={param($body)
 $case.requests+=@($body.operation)
 switch($body.operation){
  'calibration_start' {if($case.startOffline){throw 'offline'};return [pscustomobject]@{test=[pscustomobject]@{test_id=$case.test;state='requested';queue_name=$case.profile;paper_width_mm=58};lines=@('TESTE FICTICIO - SEM PEDIDO REAL')}}
  'calibration_dispatch' {if($case.dispatchOffline){throw 'response_lost'};return [pscustomobject]@{accepted=$case.permit}}
  'calibration_finish' {if($case.finishOffline){throw 'offline'};return [pscustomobject]@{accepted=$true}}
  'calibration_confirm' {if($case.confirmOffline){throw 'offline'};return [pscustomobject]@{accepted=$true}}
 }
}
$ready={$true};$preview={};$sender={$case.sends++}
Assert (-not (Get-RMenuSelfServiceSupport $config { [pscustomobject]@{protocol_version=1;authenticated=$true} })) 'Servidor antigo anuncia recurso inexistente'
Assert (Get-RMenuSelfServiceSupport $config { [pscustomobject]@{protocol_version=1;authenticated=$true;self_service_calibration=$true} }) 'Recurso disponível não reconhecido'
Assert ((Send-RMenuSelfServiceCalibration $config $root $request $ready $preview $sender) -eq 'spooler_submitted') 'Envio falhou após perda do recibo remoto'
Assert ($case.sends -eq 1) 'Teste não enviado uma vez'
Assert ((Send-RMenuSelfServiceCalibration $config $root $request $ready $preview $sender) -eq 'already_requested' -and $case.sends -eq 1) 'Perda de resposta repetiu papel'
$blocked=$false;try{Confirm-RMenuSelfServiceCalibration $config $root $request}catch{$blocked=$true}
Assert ($blocked -and (Get-RMenuSelfServiceCalibrationState $config $root) -eq 'spooler_submitted') 'Offline gravou confirmação humana local'
$case.finishOffline=$false;$case.confirmOffline=$true
$blocked=$false;try{Confirm-RMenuSelfServiceCalibration $config $root $request}catch{$blocked=$true}
Assert ($blocked -and (Get-RMenuSelfServiceCalibrationState $config $root) -eq 'spooler_submitted') 'Resposta perdida marcou confirmação'
$case.confirmOffline=$false
Confirm-RMenuSelfServiceCalibration $config $root $request
Confirm-RMenuSelfServiceCalibration $config $root $request
Assert ((Get-RMenuSelfServiceCalibrationState $config $root) -eq 'paper_confirmed' -and $case.sends -eq 1) 'Repetição da confirmação imprimiu novamente'
$config.device_id=[Guid]::NewGuid().ToString('D');$case.startOffline=$true
$blocked=$false;try{Send-RMenuSelfServiceCalibration $config $root $request $ready $preview $sender}catch{$blocked=$true}
Assert ($blocked -and $case.sends -eq 1 -and (Get-RMenuSelfServiceCalibrationState $config $root) -eq 'request_pending') 'Falha antes da autorização enviou papel'
$case.startOffline=$false
Assert ((Send-RMenuSelfServiceCalibration $config $root $request $ready $preview $sender) -eq 'spooler_submitted' -and $case.sends -eq 2) 'Reconexão antes do envio não retomou'
$config.device_id=[Guid]::NewGuid().ToString('D');$case.dispatchOffline=$true
$blocked=$false;try{Send-RMenuSelfServiceCalibration $config $root $request $ready $preview $sender}catch{$blocked=$true}
Assert ($blocked -and $case.sends -eq 2) 'Autorização com resposta perdida enviou papel'
$case.dispatchOffline=$false
Assert ((Send-RMenuSelfServiceCalibration $config $root $request $ready $preview $sender) -eq 'already_requested' -and $case.sends -eq 2) 'Autorização incerta repetiu envio'
$config.device_id=[Guid]::NewGuid().ToString('D');$case.profile='Outra fila'
$blocked=$false;try{Send-RMenuSelfServiceCalibration $config $root $request $ready $preview $sender}catch{$blocked=$true}
Assert ($blocked -and $case.sends -eq 2) 'Perfil divergente foi enviado'
$config.device_id=[Guid]::NewGuid().ToString('D');$case.profile='Fila ficticia'
Assert ((Send-RMenuSelfServiceCalibration $config $root $request $ready $preview {throw 'partial_send'}) -eq 'uncertain') 'Falha parcial foi tratada como sucesso'
Assert ((Send-RMenuSelfServiceCalibration $config $root $request $ready $preview $sender) -eq 'already_requested' -and $case.sends -eq 2) 'Falha parcial foi reenviada'
$config.device_id=[Guid]::NewGuid().ToString('D')
$path=Join-Path (Join-Path $root 'self-service-calibration') ($config.device_id+'.jsonl')
[IO.File]::WriteAllText($path,'corrupted')
Assert ((Get-RMenuSelfServiceCalibrationState $config $root) -eq 'uncertain_journal') 'Journal corrompido não bloqueou'
Assert ((Send-RMenuSelfServiceCalibration $config $root $request $ready $preview $sender) -eq 'already_requested' -and $case.sends -eq 2) 'Journal corrompido enviou teste'
$config.device_id=[Guid]::NewGuid().ToString('D')
$blocked=$false;try{Send-RMenuSelfServiceCalibration $config $root $request {$false} $preview $sender}catch{$blocked=$true}
Assert ($blocked -and (Get-RMenuSelfServiceCalibrationState $config $root) -eq 'not_requested') 'Impressora ocupada iniciou solicitação'
Write-Output ('PASS: '+$script:checks+' verificações de ativação autônoma. Sem impressora, credencial real ou rede.')

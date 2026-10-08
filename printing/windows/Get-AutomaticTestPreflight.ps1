[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'AgentConfig.psm1') -Force
$config=Read-RMenuConfiguration (Join-Path $env:LOCALAPPDATA 'RMenuPrintAgent/device.json')
if($config.endpoint -cne 'http://127.0.0.1:3010/api/printing/agent'){throw 'O ensaio exige o aplicativo local na porta 3010.'}
if($config.queue_name -cne 'EPSON TM-T20X Receipt' -or $config.paper_width_mm -ne 80){throw 'Este ensaio exige a Epson conferida, com rolo de 80 mm.'}
$printer=Get-Printer -Name $config.queue_name -ErrorAction Stop
if([int]$printer.PrinterStatus -ne 0 -or @(Get-PrintJob -PrinterName $config.queue_name -ErrorAction Stop).Count -ne 0){throw 'Impressora indisponível ou fila ocupada.'}
$response=Invoke-WebRequest -UseBasicParsing -Uri $config.endpoint -Method Post -ContentType 'application/json' -Body '{"operation":"health"}' -TimeoutSec 10 -MaximumRedirection 0 -Headers @{'Authorization'=('Bearer '+$config.credential);'x-rmenu-device'=$config.device_id}
$health=$response.Content | ConvertFrom-Json
if($health.protocol_version -ne 1 -or -not $health.authenticated){throw 'Conexão do agente não confirmada.'}
# A credencial permanece somente na memória deste processo.
@{device_id=$config.device_id;queue_name=$config.queue_name;paper_width_mm=$config.paper_width_mm;authenticated=$true;printer_ready=$true} | ConvertTo-Json -Compress

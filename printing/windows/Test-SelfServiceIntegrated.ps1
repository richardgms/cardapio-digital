param([Parameter(Mandatory=$true)][string]$FixturePath,[Parameter(Mandatory=$true)][string]$ReportPath)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'AgentCalibration.psm1') -Force
$fixture=Get-Content -LiteralPath $FixturePath -Raw -Encoding UTF8 | ConvertFrom-Json
$endpoint=[Uri]$fixture.endpoint
if(-not $fixture.isolated_fixture -or $endpoint.Scheme -ne 'http' -or $endpoint.Host -ne '127.0.0.1' -or $endpoint.AbsolutePath -cne '/api/printing/agent' -or $endpoint.Query -or $fixture.credential -cnotmatch '^[0-9a-f]{64}$'){throw 'Fixture local inválida.'}
$api={param($body)
 $bytes=[Text.Encoding]::UTF8.GetBytes(($body|ConvertTo-Json -Compress))
 $response=Invoke-WebRequest -UseBasicParsing -Uri $fixture.endpoint -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 10 -MaximumRedirection 0 -Headers @{'Authorization'=('Bearer '+$fixture.credential);'x-rmenu-device'=$fixture.device_id}
 return ($response.Content|ConvertFrom-Json)
}.GetNewClosure()
$state=Join-Path (Split-Path $FixturePath -Parent) $fixture.device_id
$spool=@{sends=0;lineWidth=0}
$sender={param($config,$lines) $spool.sends++;foreach($line in $lines){$spool.lineWidth=[Math]::Max($spool.lineWidth,$line.Length)}}
if(-not (Get-RMenuSelfServiceSupport $fixture $api)){throw 'Capacidade ausente.'}
$first=Send-RMenuSelfServiceCalibration $fixture $state $api {$true} {} $sender
Confirm-RMenuSelfServiceCalibration $fixture $state $api
$second=Send-RMenuSelfServiceCalibration $fixture $state $api {$true} {} $sender
Confirm-RMenuSelfServiceCalibration $fixture $state $api
$report=@{first=$first;second=$second;state=(Get-RMenuSelfServiceCalibrationState $fixture $state);sends=$spool.sends;max_line_width=$spool.lineWidth;physical_send=$false}
[IO.File]::WriteAllText($ReportPath,($report|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))

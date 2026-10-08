[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$FixturePath,[Parameter(Mandatory=$true)][string]$ReportPath,[switch]$PhysicalSend)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -ne 'Desktop'){throw 'Usar Windows PowerShell 5.1.'}
Import-Module (Join-Path $PSScriptRoot 'AgentCore.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AgentConfig.psm1') -Force
$fixture=Get-Content -LiteralPath $FixturePath -Raw | ConvertFrom-Json
$endpoint=[Uri]$fixture.endpoint
if(-not $fixture.isolated_fixture -or $endpoint.Scheme -ne 'http' -or $endpoint.Host -ne '127.0.0.1' -or $endpoint.AbsolutePath -cne '/api/printing/agent' -or $endpoint.Query -or $fixture.credential -cnotmatch '^[0-9a-f]{64}$'){throw 'Fixture local inválida.'}
$directory=Split-Path -Parent $FixturePath
Protect-RMenuDirectory $directory
$journalDirectory=Join-Path $directory 'journal'
Protect-RMenuDirectory $journalDirectory
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'AgentReceipt.cs') -ReferencedAssemblies System.Drawing
$api={param($body)
    $bytes=[Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress))
    $response=Invoke-WebRequest -UseBasicParsing -Uri $fixture.endpoint -Method Post -ContentType 'application/json; charset=utf-8' -Body $bytes -TimeoutSec 10 -MaximumRedirection 0 -Headers @{'Authorization'=('Bearer '+$fixture.credential);'x-rmenu-device'=$fixture.device_id}
    return ($response.Content | ConvertFrom-Json)
}.GetNewClosure()
$health=& $api @{operation='health'}
if($health.protocol_version -ne 1 -or -not $health.authenticated){throw 'Health de ensaio inválido.'}
$claimed=& $api @{operation='claim'}
$report=[ordered]@{health_confirmed=$true;physical_mode=[bool]$PhysicalSend.IsPresent;job_received=$null -ne $claimed.job;preview_generated=$false;outcome='no_job';journal_acknowledged=$false}
if($null -ne $claimed.job){
    if($claimed.job.order_id -cne $fixture.order_id -or $claimed.job.id -cne $fixture.job_id -or $claimed.device.id -cne $fixture.device_id -or $claimed.device.queue_name -cne $fixture.queue_name -or $claimed.device.paper_width_mm -ne 80 -or $claimed.device.copies -ne 1){throw 'Job fora da fixture isolada.'}
    $ready={
        $printer=Get-Printer -Name $fixture.queue_name -ErrorAction Stop
        return [int]$printer.PrinterStatus -eq 0 -and @(Get-PrintJob -PrinterName $fixture.queue_name -ErrorAction Stop).Count -eq 0
    }.GetNewClosure()
    $previewPath=Join-Path $directory 'receipt-preview.png'
    $validate={param($job)
        if($job.document_version -ne 1 -or $job.lines.Count -lt 2 -or $job.lines.Count -gt 400){throw 'Documento inválido.'}
        $sha=[Security.Cryptography.SHA256]::Create()
        try {$hash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($job.lines -join "`n")+"`n")))).Replace('-','').ToLowerInvariant()} finally {$sha.Dispose()}
        if($hash -cne $job.receipt_sha256){throw 'Checksum inválido.'}
        $null=[RMenuAgentReceipt]::Preview($fixture.queue_name,[string[]]$job.lines,80,$previewPath)
    }.GetNewClosure()
    $physicalMode=[bool]$PhysicalSend.IsPresent
    $sendReceipt={param($job)
        if($physicalMode){[RMenuAgentReceipt]::SendOnce($fixture.queue_name,[string[]]$job.lines,80)}
        # No padrão, callback sem spooler. SQL/journal são da fixture isolada.
    }.GetNewClosure()
    $report.outcome=Send-RMenuJob $claimed.job $journalDirectory $api $validate $sendReceipt $ready
    $report.preview_generated=Test-Path -LiteralPath $previewPath
    $event=Read-RMenuJournal (Join-Path $journalDirectory ($claimed.job.id+'.jsonl'))
    $report.journal_acknowledged=$null -ne $event -and $event.state -eq 'acknowledged'
}
[IO.File]::WriteAllText($ReportPath,($report | ConvertTo-Json -Compress),([Text.UTF8Encoding]::new($false)))
Write-Output ('Ensaio isolado: '+$report.outcome+'. Modo físico: '+$report.physical_mode+'.')

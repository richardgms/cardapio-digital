# Windows PowerShell 5.1. Somente funções: importar não imprime ou conecta.
Set-StrictMode -Version Latest

function Write-RMenuJournal {
    param([string]$Path, [object]$Event, [switch]$Create)
    $mode = if ($Create) { [IO.FileMode]::CreateNew } else { [IO.FileMode]::Append }
    $stream = [IO.File]::Open($Path,$mode,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    try {
        $prefix = if ($Create) { "" } else { "`n" }
        $bytes = [Text.Encoding]::UTF8.GetBytes($prefix + ($Event | ConvertTo-Json -Depth 8 -Compress) + "`n")
        $stream.Write($bytes,0,$bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
}
function Read-RMenuJournal {
    param([string]$Path)
    # Um arquivo existente, mesmo vazio/corrompido, nunca autoriza novo envio.
    $last = $null
    foreach ($line in [IO.File]::ReadAllLines($Path,[Text.Encoding]::UTF8)) {
        try { $event = $line | ConvertFrom-Json -ErrorAction Stop; if ($event.state) { $last=$event } }
        catch { continue }
    }
    return $last
}
function Sync-RMenuJournal {
    param([string]$Path,[scriptblock]$Api)
    $event = Read-RMenuJournal $Path
    if ($null -eq $event) { return 'uncertain_local_journal' }
    if ($event.state -eq 'acknowledged' -or $event.state -eq 'dispatch_denied') { return $event.state }
    $outcome = if ($event.state -eq 'spooler_submitted') { 'spooler_submitted' } else { 'uncertain' }
    try {
        $result = & $Api @{operation='finish';job_id=$event.job_id;lease_token=$event.lease_token;outcome=$outcome}
        if ($result.accepted) {
            Write-RMenuJournal $Path ([ordered]@{state='acknowledged';job_id=$event.job_id;lease_token=$event.lease_token;outcome=$outcome;at=[DateTime]::UtcNow.ToString('o')})
            return 'acknowledged'
        }
    } catch { return 'ack_pending' }
    return 'ack_pending'
}
function Send-RMenuJob {
    param([object]$Job,[string]$JournalDirectory,[scriptblock]$Api,[scriptblock]$Validate,[scriptblock]$Send,[scriptblock]$PrinterReady)
    $jobId = [Guid]::Parse($Job.id).ToString('D')
    $lease = [Guid]::Parse($Job.lease_token).ToString('D')
    $path = Join-Path $JournalDirectory ($jobId + '.jsonl')
    if (Test-Path -LiteralPath $path) {
        $synced=Sync-RMenuJournal $path $Api
        # Uma nova reserva de job com journal antigo é encerrada antes de enviar.
        # Dispatch/uncertain nunca aceitam este resultado 'failed' no servidor.
        try { $null=& $Api @{operation='finish';job_id=$jobId;lease_token=$lease;outcome='failed'} } catch { }
        return $synced
    }
    try {
        & $Validate $Job
        if (-not (& $PrinterReady)) { throw 'printer_unavailable' }
        $renewed = & $Api @{operation='renew';job_id=$jobId;lease_token=$lease}
        if (-not $renewed.accepted) { return 'lease_invalid' }
    } catch {
        try { $null = & $Api @{operation='finish';job_id=$jobId;lease_token=$lease;outcome='failed'} } catch { }
        return 'failed_before_dispatch'
    }
    try {
        Write-RMenuJournal $path ([ordered]@{state='dispatch_intent';job_id=$jobId;lease_token=$lease;receipt_sha256=$Job.receipt_sha256;at=[DateTime]::UtcNow.ToString('o')}) -Create
    } catch {
        # CreateNew é uma segunda barreira contra processos simultâneos.
        return 'journal_unavailable'
    }
    try {
        $permit = & $Api @{operation='dispatch';job_id=$jobId;lease_token=$lease}
        if (-not $permit.accepted) {
            Write-RMenuJournal $path ([ordered]@{state='dispatch_denied';job_id=$jobId;lease_token=$lease;at=[DateTime]::UtcNow.ToString('o')})
            return 'dispatch_denied'
        }
        Write-RMenuJournal $path ([ordered]@{state='dispatch_authorized';job_id=$jobId;lease_token=$lease;at=[DateTime]::UtcNow.ToString('o')})
        # Depois deste ponto qualquer erro pode ter ocorrido após envio parcial.
        & $Send $Job
        Write-RMenuJournal $path ([ordered]@{state='spooler_submitted';job_id=$jobId;lease_token=$lease;at=[DateTime]::UtcNow.ToString('o')})
    } catch {
        try { Write-RMenuJournal $path ([ordered]@{state='uncertain';job_id=$jobId;lease_token=$lease;at=[DateTime]::UtcNow.ToString('o')}) } catch { }
    }
    return (Sync-RMenuJournal $path $Api)
}
Export-ModuleMember -Function Write-RMenuJournal,Read-RMenuJournal,Sync-RMenuJournal,Send-RMenuJob

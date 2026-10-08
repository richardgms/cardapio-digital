[CmdletBinding()]
param(
    [ValidateSet(58,80)][int]$PaperWidthMm = 80,
    [ValidatePattern('^[a-zA-Z0-9-]{1,64}$')][string]$TrialId = 'initial-80mm',
    [switch]$Send
)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSEdition -ne 'Desktop') { throw 'Executar com Windows PowerShell 5.1 (powershell.exe), que possui System.Drawing do Windows.' }
$printingRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$localDirectory = Join-Path $printingRoot '.local'
$receiptPath = Join-Path $localDirectory "receipt-test-${PaperWidthMm}mm.txt"
$previewPath = Join-Path $localDirectory "receipt-test-${PaperWidthMm}mm.png"
$journalPath = Join-Path $localDirectory "dispatch-${TrialId}.json"
$printerName = 'EPSON TM-T20X Receipt'
if (-not (Test-Path -LiteralPath $receiptPath)) { throw 'Gerar primeiro o recibo com npx tsx printing/generate-test-receipt.ts 80 (ou 58).' }
$receiptText = [IO.File]::ReadAllText($receiptPath, [Text.Encoding]::UTF8)
if (-not $receiptText.StartsWith('TESTE FICTÍCIO') -or -not $receiptText.Contains('CLIENTE FICTÍCIO') -or -not $receiptText.Contains('00000000000')) { throw 'Recibo deve ser a fixture de teste, sem dados reais.' }
$lines = [string[]]($receiptText.TrimEnd("`r", "`n") -split "`n")
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'ControlledReceipt.cs') -ReferencedAssemblies System.Drawing
$previewInfo = [RMenuControlledReceipt]::Preview($printerName, $lines, $PaperWidthMm, $previewPath)
Write-Output $previewInfo
Write-Output "Preview: $previewPath"
if (-not $Send) { return }
if (Test-Path -LiteralPath $journalPath) { throw 'Este ensaio já foi iniciado. Resultado pode ser incerto; não repetir automaticamente. Nova via exige outro TrialId explícito.' }
if (@(Get-PrintJob -PrinterName $printerName).Count -gt 0) { throw 'Fila não está vazia; aguardar/conferir trabalhos existentes antes do ensaio.' }
$printer = Get-Printer -Name $printerName
if ([int]$printer.PrinterStatus -ne 0) { throw 'Impressora sinaliza condição que precisa ser conferida antes do ensaio.' }
$trial = [ordered]@{trial_id=$TrialId;printer=$printerName;paper_width_mm=$PaperWidthMm;copies=1;receipt_sha256=(Get-FileHash -LiteralPath $receiptPath -Algorithm SHA256).Hash;state='dispatching';started_at=[DateTime]::UtcNow.ToString('o')}
# CreateNew + Flush(true) antes de chamar o spooler: falha/reinício não autoriza repetir.
$journalStream = [IO.File]::Open($journalPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($trial | ConvertTo-Json))
    $journalStream.Write($bytes,0,$bytes.Length)
    $journalStream.Flush($true)
} finally { $journalStream.Dispose() }
try {
    [RMenuControlledReceipt]::SendOnce($printerName, $lines, $PaperWidthMm)
    $trial.state = 'spooler_submitted'
    $trial['completed_at'] = [DateTime]::UtcNow.ToString('o')
    [IO.File]::WriteAllText($journalPath,($trial | ConvertTo-Json),[Text.Encoding]::UTF8)
    Write-Output 'Uma via fictícia submetida ao spooler. Papel e corte aguardam confirmação física; não repetir automaticamente.'
} catch {
    Write-Output 'Resultado incerto após início do envio. O registro local bloqueia repetição automática. Conferir papel/fila antes de decidir nova via.'
    throw
}

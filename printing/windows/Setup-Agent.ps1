[CmdletBinding()]
param([string]$PreviewPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
Import-Module (Join-Path $PSScriptRoot 'AgentConfig.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AgentDesktop.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AgentCalibration.psm1') -Force
$stateDirectory=Join-Path $env:LOCALAPPDATA 'RMenuPrintAgent'
$setupState=@{config=$null;configured=$false;connected=$false;selfService=$false}
$form=New-Object Windows.Forms.Form
$form.Text='Conectar impressora · RMenu';$form.ClientSize=New-Object Drawing.Size(600,745)
$form.StartPosition='CenterScreen';$form.FormBorderStyle='FixedDialog';$form.MaximizeBox=$false
$form.Font=New-Object Drawing.Font('Segoe UI',10)
function Add-SetupLabel([string]$Text,[int]$Y,[int]$Height=32,[bool]$Heading=$false){
    $label=New-Object Windows.Forms.Label;$label.SetBounds(28,$Y,545,$Height);$label.Text=$Text
    if($Heading){$label.Font=New-Object Drawing.Font('Segoe UI',14,[Drawing.FontStyle]::Bold)}
    $form.Controls.Add($label);return $label
}
$null=Add-SetupLabel 'Sua impressora conectada ao RMenu' 24 38 $true
$null=Add-SetupLabel 'Faça esta configuração uma vez no computador do restaurante.' 68 30
$null=Add-SetupLabel '1. Escolha a impressora e confira o papel' 112 32 $true
$printerChoice=New-Object Windows.Forms.ComboBox;$printerChoice.SetBounds(28,153,430,32);$printerChoice.DropDownStyle='DropDownList'
try {foreach($printer in Get-Printer -ErrorAction Stop){$null=$printerChoice.Items.Add($printer.Name)}} catch { }
if($printerChoice.Items.Count -gt 0){$printerChoice.SelectedIndex=0}
$paperChoice=New-Object Windows.Forms.ComboBox;$paperChoice.SetBounds(473,153,98,32);$paperChoice.DropDownStyle='DropDownList'
$null=$paperChoice.Items.AddRange(@('80 mm','58 mm'));$paperChoice.SelectedIndex=-1
$copyName=New-Object Windows.Forms.Button;$copyName.SetBounds(28,199,240,36);$copyName.Text='Copiar nome da impressora'
$hint=Add-SetupLabel 'No painel da sua loja, abra Impressão. Cole o nome, escolha a mesma largura e baixe a configuração.' 247 58
$null=Add-SetupLabel '2. Conecte este computador à sua loja' 315 32 $true
$chooseFile=New-Object Windows.Forms.Button;$chooseFile.SetBounds(28,361,240,38);$chooseFile.Text='Selecionar configuração'
$check=New-Object Windows.Forms.Button;$check.SetBounds(282,361,290,38);$check.Text='Conferir conexão';$check.Enabled=$false
$status=Add-SetupLabel 'A configuração é baixada no painel RMenu. Não envie esse arquivo a outras pessoas.' 417 64
$null=Add-SetupLabel '3. Confira uma única via de teste' 497 32 $true
$testPrint=New-Object Windows.Forms.Button;$testPrint.SetBounds(28,540,240,36);$testPrint.Text='Imprimir teste fictício';$testPrint.Enabled=$false
$confirmed=New-Object Windows.Forms.CheckBox;$confirmed.SetBounds(28,589,545,42);$confirmed.Text='Saiu legível, uma via, com o corte correto para esta impressora.';$confirmed.Enabled=$false
$autoStart=New-Object Windows.Forms.CheckBox;$autoStart.SetBounds(28,638,545,30);$autoStart.Text='Iniciar automaticamente quando eu entrar no Windows';$autoStart.Checked=$true
$finish=New-Object Windows.Forms.Button;$finish.SetBounds(28,683,545,42);$finish.Text='Concluir e abrir RMenu Impressão';$finish.Enabled=$false
$form.Controls.AddRange(@($printerChoice,$paperChoice,$copyName,$chooseFile,$check,$testPrint,$confirmed,$autoStart,$finish))
$copyName.Add_Click({
    if($null -eq $printerChoice.SelectedItem){$status.Text='Instale o driver da impressora no Windows e abra este assistente novamente.';return}
    [Windows.Forms.Clipboard]::SetText([string]$printerChoice.SelectedItem)
    $status.Text='Nome copiado. Cole no campo “Impressora no Windows” do painel.'
})
$chooseFile.Add_Click({
    $dialog=New-Object Windows.Forms.OpenFileDialog
    $dialog.Title='Escolha a configuração baixada no painel da sua loja';$dialog.Filter='Configuração RMenu (*.json)|*.json'
    try {
        if($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){return}
        if(Test-Path -LiteralPath (Join-Path $stateDirectory 'device.json')){$status.Text='Este computador já está conectado. Confira a conexão; para trocar de loja ou credencial, solicite suporte.';return}
        if((Get-Item -LiteralPath $dialog.FileName).Length -gt 16384){$status.Text='Arquivo inválido. Selecione somente a configuração baixada no painel RMenu.';return}
        $candidate=[IO.File]::ReadAllText($dialog.FileName,[Text.Encoding]::UTF8) | ConvertFrom-Json
        if($printerChoice.Items -notcontains $candidate.queue_name){$status.Text='A impressora cadastrada não está instalada neste computador. Confira o nome no painel ou instale o driver.';return}
        if($paperChoice.SelectedIndex -lt 0 -or [string]$printerChoice.SelectedItem -cne $candidate.queue_name -or [int](([string]$paperChoice.SelectedItem).Split(' ')[0]) -ne $candidate.paper_width_mm){$status.Text='Escolha aqui a mesma impressora e largura que você cadastrou no painel.';return}
        $null=Install-RMenuConfiguration $dialog.FileName $stateDirectory
        $null=Install-RMenuApplication $PSScriptRoot $stateDirectory
        $setupState.config=Read-RMenuConfiguration (Join-Path $stateDirectory 'device.json')
        $setupState.configured=$true;$check.Enabled=$true
        $printerChoice.Enabled=$false;$paperChoice.Enabled=$false
        $status.Text='Computador conectado. Clique em “Conferir conexão”. Depois, remova a cópia baixada da configuração.'
    } catch {$status.Text='Não foi possível conectar. Confira o arquivo do painel e tente novamente. Uma configuração existente será preservada.'}
    finally {$dialog.Dispose()}
})
$check.Add_Click({
    if(-not $setupState.configured){return}
    $status.Text='Conferindo conexão…';$form.Refresh()
    $connection=Get-RMenuConnectionStatus $setupState.config
    $setupState.connected=$connection -eq 'connected';$finish.Enabled=$false;$testPrint.Enabled=$false;$confirmed.Enabled=$false
    if($setupState.connected){
        try {$setupState.selfService=Get-RMenuSelfServiceSupport $setupState.config}catch{$setupState.connected=$false;$status.Text='Não foi possível conferir o assistente agora. Tente conferir a conexão novamente.';return}
        $calibration=if($setupState.selfService){Get-RMenuSelfServiceCalibrationState $setupState.config $stateDirectory}else{Get-RMenuCalibrationState $setupState.config $stateDirectory}
        $testPrint.Enabled=$calibration -in @('not_requested','request_pending','requested')
        $confirmed.Enabled=$calibration -in @('spooler_submitted','uncertain','paper_confirmed')
        $confirmed.Checked=$calibration -eq 'paper_confirmed'
        $finish.Enabled=$confirmed.Checked
        $status.Text=if($testPrint.Enabled){'Conexão confirmada. Clique em “Imprimir teste fictício” e confira uma única via.'}else{'Teste já solicitado. Confira o papel; o assistente não repete o envio.'}
    }
    elseif($connection -eq 'unauthorized'){$status.Text='A conexão foi revogada. Cadastre este computador novamente pelo painel e solicite suporte para a troca.'}
    else {$status.Text='Não conseguimos conectar agora. Confira a internet e tente “Conferir conexão” novamente.'}
})
$testPrint.Add_Click({
    if(-not $setupState.connected){return}
    $testPrint.Enabled=$false
    try {
        $outcome=if($setupState.selfService){Send-RMenuSelfServiceCalibration $setupState.config $stateDirectory}else{Send-RMenuCalibration $setupState.config $stateDirectory}
        $confirmed.Enabled=$outcome -in @('spooler_submitted','uncertain')
        $status.Text=if($outcome -eq 'spooler_submitted'){'Teste enviado. Confira o papel e marque a confirmação abaixo.'}else{'Resultado não confirmado. Confira papel e fila; não repetir automaticamente.'}
    } catch {$status.Text='Teste não iniciado. Confira papel, impressora e fila. Depois confira a conexão novamente.'}
})
$confirmed.Add_CheckedChanged({$finish.Enabled=$setupState.connected -and $confirmed.Enabled -and $confirmed.Checked})
$finish.Add_Click({
    if(-not $setupState.connected -or -not $confirmed.Checked){return}
    try {
        if($setupState.selfService){Confirm-RMenuSelfServiceCalibration $setupState.config $stateDirectory}else{Confirm-RMenuCalibration $setupState.config $stateDirectory}
        $applicationDirectory=Install-RMenuApplication $PSScriptRoot $stateDirectory
        Set-RMenuAutoStart $stateDirectory $autoStart.Checked
        $arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File "'+(Join-Path $applicationDirectory 'AgentMonitor.ps1')+'"'
        $null=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru
        $form.Close()
    } catch {$status.Text='Não foi possível concluir. A configuração foi preservada; confira a conexão ou solicite suporte.'}
})
if(-not $PreviewPath -and (Test-Path -LiteralPath (Join-Path $stateDirectory 'device.json'))){
    try {
        $setupState.config=Read-RMenuConfiguration (Join-Path $stateDirectory 'device.json')
        $setupState.configured=$true;$check.Enabled=$true;$chooseFile.Enabled=$false
        $printerChoice.SelectedItem=$setupState.config.queue_name;$paperChoice.SelectedItem=([string]$setupState.config.paper_width_mm)+' mm'
        $printerChoice.Enabled=$false;$paperChoice.Enabled=$false
        $status.Text='Este computador já está conectado. Confira a conexão para concluir a instalação ou atualizar o aplicativo.'
    } catch {$status.Text='A configuração existente precisa de suporte. Ela foi preservada.'}
}
try {
    if($PreviewPath){
        $form.ShowInTaskbar=$false;$form.Opacity=0
        $form.Show();$form.Refresh()
        $bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height)
        try {$form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bitmap.Save([IO.Path]::GetFullPath($PreviewPath),[Drawing.Imaging.ImageFormat]::Png)}finally{$bitmap.Dispose()}
    } else {$null=$form.ShowDialog()}
} finally {$form.Dispose()}

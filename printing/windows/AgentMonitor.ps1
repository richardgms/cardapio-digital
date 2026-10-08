[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
Import-Module (Join-Path $PSScriptRoot 'AgentConfig.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'AgentDesktop.psm1') -Force
$stateDirectory=Join-Path $env:LOCALAPPDATA 'RMenuPrintAgent'
try {$config=Read-RMenuConfiguration (Join-Path $stateDirectory 'device.json')}
catch {[Windows.Forms.MessageBox]::Show('Abra o instalador RMenu para conectar este computador.','RMenu Impressão') | Out-Null;exit 1}
$mutex=New-Object Threading.Mutex($false,('Local\RMenuMonitor_'+$config.device_id))
$acquired=$false
try {
    try {$acquired=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$acquired=$true}
    if(-not $acquired){return}
    $runtime=@{worker=$null;paused=$false;quitting=$false}
    $stopPath=Join-Path $stateDirectory 'stop-request'
    $form=New-Object Windows.Forms.Form
    $form.Text='RMenu Impressão';$form.ClientSize=New-Object Drawing.Size(460,245);$form.StartPosition='CenterScreen'
    $form.Font=New-Object Drawing.Font('Segoe UI',10)
    $heading=New-Object Windows.Forms.Label;$heading.SetBounds(24,24,410,42);$heading.Text='Conectando…';$heading.Font=New-Object Drawing.Font('Segoe UI',16,[Drawing.FontStyle]::Bold)
    $description=New-Object Windows.Forms.Label;$description.SetBounds(24,78,410,75);$description.Text=$config.queue_name+' · '+$config.paper_width_mm+' mm'+"`r`nAtive pedidos novos no painel da sua loja."
    $pause=New-Object Windows.Forms.Button;$pause.SetBounds(24,168,205,40);$pause.Text='Pausar neste computador'
    $hide=New-Object Windows.Forms.Button;$hide.SetBounds(245,168,180,40);$hide.Text='Continuar em segundo plano'
    $form.Controls.AddRange(@($heading,$description,$pause,$hide))
    $tray=New-Object Windows.Forms.NotifyIcon;$tray.Icon=[Drawing.SystemIcons]::Application;$tray.Text='RMenu Impressão';$tray.Visible=$true
    $menu=New-Object Windows.Forms.ContextMenuStrip
    $showItem=$menu.Items.Add('Abrir RMenu Impressão')
    $quitItem=$menu.Items.Add('Encerrar neste computador')
    $tray.ContextMenuStrip=$menu
    $showItem.Add_Click({$form.Show();$form.Activate()})
    $tray.Add_DoubleClick({$form.Show();$form.Activate()})
    $hide.Add_Click({$form.Hide()})
    $pause.Add_Click({
        $runtime.paused=-not $runtime.paused
        if($runtime.paused){Request-RMenuStop $stateDirectory;$pause.Text='Retomar neste computador';$heading.Text='Pausando com segurança…'}
        else {$pause.Text='Pausar neste computador'}
    })
    $quitItem.Add_Click({$runtime.quitting=$true;Request-RMenuStop $stateDirectory;$form.Close()})
    $form.Add_FormClosing({param($sender,$eventArgs) if(-not $runtime.quitting){$eventArgs.Cancel=$true;$form.Hide()}})
    $timer=New-Object Windows.Forms.Timer;$timer.Interval=5000
    $tick={
        if($runtime.paused){$heading.Text=if($runtime.worker -and -not $runtime.worker.HasExited){'Concluindo a tentativa atual…'}else{'Pausado neste computador'};return}
        $connection=Get-RMenuConnectionStatus $config
        if($connection -eq 'unauthorized'){$heading.Text='Reconecte pelo painel';return}
        if($connection -ne 'connected'){$heading.Text='Sem conexão · tentando novamente';return}
        try {$printer=Get-Printer -Name $config.queue_name -ErrorAction Stop;$available=[int]$printer.PrinterStatus -eq 0}
        catch {$available=$false}
        $heading.Text=if($available){'Conectado'}else{'Confira a impressora'}
        if($null -eq $runtime.worker -or $runtime.worker.HasExited){
            if(Test-Path -LiteralPath $stopPath){Remove-Item -LiteralPath $stopPath -Force}
            $arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $PSScriptRoot 'Run-Agent.ps1')+'" -Send'
            $runtime.worker=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru
        }
        $tray.Text='RMenu Impressão: '+$heading.Text
    }
    $timer.Add_Tick($tick);$timer.Start()
    $form.Add_Shown($tick)
    [Windows.Forms.Application]::Run($form)
} finally {
    if($acquired){Request-RMenuStop $stateDirectory}
    if($timer){$timer.Stop();$timer.Dispose()}
    if($tray){$tray.Visible=$false;$tray.Dispose()}
    if($form){$form.Dispose()}
    if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()
}

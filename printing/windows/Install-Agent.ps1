[CmdletBinding()]
param([string]$ProvisioningPath)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSEdition -ne 'Desktop'){throw 'Usar Windows PowerShell 5.1.'}
Import-Module (Join-Path $PSScriptRoot 'AgentConfig.psm1') -Force
if (-not $ProvisioningPath) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog=New-Object Windows.Forms.OpenFileDialog
    $dialog.Title='Selecione a configuração baixada no painel RMenu'
    $dialog.Filter='Configuração RMenu (*.json)|*.json'
    if($dialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){return}
    $ProvisioningPath=$dialog.FileName
}
$stateDirectory=Join-Path $env:LOCALAPPDATA 'RMenuPrintAgent'
try {
    $null=Install-RMenuConfiguration $ProvisioningPath $stateDirectory
    Write-Output 'Configuração importada com DPAPI para este usuário Windows. Nenhum pedido foi reservado ou impresso.'
    Write-Output 'A cópia baixada contém a credencial: guarde com segurança e remova essa cópia após conferir a importação.'
    Write-Output 'Use Verificar-Conexao.cmd para testar a conexão sem imprimir.'
} catch { Write-Output 'Não foi possível importar. Confira a configuração e se já existe uma instalação. Nenhuma configuração existente foi sobrescrita.';exit 1 }

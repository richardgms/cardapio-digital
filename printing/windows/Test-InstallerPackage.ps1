$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'AgentDesktop.psm1') -Force
Add-Type -AssemblyName System.IO.Compression
$workspace=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$executable=Join-Path $workspace 'public/printing/RMenu-Instalar.exe'
# Carrega somente os metadados e recurso; não executa Main nem abre o assistente.
$assembly=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($executable))
$resource=$assembly.GetManifestResourceStream('RMenu.Package.zip')
$archive=New-Object IO.Compression.ZipArchive($resource,[IO.Compression.ZipArchiveMode]::Read)
try{
 $files=@(Get-RMenuApplicationFiles)
 if($archive.Entries.Count -ne $files.Count){throw 'Pacote incompleto.'}
 foreach($name in $files){
  $entry=$archive.GetEntry($name)
  if($null -eq $entry -or $entry.FullName -cne $name -or $entry.Length -gt 262144 -or $entry.Length -lt 1){throw 'Arquivo inválido no pacote.'}
  if($name.EndsWith('.ps1') -or $name.EndsWith('.psm1')){
   $reader=New-Object IO.StreamReader($entry.Open(),[Text.Encoding]::UTF8)
   try{$source=$reader.ReadToEnd()}finally{$reader.Dispose()}
   $tokens=$null;$errors=$null
   $null=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
   if($errors.Count -ne 0){throw 'Script inválido no pacote.'}
  }
 }
 Write-Output ('PASS: '+$files.Count+' arquivos completos e sintaxe validada no instalador. Nenhum aplicativo iniciado.')
}finally{$archive.Dispose();$resource.Dispose()}

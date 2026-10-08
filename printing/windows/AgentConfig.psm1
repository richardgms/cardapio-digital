# Configuração local protegida por DPAPI CurrentUser; não contém service_role.
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.Security
function Test-RMenuEndpoint {
    param([string]$Endpoint)
    try { $uri=[Uri]$Endpoint } catch { return $false }
    if (-not $uri.IsAbsoluteUri -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -cne '/api/printing/agent') { return $false }
    if ($uri.Scheme -eq 'https' -and $uri.IsDefaultPort -and ($uri.DnsSafeHost -eq 'rmenu.com.br' -or $uri.DnsSafeHost.EndsWith('.rmenu.com.br'))) { return $true }
    return $uri.Scheme -eq 'http' -and $uri.Port -eq 3010 -and ($uri.DnsSafeHost -eq 'localhost' -or $uri.DnsSafeHost -eq '127.0.0.1' -or $uri.DnsSafeHost.EndsWith('.localhost'))
}
function Test-RMenuConfiguration {
    param([object]$Config,[switch]$Protected)
    $expected=@('schema_version','device_id','endpoint','queue_name','paper_width_mm')
    $expected+= if ($Protected) { 'protected_credential' } else { 'credential' }
    foreach($field in $Config.PSObject.Properties.Name) { if($field -notin $expected){throw 'Configuração contém campo não permitido.'} }
    foreach($field in $expected) { if($field -notin $Config.PSObject.Properties.Name){throw 'Configuração incompleta.'} }
    if ($Config.schema_version -ne 1 -or $Config.paper_width_mm -notin @(58,80)) { throw 'Versão ou largura inválida.' }
    $parsedGuid=[Guid]::Empty
    if (-not [Guid]::TryParse([string]$Config.device_id,[ref]$parsedGuid) -or -not (Test-RMenuEndpoint $Config.endpoint)) { throw 'Dispositivo ou endpoint inválido.' }
    if ([string]::IsNullOrWhiteSpace($Config.queue_name) -or $Config.queue_name.Length -gt 160 -or $Config.queue_name -match '[\x00-\x1f\x7f]') { throw 'Nome de fila inválido.' }
    if (-not $Protected -and $Config.credential -cnotmatch '^[0-9a-f]{64}$') { throw 'Credencial inválida.' }
}
function Protect-RMenuDirectory {
    param([string]$Directory)
    $null=New-Item -ItemType Directory -Path $Directory -Force
    $acl=New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true,$false)
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    foreach($identity in @($sid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),(New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
        $rule=New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
        $acl.AddAccessRule($rule)
    }
    [IO.Directory]::SetAccessControl($Directory,$acl)
}
function Install-RMenuConfiguration {
    param([string]$ProvisioningPath,[string]$StateDirectory)
    if ((Get-Item -LiteralPath $ProvisioningPath).Length -gt 16384) { throw 'Arquivo excede o limite.' }
    $config=[IO.File]::ReadAllText($ProvisioningPath,[Text.Encoding]::UTF8) | ConvertFrom-Json
    Test-RMenuConfiguration $config
    Protect-RMenuDirectory $StateDirectory
    $credentialBytes=[Text.Encoding]::UTF8.GetBytes($config.credential)
    try { $encrypted=[Security.Cryptography.ProtectedData]::Protect($credentialBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser) }
    finally { [Array]::Clear($credentialBytes,0,$credentialBytes.Length) }
    $saved=[ordered]@{schema_version=1;device_id=$config.device_id;endpoint=$config.endpoint;queue_name=$config.queue_name;paper_width_mm=$config.paper_width_mm;protected_credential=[Convert]::ToBase64String($encrypted)}
    $path=Join-Path $StateDirectory 'device.json'
    # Importação não sobrescreve credenciais/journal existentes.
    $stream=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $bytes=[Text.Encoding]::UTF8.GetBytes(($saved | ConvertTo-Json -Compress));$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true) }
    finally { $stream.Dispose() }
    Protect-RMenuDirectory (Join-Path $StateDirectory 'journal')
    return $path
}
function Read-RMenuConfiguration {
    param([string]$Path)
    $config=[IO.File]::ReadAllText($Path,[Text.Encoding]::UTF8) | ConvertFrom-Json
    Test-RMenuConfiguration $config -Protected
    $bytes=$null
    try {
        $bytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($config.protected_credential),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        $credential=[Text.Encoding]::UTF8.GetString($bytes)
        if ($credential -cnotmatch '^[0-9a-f]{64}$') { throw 'Credencial inválida.' }
        $config | Add-Member -NotePropertyName credential -NotePropertyValue $credential
    } finally { if($null -ne $bytes){[Array]::Clear($bytes,0,$bytes.Length)} }
    return $config
}
Export-ModuleMember -Function Test-RMenuEndpoint,Install-RMenuConfiguration,Read-RMenuConfiguration,Protect-RMenuDirectory

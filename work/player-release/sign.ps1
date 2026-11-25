param([switch]$Initialize,[string]$Player,[string]$Feed)
$ErrorActionPreference='Stop'
$name='Poptropica.love Desktop Player Release v1'
$type=[System.Security.Cryptography.CngKey]
$blob=[System.Security.Cryptography.CngKeyBlobFormat]::EccPublicBlob
$publicFile=Join-Path $PSScriptRoot 'player-public.key'
if(!$type::Exists($name)){
 if(!$Initialize -or (Test-Path -LiteralPath $publicFile)){throw 'The original Windows signing key is required.'}
 $opts=[System.Security.Cryptography.CngKeyCreationParameters]::new()
 $opts.KeyUsage=[System.Security.Cryptography.CngKeyUsages]::Signing
 $opts.ExportPolicy=[System.Security.Cryptography.CngExportPolicies]::None
 $key=$type::Create([System.Security.Cryptography.CngAlgorithm]::ECDsaP256,$name,$opts)
}else{$key=$type::Open($name)}
try{
 $pub=$key.Export($blob)
 if(Test-Path -LiteralPath $publicFile){
  if([Convert]::ToBase64String([IO.File]::ReadAllBytes($publicFile)) -ne [Convert]::ToBase64String($pub)){throw 'Public signing key mismatch'}
 }elseif($Initialize){[IO.File]::WriteAllBytes($publicFile,$pub)}else{throw 'Missing pinned public key'}
 if(!$Player){return}
 $path=(Resolve-Path -LiteralPath $Player).Path
 $version=[Reflection.AssemblyName]::GetAssemblyName($path).Version.ToString(4)
 $size=(Get-Item -LiteralPath $path).Length
 $digest=(Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant()
 $body="poptropica-player-win-x64-v1`n$version`n$size`n$digest`n"
 $signer=[System.Security.Cryptography.ECDsaCng]::new($key)
 try{$signature=$signer.SignData([Text.Encoding]::ASCII.GetBytes($body),[System.Security.Cryptography.HashAlgorithmName]::SHA256,[System.Security.Cryptography.DSASignatureFormat]::IeeeP1363FixedFieldConcatenation)}finally{$signer.Dispose()}
 [IO.Directory]::CreateDirectory($Feed) | Out-Null
 $asset=Join-Path $Feed ($digest+'.bin')
 [IO.File]::Copy($path,$asset,$true)
 [IO.File]::WriteAllText((Join-Path $Feed 'latest.txt'),$body+[Convert]::ToBase64String($signature)+[char]10,[Text.Encoding]::ASCII)
 Write-Output "Signed player $version ($size bytes)."
}finally{$key.Dispose()}

param([string]$Destination = (Join-Path $PSScriptRoot '..\assembled'))
$ErrorActionPreference = 'Stop'
$folder = (Resolve-Path -LiteralPath $Destination).Path
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$modules = @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter Bundled*.cs | ForEach-Object FullName)
& $compiler /nologo /target:winexe /platform:x64 /optimize+ "/out:$folder\Poptropica.exe" "/win32manifest:$PSScriptRoot\app.manifest" "/win32icon:$PSScriptRoot\game.ico" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Web.Extensions.dll "/reference:$folder\Microsoft.Web.WebView2.WinForms.dll" "/reference:$folder\Microsoft.Web.WebView2.Core.dll" "$PSScriptRoot\Launcher.cs" "$PSScriptRoot\GameStyle.cs" "/resource:$PSScriptRoot\..\player-release\player-public.key,PlayerReleaseKey" "$PSScriptRoot\..\player-release\PlayerRelease.cs" "/resource:$PSScriptRoot\OfflineWorkspace.js,OfflineWorkspace" "/resource:$folder\offline\public\cloud\save-store.mjs,SaveStore" "/resource:$folder\offline\overlay\cloud\play.mjs,OfflinePlay" @modules
exit $LASTEXITCODE




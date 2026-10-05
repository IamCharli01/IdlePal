# Packages the extension into a .vsix without needing Node.js or vsce.
# (If you have Node, `npx @vscode/vsce package` works too and respects .vscodeignore.)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression

$root = Split-Path $PSScriptRoot -Parent
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$out = Join-Path $root "$($pkg.name)-$($pkg.version).vsix"

# Ship only runtime files.
$include = @('package.json', 'README.md', 'CHANGELOG.md', 'LICENSE')
$include += Get-ChildItem (Join-Path $root 'src') -Recurse -File -Filter *.js | ForEach-Object { $_.FullName.Substring($root.Length + 1) }
$include += Get-ChildItem (Join-Path $root 'media') -File | ForEach-Object { 'media\' + $_.Name }
$include += Get-ChildItem (Join-Path $root 'walkthrough') -File | ForEach-Object { 'walkthrough\' + $_.Name }
$include = $include | ForEach-Object { $_ -replace '\\', '/' } | Where-Object { Test-Path (Join-Path $root $_) }

foreach ($f in @('media/icon.png', 'media/index.html', 'media/view.js', 'media/sprites.js', 'src/extension.js')) {
  if ($include -notcontains $f) { throw "Missing required file: $f" }
}

$esc = { param($s) [System.Security.SecurityElement]::Escape([string]$s) }
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="$($pkg.name)" Version="$($pkg.version)" Publisher="$($pkg.publisher)" />
    <DisplayName>$(& $esc $pkg.displayName)</DisplayName>
    <Description xml:space="preserve">$(& $esc $pkg.description)</Description>
    <Tags>$(& $esc ($pkg.keywords -join ','))</Tags>
    <Categories>$(& $esc ($pkg.categories -join ','))</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="$($pkg.engines.vscode)" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="$($pkg.extensionKind -join ',')" />
      <Property Id="Microsoft.VisualStudio.Services.Branding.Color" Value="$($pkg.galleryBanner.color)" />
      <Property Id="Microsoft.VisualStudio.Services.Branding.Theme" Value="$($pkg.galleryBanner.theme)" />
    </Properties>
    <License>extension/LICENSE</License>
    <Icon>extension/media/icon.png</Icon>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Changelog" Path="extension/CHANGELOG.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/media/icon.png" Addressable="true" />
  </Assets>
</PackageManifest>
"@

$contentTypes = @"
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json" />
  <Default Extension=".js" ContentType="application/javascript" />
  <Default Extension=".css" ContentType="text/css" />
  <Default Extension=".html" ContentType="text/html" />
  <Default Extension=".svg" ContentType="image/svg+xml" />
  <Default Extension=".png" ContentType="image/png" />
  <Default Extension=".md" ContentType="text/markdown" />
  <Default Extension=".txt" ContentType="text/plain" />
  <Default Extension=".vsixmanifest" ContentType="text/xml" />
  <Override PartName="/extension/LICENSE" ContentType="text/plain" />
</Types>
"@

if (Test-Path $out) { Remove-Item $out }
$stream = [System.IO.File]::Open($out, 'CreateNew')
$zip = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create)
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Add-Text($name, $text) {
  $w = New-Object System.IO.StreamWriter($zip.CreateEntry($name).Open(), $utf8)
  $w.Write($text); $w.Dispose()
}
try {
  Add-Text 'extension.vsixmanifest' $manifest
  Add-Text '[Content_Types].xml' $contentTypes
  foreach ($f in $include) {
    $bytes = [System.IO.File]::ReadAllBytes((Join-Path $root $f))
    $s = $zip.CreateEntry("extension/$f").Open(); $s.Write($bytes, 0, $bytes.Length); $s.Dispose()
  }
} finally {
  $zip.Dispose(); $stream.Dispose()
}
Write-Host "Built $out ($($include.Count) files, $([math]::Round((Get-Item $out).Length / 1KB)) KB)"

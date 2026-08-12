param()

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $root 'dist'
$runtimeSource = Join-Path $distDir 'simple-markdown-viewer-runtime\simple-markdown-viewer-runtime-win_x64.exe'
$payloadDir = Join-Path $distDir 'installer-payload'
$workDir = Join-Path $distDir 'installer-work-neutralino'
$payloadZip = Join-Path $workDir 'app.zip'
$setupExe = Join-Path $distDir 'SimpleMarkdownViewerSetup-1.1.0.exe'
$launcherSource = Join-Path $root 'scripts\launcher\SingleInstanceLauncher.cs'
$stubSource = Join-Path $root 'scripts\installer\InstallerStub.cs'
$launcherExe = Join-Path $payloadDir 'simple-markdown-viewer.exe'
$stubExe = Join-Path $workDir 'installer-stub.exe'
$iconPath = Join-Path $root 'icon.ico'

function Remove-PathInsideRoot {
  param([string] $Path)

  $fullRoot = [System.IO.Path]::GetFullPath($root)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a path outside the project: $fullPath"
  }

  if (Test-Path -LiteralPath $fullPath) {
    Remove-Item -LiteralPath $fullPath -Recurse -Force
  }
}

if (-not (Test-Path -LiteralPath $runtimeSource)) {
  throw "Neutralino Windows runtime was not found: $runtimeSource"
}

$cscPath = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $cscPath)) {
  throw 'Could not find the .NET Framework C# compiler.'
}

Remove-PathInsideRoot $payloadDir
Remove-PathInsideRoot $workDir
New-Item -ItemType Directory -Path $payloadDir -Force | Out-Null
New-Item -ItemType Directory -Path $workDir -Force | Out-Null

Copy-Item -LiteralPath $runtimeSource -Destination (Join-Path $payloadDir 'simple-markdown-viewer-runtime.exe')
Copy-Item -LiteralPath $iconPath -Destination (Join-Path $payloadDir 'icon.ico')

& $cscPath /nologo /target:winexe "/win32icon:$iconPath" "/out:$launcherExe" $launcherSource
if ($LASTEXITCODE -ne 0) {
  throw "Launcher compilation failed with exit code $LASTEXITCODE."
}

Compress-Archive -Path (Join-Path $payloadDir '*') -DestinationPath $payloadZip -CompressionLevel Optimal -Force

& $cscPath /nologo /target:winexe "/win32icon:$iconPath" "/out:$stubExe" /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Windows.Forms.dll $stubSource
if ($LASTEXITCODE -ne 0) {
  throw "Installer stub compilation failed with exit code $LASTEXITCODE."
}

$marker = [System.Text.Encoding]::ASCII.GetBytes('SMVZIP01')
$zipLength = (Get-Item -LiteralPath $payloadZip).Length
$lengthBytes = [System.BitConverter]::GetBytes([Int64]$zipLength)
$output = [System.IO.File]::Create($setupExe)
try {
  foreach ($path in @($stubExe, $payloadZip)) {
    $input = [System.IO.File]::OpenRead($path)
    try {
      $input.CopyTo($output)
    } finally {
      $input.Dispose()
    }
  }
  $output.Write($marker, 0, $marker.Length)
  $output.Write($lengthBytes, 0, $lengthBytes.Length)
} finally {
  $output.Dispose()
}

Get-Item -LiteralPath $setupExe

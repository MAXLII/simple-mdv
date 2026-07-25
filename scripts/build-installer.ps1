param(
  [string] $NodePath = '',
  [string] $NwVersion = '0.111.3'
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'out'
$distDir = Join-Path $root 'dist'
$stageDir = Join-Path $distDir 'app-source'
$workDir = Join-Path $distDir 'installer-work'
$payloadZip = Join-Path $workDir 'app.zip'
$setupExe = Join-Path $distDir 'SimpleMarkdownViewerSetup.exe'
$stubSource = Join-Path $root 'scripts\installer\InstallerStub.cs'
$stubExe = Join-Path $workDir 'installer-stub.exe'

function Remove-PathInsideRoot {
  param([string] $Path)

  $fullRoot = [System.IO.Path]::GetFullPath($root)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a path outside the project: $fullPath"
  }

  if (Test-Path -LiteralPath $fullPath) {
    try {
      Remove-Item -LiteralPath $fullPath -Recurse -Force
    } catch {
      $remainingItems = @(Get-ChildItem -LiteralPath $fullPath -Force -ErrorAction Stop)
      if ($remainingItems.Count -ne 0) {
        throw
      }
    }
  }
}

if (-not $NodePath) {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($nodeCommand) {
    $NodePath = $nodeCommand.Source
  } elseif (Test-Path 'C:\Program Files\nodejs\node.exe') {
    $NodePath = 'C:\Program Files\nodejs\node.exe'
  } else {
    throw 'Could not find node.exe. Pass -NodePath "C:\Path\To\node.exe".'
  }
}

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCommand) {
  $npmPath = $npmCommand.Source
} elseif (Test-Path 'C:\Program Files\nodejs\npm.cmd') {
  $npmPath = 'C:\Program Files\nodejs\npm.cmd'
} else {
  throw 'Could not find npm.cmd. Install Node.js or add npm to PATH.'
}

$nwBuilderCli = Join-Path $root 'node_modules\nw-builder\src\cli.js'
if (-not (Test-Path -LiteralPath $nwBuilderCli)) {
  throw "NW Builder CLI was not found. Run npm install first."
}

$cscPath = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $cscPath)) {
  $cscCommand = Get-Command csc.exe -ErrorAction SilentlyContinue
  if ($cscCommand) {
    $cscPath = $cscCommand.Source
  } else {
    throw 'Could not find csc.exe for compiling the installer stub.'
  }
}

Remove-PathInsideRoot $outDir
Remove-PathInsideRoot $distDir
New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

$appFiles = @(
  'index.html',
  'renderer.js',
  'styles.css',
  'package.json',
  'package-lock.json',
  'icon.png',
  'icon.ico',
  'LICENSE',
  'README.md'
)

foreach ($file in $appFiles) {
  $source = Join-Path $root $file
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination $stageDir -Force
  }
}

Push-Location $stageDir
try {
  & $npmPath ci --omit=dev
  if ($LASTEXITCODE -ne 0) {
    throw "npm ci failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

Push-Location $stageDir
try {
  & $NodePath $nwBuilderCli './**/*' --version $NwVersion --platform win --arch x64 --cacheDir (Join-Path $root 'cache') --outDir $outDir '--app.icon=icon.ico'
  if ($LASTEXITCODE -ne 0) {
    throw "NW Builder failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath (Join-Path $outDir 'simple-markdown-viewer.exe'))) {
  throw "Expected app executable was not created in $outDir."
}

New-Item -ItemType Directory -Path $workDir -Force | Out-Null

if (Test-Path -LiteralPath $payloadZip) {
  Remove-Item -LiteralPath $payloadZip -Force
}
Compress-Archive -Path (Join-Path $outDir '*') -DestinationPath $payloadZip -Force

$installerIcon = Join-Path $root 'icon.ico'
& $cscPath /nologo /target:winexe /win32icon:$installerIcon /out:$stubExe /reference:System.Drawing.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Windows.Forms.dll $stubSource
if ($LASTEXITCODE -ne 0) {
  throw "C# installer stub compilation failed with exit code $LASTEXITCODE."
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

if (-not (Test-Path -LiteralPath $setupExe)) {
  throw "Installer was not created: $setupExe"
}

Get-Item -LiteralPath $setupExe

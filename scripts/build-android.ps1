param([ValidateSet('Debug','Release')][string]$Variant = 'Debug', [switch]$Tests)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$toolRoot = Join-Path $repoRoot 'cache\android-tools'
$env:JAVA_HOME = (Get-ChildItem -LiteralPath (Join-Path $toolRoot 'jdk') -Directory | Select-Object -First 1).FullName
$env:ANDROID_HOME = Join-Path $toolRoot 'sdk'
$env:ANDROID_USER_HOME = Join-Path $toolRoot 'android-user'
$env:GRADLE_USER_HOME = Join-Path $toolRoot 'gradle-user'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
& node (Join-Path $PSScriptRoot 'build-android-frontend.js')
if ($LASTEXITCODE -ne 0) { throw 'Android frontend build failed' }
Push-Location (Join-Path $repoRoot 'android')
try {
    if (-not (Test-Path -LiteralPath '.\gradlew.bat')) {
        & (Join-Path $toolRoot 'gradle\gradle-8.13\bin\gradle.bat') wrapper --gradle-version 8.13 --distribution-type bin --console=plain
        if ($LASTEXITCODE -ne 0) { throw 'Gradle wrapper generation failed' }
    }
    $tasks = @("assemble$Variant")
    if ($Tests) { $tasks += @('testDebugUnitTest','lintDebug','assembleDebugAndroidTest') }
    & '.\gradlew.bat' @tasks --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Android build or validation failed' }
} finally { Pop-Location }

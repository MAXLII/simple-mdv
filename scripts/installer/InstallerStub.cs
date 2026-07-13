using Microsoft.Win32;
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

internal static class InstallerStub
{
    private const string AppName = "Simple Markdown Viewer";
    private const string AppId = "SimpleMarkdownViewer";
    private const string Publisher = "Derek Bowes";
    private const string Version = "1.0.1";
    private const string ExeName = "simple-markdown-viewer.exe";
    private static readonly byte[] Marker = Encoding.ASCII.GetBytes("SMVZIP01");
    private const int HWND_BROADCAST = 0xffff;
    private const int WM_SETTINGCHANGE = 0x001A;
    private const int SMTO_ABORTIFHUNG = 0x0002;

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    private static extern IntPtr SendMessageTimeout(
        IntPtr hWnd,
        uint Msg,
        UIntPtr wParam,
        string lParam,
        uint fuFlags,
        uint uTimeout,
        out UIntPtr lpdwResult);

    [STAThread]
    private static int Main()
    {
        try
        {
            string installDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs",
                AppName);
            string tempDir = Path.Combine(Path.GetTempPath(), AppId + "-install");
            string zipPath = Path.Combine(Path.GetTempPath(), AppId + ".zip");

            ExtractPayload(zipPath);

            if (Directory.Exists(tempDir))
            {
                Directory.Delete(tempDir, true);
            }
            Directory.CreateDirectory(tempDir);
            ZipFile.ExtractToDirectory(zipPath, tempDir);

            if (Directory.Exists(installDir))
            {
                CloseRunningApp();
                DeleteDirectoryWithRetries(installDir);
            }
            Directory.CreateDirectory(installDir);
            CopyDirectory(tempDir, installDir);

            string exePath = Path.Combine(installDir, ExeName);
            if (!File.Exists(exePath))
            {
                throw new FileNotFoundException("Installed executable was not found.", exePath);
            }

            string uninstallScript = WriteUninstaller(installDir);
            WriteCommandShim(installDir, exePath);
            AddInstallDirToUserPath(installDir);
            CreateShortcuts(installDir, exePath, uninstallScript);
            WriteUninstallRegistry(installDir, exePath, uninstallScript);

            TryDelete(zipPath);
            TryDeleteDirectory(tempDir);

            MessageBox.Show(
                AppName + " has been installed successfully.",
                AppName + " Setup",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);

            return 0;
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                ex.Message,
                AppName + " Setup Failed",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 1;
        }
    }

    private static void ExtractPayload(string zipPath)
    {
        string self = Assembly.GetExecutingAssembly().Location;
        using (FileStream input = File.OpenRead(self))
        {
            if (input.Length < Marker.Length + 8)
            {
                throw new InvalidDataException("Installer payload is missing.");
            }

            input.Seek(-8, SeekOrigin.End);
            byte[] lengthBytes = new byte[8];
            ReadExactly(input, lengthBytes, 0, lengthBytes.Length);
            long zipLength = BitConverter.ToInt64(lengthBytes, 0);

            input.Seek(-(8 + Marker.Length), SeekOrigin.End);
            byte[] markerBytes = new byte[Marker.Length];
            ReadExactly(input, markerBytes, 0, markerBytes.Length);
            for (int i = 0; i < Marker.Length; i++)
            {
                if (markerBytes[i] != Marker[i])
                {
                    throw new InvalidDataException("Installer payload marker is invalid.");
                }
            }

            long zipStart = input.Length - 8 - Marker.Length - zipLength;
            if (zipStart < 0)
            {
                throw new InvalidDataException("Installer payload length is invalid.");
            }

            input.Seek(zipStart, SeekOrigin.Begin);
            using (FileStream output = File.Create(zipPath))
            {
                CopyBytes(input, output, zipLength);
            }
        }
    }

    private static string WriteUninstaller(string installDir)
    {
        string uninstallScript = Path.Combine(installDir, "uninstall.ps1");
        string escapedInstallDir = installDir.Replace("'", "''");
        string content =
            "$ErrorActionPreference = 'SilentlyContinue'\r\n" +
            "$appName = '" + AppName + "'\r\n" +
            "$appId = '" + AppId + "'\r\n" +
            "$installDir = '" + escapedInstallDir + "'\r\n" +
            "$desktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) \"$appName.lnk\"\r\n" +
            "$startMenuDir = Join-Path ([Environment]::GetFolderPath('Programs')) $appName\r\n" +
            "$regPath = \"HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\$appId\"\r\n" +
            "Remove-Item -LiteralPath $desktopShortcut -Force\r\n" +
            "Remove-Item -LiteralPath $startMenuDir -Recurse -Force\r\n" +
            "Remove-Item -LiteralPath $regPath -Recurse -Force\r\n" +
            "function Remove-PathEntry([string]$pathValue, [string]$entry) {\r\n" +
            "  if (-not $pathValue) { return '' }\r\n" +
            "  (($pathValue -split ';') | Where-Object { $_ -and ($_.TrimEnd('\\') -ine $entry.TrimEnd('\\')) }) -join ';'\r\n" +
            "}\r\n" +
            "$userEnv = 'HKCU:\\Environment'\r\n" +
            "$oldPath = (Get-ItemProperty -Path $userEnv -Name Path -ErrorAction SilentlyContinue).Path\r\n" +
            "$newPath = Remove-PathEntry $oldPath $installDir\r\n" +
            "Set-ItemProperty -Path $userEnv -Name Path -Value $newPath\r\n" +
            "Add-Type -Namespace Win32 -Name NativeMethods -MemberDefinition '[DllImport(\"user32.dll\", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'\r\n" +
            "$result = [UIntPtr]::Zero\r\n" +
            "[Win32.NativeMethods]::SendMessageTimeout([IntPtr]0xffff, 0x001A, [UIntPtr]::Zero, 'Environment', 0x0002, 5000, [ref]$result) | Out-Null\r\n" +
            "foreach ($profilePath in @((Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'PowerShell\\profile.ps1'), (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'WindowsPowerShell\\profile.ps1'))) {\r\n" +
            "  if (Test-Path -LiteralPath $profilePath) {\r\n" +
            "    $profileText = Get-Content -LiteralPath $profilePath -Raw\r\n" +
            "    $profileText = [regex]::Replace($profileText, \"(?s)\\r?\\n?# BEGIN Simple Markdown Viewer md command.*?# END Simple Markdown Viewer md command\\r?\\n?\", \"\")\r\n" +
            "    $profileText = [regex]::Replace($profileText, \"(?s)\\r?\\n?# BEGIN Simple Markdown Viewer mdv command.*?# END Simple Markdown Viewer mdv command\\r?\\n?\", \"\")\r\n" +
            "    Set-Content -LiteralPath $profilePath -Value $profileText -Encoding UTF8\r\n" +
            "  }\r\n" +
            "}\r\n" +
            "$cleanup = \"Start-Sleep -Seconds 1; Remove-Item -LiteralPath `\"$installDir`\" -Recurse -Force\"\r\n" +
            "Start-Process powershell.exe -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cleanup -WindowStyle Hidden\r\n";

        File.WriteAllText(uninstallScript, content, Encoding.UTF8);
        return uninstallScript;
    }

    private static void WriteCommandShim(string installDir, string exePath)
    {
        string cmdPath = Path.Combine(installDir, "mdv.cmd");
        string content =
            "@echo off\r\n" +
            "if \"%~1\"==\"\" (\r\n" +
            "  start \"\" \"" + exePath + "\"\r\n" +
            "  exit /b 0\r\n" +
            ")\r\n" +
            "set \"target=%~f1\"\r\n" +
            "start \"\" \"" + exePath + "\" \"%target%\"\r\n";
        File.WriteAllText(cmdPath, content, Encoding.ASCII);
    }

    private static void AddInstallDirToUserPath(string installDir)
    {
        using (RegistryKey key = Registry.CurrentUser.CreateSubKey("Environment"))
        {
            string existing = Convert.ToString(key.GetValue("Path", "", RegistryValueOptions.DoNotExpandEnvironmentNames));
            string trimmedInstallDir = installDir.TrimEnd('\\');
            foreach (string entry in existing.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries))
            {
                if (string.Equals(entry.TrimEnd('\\'), trimmedInstallDir, StringComparison.OrdinalIgnoreCase))
                {
                    BroadcastEnvironmentChange();
                    return;
                }
            }

            string newPath = string.IsNullOrWhiteSpace(existing)
                ? installDir
                : existing.TrimEnd(';') + ";" + installDir;
            key.SetValue("Path", newPath, RegistryValueKind.ExpandString);
        }

        BroadcastEnvironmentChange();
    }

    private static void BroadcastEnvironmentChange()
    {
        UIntPtr result;
        SendMessageTimeout(
            new IntPtr(HWND_BROADCAST),
            WM_SETTINGCHANGE,
            UIntPtr.Zero,
            "Environment",
            SMTO_ABORTIFHUNG,
            5000,
            out result);
    }

    private static void CreateShortcuts(string installDir, string exePath, string uninstallScript)
    {
        string desktopShortcut = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            AppName + ".lnk");
        string startMenuDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Programs),
            AppName);
        Directory.CreateDirectory(startMenuDir);

        CreateShortcut(desktopShortcut, exePath, "", installDir, exePath + ",0");
        CreateShortcut(Path.Combine(startMenuDir, AppName + ".lnk"), exePath, "", installDir, exePath + ",0");
        CreateShortcut(
            Path.Combine(startMenuDir, "Uninstall " + AppName + ".lnk"),
            "powershell.exe",
            "-NoProfile -ExecutionPolicy Bypass -File \"" + uninstallScript + "\"",
            installDir,
            "powershell.exe,0");
    }

    private static void CreateShortcut(string shortcutPath, string targetPath, string arguments, string workingDirectory, string iconLocation)
    {
        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(shellType);
        object shortcut = shellType.InvokeMember(
            "CreateShortcut",
            BindingFlags.InvokeMethod,
            null,
            shell,
            new object[] { shortcutPath });
        Type shortcutType = shortcut.GetType();
        shortcutType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, shortcut, new object[] { targetPath });
        shortcutType.InvokeMember("Arguments", BindingFlags.SetProperty, null, shortcut, new object[] { arguments });
        shortcutType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, shortcut, new object[] { workingDirectory });
        shortcutType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, shortcut, new object[] { iconLocation });
        shortcutType.InvokeMember("Save", BindingFlags.InvokeMethod, null, shortcut, null);
        Marshal.FinalReleaseComObject(shortcut);
        Marshal.FinalReleaseComObject(shell);
    }

    private static void WriteUninstallRegistry(string installDir, string exePath, string uninstallScript)
    {
        using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\" + AppId))
        {
            key.SetValue("DisplayName", AppName);
            key.SetValue("DisplayVersion", Version);
            key.SetValue("Publisher", Publisher);
            key.SetValue("InstallLocation", installDir);
            key.SetValue("DisplayIcon", exePath);
            key.SetValue("UninstallString", "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"" + uninstallScript + "\"");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }
    }

    private static void CloseRunningApp()
    {
        string processName = Path.GetFileNameWithoutExtension(ExeName);
        foreach (Process process in Process.GetProcessesByName(processName))
        {
            try
            {
                if (process.MainWindowHandle != IntPtr.Zero)
                {
                    process.CloseMainWindow();
                    if (process.WaitForExit(5000))
                    {
                        continue;
                    }
                }

                process.Kill();
                process.WaitForExit(5000);
            }
            catch
            {
            }
            finally
            {
                process.Dispose();
            }
        }
    }

    private static void DeleteDirectoryWithRetries(string path)
    {
        const int maxAttempts = 10;
        for (int attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                if (!Directory.Exists(path))
                {
                    return;
                }

                ClearReadOnlyAttributes(path);
                Directory.Delete(path, true);
                return;
            }
            catch (UnauthorizedAccessException)
            {
                if (attempt == maxAttempts)
                {
                    throw;
                }
                Thread.Sleep(500);
            }
            catch (IOException)
            {
                if (attempt == maxAttempts)
                {
                    throw;
                }
                Thread.Sleep(500);
            }
        }
    }

    private static void ClearReadOnlyAttributes(string path)
    {
        if (!Directory.Exists(path))
        {
            return;
        }

        foreach (string file in Directory.GetFiles(path, "*", SearchOption.AllDirectories))
        {
            File.SetAttributes(file, FileAttributes.Normal);
        }
    }

    private static void CopyDirectory(string sourceDir, string destinationDir)
    {
        foreach (string directory in Directory.GetDirectories(sourceDir, "*", SearchOption.AllDirectories))
        {
            Directory.CreateDirectory(directory.Replace(sourceDir, destinationDir));
        }

        foreach (string file in Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            string target = file.Replace(sourceDir, destinationDir);
            Directory.CreateDirectory(Path.GetDirectoryName(target));
            CopyFileWithRetries(file, target);
        }
    }

    private static void CopyFileWithRetries(string source, string target)
    {
        const int maxAttempts = 10;
        for (int attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                if (File.Exists(target))
                {
                    File.SetAttributes(target, FileAttributes.Normal);
                }

                File.Copy(source, target, true);
                return;
            }
            catch (UnauthorizedAccessException)
            {
                if (attempt == maxAttempts)
                {
                    throw;
                }
                Thread.Sleep(500);
            }
            catch (IOException)
            {
                if (attempt == maxAttempts)
                {
                    throw;
                }
                Thread.Sleep(500);
            }
        }
    }

    private static void CopyBytes(Stream input, Stream output, long bytesToCopy)
    {
        byte[] buffer = new byte[1024 * 1024];
        long remaining = bytesToCopy;
        while (remaining > 0)
        {
            int read = input.Read(buffer, 0, (int)Math.Min(buffer.Length, remaining));
            if (read <= 0)
            {
                throw new EndOfStreamException();
            }
            output.Write(buffer, 0, read);
            remaining -= read;
        }
    }

    private static void ReadExactly(Stream stream, byte[] buffer, int offset, int count)
    {
        while (count > 0)
        {
            int read = stream.Read(buffer, offset, count);
            if (read <= 0)
            {
                throw new EndOfStreamException();
            }
            offset += read;
            count -= read;
        }
    }

    private static void TryDelete(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, true);
            }
        }
        catch
        {
        }
    }
}

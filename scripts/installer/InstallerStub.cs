using Microsoft.Win32;
using System;
using System.Diagnostics;
using System.Drawing;
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
    private const string Version = "1.3.0";
    private const string ExeName = "simple-markdown-viewer.exe";
    private const string MarkdownProgId = AppId + ".md";
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

    [DllImport("shell32.dll")]
    private static extern void SHChangeNotify(uint eventId, uint flags, IntPtr item1, IntPtr item2);

    [STAThread]
    private static int Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (SetupForm form = new SetupForm())
        {
            Application.Run(form);
            return form.ExitCode;
        }
    }

    private sealed class SetupForm : Form
    {
        private readonly CheckBox associateMarkdown;
        private readonly CheckBox desktopShortcut;
        private readonly CheckBox launchAfterInstall;
        private readonly Label statusLabel;
        private readonly ProgressBar progressBar;
        private readonly Button installButton;
        private bool installationComplete;

        internal int ExitCode { get; private set; }

        internal SetupForm()
        {
            Text = AppName + " Setup";
            ClientSize = new Size(640, 460);
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            BackColor = Color.FromArgb(247, 249, 252);
            Font = new Font("Segoe UI", 9.5F);
            ExitCode = 1;

            try
            {
                Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
            }
            catch
            {
            }

            Panel header = new Panel();
            header.Dock = DockStyle.Top;
            header.Height = 146;
            header.BackColor = Color.FromArgb(15, 25, 48);
            Controls.Add(header);

            PictureBox logo = new PictureBox();
            logo.Location = new Point(36, 29);
            logo.Size = new Size(86, 86);
            logo.SizeMode = PictureBoxSizeMode.Zoom;
            if (Icon != null)
            {
                logo.Image = Icon.ToBitmap();
            }
            header.Controls.Add(logo);

            Label title = new Label();
            title.AutoSize = true;
            title.Location = new Point(144, 35);
            title.Font = new Font("Segoe UI Semibold", 22F, FontStyle.Bold);
            title.ForeColor = Color.White;
            title.Text = AppName;
            header.Controls.Add(title);

            Label subtitle = new Label();
            subtitle.AutoSize = true;
            subtitle.Location = new Point(147, 83);
            subtitle.Font = new Font("Segoe UI", 10.5F);
            subtitle.ForeColor = Color.FromArgb(179, 198, 231);
            subtitle.Text = "A lightweight Markdown and source-code reader";
            header.Controls.Add(subtitle);

            Label optionsTitle = new Label();
            optionsTitle.AutoSize = true;
            optionsTitle.Location = new Point(38, 174);
            optionsTitle.Font = new Font("Segoe UI Semibold", 12F, FontStyle.Bold);
            optionsTitle.ForeColor = Color.FromArgb(28, 39, 61);
            optionsTitle.Text = "Installation options";
            Controls.Add(optionsTitle);

            associateMarkdown = CreateOption(
                "Associate .md files with Simple Markdown Viewer",
                "Double-click Markdown documents to open them in this app.",
                213);
            associateMarkdown.Checked = true;

            desktopShortcut = CreateOption(
                "Create a desktop shortcut",
                "The app is always added to the Start menu.",
                276);
            desktopShortcut.Checked = true;

            launchAfterInstall = CreateOption(
                "Launch Simple Markdown Viewer when setup finishes",
                "You can change the .md default app later in Windows Settings.",
                339);
            launchAfterInstall.Checked = true;

            statusLabel = new Label();
            statusLabel.AutoSize = false;
            statusLabel.Location = new Point(38, 391);
            statusLabel.Size = new Size(410, 23);
            statusLabel.ForeColor = Color.FromArgb(79, 92, 117);
            statusLabel.Text = "Ready to install for the current Windows user.";
            Controls.Add(statusLabel);

            progressBar = new ProgressBar();
            progressBar.Location = new Point(38, 417);
            progressBar.Size = new Size(410, 8);
            progressBar.Style = ProgressBarStyle.Continuous;
            Controls.Add(progressBar);

            installButton = new Button();
            installButton.Location = new Point(476, 389);
            installButton.Size = new Size(126, 38);
            installButton.FlatStyle = FlatStyle.Flat;
            installButton.FlatAppearance.BorderSize = 0;
            installButton.BackColor = Color.FromArgb(60, 108, 244);
            installButton.ForeColor = Color.White;
            installButton.Font = new Font("Segoe UI Semibold", 10F, FontStyle.Bold);
            installButton.Text = "Install";
            installButton.Cursor = Cursors.Hand;
            installButton.Click += InstallButtonClick;
            Controls.Add(installButton);

            AcceptButton = installButton;
            FormClosing += SetupFormClosing;
        }

        private CheckBox CreateOption(string title, string description, int top)
        {
            CheckBox option = new CheckBox();
            option.AutoSize = true;
            option.Location = new Point(41, top);
            option.Font = new Font("Segoe UI Semibold", 10F, FontStyle.Bold);
            option.ForeColor = Color.FromArgb(36, 48, 72);
            option.Text = title;
            Controls.Add(option);

            Label descriptionLabel = new Label();
            descriptionLabel.AutoSize = true;
            descriptionLabel.Location = new Point(64, top + 27);
            descriptionLabel.ForeColor = Color.FromArgb(104, 117, 142);
            descriptionLabel.Text = description;
            Controls.Add(descriptionLabel);
            return option;
        }

        private void InstallButtonClick(object sender, EventArgs e)
        {
            if (installationComplete)
            {
                Close();
                return;
            }

            installButton.Enabled = false;
            associateMarkdown.Enabled = false;
            desktopShortcut.Enabled = false;
            launchAfterInstall.Enabled = false;

            bool createAssociation = associateMarkdown.Checked;
            bool createDesktopShortcut = desktopShortcut.Checked;
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    string exePath = Install(
                        createAssociation,
                        createDesktopShortcut,
                        UpdateProgress);
                    BeginInvoke((MethodInvoker)delegate
                    {
                        progressBar.Value = 100;
                        statusLabel.Text = "Installation complete. Simple Markdown Viewer is ready.";
                        installButton.Text = "Finish";
                        installButton.Enabled = true;
                        installationComplete = true;
                        ExitCode = 0;

                        if (launchAfterInstall.Checked)
                        {
                            Process.Start(exePath);
                        }
                    });
                }
                catch (Exception ex)
                {
                    BeginInvoke((MethodInvoker)delegate
                    {
                        statusLabel.Text = "Setup could not be completed.";
                        installButton.Enabled = true;
                        associateMarkdown.Enabled = true;
                        desktopShortcut.Enabled = true;
                        launchAfterInstall.Enabled = true;
                        MessageBox.Show(
                            this,
                            ex.Message,
                            AppName + " Setup Failed",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error);
                    });
                }
            });
        }

        private void UpdateProgress(int value, string message)
        {
            if (IsDisposed)
            {
                return;
            }

            BeginInvoke((MethodInvoker)delegate
            {
                progressBar.Value = Math.Max(0, Math.Min(100, value));
                statusLabel.Text = message;
            });
        }

        private void SetupFormClosing(object sender, FormClosingEventArgs e)
        {
            if (!installButton.Enabled)
            {
                e.Cancel = true;
            }
        }
    }

    private static string Install(bool associateMarkdown, bool desktopShortcut, Action<int, string> progress)
    {
        string installDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Programs",
            AppName);
        string tempDir = Path.Combine(Path.GetTempPath(), AppId + "-install");
        string zipPath = Path.Combine(Path.GetTempPath(), AppId + ".zip");

        progress(8, "Reading the installation package...");
        ExtractPayload(zipPath);

        progress(20, "Unpacking application files...");
        if (Directory.Exists(tempDir))
        {
            Directory.Delete(tempDir, true);
        }
        Directory.CreateDirectory(tempDir);
        ZipFile.ExtractToDirectory(zipPath, tempDir);

        progress(42, "Installing Simple Markdown Viewer...");
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

        progress(72, "Creating shortcuts and command-line tools...");
        string uninstallScript = WriteUninstaller(installDir);
        WriteCommandShim(installDir, exePath);
        AddInstallDirToUserPath(installDir);
        CreateShortcuts(installDir, exePath, uninstallScript, desktopShortcut);
        WriteUninstallRegistry(installDir, exePath, uninstallScript);

        progress(88, associateMarkdown
            ? "Associating Markdown documents..."
            : "Finishing installation...");
        if (associateMarkdown)
        {
            RegisterMarkdownAssociation(exePath);
        }

        TryDelete(zipPath);
        TryDeleteDirectory(tempDir);
        progress(100, "Installation complete.");
        return exePath;
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
            "$progId = '" + MarkdownProgId + "'\r\n" +
            "$previousMdProgId = (Get-ItemProperty -LiteralPath $regPath -Name PreviousMdProgId -ErrorAction SilentlyContinue).PreviousMdProgId\r\n" +
            "Remove-Item -LiteralPath $desktopShortcut -Force\r\n" +
            "Remove-Item -LiteralPath $startMenuDir -Recurse -Force\r\n" +
            "Remove-Item -LiteralPath $regPath -Recurse -Force\r\n" +
            "$classes = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Classes', $true)\r\n" +
            "if ($classes) {\r\n" +
            "  $mdKey = $classes.OpenSubKey('.md', $true)\r\n" +
            "  if ($mdKey) {\r\n" +
            "    if ($mdKey.GetValue('') -eq $progId) {\r\n" +
            "      if ($previousMdProgId) { $mdKey.SetValue('', $previousMdProgId) } else { $mdKey.DeleteValue('', $false) }\r\n" +
            "    }\r\n" +
            "    $openWith = $mdKey.OpenSubKey('OpenWithProgids', $true)\r\n" +
            "    if ($openWith) { $openWith.DeleteValue($progId, $false); $openWith.Dispose() }\r\n" +
            "    $mdKey.Dispose()\r\n" +
            "  }\r\n" +
            "  $classes.DeleteSubKeyTree($progId, $false)\r\n" +
            "  $classes.Dispose()\r\n" +
            "}\r\n" +
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

    private static void CreateShortcuts(string installDir, string exePath, string uninstallScript, bool desktopShortcutEnabled)
    {
        string iconPath = Path.Combine(installDir, "icon.ico");
        string appIconLocation = File.Exists(iconPath)
            ? iconPath + ",0"
            : exePath + ",0";
        string desktopShortcut = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            AppName + ".lnk");
        string startMenuDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.Programs),
            AppName);
        Directory.CreateDirectory(startMenuDir);

        if (desktopShortcutEnabled)
        {
            CreateShortcut(desktopShortcut, exePath, "", installDir, appIconLocation);
        }
        else if (File.Exists(desktopShortcut))
        {
            File.Delete(desktopShortcut);
        }
        CreateShortcut(Path.Combine(startMenuDir, AppName + ".lnk"), exePath, "", installDir, appIconLocation);
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

    private static void RegisterMarkdownAssociation(string exePath)
    {
        string iconPath = Path.Combine(Path.GetDirectoryName(exePath), "icon.ico");
        string iconLocation = File.Exists(iconPath)
            ? iconPath
            : exePath;

        using (RegistryKey classes = Registry.CurrentUser.CreateSubKey(@"Software\Classes"))
        using (RegistryKey extension = classes.CreateSubKey(".md"))
        {
            string previousProgId = Convert.ToString(extension.GetValue(""));
            if (!string.IsNullOrWhiteSpace(previousProgId) &&
                !string.Equals(previousProgId, MarkdownProgId, StringComparison.OrdinalIgnoreCase))
            {
                using (RegistryKey uninstall = Registry.CurrentUser.CreateSubKey(
                    @"Software\Microsoft\Windows\CurrentVersion\Uninstall\" + AppId))
                {
                    uninstall.SetValue("PreviousMdProgId", previousProgId);
                }
            }

            extension.SetValue("", MarkdownProgId);
            extension.SetValue("Content Type", "text/markdown");
            extension.SetValue("PerceivedType", "text");
            using (RegistryKey openWith = extension.CreateSubKey("OpenWithProgids"))
            {
                openWith.SetValue(MarkdownProgId, "", RegistryValueKind.String);
            }
        }

        using (RegistryKey progId = Registry.CurrentUser.CreateSubKey(@"Software\Classes\" + MarkdownProgId))
        {
            progId.SetValue("", "Markdown Document");
            progId.SetValue("FriendlyTypeName", "Markdown Document");
            using (RegistryKey icon = progId.CreateSubKey("DefaultIcon"))
            {
                icon.SetValue("", "\"" + iconLocation + "\",0");
            }
            using (RegistryKey command = progId.CreateSubKey(@"shell\open\command"))
            {
                command.SetValue("", "\"" + exePath + "\" \"%1\"");
            }
        }

        const uint SHCNE_ASSOCCHANGED = 0x08000000;
        const uint SHCNF_IDLIST = 0x0000;
        SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, IntPtr.Zero, IntPtr.Zero);
    }

    private static void CloseRunningApp()
    {
        string[] processNames = {
            Path.GetFileNameWithoutExtension(ExeName),
            "simple-markdown-viewer-runtime"
        };
        foreach (string processName in processNames)
        {
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

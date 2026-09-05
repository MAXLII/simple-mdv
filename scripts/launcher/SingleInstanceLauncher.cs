using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

internal static class SingleInstanceLauncher
{
    private const string MutexName = @"Local\SimpleMarkdownViewer.SingleInstance";
    private const string RuntimeName = "simple-markdown-viewer-runtime.exe";
    private const string RuntimeProcessName = "simple-markdown-viewer-runtime";
    private const int SwRestore = 9;

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr windowHandle);

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr windowHandle, int command);

    [STAThread]
    private static int Main(string[] args)
    {
        bool ownsMutex;
        using (Mutex mutex = new Mutex(true, MutexName, out ownsMutex))
        {
            string queueDirectory = Environment.GetEnvironmentVariable("SMV_QUEUE_DIR");
            if (string.IsNullOrWhiteSpace(queueDirectory))
            {
                queueDirectory = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "SimpleMarkdownViewer");
            }
            Directory.CreateDirectory(queueDirectory);

            if (!ownsMutex)
            {
                AppendOpenRequests(queueDirectory, args);
                FocusExistingWindow();
                return 0;
            }

            string runtimePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, RuntimeName);
            if (!File.Exists(runtimePath))
            {
                return 2;
            }

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = runtimePath;
            startInfo.WorkingDirectory = AppDomain.CurrentDomain.BaseDirectory;
            startInfo.UseShellExecute = false;
            startInfo.Arguments = QuoteArgument("--open-queue-dir=" + queueDirectory) + BuildArguments(args);

            using (Process runtime = Process.Start(startInfo))
            {
                runtime.WaitForExit();
                return runtime.ExitCode;
            }
        }
    }

    private static void AppendOpenRequests(string queueDirectory, string[] args)
    {
        if (args.Length == 0)
        {
            return;
        }

        StringBuilder requests = new StringBuilder();
        foreach (string arg in args)
        {
            string resolved = Path.GetFullPath(arg);
            requests.AppendLine(resolved);
        }
        string prefix = DateTime.UtcNow.Ticks.ToString("D19") + "-" + Process.GetCurrentProcess().Id;
        string temporaryPath = Path.Combine(queueDirectory, prefix + "-" + Guid.NewGuid().ToString("N") + ".tmp");
        string requestPath = Path.ChangeExtension(temporaryPath, ".request");
        File.WriteAllText(temporaryPath, requests.ToString(), new UTF8Encoding(false));
        File.Move(temporaryPath, requestPath);
    }

    private static string BuildArguments(string[] args)
    {
        StringBuilder result = new StringBuilder();
        foreach (string arg in args)
        {
            result.Append(' ');
            result.Append(QuoteArgument(Path.GetFullPath(arg)));
        }
        return result.ToString();
    }

    private static string QuoteArgument(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static void FocusExistingWindow()
    {
        foreach (Process process in Process.GetProcessesByName(RuntimeProcessName))
        {
            try
            {
                if (process.MainWindowHandle != IntPtr.Zero)
                {
                    ShowWindowAsync(process.MainWindowHandle, SwRestore);
                    SetForegroundWindow(process.MainWindowHandle);
                    return;
                }
            }
            finally
            {
                process.Dispose();
            }
        }
    }
}

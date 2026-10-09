using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Instalar RMenu Impressão")]
[assembly: AssemblyProduct("RMenu Impressão")]
[assembly: AssemblyVersion("1.1.0.0")]
internal static class InstallerLauncher
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        string directory = Path.Combine(Path.GetTempPath(), "RMenuSetup-" + Guid.NewGuid().ToString("N"));
        string[] names = { "AgentConfig.psm1", "AgentCore.psm1", "AgentDesktop.psm1", "AgentCalibration.psm1", "AgentReceipt.cs", "Run-Agent.ps1", "AgentMonitor.ps1", "Setup-Agent.ps1" };
        try
        {
            Directory.CreateDirectory(directory);
            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("RMenu.Package.zip"))
            using (ZipArchive archive = new ZipArchive(resource, ZipArchiveMode.Read))
            {
                if (archive.Entries.Count != names.Length) throw new InvalidDataException();
                foreach (string name in names)
                {
                    ZipArchiveEntry entry = archive.GetEntry(name);
                    if (entry == null || entry.FullName != name || entry.Length > 262144) throw new InvalidDataException();
                    using (Stream source = entry.Open())
                    using (FileStream target = new FileStream(Path.Combine(directory, name), FileMode.CreateNew)) source.CopyTo(target);
                }
            }
            string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe");
            ProcessStartInfo start = new ProcessStartInfo(powershell, "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File \"" + Path.Combine(directory, "Setup-Agent.ps1") + "\"");
            start.UseShellExecute = false; start.CreateNoWindow = true;
            using (Process process = Process.Start(start)) process.WaitForExit();
        }
        catch { MessageBox.Show("Não foi possível abrir o assistente. Baixe o instalador novamente pelo painel RMenu ou solicite suporte.", "RMenu Impressão", MessageBoxButtons.OK, MessageBoxIcon.Information); }
        finally
        {
            // Somente os arquivos conhecidos na pasta exclusiva criada acima.
            foreach (string name in names) { try { File.Delete(Path.Combine(directory, name)); } catch { } }
            try { Directory.Delete(directory, false); } catch { }
        }
    }
}

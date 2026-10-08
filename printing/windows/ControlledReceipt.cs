using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Printing;

// Somente o ensaio fictício. Não é o agente de fila nem aceita pedidos de rede.
public static class RMenuControlledReceipt
{
    public static string Preview(string printerName, string[] lines, int paperWidthMm, string output)
    {
        using (PrintDocument document = Prepare(printerName, lines, paperWidthMm))
        {
            PreviewPrintController preview = new PreviewPrintController();
            preview.UseAntiAlias = true;
            document.PrintController = preview; // Sem envio ao spooler.
            document.Print();
            PreviewPageInfo[] pages = preview.GetPreviewPageInfo();
            if (pages.Length != 1) throw new InvalidOperationException("Ensaio deve produzir uma única página.");
            try
            {
                int width = (int)Math.Ceiling(pages[0].PhysicalSize.Width * 2.03);
                int height = (int)Math.Ceiling(pages[0].PhysicalSize.Height * 2.03);
                using (Bitmap bitmap = new Bitmap(width, height))
                using (Graphics graphics = Graphics.FromImage(bitmap))
                {
                    bitmap.SetResolution(203, 203);
                    graphics.Clear(Color.White);
                    graphics.DrawImage(pages[0].Image, new Rectangle(0, 0, width, height));
                    bitmap.Save(output, ImageFormat.Png);
                }
            }
            finally { foreach (PreviewPageInfo page in pages) page.Image.Dispose(); }
            PaperSize paper = document.DefaultPageSettings.PaperSize;
            RectangleF area = document.DefaultPageSettings.PrintableArea;
            return String.Format(System.Globalization.CultureInfo.InvariantCulture,
                "preview_only; copies=1; paper={0:F1}x{1:F1}mm; printable={2:F1}x{3:F1}mm; font=Consolas 7.5pt; lines={4}",
                paper.Width * 0.254, paper.Height * 0.254, area.Width * 0.254, area.Height * 0.254, lines.Length);
        }
    }

    public static void SendOnce(string printerName, string[] lines, int paperWidthMm)
    {
        using (PrintDocument document = Prepare(printerName, lines, paperWidthMm))
        {
            document.PrintController = new StandardPrintController();
            document.Print(); // Retorno indica submissão, não papel confirmado.
        }
    }

    private static PrintDocument Prepare(string printerName, string[] lines, int paperWidthMm)
    {
        if (printerName != "EPSON TM-T20X Receipt") throw new ArgumentException("Ensaio limitado à Epson inspecionada.");
        if (paperWidthMm != 58 && paperWidthMm != 80) throw new ArgumentException("Papel deve ser 58 ou 80 mm.");
        if (lines.Length < 2 || lines.Length > 100 || !lines[0].StartsWith("TESTE FICTÍCIO"))
            throw new ArgumentException("Só pode imprimir fixture fictícia identificada.");
        PrintDocument document = new PrintDocument();
        document.DocumentName = "RMenu TESTE FICTICIO - UMA VIA";
        document.PrinterSettings.PrinterName = printerName;
        if (!document.PrinterSettings.IsValid) { document.Dispose(); throw new InvalidOperationException("Fila de impressora indisponível."); }
        document.PrinterSettings.Copies = 1;
        document.PrinterSettings.Collate = false;
        document.OriginAtMargins = false;
        int width = (int)Math.Round(paperWidthMm / 0.254);
        int height = (int)Math.Ceiling((lines.Length * 9.5 + 24) / 0.72);
        document.DefaultPageSettings.PaperSize = new PaperSize("RMenu teste controlado", width, height);
        document.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
        document.PrintPage += delegate(object sender, PrintPageEventArgs page)
        {
            if (Math.Abs(page.PageBounds.Width * 0.254 - paperWidthMm) > 2)
                throw new InvalidOperationException("Driver não respeitou a largura solicitada; não enviar.");
            page.Graphics.PageUnit = GraphicsUnit.Point;
            page.Graphics.TranslateTransform(-page.PageSettings.HardMarginX * 0.72f, -page.PageSettings.HardMarginY * 0.72f);
            RectangleF area = page.PageSettings.PrintableArea;
            float x = area.Left * 0.72f + 3;
            float y = area.Top * 0.72f + 3;
            float widthPoints = area.Width * 0.72f - 6;
            using (Font font = new Font("Consolas", 7.5f, FontStyle.Regular, GraphicsUnit.Point))
            using (StringFormat format = (StringFormat)StringFormat.GenericTypographic.Clone())
            {
                format.FormatFlags |= StringFormatFlags.NoWrap | StringFormatFlags.MeasureTrailingSpaces;
                foreach (string line in lines)
                {
                    float measured = page.Graphics.MeasureString(line, font, new PointF(0, 0), format).Width;
                    if (measured > widthPoints + 0.5f || y + 9.5f > (Math.Min(area.Bottom, page.PageBounds.Bottom) * 0.72f - 3))
                        throw new InvalidOperationException("Conteúdo excede a área imprimível; calibrar antes do envio.");
                    page.Graphics.DrawString(line, font, Brushes.Black, x, y, format);
                    y += 9.5f;
                }
            }
            page.HasMorePages = false; // Uma página, uma via. Corte depende do driver.
        };
        return document;
    }
}

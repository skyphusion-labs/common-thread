/** Payload POSTed to the self-hosted PDF/A renderer over Workers VPC HTTP. */
export interface PdfRenderHandoff {
  investigationId: string;
  attributionRunId: number;
  /** Full HTML document (from packetMarkdownToHtml). */
  html: string;
  /** PDF/A profile; default 2b per §8.1.2 court/archival use. */
  pdfaProfile?: '2b';
}

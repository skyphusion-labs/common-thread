import type { PdfRenderHandoff } from './pdf-handoff';

export interface PdfDispatchEnv {
  /** Dedicated VPC binding for the PDF/A container (preferred). */
  VPC_PDF?: Fetcher;
  /** Fallback when PDF shares the ingest VPC service. */
  VPC_INGEST?: Fetcher;
  PDF_WORKER_URL?: string;
  /** Required for `?format=pdf` packet export. */
  PDF_SECRET?: string;
}

function pdfVpcFetcher(env: PdfDispatchEnv): Fetcher | undefined {
  return env.VPC_PDF ?? env.VPC_INGEST;
}

export function vpcPdfEnabled(env: PdfDispatchEnv): boolean {
  return Boolean(pdfVpcFetcher(env) && env.PDF_WORKER_URL && env.PDF_SECRET);
}

/**
 * POST an evidence-packet HTML payload to the PDF/A renderer container.
 *
 * PDF_WORKER_URL hostname must match the VPC PDF service (default: json-pdf).
 */
export async function dispatchPdfRender(
  env: PdfDispatchEnv,
  handoff: PdfRenderHandoff
): Promise<Response> {
  const vpc = pdfVpcFetcher(env);
  if (!vpc) {
    throw new Error('VPC_PDF (or VPC_INGEST) binding is not configured');
  }
  if (!env.PDF_WORKER_URL) {
    throw new Error('PDF_WORKER_URL variable is not configured');
  }
  if (!env.PDF_SECRET) {
    throw new Error('PDF_SECRET is not configured');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/pdf',
    Authorization: `Bearer ${env.PDF_SECRET}`,
  };

  return vpc.fetch(env.PDF_WORKER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(handoff),
  });
}

/** Client-side EPUB text extraction: unzip with fflate, walk the OPF
 * spine, and pull readable text out of each XHTML document. No network,
 * no rendering — we only want the words. */

import { unzipSync, strFromU8 } from 'fflate';

export interface ParsedEpub {
  title: string;
  text: string;
}

/** Resolve `href` against the directory of `fromPath`, normalizing `..`. */
function resolvePath(fromPath: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0]);
  const baseParts = fromPath.split('/').slice(0, -1);
  for (const part of clean.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join('/');
}

const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, dt, td, figcaption';

function extractBlocks(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, nav, sup.noteref').forEach((el) => el.remove());
  const blocks = Array.from(doc.body.querySelectorAll(BLOCK_SELECTOR))
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 0);
  if (blocks.length > 0) return blocks.join('\n\n');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export async function parseEpub(buffer: ArrayBuffer): Promise<ParsedEpub> {
  const files = unzipSync(new Uint8Array(buffer));
  const read = (path: string): string | undefined => {
    const data = files[path];
    return data ? strFromU8(data) : undefined;
  };

  const containerXml = read('META-INF/container.xml');
  if (!containerXml) throw new Error('Not a valid EPUB (missing container.xml)');
  const container = new DOMParser().parseFromString(containerXml, 'application/xml');
  const opfPath = container.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('Not a valid EPUB (no rootfile)');

  const opfXml = read(opfPath);
  if (!opfXml) throw new Error('Not a valid EPUB (missing package document)');
  const opf = new DOMParser().parseFromString(opfXml, 'application/xml');

  const title =
    opf.getElementsByTagNameNS('*', 'title')[0]?.textContent?.trim() || 'Untitled EPUB';

  const hrefById = new Map<string, string>();
  opf.querySelectorAll('manifest > item').forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) hrefById.set(id, href);
  });

  const sections: string[] = [];
  opf.querySelectorAll('spine > itemref').forEach((ref) => {
    const idref = ref.getAttribute('idref');
    const href = idref ? hrefById.get(idref) : undefined;
    if (!href) return;
    const html = read(resolvePath(opfPath, href));
    if (!html) return;
    const text = extractBlocks(html);
    if (text) sections.push(text);
  });

  if (sections.length === 0) throw new Error('No readable text found in EPUB');
  return { title, text: sections.join('\n\n') };
}

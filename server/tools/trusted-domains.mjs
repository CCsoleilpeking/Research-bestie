export const TRUSTED = new Set([
  // Academic papers
  'arxiv.org',
  'semanticscholar.org',
  'scholar.google.com',
  'doi.org',
  'pubmed.ncbi.nlm.nih.gov',
  'ieee.org',
  'ieeexplore.ieee.org',
  'acm.org',
  'dl.acm.org',
  'nature.com',
  'science.org',
  'springer.com',
  'link.springer.com',
  'wiley.com',
  'onlinelibrary.wiley.com',
  'openreview.net',
  'aclweb.org',
  'aclanthology.org',
  'sciencedirect.com',
  'jstor.org',
  'researchgate.net',
  'biorxiv.org',
  'medrxiv.org',
  'ssrn.com',
  'pnas.org',
  'cell.com',
  'thelancet.com',
  'bmj.com',
  'plos.org',
  'frontiersin.org',
  'mdpi.com',
  'aaai.org',
  'neurips.cc',
  'papers.nips.cc',
  'proceedings.mlr.press',
  'jmlr.org',
  'cvpr.org',
  'iclr.cc',
  // Tech docs
  'github.com',
  'huggingface.co',
  'pytorch.org',
  'tensorflow.org',
  'docs.python.org',
  'developer.mozilla.org',
  'platform.openai.com',
  'docs.anthropic.com',
  // Knowledge
  'wikipedia.org',
  'en.wikipedia.org',
  'stackoverflow.com',
  // News
  'reuters.com',
  'bbc.com',
  'nytimes.com',
]);

export function isTrusted(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    // Check exact match or parent domain match
    if (TRUSTED.has(hostname)) return true;
    // Check if parent domain is trusted (e.g., sub.arxiv.org → arxiv.org)
    const parts = hostname.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      if (TRUSTED.has(parts.slice(i).join('.'))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function sortByTrust(results) {
  const trusted = results.filter(r => isTrusted(r.url));
  const untrusted = results.filter(r => !isTrusted(r.url));
  // Trusted first, untrusted max 3
  return [...trusted, ...untrusted.slice(0, 3)];
}

// Weight: higher = more trusted, sorted first
const TRUSTED_WEIGHTS = {
  // Academic papers (highest priority)
  'arxiv.org': 100,
  'semanticscholar.org': 95,
  'scholar.google.com': 95,
  'doi.org': 95,
  'pubmed.ncbi.nlm.nih.gov': 90,
  'ieee.org': 90,
  'ieeexplore.ieee.org': 90,
  'acm.org': 90,
  'dl.acm.org': 90,
  'nature.com': 90,
  'science.org': 90,
  'springer.com': 85,
  'link.springer.com': 85,
  'wiley.com': 85,
  'onlinelibrary.wiley.com': 85,
  'openreview.net': 90,
  'aclweb.org': 90,
  'aclanthology.org': 90,
  'sciencedirect.com': 85,
  'jstor.org': 85,
  'researchgate.net': 80,
  'biorxiv.org': 90,
  'medrxiv.org': 90,
  'ssrn.com': 80,
  'pnas.org': 90,
  'cell.com': 90,
  'thelancet.com': 90,
  'bmj.com': 85,
  'plos.org': 85,
  'frontiersin.org': 80,
  'mdpi.com': 75,
  'aaai.org': 90,
  'neurips.cc': 90,
  'papers.nips.cc': 90,
  'proceedings.mlr.press': 90,
  'jmlr.org': 90,
  'cvpr.org': 90,
  'iclr.cc': 90,
  // Tech docs (medium priority)
  'github.com': 60,
  'huggingface.co': 65,
  'pytorch.org': 60,
  'tensorflow.org': 60,
  'docs.python.org': 55,
  'developer.mozilla.org': 55,
  'platform.openai.com': 60,
  'docs.anthropic.com': 60,
  // Knowledge (lower priority)
  'wikipedia.org': 50,
  'en.wikipedia.org': 50,
  'stackoverflow.com': 50,
  // News (lowest trusted)
  'reuters.com': 40,
  'bbc.com': 40,
  'nytimes.com': 40,
};

function getWeight(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    if (TRUSTED_WEIGHTS[hostname]) return TRUSTED_WEIGHTS[hostname];
    // Check parent domain
    const parts = hostname.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.');
      if (TRUSTED_WEIGHTS[parent]) return TRUSTED_WEIGHTS[parent];
    }
    return 0;
  } catch {
    return 0;
  }
}

export function isTrusted(url) {
  return getWeight(url) > 0;
}

export function sortByTrust(results) {
  const trusted = results.filter(r => isTrusted(r.url));
  const untrusted = results.filter(r => !isTrusted(r.url));
  // Sort trusted by weight (highest first)
  trusted.sort((a, b) => getWeight(b.url) - getWeight(a.url));
  // Trusted first (sorted by weight), untrusted max 3
  return [...trusted, ...untrusted.slice(0, 3)];
}

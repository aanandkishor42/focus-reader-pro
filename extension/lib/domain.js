const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Reduce a URL or hostname to a stable, lowercase domain key.
 * We strip "www." so example.com and www.example.com share settings.
 */
export function normalizeDomain(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";

  const candidate = HAS_SCHEME.test(raw) ? raw : `https://${raw}`;

  try {
    const { hostname } = new URL(candidate);
    return hostname.replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

/**
 * A blocklist entry also blocks its subdomains, but never a lookalike
 * domain such as "notbank.example" when "bank.example" is blocked.
 */
export function isDomainBlocked(hostname, blocklist) {
  const domain = normalizeDomain(hostname);
  if (!domain) return false;

  const entries = Array.isArray(blocklist) ? blocklist : [];
  return entries.some((entry) => {
    const blocked = normalizeDomain(entry);
    return blocked !== "" && (domain === blocked || domain.endsWith(`.${blocked}`));
  });
}

/**
 * Accept one domain per line or comma-separated values. Lines may contain
 * comments, which makes copy/pasted blocklists easier to maintain.
 */
export function parseBlocklist(text) {
  const seen = new Set();
  const domains = [];

  for (const line of String(text ?? "").split(/\r?\n/)) {
    const withoutComment = line.split("#")[0];
    for (const value of withoutComment.split(/[\s,]+/)) {
      const domain = normalizeDomain(value);
      if (domain && !seen.has(domain)) {
        seen.add(domain);
        domains.push(domain);
      }
    }
  }

  return domains;
}

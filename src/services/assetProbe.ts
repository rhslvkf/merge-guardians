/**
 * Does this asset URL actually resolve to the kind of file we asked for?
 *
 * The art and audio packs are hand-installed CC0 downloads, so a checkout can
 * legitimately be missing any of them. Letting Phaser's loader discover that is
 * messy: a dev server answers an unknown path with its SPA fallback HTML, and
 * decoding a 200-with-the-wrong-body throws inside the loader instead of
 * reporting a clean miss. A HEAD request first turns "absent" into a fact the
 * services can branch on.
 *
 * The whole probe is one parallel batch before the loader starts, so it costs
 * roughly one round trip whether the pack is there or not.
 */
export async function exists(path: string, expectedType: string): Promise<boolean> {
  try {
    const response = await fetch(path, { method: 'HEAD', cache: 'no-store' });
    if (!response.ok) return false;
    const type = response.headers.get('content-type') ?? '';
    // No content-type at all is fine — some static hosts omit it. HTML is not:
    // that is the fallback page, which means the file is missing.
    return type === '' || type.startsWith(expectedType);
  } catch {
    // Offline, blocked, or a host that refuses HEAD. Treat as absent rather
    // than risk the loader choking on it.
    return false;
  }
}

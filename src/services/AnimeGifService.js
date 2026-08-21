/**
 * Free, no-auth-required API built specifically for bots to pull categorized
 * anime reaction GIFs (kiss, hug, pat, slap, cuddle, etc). If it's ever down or
 * network is unavailable, callers just get null back and render without an image
 * instead of crashing the command.
 */
async function fetchAnimeGif(category) {
  try {
    const res = await fetch(`https://nekos.best/api/v2/${category}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.results?.[0]?.url || null;
  } catch {
    return null; // network hiccup / API down — command still works, just without a GIF
  }
}

module.exports = { fetchAnimeGif };

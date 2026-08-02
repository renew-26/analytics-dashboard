function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[a.length][b.length];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\-()]/g, "");
}

export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(na, nb) / maxLen;
}

export interface SimilarProductCandidate {
  id: string;
  name: string;
  brand: string | null;
  contractPeriod: number | null;
  score: number;
}

export function suggestSimilarProducts(
  targetName: string,
  candidates: { id: string; name: string; brand: string | null; contractPeriod: number | null }[],
  limit: number = 3
): SimilarProductCandidate[] {
  return candidates
    .map(c => ({ ...c, score: similarity(targetName, c.name) }))
    .filter(c => c.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

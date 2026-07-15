export function distanceLevenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  )

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cout
      )
    }
  }

  return dp[m][n]
}

export function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function scoreSimilarite(a: string, b: string): number {
  const na = normaliser(a)
  const nb = normaliser(b)

  if (na.length === 0 || nb.length === 0) return 0
  if (na === nb) return 1

  if (na.includes(nb) || nb.includes(na)) {
    const plusLong = Math.max(na.length, nb.length)
    const plusCourt = Math.min(na.length, nb.length)
    return 0.85 + 0.15 * (plusCourt / plusLong)
  }

  const distance = distanceLevenshtein(na, nb)
  const longueurMax = Math.max(na.length, nb.length)
  return 1 - distance / longueurMax
}

export function trouverElementsProches<T>(
  saisie: string,
  items: T[],
  getNom: (item: T) => string,
  seuil = 0.55,
  limite = 5
): Array<T & { scoreSimilarite: number }> {
  const saisieNormalisee = normaliser(saisie)
  if (saisieNormalisee.length < 2) return []

  return items
    .map((item) => ({
      ...item,
      scoreSimilarite: scoreSimilarite(saisie, getNom(item)),
    }))
    .filter((item) => item.scoreSimilarite >= seuil)
    .sort((a, b) => b.scoreSimilarite - a.scoreSimilarite)
    .slice(0, limite)
}

const PALETTE_TAGS = ['#F0B429', '#17A673', '#E85D4A', '#4A8FC2', '#A876B8']

export function couleurTag(nom: string): string {
  let hash = 0
  for (let i = 0; i < nom.length; i++) {
    hash = (hash * 31 + nom.charCodeAt(i)) % PALETTE_TAGS.length
  }
  return PALETTE_TAGS[Math.abs(hash) % PALETTE_TAGS.length]
}

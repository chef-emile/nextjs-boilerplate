export type LigneCsv = Record<string, string>

export function parserCsv(texte: string): LigneCsv[] {
  const lignes = decouperLignesCsv(texte)
  if (lignes.length === 0) return []

  const entetes = lignes[0].map((e) => e.trim())
  const resultats: LigneCsv[] = []

  for (let i = 1; i < lignes.length; i++) {
    const valeurs = lignes[i]
    if (valeurs.length === 1 && valeurs[0].trim() === '') continue

    const ligne: LigneCsv = {}
    entetes.forEach((entete, index) => {
      ligne[entete] = (valeurs[index] || '').trim()
    })
    resultats.push(ligne)
  }

  return resultats
}

function decouperLignesCsv(texte: string): string[][] {
  const lignes: string[][] = []
  let ligneActuelle: string[] = []
  let champActuel = ''
  let dansGuillemets = false

  const texteNettoye = texte.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < texteNettoye.length; i++) {
    const caractere = texteNettoye[i]
    const suivant = texteNettoye[i + 1]

    if (dansGuillemets) {
      if (caractere === '"' && suivant === '"') {
        champActuel += '"'
        i++
      } else if (caractere === '"') {
        dansGuillemets = false
      } else {
        champActuel += caractere
      }
    } else {
      if (caractere === '"') {
        dansGuillemets = true
      } else if (caractere === ',') {
        ligneActuelle.push(champActuel)
        champActuel = ''
      } else if (caractere === '\n') {
        ligneActuelle.push(champActuel)
        lignes.push(ligneActuelle)
        ligneActuelle = []
        champActuel = ''
      } else {
        champActuel += caractere
      }
    }
  }

  if (champActuel.length > 0 || ligneActuelle.length > 0) {
    ligneActuelle.push(champActuel)
    lignes.push(ligneActuelle)
  }

  return lignes.filter((ligne) => !(ligne.length === 1 && ligne[0] === ''))
}

export function decouperListe(valeur: string): string[] {
  return valeur
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
}

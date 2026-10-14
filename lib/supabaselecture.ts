import { supabase } from '@/lib/supabase'

// L'API Supabase renvoie au maximum 1000 lignes par requête (réglage « Max Rows »).
// Cette fonction lit une table page par page pour récupérer toutes les lignes.
// `ordres` doit permettre un tri stable (clé primaire ou clé composite complète),
// sinon des lignes peuvent être sautées ou doublonnées d'une page à l'autre.

const TAILLE_PAGE = 1000

export async function lireToutesLesLignes<T>(
  table: string,
  colonnes: string,
  ordres: string[]
): Promise<T[]> {
  const resultat: T[] = []
  let debut = 0

  while (true) {
    let requete = supabase.from(table).select(colonnes)

    for (const colonne of ordres) {
      requete = requete.order(colonne)
    }

    const { data, error } = await requete.range(debut, debut + TAILLE_PAGE - 1)

    if (error) throw error

    const lignes = (data || []) as unknown as T[]
    resultat.push(...lignes)

    if (lignes.length < TAILLE_PAGE) break
    debut += TAILLE_PAGE
  }

  return resultat
}

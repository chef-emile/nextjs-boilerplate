import { supabase } from '@/lib/supabase'

const TAILLE_PAGE = 1000

// Lit toutes les lignes d'une table par pages de 1000 (limite de l'API Supabase).
// `ordre` donne les colonnes de tri : un tri stable est indispensable pour que
// la pagination ne saute ni ne répète de lignes.
export async function lireToutesLesLignes<T>(
  table: string,
  colonnes: string,
  ordre: string[]
): Promise<T[]> {
  const resultat: T[] = []

  for (let debut = 0; ; debut += TAILLE_PAGE) {
    let requete = supabase.from(table).select(colonnes)
    for (const colonne of ordre) {
      requete = requete.order(colonne)
    }

    const { data, error } = await requete.range(debut, debut + TAILLE_PAGE - 1)
    if (error) throw error

    const lignes = (data || []) as unknown as T[]
    resultat.push(...lignes)

    if (lignes.length < TAILLE_PAGE) break
  }

  return resultat
}

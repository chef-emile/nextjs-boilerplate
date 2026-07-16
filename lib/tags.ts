import { supabase } from '@/lib/supabase'

export type TagCache = {
  tag_id: number
  nom: string
  portee: string
}

export async function trouverOuCreerTag(
  nom: string,
  portee: 'ingredient' | 'recette',
  cache: TagCache[]
): Promise<number> {
  const nomNormalise = nom.trim().toLowerCase()
  const existant = cache.find(
    (t) => t.nom.toLowerCase() === nomNormalise && t.portee === portee
  )
  if (existant) return existant.tag_id

  const { data, error } = await supabase
    .from('tags')
    .insert({ nom: nom.trim(), portee })
    .select()
    .single()

  if (error) {
    const { data: tagExistant } = await supabase
      .from('tags')
      .select('*')
      .eq('portee', portee)
      .ilike('nom', nom.trim())
      .maybeSingle()

    if (tagExistant) {
      cache.push(tagExistant)
      return tagExistant.tag_id
    }
    throw error
  }

  cache.push(data)
  return data.tag_id
}

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TagSelector from '@/app/components/TagSelector'
import { trouverElementsProches } from '@/lib/similarite'

type Tag = {
  tag_id: number
  nom: string
  portee: string
}

export default function AjouterRecette() {
  const router = useRouter()
  const [nom, setNom] = useState('')
  const [lienExterne, setLienExterne] = useState('')
  const [instructions, setInstructions] = useState('')
  const [ingredients, setIngredients] = useState<any[]>([])
  const [selection, setSelection] = useState<number[]>([])
  const [recherche, setRecherche] = useState('')
  const [message, setMessage] = useState('')
  const [recettes, setRecettes] = useState<any[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [tagsSelection, setTagsSelection] = useState<number[]>([])

  useEffect(() => {
    const chargerIngredients = async () => {
      const { data } = await supabase
        .from('ingredients')
        .select('*')
        .order('nom')
      setIngredients(data || [])

      const { data: recettesData } = await supabase
        .from('recettes')
        .select('*')
        .order('nom')
      setRecettes(recettesData || [])

      const { data: tagsData } = await supabase
        .from('tags')
        .select('*')
        .eq('portee', 'recette')
        .order('nom')
      setTags(tagsData || [])
    }
    chargerIngredients()
  }, [])

  const ingredientsFiltres = ingredients.filter((ingredient) =>
    ingredient.nom
      .toLowerCase()
      .includes(recherche.toLowerCase())
  )

  const recettesProches = trouverElementsProches(nom, recettes, (r) => r.nom)

  const correspondanceExacte = recettesProches.find(
    (r) => r.scoreSimilarite >= 0.9
  )

  const enregistrer = async () => {
    if (nom.trim().length === 0) {
      setMessage('Le nom est obligatoire.')
      return
    }

    if (correspondanceExacte) {
      const confirmation = confirm(
        `Une recette très proche existe déjà : "${correspondanceExacte.nom}". Créer quand même "${nom}" ?`
      )
      if (!confirmation) return
    }

    const { data: recette, error } = await supabase
      .from('recettes')
      .insert({
        nom,
        lien_externe: lienExterne.trim() || null,
        instructions: instructions.trim() || null,
      })
      .select()
      .single()

    if (error) {
      setMessage(error.message)
      return
    }

    if (selection.length > 0) {
      const { error: liaisonError } = await supabase
        .from('recette_ingredients')
        .insert(
          selection.map((ingredientId) => ({
            recette_id: recette.recette_id,
            ingredient_id: ingredientId,
            obligatoire: true,
          }))
        )
      if (liaisonError) {
        setMessage(liaisonError.message)
        return
      }
    }

    if (tagsSelection.length > 0) {
      const { error: tagError } = await supabase
        .from('recette_tags')
        .insert(
          tagsSelection.map((tagId) => ({
            recette_id: recette.recette_id,
            tag_id: tagId,
          }))
        )
      if (tagError) {
        setMessage(
          `Recette créée, mais erreur sur les tags : ${tagError.message}`
        )
        return
      }
    }

    router.push(`/recettes/${recette.recette_id}`)
  }

  return (
    <main className="min-h-screen bg-fond text-texte px-6 py-10 md:px-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="font-serif italic text-4xl md:text-5xl text-texte mb-8">
          Ajouter une recette
        </h1>

        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Nom de la recette"
          className="bg-surface border border-ligne rounded-lg px-3 py-2 font-sans text-sm text-texte mb-2 block w-full focus:outline-none focus:border-or"
        />

       {recettesProches.length > 0 && (
          <div className="border border-or bg-surface-2 rounded-lg p-3 mb-4">
            <p className="font-mono text-xs uppercase tracking-wide text-or mb-2">
              Recettes proches déjà existantes
            </p>
            <ul className="font-sans text-sm text-texte space-y-1">
              {recettesProches.map((r) => (
                <li key={r.recette_id}>
                  {r.nom}{' '}
                  <span className="font-mono text-texte-muted">
                    ({Math.round(r.scoreSimilarite * 100)}%)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

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
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        Ajouter une recette
      </h1>
      <input
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        placeholder="Nom de la recette"
        className="border p-2 rounded mb-2 block"
      />

      {recettesProches.length > 0 && (
        <div className="border border-yellow-300 bg-yellow-50 rounded p-3 mb-4 max-w-md">
          <p className="text-sm font-semibold mb-1">
            Recettes proches déjà existantes :
          </p>
          <ul className="text-sm">
            {recettesProches.map((r) => (
              <li key={r.recette_id}>
                {r.nom}{' '}
                <span className="text-gray-500">
                  ({Math.round(r.scoreSimilarite * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 max-w-md">
        <p className="font-semibold mb-2">Tags de la recette</p>
        <TagSelector
          portee="recette"
          tagsDisponibles={tags}
          selection={tagsSelection}
          onChange={setTagsSelection}
          onTagCree={(tag) => setTags([...tags, tag])}
        />
      </div>

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher un ingrédient..."
        className="border p-2 rounded mb-4 block w-full"
      />
      <div className="max-h-96 overflow-auto">
        {ingredientsFiltres.map((ingredient) => (
          <label
            key={ingredient.ingredient_id}
            className="block"
          >
            <input
              type="checkbox"
              checked={selection.includes(
                ingredient.ingredient_id
              )}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelection([
                    ...selection,
                    ingredient.ingredient_id,
                  ])
                } else {
                  setSelection(
                    selection.filter(
                      (id) =>
                        id !== ingredient.ingredient_id
                    )
                  )
                }
              }}
            />
            {' '}
            {ingredient.nom}
          </label>
        ))}
      </div>
      <button
        onClick={enregistrer}
        className="bg-green-500 text-white px-4 py-2 rounded mt-4"
      >
        Enregistrer la recette
      </button>
      <p className="mt-4">{message}</p>
    </main>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AjouterRecette() {
  const [nom, setNom] = useState('')
  const [ingredients, setIngredients] = useState<any[]>([])
  const [selection, setSelection] = useState<number[]>([])
  const [recherche, setRecherche] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const chargerIngredients = async () => {
      const { data } = await supabase
        .from('ingredients')
        .select('*')
        .order('nom')

      setIngredients(data || [])
    }

    chargerIngredients()
  }, [])

  const ingredientsFiltres = ingredients.filter((ingredient) =>
    ingredient.nom
      .toLowerCase()
      .includes(recherche.toLowerCase())
  )

  const enregistrer = async () => {
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

    setMessage('Recette ajoutée')
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
        className="border p-2 rounded mb-4 block"
      />

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

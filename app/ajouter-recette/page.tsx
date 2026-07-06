    'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AjouterRecette() {
  const [nom, setNom] = useState('')
  const [categorie, setCategorie] = useState('')
  const [ingredients, setIngredients] = useState<any[]>([])
  const [selection, setSelection] = useState<number[]>([])

  const enregistrer = async () => {
    const { data: recette } = await supabase
    .from('recettes')
    .insert({
      nom,
      categorie,
    })
    .select()
    .single()

    await supabase.from('recette_ingredients').insert(
  selection.map((ingredientId) => ({
    recette_id: recette.recette_id,
    ingredient_id: ingredientId,
    obligatoire: true,
  }))
)
}

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

  return (
    <main className="p-6">
      <h1>Ajouter une recette</h1>

      <input
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        placeholder="Nom de la recette"
      />

      <br />

      <select
        value={categorie}
        onChange={(e) => setCategorie(e.target.value)}
      >
        <option>Plat</option>
        <option>Apéro</option>
        <option>Dessert</option>
        <option>Soupe</option>
      </select>

      <h2>Ingrédients</h2>

      {ingredients.map((ingredient) => (
        <label key={ingredient.ingredient_id}>
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

          {ingredient.nom}
        </label>
      ))}


      <button
        onClick={enregistrer}
        className="bg-blue-500 text-white px-4 py-2 rounded"
        >
      Enregistrer la recette
      </button>
    </main>
  )
}

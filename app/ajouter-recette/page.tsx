'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AjouterRecette() {
  const [nom, setNom] = useState('')
  const [categorie, setCategorie] = useState('')
  const [ingredients, setIngredients] = useState<any[]>([])
  const [selection, setSelection] = useState<number[]>([])

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
    </main>
  )
}

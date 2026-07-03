'use client'

import { useState } from 'react'

type Ingredient = {
  ingredient_id: number
  nom: string
}

export default function IngredientsSelector({
  ingredients,
}: {
  ingredients: Ingredient[]
}) {
  const [selected, setSelected] = useState<string[]>([])

  const toggleIngredient = (nom: string) => {
    setSelected((current) =>
      current.includes(nom)
        ? current.filter((i) => i !== nom)
        : [...current, nom]
    )
  }

  return (
    <div>
      {ingredients.map((ingredient) => (
        <button
          key={ingredient.ingredient_id}
          onClick={() => toggleIngredient(ingredient.nom)}
        >
          {selected.includes(ingredient.nom) ? '✓ ' : ''}
          {ingredient.nom}
        </button>
      ))}

      <pre>{JSON.stringify(selected, null, 2)}</pre>
    </div>
  )
}

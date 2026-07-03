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
  className={`m-1 px-4 py-2 rounded-full border transition-all duration-200 ${
    selected.includes(ingredient.nom)
      ? "bg-green-500 text-white border-green-500"
      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
  }`}
>
  {ingredient.nom}
</button>
      ))}

      <pre>{JSON.stringify(selected, null, 2)}</pre>
    </div>
  )
}

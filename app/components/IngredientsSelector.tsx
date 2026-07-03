'use client'

import { useState } from 'react'

type Ingredient = {
  ingredient_id: number
  nom: string
}
type Recette = {
  recette_id: number
  nom: string
}


type RecetteIngredient = {
  recette_id: number
  ingredient_id: number
  obligatoire: boolean
}
export default function IngredientsSelector({
  ingredients,
  recettes,
  recetteIngredients,
}: {
  ingredients: Ingredient[]
  recettes: Recette[]
  recetteIngredients: RecetteIngredient[]
}) {
  const [selected, setSelected] = useState<string[]>([])

  const toggleIngredient = (nom: string) => {
    setSelected((current) =>
      current.includes(nom)
        ? current.filter((i) => i !== nom)
        : [...current, nom]
    )
  }
console.log(
  recettes.length,
  recetteIngredients.length
)
  return (
    <div>
      {ingredients.map((ingredient) => (
        <button
          key={ingredient.ingredient_id}
          onClick={() => toggleIngredient(ingredient.nom)}
          className={`m-1 px-4 py-2 rounded-full border transition-all duration-200 ${
            selected.includes(ingredient.nom)
              ? 'bg-green-500 text-white border-green-500'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
          }`}
        >
          {ingredient.nom}
        </button>
      ))}

      <div className="mt-6 p-4 bg-gray-100 rounded-lg">
        <h2 className="font-bold mb-2">
          Ingrédients sélectionnés :
        </h2>

        <div className="flex flex-wrap gap-2">
          {selected.map((ingredient) => (
            <span
              key={ingredient}
              className="bg-green-500 text-white px-3 py-1 rounded-full"
            >
              {ingredient}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-bold mb-4">
          Recettes compatibles
        </h2>

        <div className="bg-white border rounded-lg p-4">
          Bientôt ici les recettes compatibles
        </div>
      </div>
    </div>
  )
}

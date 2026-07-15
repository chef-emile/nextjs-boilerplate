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

type Tag = {
  tag_id: number
  nom: string
  portee: string
}

type IngredientTag = {
  ingredient_id: number
  tag_id: number
}

export default function IngredientsSelector({
  ingredients,
  recettes,
  recetteIngredients,
  tags = [],
  ingredientTags = [],
}: {
  ingredients: Ingredient[]
  recettes: Recette[]
  recetteIngredients: RecetteIngredient[]
  tags?: Tag[]
  ingredientTags?: IngredientTag[]
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null)
  const [tagsFiltre, setTagsFiltre] = useState<number[]>([])

  const toggleIngredient = (nom: string) => {
    setSelected((current) =>
      current.includes(nom)
        ? current.filter((i) => i !== nom)
        : [...current, nom]
    )
  }

  const toggleTagFiltre = (tagId: number) => {
    setTagsFiltre((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId]
    )
  }

  const recettesCompatibles = recettes
    .map((recette) => {
      const ingredientsRecette = recetteIngredients.filter(
        (ri) => ri.recette_id === recette.recette_id
      )

      const ingredientsTrouves = ingredientsRecette.filter((ri) => {
        const ingredient = ingredients.find(
          (i) => i.ingredient_id === ri.ingredient_id
        )

        return ingredient && selected.includes(ingredient.nom)
      })

      const score =
        ingredientsRecette.length > 0
          ? Math.round(
              (ingredientsTrouves.length /
                ingredientsRecette.length) *
                100
            )
          : 0

      return {
        nom: recette.nom,
        score,
      }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  const ingredientsCompatibles = ingredients.map((ingredient) => {
    if (selected.includes(ingredient.nom)) {
      return {
        id: ingredient.ingredient_id,
        score: 0,
      }
    }

    let score = 0

    recettes.forEach((recette) => {
      const ingredientsRecette = recetteIngredients
        .filter((ri) => ri.recette_id === recette.recette_id)
        .map((ri) => ri.ingredient_id)

      const recetteContientSelection = selected.every((nom) => {
        const ingredientSelectionne = ingredients.find(
          (i) => i.nom === nom
        )

        return (
          ingredientSelectionne &&
          ingredientsRecette.includes(
            ingredientSelectionne.ingredient_id
          )
        )
      })

      if (
        recetteContientSelection &&
        ingredientsRecette.includes(ingredient.ingredient_id)
      ) {
        score++
      }
    })

    return {
      id: ingredient.ingredient_id,
      score,
    }
  })

  const getCompatibilityScore = (ingredientId: number) => {
    return (
      ingredientsCompatibles.find((i) => i.id === ingredientId)?.score || 0
    )
  }

  const ingredientsAffiches =
    tagsFiltre.length === 0
      ? ingredients
      : ingredients.filter((ingredient) => {
          const tagsDeLIngredient = ingredientTags
            .filter((it) => it.ingredient_id === ingredient.ingredient_id)
            .map((it) => it.tag_id)
          return tagsFiltre.every((tagId) =>
            tagsDeLIngredient.includes(tagId)
          )
        })

  return (
    <div>
      {tags.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-semibold mb-2">Filtrer par tag :</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag.tag_id}
                onClick={() => toggleTagFiltre(tag.tag_id)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  tagsFiltre.includes(tag.tag_id)
                    ? 'bg-purple-500 text-white border-purple-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                }`}
              >
                {tag.nom}
              </button>
            ))}
          </div>
        </div>
      )}

      {ingredientsAffiches.map((ingredient) => {
        const score = getCompatibilityScore(ingredient.ingredient_id)

        return (
          <button
            key={ingredient.ingredient_id}
            onClick={() => toggleIngredient(ingredient.nom)}
            className={`m-1 px-4 py-2 rounded-full border transition-all duration-200 ${
              selected.includes(ingredient.nom)
                ? 'bg-green-500 text-white border-green-500'
                : score > 10
                ? 'bg-yellow-500'
                : score > 5
                ? 'bg-yellow-300'
                : score > 0
                ? 'bg-yellow-100'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            {ingredient.nom}
            {score > 0 && ` (${score})`}
          </button>
        )
      })}

      {ingredientsAffiches.length === 0 && (
        <p className="text-gray-500 mt-4">
          Aucun ingrédient pour ces tags.
        </p>
      )}

      <div className="mt-6 p-4 bg-gray-100 rounded-lg">
        <h2 className="font-bold mb-2">Ingrédients sélectionnés :</h2>

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
        <h2 className="text-xl font-bold mb-4">Recettes compatibles</h2>

        <div className="bg-white border rounded-lg p-4">
          {recettesCompatibles.map((recette) => (
            <button
              key={recette.nom}
              onClick={() => setSelectedRecipe(recette.nom)}
              className="w-full flex justify-between border-b py-2 hover:bg-gray-100"
            >
              <span>{recette.nom}</span>
              <span>{recette.score}%</span>
            </button>
          ))}
        </div>

        {selectedRecipe && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h2 className="font-bold">Recette sélectionnée</h2>
            <p>{selectedRecipe}</p>
          </div>
        )}
      </div>
    </div>
  )
}

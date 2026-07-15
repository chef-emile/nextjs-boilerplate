'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Ingredient = {
  ingredient_id: number
  nom: string
  categorie?: string
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

export default function RecetteDetail({
  recette,
  recetteIngredientsInitial,
  ingredients,
}: {
  recette: Recette
  recetteIngredientsInitial: RecetteIngredient[]
  ingredients: Ingredient[]
}) {
  const router = useRouter()

  const [nom, setNom] = useState(recette.nom)
  const [editionNom, setEditionNom] = useState(false)
  const [nomTemp, setNomTemp] = useState(recette.nom)

  const [recetteIngredients, setRecetteIngredients] = useState
    RecetteIngredient[]
  >(recetteIngredientsInitial)

  const [recherche, setRecherche] = useState('')
  const [obligatoireNouveau, setObligatoireNouveau] = useState(true)
  const [message, setMessage] = useState('')

  const ingredientsAssocies = recetteIngredients
    .map((ri) => {
      const ingredient = ingredients.find(
        (i) => i.ingredient_id === ri.ingredient_id
      )
      if (!ingredient) return null
      return {
        ...ingredient,
        obligatoire: ri.obligatoire,
      }
    })
    .filter((i): i is Ingredient & { obligatoire: boolean } => i !== null)

  const idsAssocies = recetteIngredients.map((ri) => ri.ingredient_id)

  const ingredientsDisponibles = ingredients
    .filter((i) => !idsAssocies.includes(i.ingredient_id))
    .filter((i) =>
      i.nom.toLowerCase().includes(recherche.toLowerCase())
    )

  const renommer = async () => {
    if (nomTemp.trim().length === 0) {
      setMessage('Le nom ne peut pas être vide.')
      return
    }

    const { error } = await supabase
      .from('recettes')
      .update({ nom: nomTemp })
      .eq('recette_id', recette.recette_id)

    if (error) {
      setMessage(error.message)
      return
    }

    setNom(nomTemp)
    setEditionNom(false)
    setMessage('')
  }

  const supprimerRecette = async () => {
    const confirmation = confirm(
      `Supprimer définitivement la recette "${nom}" ?`
    )
    if (!confirmation) return

    const { error: errorLignes } = await supabase
      .from('recette_ingredients')
      .delete()
      .eq('recette_id', recette.recette_id)

    if (errorLignes) {
      setMessage(errorLignes.message)
      return
    }

    const { error: errorRecette } = await supabase
      .from('recettes')
      .delete()
      .eq('recette_id', recette.recette_id)

    if (errorRecette) {
      setMessage(errorRecette.message)
      return
    }

    router.push('/')
  }

  const ajouterIngredient = async (ingredient: Ingredient) => {
    const { error } = await supabase.from('recette_ingredients').insert({
      recette_id: recette.recette_id,
      ingredient_id: ingredient.ingredient_id,
      obligatoire: obligatoireNouveau,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setRecetteIngredients([
      ...recetteIngredients,
      {
        recette_id: recette.recette_id,
        ingredient_id: ingredient.ingredient_id,
        obligatoire: obligatoireNouveau,
      },
    ])
    setRecherche('')
    setMessage('')
  }

  const supprimerIngredient = async (ingredientId: number) => {
    const { error } = await supabase
      .from('recette_ingredients')
      .delete()
      .eq('recette_id', recette.recette_id)
      .eq('ingredient_id', ingredientId)

    if (error) {
      setMessage(error.message)
      return
    }

    setRecetteIngredients(
      recetteIngredients.filter(
        (ri) => ri.ingredient_id !== ingredientId
      )
    )
  }

  const toggleObligatoire = async (
    ingredientId: number,
    valeurActuelle: boolean
  ) => {
    const { error } = await supabase
      .from('recette_ingredients')
      .update({ obligatoire: !valeurActuelle })
      .eq('recette_id', recette.recette_id)
      .eq('ingredient_id', ingredientId)

    if (error) {
      setMessage(error.message)
      return
    }

    setRecetteIngredients(
      recetteIngredients.map((ri) =>
        ri.ingredient_id === ingredientId
          ? { ...ri, obligatoire: !valeurActuelle }
          : ri
      )
    )
  }

  return (
    <main className="p-6">
      <Link href="/" className="text-blue-500 underline">
        ← Retour aux recettes
      </Link>

      <div className="mt-4 mb-6">
        {editionNom ? (
          <div className="flex gap-2 items-center">
            <input
              value={nomTemp}
              onChange={(e) => setNomTemp(e.target.value)}
              className="border p-2 rounded text-2xl font-bold flex-1"
            />
            <button
              onClick={renommer}
              className="bg-green-500 text-white px-4 py-2 rounded"
            >
              Enregistrer
            </button>
            <button
              onClick={() => {
                setNomTemp(nom)
                setEditionNom(false)
              }}
              className="bg-gray-300 px-4 py-2 rounded"
            >
              Annuler
            </button>
          </div>
        ) : (
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">{nom}</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setEditionNom(true)}
                className="bg-blue-500 text-white px-4 py-2 rounded"
              >
                Renommer
              </button>
              <button
                onClick={supprimerRecette}
                className="bg-red-500 text-white px-4 py-2 rounded"
              >
                Supprimer la recette
              </button>
            </div>
          </div>
        )}
      </div>

      {message && <p className="text-red-600 mb-4">{message}</p>}

      <h2 className="text-xl font-bold mb-2">
        Ingrédients ({ingredientsAssocies.length})
      </h2>

      {ingredientsAssocies.length === 0 ? (
        <p className="mb-6">Aucun ingrédient pour cette recette.</p>
      ) : (
        <div className="mb-6">
          {ingredientsAssocies.map((ingredient) => (
            <div
              key={ingredient.ingredient_id}
              className="flex justify-between items-center border-b py-2"
            >
              <span>{ingredient.nom}</span>
              <div className="flex gap-2 items-center">
                <button
                  onClick={() =>
                    toggleObligatoire(
                      ingredient.ingredient_id,
                      ingredient.obligatoire
                    )
                  }
                  className={`text-sm px-2 py-1 rounded ${
                    ingredient.obligatoire
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {ingredient.obligatoire ? 'Obligatoire' : 'Optionnel'}
                </button>
                <button
                  onClick={() =>
                    supprimerIngredient(ingredient.ingredient_id)
                  }
                  className="text-red-600"
                >
                  Retirer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-xl font-bold mb-2">Ajouter un ingrédient</h2>

      <div className="flex gap-4 items-center mb-2">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un ingrédient..."
          className="border p-2 rounded flex-1"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={obligatoireNouveau}
            onChange={(e) => setObligatoireNouveau(e.target.checked)}
          />
          Obligatoire
        </label>
      </div>

      {recherche.length > 0 && (
        <div className="max-h-64 overflow-auto border rounded">
          {ingredientsDisponibles.map((ingredient) => (
            <div
              key={ingredient.ingredient_id}
              className="flex justify-between items-center px-3 py-2 border-b"
            >
              <span>{ingredient.nom}</span>
              <button
                onClick={() => ajouterIngredient(ingredient)}
                className="bg-blue-500 text-white px-3 py-1 rounded"
              >
                Ajouter
              </button>
            </div>
          ))}
          {ingredientsDisponibles.length === 0 && (
            <p className="px-3 py-2 text-gray-500">
              Aucun ingrédient trouvé.
            </p>
          )}
        </div>
      )}
    </main>
  )
}

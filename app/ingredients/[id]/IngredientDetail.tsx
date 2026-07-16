'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TagSelector from '@/app/components/TagSelector'

type Ingredient = {
  ingredient_id: number
  nom: string
  categorie?: string | null
  type_conservation?: string | null
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

export default function IngredientDetail({
  ingredient,
  tagsDisponibles,
  ingredientTagsInitial,
}: {
  ingredient: Ingredient
  tagsDisponibles: Tag[]
  ingredientTagsInitial: IngredientTag[]
}) {
  const [tags, setTags] = useState<Tag[]>(tagsDisponibles)
  const [tagsSelection, setTagsSelection] = useState<number[]>(
    ingredientTagsInitial.map((it) => it.tag_id)
  )
  const [message, setMessage] = useState('')

  const handleTagsChange = async (nouvelleSelection: number[]) => {
    const ajouts = nouvelleSelection.filter(
      (id) => !tagsSelection.includes(id)
    )
    const suppressions = tagsSelection.filter(
      (id) => !nouvelleSelection.includes(id)
    )

    if (ajouts.length > 0) {
      const { error } = await supabase.from('ingredient_tags').insert(
        ajouts.map((tagId) => ({
          ingredient_id: ingredient.ingredient_id,
          tag_id: tagId,
        }))
      )
      if (error) {
        setMessage(error.message)
        return
      }
    }

    for (const tagId of suppressions) {
      const { error } = await supabase
        .from('ingredient_tags')
        .delete()
        .eq('ingredient_id', ingredient.ingredient_id)
        .eq('tag_id', tagId)
      if (error) {
        setMessage(error.message)
        return
      }
    }

    setTagsSelection(nouvelleSelection)
    setMessage('')
  }

  return (
    <main className="p-6">
      <Link href="/ingredients" className="text-blue-500 underline">
        ← Retour aux ingrédients
      </Link>

      <h1 className="text-2xl font-bold mt-4 mb-2">{ingredient.nom}</h1>

      {ingredient.categorie && (
        <p className="text-gray-500 mb-1">
          Catégorie : {ingredient.categorie}
        </p>
      )}
      {ingredient.type_conservation && (
        <p className="text-gray-500 mb-4">
          Conservation : {ingredient.type_conservation}
        </p>
      )}

      {message && <p className="text-red-600 mb-4">{message}</p>}

      <div className="mt-4 max-w-md">
        <p className="font-semibold mb-2">Tags</p>
        <TagSelector
          portee="ingredient"
          tagsDisponibles={tags}
          selection={tagsSelection}
          onChange={handleTagsChange}
          onTagCree={(tag) => setTags([...tags, tag])}
        />
      </div>
    </main>
  )
}

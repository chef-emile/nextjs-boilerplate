'use client'

import { useState } from 'react'
import Link from 'next/link'

type Recette = {
  recette_id: number
  nom: string
}

type Tag = {
  tag_id: number
  nom: string
  portee: string
}

type RecetteTag = {
  recette_id: number
  tag_id: number
}

export default function RecettesListe({
  recettes,
  tags,
  recetteTags,
}: {
  recettes: Recette[]
  tags: Tag[]
  recetteTags: RecetteTag[]
}) {
  const [tagsSelectionnes, setTagsSelectionnes] = useState<number[]>([])

  const toggleTag = (tagId: number) => {
    setTagsSelectionnes((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId]
    )
  }

  const recettesFiltrees =
    tagsSelectionnes.length === 0
      ? recettes
      : recettes.filter((recette) => {
          const tagsDeLaRecette = recetteTags
            .filter((rt) => rt.recette_id === recette.recette_id)
            .map((rt) => rt.tag_id)
          return tagsSelectionnes.every((tagId) =>
            tagsDeLaRecette.includes(tagId)
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
                onClick={() => toggleTag(tag.tag_id)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  tagsSelectionnes.includes(tag.tag_id)
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

      <ul>
        {recettesFiltrees.map((recette) => (
          <li key={recette.recette_id} className="mb-1">
            <Link
              href={`/recettes/${recette.recette_id}`}
              className="text-blue-600 hover:underline"
            >
              {recette.nom}
            </Link>
          </li>
        ))}
      </ul>

      {recettesFiltrees.length === 0 && (
        <p className="text-gray-500">Aucune recette pour ces tags.</p>
      )}
    </div>
  )
}

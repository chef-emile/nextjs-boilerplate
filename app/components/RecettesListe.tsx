'use client'

import { useState } from 'react'
import Link from 'next/link'
import { couleurTag } from '@/lib/tagColor'

type Recette = {
  recette_id: number
  nom: string
  photo_url?: string | null
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

  const tagsDe = (recetteId: number) =>
    recetteTags
      .filter((rt) => rt.recette_id === recetteId)
      .map((rt) => tags.find((t) => t.tag_id === rt.tag_id))
      .filter((t): t is Tag => t !== undefined)

  return (
    <div>
      {tags.length > 0 && (
        <div className="mb-8">
          <p className="font-mono text-xs tracking-widest text-texte-muted uppercase mb-3">
            Filtrer par tag
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const couleur = couleurTag(tag.nom)
              const actif = tagsSelectionnes.includes(tag.tag_id)
              return (
                <button
                  key={tag.tag_id}
                  onClick={() => toggleTag(tag.tag_id)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-[--radius-badge] text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: actif ? couleur : 'transparent',
                    color: actif ? '#17140F' : '#9C9284',
                    border: `1px solid ${actif ? couleur : '#3A342A'}`,
                  }}
                >
                  {tag.nom}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {recettesFiltrees.length === 0 ? (
        <p className="text-texte-muted">Aucune recette pour ces tags.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {recettesFiltrees.map((recette) => {
            const tagsRecette = tagsDe(recette.recette_id)
            return (
              <Link
                key={recette.recette_id}
                href={`/recettes/${recette.recette_id}`}
                className="block rounded-[--radius-carte] shadow-[--shadow-carte] overflow-hidden bg-surface hover:bg-surface-2 border border-ligne transition-colors"
              >
                <div className="h-36 bg-surface-2 flex items-center justify-center overflow-hidden">
                  {recette.photo_url ? (
                    <img
                      src={recette.photo_url}
                      alt={recette.nom}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <i className="text-texte-muted text-2xl">🍽</i>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-display italic text-2xl text-texte mb-2">
                    {recette.nom}
                  </p>
                  {tagsRecette.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tagsRecette.map((tag) => {
                        const couleur = couleurTag(tag.nom)
                        return (
                          <span
                            key={tag.tag_id}
                            className="text-xs font-medium px-2 py-0.5 rounded-[--radius-badge]"
                            style={{
                              backgroundColor: couleur,
                              color: '#17140F',
                            }}
                          >
                            {tag.nom}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

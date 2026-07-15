'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Tag = {
  tag_id: number
  nom: string
  portee: string
}

export default function TagSelector({
  portee,
  tagsDisponibles,
  selection,
  onChange,
  onTagCree,
}: {
  portee: 'ingredient' | 'recette'
  tagsDisponibles: Tag[]
  selection: number[]
  onChange: (selection: number[]) => void
  onTagCree: (tag: Tag) => void
}) {
  const [nouveauTag, setNouveauTag] = useState('')
  const [creation, setCreation] = useState(false)
  const [erreur, setErreur] = useState('')

  const toggleTag = (tagId: number) => {
    if (selection.includes(tagId)) {
      onChange(selection.filter((id) => id !== tagId))
    } else {
      onChange([...selection, tagId])
    }
  }

  const creerTag = async () => {
    const nom = nouveauTag.trim()
    if (nom.length === 0) return

    const dejaExistant = tagsDisponibles.find(
      (t) => t.nom.toLowerCase() === nom.toLowerCase()
    )
    if (dejaExistant) {
      if (!selection.includes(dejaExistant.tag_id)) {
        onChange([...selection, dejaExistant.tag_id])
      }
      setNouveauTag('')
      return
    }

    setCreation(true)
    setErreur('')

    const { data, error } = await supabase
      .from('tags')
      .insert({ nom, portee })
      .select()
      .single()

    setCreation(false)

    if (error) {
      setErreur(error.message)
      return
    }

    onTagCree(data)
    onChange([...selection, data.tag_id])
    setNouveauTag('')
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {tagsDisponibles.map((tag) => (
          <button
            key={tag.tag_id}
            type="button"
            onClick={() => toggleTag(tag.tag_id)}
            className={`px-3 py-1 rounded-full text-sm border ${
              selection.includes(tag.tag_id)
                ? 'bg-purple-500 text-white border-purple-500'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
            }`}
          >
            {tag.nom}
          </button>
        ))}
      </div>

      <div className="flex gap-2 items-center">
        <input
          value={nouveauTag}
          onChange={(e) => setNouveauTag(e.target.value)}
          placeholder="Nouveau tag..."
          className="border p-2 rounded text-sm flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              creerTag()
            }
          }}
        />
        <button
          type="button"
          onClick={creerTag}
          disabled={creation || nouveauTag.trim().length === 0}
          className="bg-purple-500 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
        >
          {creation ? 'Création...' : 'Créer'}
        </button>
      </div>

      {erreur && <p className="text-red-600 text-sm mt-1">{erreur}</p>}
    </div>
  )
}

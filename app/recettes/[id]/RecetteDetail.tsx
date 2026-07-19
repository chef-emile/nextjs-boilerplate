'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import TagSelector from '@/app/components/TagSelector'

type Ingredient = {
  ingredient_id: number
  nom: string
  categorie?: string
}

type Recette = {
  recette_id: number
  nom: string
  lien_externe?: string | null
  instructions?: string | null
  photo_url?: string | null
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

type RecetteTag = {
  recette_id: number
  tag_id: number
}

export default function RecetteDetail({
  recette,
  recetteIngredientsInitial,
  ingredients,
  tagsDisponibles,
  recetteTagsInitial,
}: {
  recette: Recette
  recetteIngredientsInitial: RecetteIngredient[]
  ingredients: Ingredient[]
  tagsDisponibles: Tag[]
  recetteTagsInitial: RecetteTag[]
}) {
  const router = useRouter()

  const [nom, setNom] = useState(recette.nom)
  const [editionNom, setEditionNom] = useState(false)
  const [nomTemp, setNomTemp] = useState(recette.nom)

  const [lienExterne, setLienExterne] = useState(recette.lien_externe || '')
  const [editionLien, setEditionLien] = useState(false)
  const [lienTemp, setLienTemp] = useState(recette.lien_externe || '')

  const [instructions, setInstructions] = useState(recette.instructions || '')
  const [editionInstructions, setEditionInstructions] = useState(false)
  const [instructionsTemp, setInstructionsTemp] = useState(recette.instructions || '')

  const [photoUrl, setPhotoUrl] = useState(recette.photo_url || '')
  const [uploadEnCours, setUploadEnCours] = useState(false)

  const [recetteIngredients, setRecetteIngredients] = useState<RecetteIngredient[]>(recetteIngredientsInitial)

  const [recherche, setRecherche] = useState('')
  const [obligatoireNouveau, setObligatoireNouveau] = useState(true)
  const [message, setMessage] = useState('')

  const [tags, setTags] = useState<Tag[]>(tagsDisponibles)
  const [tagsSelection, setTagsSelection] = useState<number[]>(
    recetteTagsInitial.map((rt) => rt.tag_id)
  )

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
    .filter((i) => i.nom.toLowerCase().includes(recherche.toLowerCase()))

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

  const enregistrerLien = async () => {
    const { error } = await supabase
      .from('recettes')
      .update({ lien_externe: lienTemp.trim() || null })
      .eq('recette_id', recette.recette_id)

    if (error) {
      setMessage(error.message)
      return
    }

    setLienExterne(lienTemp.trim())
    setEditionLien(false)
    setMessage('')
  }

  const enregistrerInstructions = async () => {
    const { error } = await supabase
      .from('recettes')
      .update({ instructions: instructionsTemp.trim() || null })
      .eq('recette_id', recette.recette_id)

    if (error) {
      setMessage(error.message)
      return
    }

    setInstructions(instructionsTemp.trim())
    setEditionInstructions(false)
    setMessage('')
  }

  const uploaderPhoto = async (fichier: File) => {
    setUploadEnCours(true)
    setMessage('')

    const extension = fichier.name.split('.').pop()
    const cheminFichier = `${recette.recette_id}-${Date.now()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('photos-recettes')
      .upload(cheminFichier, fichier, { upsert: true })

    if (uploadError) {
      setMessage(uploadError.message)
      setUploadEnCours(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('photos-recettes')
      .getPublicUrl(cheminFichier)

    const { error: updateError } = await supabase
      .from('recettes')
      .update({ photo_url: urlData.publicUrl })
      .eq('recette_id', recette.recette_id)

    if (updateError) {
      setMessage(updateError.message)
      setUploadEnCours(false)
      return
    }

    setPhotoUrl(urlData.publicUrl)
    setUploadEnCours(false)
  }

  const supprimerPhoto = async () => {
    const { error } = await supabase
      .from('recettes')
      .update({ photo_url: null })
      .eq('recette_id', recette.recette_id)

    if (error) {
      setMessage(error.message)
      return
    }

    setPhotoUrl('')
  }

  const handleTagsChange = async (nouvelleSelection: number[]) => {
    const ajouts = nouvelleSelection.filter((id) => !tagsSelection.includes(id))
    const suppressions = tagsSelection.filter((id) => !nouvelleSelection.includes(id))

    if (ajouts.length > 0) {
      const { error } = await supabase.from('recette_tags').insert(
        ajouts.map((tagId) => ({
          recette_id: recette.recette_id,
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
        .from('recette_tags')
        .delete()
        .eq('recette_id', recette.recette_id)
        .eq('tag_id', tagId)
      if (error) {
        setMessage(error.message)
        return
      }
    }

    setTagsSelection(nouvelleSelection)
    setMessage('')
  }

  const supprimerRecette = async () => {
    const confirmation = confirm(`Supprimer définitivement la recette "${nom}" ?`)
    if (!confirmation) return

    const { error: errorLignes } = await supabase
      .from('recette_ingredients')
      .delete()
      .eq('recette_id', recette.recette_id)

    if (errorLignes) {
      setMessage(errorLignes.message)
      return
    }

    const { error: errorTags } = await supabase
      .from('recette_tags')
      .delete()
      .eq('recette_id', recette.recette_id)

    if (errorTags) {
      setMessage(errorTags.message)
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
      recetteIngredients.filter((ri) => ri.ingredient_id !== ingredientId)
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
    <main className="min-h-screen bg-fond text-texte px-6 py-10 md:px-10">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-wide text-texte-muted hover:text-or transition-colors"
        >
          ← Retour aux recettes
        </Link>

        <div className="mt-4 mb-6">
          {editionNom ? (
            <div className="flex gap-2 items-center">
              <input
                value={nomTemp}
                onChange={(e) => setNomTemp(e.target.value)}
                className="bg-surface border border-ligne rounded-[--radius-champ] px-3 py-2 font-display italic text-2xl text-texte flex-1 focus:outline-none focus:border-or"
                autoFocus
              />
              <button
                onClick={renommer}
                className="bg-emeraude text-fond px-4 py-2 rounded-[--radius-champ] font-sans text-sm hover:opacity-90 transition-opacity"
              >
                Enregistrer
              </button>
              <button
                onClick={() => {
                  setNomTemp(nom)
                  setEditionNom(false)
                }}
                className="bg-surface-2 text-texte-muted px-4 py-2 rounded-[--radius-champ] font-sans text-sm hover:text-texte transition-colors"
              >
                Annuler
              </button>
            </div>
          ) : (
            <div className="flex justify-between items-start gap-4">
              <h1 className="font-display italic text-4xl md:text-5xl text-texte">
                {nom}
              </h1>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setEditionNom(true)}
                  className="font-mono text-xs uppercase tracking-wide border border-ligne text-texte-muted px-3 py-2 rounded-[--radius-champ] hover:border-or hover:text-or transition-colors"
                >
                  Renommer
                </button>
                <button
                  onClick={supprimerRecette}
                  className="font-mono text-xs uppercase tracking-wide border border-corail text-corail px-3 py-2 rounded-[--radius-champ] hover:bg-corail hover:text-fond transition-colors"
                >
                  Supprimer
                </button>
              </div>
            </div>
          )}
        </div>

        {message && (
          <p className="font-sans text-sm text-corail mb-4">{message}</p>
        )}

        <div className="mb-6">
          {photoUrl ? (
            <div className="relative group">
              <img
                src={photoUrl}
                alt={nom}
                className="w-full max-h-96 object-cover rounded-[--radius-carte] border border-ligne"
              />
              <button
                onClick={supprimerPhoto}
                className="absolute top-3 right-3 font-mono text-xs uppercase tracking-wide bg-fond/80 text-corail border border-corail px-3 py-1 rounded-[--radius-champ] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Retirer la photo
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center border border-dashed border-ligne rounded-[--radius-carte] h-40 cursor-pointer hover:border-or transition-colors">
              <span className="font-mono text-xs uppercase tracking-wide text-texte-muted">
                {uploadEnCours ? 'Envoi en cours...' : '+ Ajouter une photo'}
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadEnCours}
                onChange={(e) => {
                  const fichier = e.target.files?.[0]
                  if (fichier) uploaderPhoto(fichier)
                }}
              />
            </label>
          )}
        </div>

        <div className="mb-6">
          <p className="font-mono text-xs uppercase tracking-wide text-texte-muted mb-2">
            Tags
          </p>
          <TagSelector
            portee="recette"
            tagsDisponibles={tags}
            selection={tagsSelection}
            onChange={handleTagsChange}
            onTagCree={(tag) => setTags([...tags, tag])}
          />
        </div>

        <div className="mb-6">
          <p className="font-mono text-xs uppercase tracking-wide text-texte-muted mb-2">
            Lien vers un site tiers
          </p>
          {editionLien ? (
            <div className="flex gap-2 items-center">
              <input
                value={lienTemp}
                onChange={(e) => setLienTemp(e.target.value)}
                placeholder="https://..."
                className="bg-surface border border-ligne rounded-[--radius-champ] px-3 py-2 font-sans text-sm text-texte flex-1 focus:outline-none focus:border-or"
                autoFocus
              />
              <button
                onClick={enregistrerLien}
                className="bg-emeraude text-fond px-3 py-2 rounded-[--radius-champ] font-sans text-sm hover:opacity-90 transition-opacity"
              >
                Enregistrer
              </button>
              <button
                onClick={() => {
                  setLienTemp(lienExterne)
                  setEditionLien(false)
                }}
                className="bg-surface-2 text-texte-muted px-3 py-2 rounded-[--radius-champ] font-sans text-sm hover:text-texte transition-colors"
              >
                Annuler
              </button>
            </div>
          ) : (
            <div className="flex gap-3 items-center flex-wrap">
              {lienExterne ? (
                <a href={lienExterne} target="_blank" rel="noopener noreferrer" className="font-sans text-sm text-emeraude hover:underline break-all">
                  {lienExterne}
                </a>
              ) : (
                <span className="font-sans text-sm text-texte-muted">
                  Aucun lien
                </span>
              )}
              <button
                onClick={() => setEditionLien(true)}
                className="font-mono text-xs text-texte-muted hover:text-or transition-colors"
              >
                Modifier
              </button>
            </div>
          )}
        </div>

        <div className="mb-8">
          <p className="font-mono text-xs uppercase tracking-wide text-texte-muted mb-2">
            Instructions
          </p>
          {editionInstructions ? (
            <div>
              <textarea
                value={instructionsTemp}
                onChange={(e) => setInstructionsTemp(e.target.value)}
                rows={6}
                className="bg-surface border border-ligne rounded-[--radius-champ] px-3 py-2 font-sans text-sm text-texte w-full mb-2 focus:outline-none focus:border-or"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={enregistrerInstructions}
                  className="bg-emeraude text-fond px-3 py-2 rounded-[--radius-champ] font-sans text-sm hover:opacity-90 transition-opacity"
                >
                  Enregistrer
                </button>
                <button
                  onClick={() => {
                    setInstructionsTemp(instructions)
                    setEditionInstructions(false)
                  }}
                  className="bg-surface-2 text-texte-muted px-3 py-2 rounded-[--radius-champ] font-sans text-sm hover:text-texte transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <div>
              {instructions ? (
                <p className="whitespace-pre-wrap font-sans text-sm text-texte mb-2 leading-relaxed">
                  {instructions}
                </p>
              ) : (
                <p className="font-sans text-sm text-texte-muted mb-2">
                  Aucune instruction.
                </p>
              )}
              <button
                onClick={() => setEditionInstructions(true)}
                className="font-mono text-xs text-texte-muted hover:text-or transition-colors"
              >
                Modifier
              </button>
            </div>
          )}
        </div>

        <h2 className="font-display italic text-2xl text-texte mb-3">
          Ingrédients
          <span className="font-mono not-italic text-sm text-texte-muted ml-2">
            ({ingredientsAssocies.length})
          </span>
        </h2>

        {ingredientsAssocies.length === 0 ? (
          <p className="font-sans text-sm text-texte-muted mb-8">
            Aucun ingrédient pour cette recette.
          </p>
        ) : (
          <div className="mb-8 bg-surface border border-ligne rounded-[--radius-carte] shadow-[--shadow-carte] divide-y divide-ligne overflow-hidden">
            {ingredientsAssocies.map((ingredient) => (
              <div
                key={ingredient.ingredient_id}
                className="flex justify-between items-center px-4 py-3"
              >
                <span className="font-sans text-sm text-texte">
                  {ingredient.nom}
                </span>
                <div className="flex gap-3 items-center">
                  <button
                    onClick={() =>
                      toggleObligatoire(
                        ingredient.ingredient_id,
                        ingredient.obligatoire
                      )
                    }
                    className={`text-xs font-medium px-2 py-1 rounded-[--radius-badge] transition-colors ${
                      ingredient.obligatoire
                        ? 'bg-or text-fond'
                        : 'border border-ligne text-texte-muted'
                    }`}
                  >
                    {ingredient.obligatoire ? 'Obligatoire' : 'Optionnel'}
                  </button>
                  <button
                    onClick={() => supprimerIngredient(ingredient.ingredient_id)}
                    className="font-mono text-xs text-corail hover:underline"
                  >
                    Retirer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <h2 className="font-display italic text-2xl text-texte mb-3">
          Ajouter un ingrédient
        </h2>

        <div className="flex gap-4 items-center mb-2 flex-wrap">
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un ingrédient..."
            className="bg-surface border border-ligne rounded-[--radius-champ] px-3 py-2 font-sans text-sm text-texte flex-1 min-w-[200px] focus:outline-none focus:border-or"
          />
          <label className="flex items-center gap-2 font-sans text-sm text-texte-muted">
            <input
              type="checkbox"
              checked={obligatoireNouveau}
              onChange={(e) => setObligatoireNouveau(e.target.checked)}
              className="accent-or"
            />
            Obligatoire
          </label>
        </div>

        {recherche.length > 0 && (
          <div className="max-h-64 overflow-auto bg-surface border border-ligne rounded-[--radius-carte] divide-y divide-ligne">
            {ingredientsDisponibles.map((ingredient) => (
              <div
                key={ingredient.ingredient_id}
                className="flex justify-between items-center px-4 py-2"
              >
                <span className="font-sans text-sm text-texte">
                  {ingredient.nom}
                </span>
                <button
                  onClick={() => ajouterIngredient(ingredient)}
                  className="bg-or text-fond px-3 py-1 rounded-[--radius-badge] font-sans text-sm hover:opacity-90 transition-opacity"
                >
                  Ajouter
                </button>
              </div>
            ))}
            {ingredientsDisponibles.length === 0 && (
              <p className="px-4 py-3 font-sans text-sm text-texte-muted">
                Aucun ingrédient trouvé.
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

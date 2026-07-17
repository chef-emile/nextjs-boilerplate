'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PHRASE_CONFIRMATION = 'SUPPRIMER TOUT'

export default function ExportEtReset() {
  const router = useRouter()

  const [enCoursExport, setEnCoursExport] = useState(false)
  const [erreurExport, setErreurExport] = useState('')

  const [modaleReset, setModaleReset] = useState(false)
  const [confirmationTexte, setConfirmationTexte] = useState('')
  const [enCoursReset, setEnCoursReset] = useState(false)
  const [erreurReset, setErreurReset] = useState('')

  const echapperCsv = (valeur: string) => {
    if (valeur.includes(',') || valeur.includes('"') || valeur.includes('\n')) {
      return `"${valeur.replace(/"/g, '""')}"`
    }
    return valeur
  }

  const exporterRecettes = async () => {
    setEnCoursExport(true)
    setErreurExport('')

    try {
      const { data: recettesData, error: errRecettes } = await supabase
        .from('recettes')
        .select('recette_id, nom, lien_externe, instructions')
        .order('nom')
      if (errRecettes) throw errRecettes

      const { data: recetteTagsData, error: errRecetteTags } = await supabase
        .from('recette_tags')
        .select('recette_id, tag_id')
      if (errRecetteTags) throw errRecetteTags

      const { data: tagsData, error: errTags } = await supabase
        .from('tags')
        .select('tag_id, nom')
        .eq('portee', 'recette')
      if (errTags) throw errTags

      const { data: recetteIngredientsData, error: errRecetteIngredients } =
        await supabase
          .from('recette_ingredients')
          .select('recette_id, ingredient_id, obligatoire')
      if (errRecetteIngredients) throw errRecetteIngredients

      const { data: ingredientsData, error: errIngredients } = await supabase
        .from('ingredients')
        .select('ingredient_id, nom')
      if (errIngredients) throw errIngredients

      const nomTag = (tagId: number) =>
        tagsData?.find((t) => t.tag_id === tagId)?.nom || ''

      const nomIngredient = (ingredientId: number) =>
        ingredientsData?.find((i) => i.ingredient_id === ingredientId)?.nom ||
        ''

      const lignesCsv = [
        'nom,lien_externe,instructions,tags,ingredients_obligatoires,ingredients_optionnels',
      ]

      for (const recette of recettesData || []) {
        const tagsNoms = (recetteTagsData || [])
          .filter((rt) => rt.recette_id === recette.recette_id)
          .map((rt) => nomTag(rt.tag_id))
          .filter(Boolean)

        const obligatoiresNoms = (recetteIngredientsData || [])
          .filter(
            (ri) => ri.recette_id === recette.recette_id && ri.obligatoire
          )
          .map((ri) => nomIngredient(ri.ingredient_id))
          .filter(Boolean)

        const optionnelsNoms = (recetteIngredientsData || [])
          .filter(
            (ri) => ri.recette_id === recette.recette_id && !ri.obligatoire
          )
          .map((ri) => nomIngredient(ri.ingredient_id))
          .filter(Boolean)

        const ligne = [
          echapperCsv(recette.nom || ''),
          echapperCsv(recette.lien_externe || ''),
          echapperCsv(recette.instructions || ''),
          echapperCsv(tagsNoms.join(';')),
          echapperCsv(obligatoiresNoms.join(';')),
          echapperCsv(optionnelsNoms.join(';')),
        ].join(',')

        lignesCsv.push(ligne)
      }

      const contenuCsv = lignesCsv.join('\n')
      const blob = new Blob([contenuCsv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const lien = document.createElement('a')
      lien.href = url
      lien.download = `recettes_export_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(lien)
      lien.click()
      document.body.removeChild(lien)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setErreurExport(err.message || "Erreur pendant l'export.")
    }

    setEnCoursExport(false)
  }

  const supprimerToutesLesLignes = async (table: string, colonneId: string) => {
    const { error } = await supabase.from(table).delete().neq(colonneId, -1)
    if (error) throw error
  }

  const confirmerReset = async () => {
    if (confirmationTexte !== PHRASE_CONFIRMATION) return

    setEnCoursReset(true)
    setErreurReset('')

    try {
      await supprimerToutesLesLignes('recette_ingredients', 'recette_id')
      await supprimerToutesLesLignes('recette_tags', 'recette_id')
      await supprimerToutesLesLignes('ingredient_tags', 'ingredient_id')
      await supprimerToutesLesLignes('recettes', 'recette_id')
      await supprimerToutesLesLignes('ingredients', 'ingredient_id')
      await supprimerToutesLesLignes('tags', 'tag_id')

      setModaleReset(false)
      setConfirmationTexte('')
      router.refresh()
    } catch (err: any) {
      setErreurReset(err.message || 'Erreur pendant la réinitialisation.')
    }

    setEnCoursReset(false)
  }

  const fermerModaleReset = () => {
    if (enCoursReset) return
    setModaleReset(false)
    setConfirmationTexte('')
    setErreurReset('')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border rounded p-4">
        <h2 className="text-xl font-bold mb-2">Exporter les recettes</h2>
        <p className="text-sm text-gray-500 mb-3">
          Génère un CSV avec les colonnes <code>nom</code>,{' '}
          <code>lien_externe</code>, <code>instructions</code>,{' '}
          <code>tags</code>, <code>ingredients_obligatoires</code>,{' '}
          <code>ingredients_optionnels</code> — directement réimportable via
          le formulaire d'import ci-dessus.
        </p>

        {erreurExport && (
          <p className="text-red-600 mb-2">{erreurExport}</p>
        )}

        <button
          onClick={exporterRecettes}
          disabled={enCoursExport}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {enCoursExport ? 'Export en cours...' : 'Exporter les recettes (CSV)'}
        </button>
      </div>

      <div className="border-2 border-red-300 rounded p-4">
        <h2 className="text-xl font-bold mb-2 text-red-700">Zone dangereuse</h2>
        <p className="text-sm text-gray-500 mb-3">
          Supprime définitivement toutes les recettes, ingrédients et tags de
          la base. Cette action est irréversible — pense à exporter tes
          recettes avant si besoin.
        </p>

        <button
          onClick={() => setModaleReset(true)}
          className="bg-red-600 text-white px-4 py-2 rounded"
        >
          Réinitialiser toute la base de données
        </button>
      </div>

      {modaleReset && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-red-700 mb-2">
              Confirmer la réinitialisation
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Toutes les recettes, ingrédients et tags seront supprimés
              définitivement. Pour confirmer, tape exactement{' '}
              <code className="font-mono bg-gray-100 px-1">
                {PHRASE_CONFIRMATION}
              </code>{' '}
              ci-dessous.
            </p>

            <input
              type="text"
              value={confirmationTexte}
              onChange={(e) => setConfirmationTexte(e.target.value)}
              placeholder={PHRASE_CONFIRMATION}
              className="border rounded p-2 w-full mb-3"
              disabled={enCoursReset}
            />

            {erreurReset && (
              <p className="text-red-600 text-sm mb-3">{erreurReset}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={fermerModaleReset}
                disabled={enCoursReset}
                className="px-4 py-2 rounded border disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmerReset}
                disabled={enCoursReset || confirmationTexte !== PHRASE_CONFIRMATION}
                className="bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {enCoursReset
                  ? 'Suppression en cours...'
                  : 'Supprimer définitivement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

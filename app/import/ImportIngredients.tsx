'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { parserCsv, decouperListe } from '@/lib/csv'
import { trouverElementsProches } from '@/lib/similarite'
import { trouverOuCreerTag, TagCache } from '@/lib/tags'

type IngredientExistant = {
  ingredient_id: number
  nom: string
}

type LigneIngredient = {
  nom: string
  tagsNoms: string[]
}

type Decision = {
  action: 'nouveau' | 'existant'
  ingredientIdExistant: number | null
}

export default function ImportIngredients() {
  const [ingredientsExistants, setIngredientsExistants] = useState
    IngredientExistant[]
  >([])
  const [tagsExistants, setTagsExistants] = useState<TagCache[]>([])
  const [ingredientTagsExistants, setIngredientTagsExistants] = useState
    { ingredient_id: number; tag_id: number }[]
  >([])

  const [lignes, setLignes] = useState<LigneIngredient[]>([])
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [nomFichier, setNomFichier] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [resultat, setResultat] = useState('')
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    const charger = async () => {
      const { data: ingredientsData } = await supabase
        .from('ingredients')
        .select('ingredient_id, nom')
        .order('nom')
      setIngredientsExistants(ingredientsData || [])

      const { data: tagsData } = await supabase
        .from('tags')
        .select('*')
        .eq('portee', 'ingredient')
      setTagsExistants(tagsData || [])

      const { data: ingredientTagsData } = await supabase
        .from('ingredient_tags')
        .select('*')
      setIngredientTagsExistants(ingredientTagsData || [])
    }
    charger()
  }, [])

  const suggestionPour = (nom: string) => {
    return trouverElementsProches(
      nom,
      ingredientsExistants,
      (i) => i.nom,
      0.55,
      1
    )[0]
  }

  const gererFichier = async (fichier: File) => {
    setErreur('')
    setResultat('')
    setNomFichier(fichier.name)

    const texte = await fichier.text()
    const donnees = parserCsv(texte)

    const lignesParsees: LigneIngredient[] = donnees
      .map((ligne) => ({
        nom: (ligne['nom'] || ligne['Nom'] || '').trim(),
        tagsNoms: decouperListe(ligne['tags'] || ligne['Tags'] || ''),
      }))
      .filter((l) => l.nom.length > 0)

    const decisionsInitiales: Decision[] = lignesParsees.map((ligne) => {
      const suggestion = suggestionPour(ligne.nom)
      if (suggestion && suggestion.scoreSimilarite >= 0.9) {
        return {
          action: 'existant',
          ingredientIdExistant: suggestion.ingredient_id,
        }
      }
      return { action: 'nouveau', ingredientIdExistant: null }
    })

    setLignes(lignesParsees)
    setDecisions(decisionsInitiales)
  }

  const modifierDecision = (index: number, decision: Decision) => {
    setDecisions((prev) => prev.map((d, i) => (i === index ? decision : d)))
  }

  const lancerImport = async () => {
    setEnCours(true)
    setErreur('')

    let crees = 0
    let reutilises = 0

    const tagsCache = [...tagsExistants]
    const liensExistants = [...ingredientTagsExistants]

    try {
      for (let i = 0; i < lignes.length; i++) {
        const ligne = lignes[i]
        const decision = decisions[i]

        let ingredientId: number

        if (decision.action === 'existant' && decision.ingredientIdExistant) {
          ingredientId = decision.ingredientIdExistant
          reutilises++
        } else {
          const { data, error } = await supabase
            .from('ingredients')
            .insert({ nom: ligne.nom })
            .select()
            .single()

          if (error) throw error
          ingredientId = data.ingredient_id
          crees++
        }

        for (const nomTag of ligne.tagsNoms) {
          const tagId = await trouverOuCreerTag(nomTag, 'ingredient', tagsCache)

          const dejaLie = liensExistants.some(
            (l) => l.ingredient_id === ingredientId && l.tag_id === tagId
          )

          if (!dejaLie) {
            const { error: liaisonError } = await supabase
              .from('ingredient_tags')
              .insert({ ingredient_id: ingredientId, tag_id: tagId })

            if (liaisonError) throw liaisonError
            liensExistants.push({ ingredient_id: ingredientId, tag_id: tagId })
          }
        }
      }

      setResultat(
        `Import terminé : ${crees} ingrédient(s) créé(s), ${reutilises} réutilisé(s).`
      )
      setLignes([])
      setDecisions([])
      setNomFichier('')

      const { data: ingredientsData } = await supabase
        .from('ingredients')
        .select('ingredient_id, nom')
        .order('nom')
      setIngredientsExistants(ingredientsData || [])
    } catch (err: any) {
      setErreur(err.message || "Erreur pendant l'import.")
    }

    setEnCours(false)
  }

  return (
    <div className="border rounded p-4">
      <h2 className="text-xl font-bold mb-2">Importer des ingrédients</h2>
      <p className="text-sm text-gray-500 mb-3">
        Colonnes attendues : <code>nom</code>, <code>tags</code> (séparés par
        des <code>;</code>)
      </p>

      <input
        type="file"
        accept=".csv"
        onChange={(e) => {
          const fichier = e.target.files?.[0]
          if (fichier) gererFichier(fichier)
        }}
        className="mb-4 block"
      />

      {erreur && <p className="text-red-600 mb-2">{erreur}</p>}
      {resultat && <p className="text-green-600 mb-2">{resultat}</p>}

      {lignes.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-gray-600">
            {nomFichier} — {lignes.length} ligne(s) à valider
          </p>

          <div className="max-h-96 overflow-auto border rounded mb-4">
            {lignes.map((ligne, index) => {
              const suggestion = suggestionPour(ligne.nom)
              const decision = decisions[index]

              return (
                <div key={index} className="border-b p-3">
                  <p className="font-semibold">{ligne.nom}</p>
                  {ligne.tagsNoms.length > 0 && (
                    <p className="text-xs text-gray-500">
                      Tags : {ligne.tagsNoms.join(', ')}
                    </p>
                  )}
                  {suggestion && (
                    <p className="text-xs text-yellow-700 mt-1">
                      Proche de « {suggestion.nom} » (
                      {Math.round(suggestion.scoreSimilarite * 100)}%)
                    </p>
                  )}

                  <div className="flex gap-4 mt-2 text-sm items-center">
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`decision-${index}`}
                        checked={decision.action === 'nouveau'}
                        onChange={() =>
                          modifierDecision(index, {
                            action: 'nouveau',
                            ingredientIdExistant: null,
                          })
                        }
                      />
                      Créer un nouvel ingrédient
                    </label>

                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`decision-${index}`}
                        checked={decision.action === 'existant'}
                        onChange={() =>
                          modifierDecision(index, {
                            action: 'existant',
                            ingredientIdExistant:
                              decision.ingredientIdExistant ??
                              suggestion?.ingredient_id ??
                              ingredientsExistants[0]?.ingredient_id ??
                              null,
                          })
                        }
                      />
                      Utiliser un ingrédient existant
                    </label>

                    {decision.action === 'existant' && (
                      <select
                        value={decision.ingredientIdExistant ?? ''}
                        onChange={(e) =>
                          modifierDecision(index, {
                            action: 'existant',
                            ingredientIdExistant: Number(e.target.value),
                          })
                        }
                        className="border rounded p-1 text-sm"
                      >
                        {ingredientsExistants.map((ing) => (
                          <option
                            key={ing.ingredient_id}
                            value={ing.ingredient_id}
                          >
                            {ing.nom}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <button
            onClick={lancerImport}
            disabled={enCours}
            className="bg-green-500 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {enCours ? 'Import en cours...' : "Lancer l'import"}
          </button>
        </div>
      )}
    </div>
  )
}

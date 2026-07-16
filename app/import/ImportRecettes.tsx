'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { parserCsv, decouperListe } from '@/lib/csv'
import { trouverElementsProches, normaliser } from '@/lib/similarite'
import { trouverOuCreerTag, TagCache } from '@/lib/tags'

type IngredientExistant = {
  ingredient_id: number
  nom: string
}

type RecetteExistante = {
  recette_id: number
  nom: string
}

type LigneRecette = {
  nom: string
  lienExterne: string
  instructions: string
  tagsNoms: string[]
  obligatoiresNoms: string[]
  optionnelsNoms: string[]
}

type DecisionRecette = {
  action: 'creer' | 'ignorer'
}

type ResolutionIngredient = {
  nomOriginal: string
  action: 'existant' | 'nouveau'
  ingredientIdExistant: number | null
}

export default function ImportRecettes() {
  const [ingredientsExistants, setIngredientsExistants] = useState
    IngredientExistant[]
  >([])
  const [recettesExistantes, setRecettesExistantes] = useState
    RecetteExistante[]
  >([])
  const [tagsExistants, setTagsExistants] = useState<TagCache[]>([])

  const [lignes, setLignes] = useState<LigneRecette[]>([])
  const [decisionsRecettes, setDecisionsRecettes] = useState
    DecisionRecette[]
  >([])
  const [resolutions, setResolutions] = useState
    Record<string, ResolutionIngredient>
  >({})

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

      const { data: recettesData } = await supabase
        .from('recettes')
        .select('recette_id, nom')
        .order('nom')
      setRecettesExistantes(recettesData || [])

      const { data: tagsData } = await supabase
        .from('tags')
        .select('*')
        .eq('portee', 'recette')
      setTagsExistants(tagsData || [])
    }
    charger()
  }, [])

  const gererFichier = async (fichier: File) => {
    setErreur('')
    setResultat('')
    setNomFichier(fichier.name)

    const texte = await fichier.text()
    const donnees = parserCsv(texte)

    const lignesParsees: LigneRecette[] = donnees
      .map((ligne) => ({
        nom: (ligne['nom'] || ligne['Nom'] || '').trim(),
        lienExterne: (ligne['lien_externe'] || '').trim(),
        instructions: (ligne['instructions'] || '').trim(),
        tagsNoms: decouperListe(ligne['tags'] || ''),
        obligatoiresNoms: decouperListe(
          ligne['ingredients_obligatoires'] || ''
        ),
        optionnelsNoms: decouperListe(ligne['ingredients_optionnels'] || ''),
      }))
      .filter((l) => l.nom.length > 0)

    const decisionsInitiales: DecisionRecette[] = lignesParsees.map(() => ({
      action: 'creer',
    }))

    const nomsIngredientsReferences = new Map<string, string>()
    lignesParsees.forEach((ligne) => {
      ;[...ligne.obligatoiresNoms, ...ligne.optionnelsNoms].forEach((nom) => {
        const cle = normaliser(nom)
        if (!nomsIngredientsReferences.has(cle)) {
          nomsIngredientsReferences.set(cle, nom)
        }
      })
    })

    const resolutionsInitiales: Record<string, ResolutionIngredient> = {}

    nomsIngredientsReferences.forEach((nomOriginal, cle) => {
      const correspondanceExacte = ingredientsExistants.find(
        (i) => normaliser(i.nom) === cle
      )

      if (correspondanceExacte) {
        resolutionsInitiales[cle] = {
          nomOriginal,
          action: 'existant',
          ingredientIdExistant: correspondanceExacte.ingredient_id,
        }
        return
      }

      const suggestion = trouverElementsProches(
        nomOriginal,
        ingredientsExistants,
        (i) => i.nom,
        0.55,
        1
      )[0]

      if (suggestion && suggestion.scoreSimilarite >= 0.85) {
        resolutionsInitiales[cle] = {
          nomOriginal,
          action: 'existant',
          ingredientIdExistant: suggestion.ingredient_id,
        }
      } else {
        resolutionsInitiales[cle] = {
          nomOriginal,
          action: 'nouveau',
          ingredientIdExistant: suggestion ? suggestion.ingredient_id : null,
        }
      }
    })

    setLignes(lignesParsees)
    setDecisionsRecettes(decisionsInitiales)
    setResolutions(resolutionsInitiales)
  }

  const suggestionRecette = (nom: string) => {
    return trouverElementsProches(
      nom,
      recettesExistantes,
      (r) => r.nom,
      0.55,
      1
    )[0]
  }

  const modifierDecisionRecette = (
    index: number,
    action: 'creer' | 'ignorer'
  ) => {
    setDecisionsRecettes((prev) =>
      prev.map((d, i) => (i === index ? { action } : d))
    )
  }

  const modifierResolution = (
    cle: string,
    resolution: ResolutionIngredient
  ) => {
    setResolutions((prev) => ({ ...prev, [cle]: resolution }))
  }

  const clesASignaler = Object.entries(resolutions).filter(([, r]) => {
    const correspondanceExacte = ingredientsExistants.find(
      (i) => normaliser(i.nom) === normaliser(r.nomOriginal)
    )
    return !correspondanceExacte
  })

  const lancerImport = async () => {
    setEnCours(true)
    setErreur('')

    let recettesCreees = 0
    let recettesIgnorees = 0
    let ingredientsCreesCount = 0

    const tagsCache = [...tagsExistants]
    const resolutionsFinales = { ...resolutions }

    try {
      for (const cle of Object.keys(resolutionsFinales)) {
        const resolution = resolutionsFinales[cle]
        if (resolution.action === 'nouveau') {
          const { data, error } = await supabase
            .from('ingredients')
            .insert({ nom: resolution.nomOriginal })
            .select()
            .single()

          if (error) throw error

          resolutionsFinales[cle] = {
            ...resolution,
            ingredientIdExistant: data.ingredient_id,
          }
          ingredientsCreesCount++
        }
      }

      for (let i = 0; i < lignes.length; i++) {
        const ligne = lignes[i]
        const decision = decisionsRecettes[i]

        if (decision.action === 'ignorer') {
          recettesIgnorees++
          continue
        }

        const { data: recette, error } = await supabase
          .from('recettes')
          .insert({
            nom: ligne.nom,
            lien_externe: ligne.lienExterne || null,
            instructions: ligne.instructions || null,
          })
          .select()
          .single()

        if (error) throw error

        for (const nomTag of ligne.tagsNoms) {
          const tagId = await trouverOuCreerTag(nomTag, 'recette', tagsCache)
          const { error: tagError } = await supabase
            .from('recette_tags')
            .insert({ recette_id: recette.recette_id, tag_id: tagId })
          if (tagError) throw tagError
        }

        const insererIngredients = async (
          noms: string[],
          obligatoire: boolean
        ) => {
          for (const nom of noms) {
            const cle = normaliser(nom)
            const resolution = resolutionsFinales[cle]
            if (!resolution || !resolution.ingredientIdExistant) continue

            const { error: liaisonError } = await supabase
              .from('recette_ingredients')
              .insert({
                recette_id: recette.recette_id,
                ingredient_id: resolution.ingredientIdExistant,
                obligatoire,
              })
            if (liaisonError) throw liaisonError
          }
        }

        await insererIngredients(ligne.obligatoiresNoms, true)
        await insererIngredients(ligne.optionnelsNoms, false)

        recettesCreees++
      }

      setResultat(
        `Import terminé : ${recettesCreees} recette(s) créée(s), ${recettesIgnorees} ignorée(s), ${ingredientsCreesCount} nouvel(aux) ingrédient(s) créé(s).`
      )
      setLignes([])
      setDecisionsRecettes([])
      setResolutions({})
      setNomFichier('')

      const { data: ingredientsData } = await supabase
        .from('ingredients')
        .select('ingredient_id, nom')
        .order('nom')
      setIngredientsExistants(ingredientsData || [])

      const { data: recettesData } = await supabase
        .from('recettes')
        .select('recette_id, nom')
        .order('nom')
      setRecettesExistantes(recettesData || [])
    } catch (err: any) {
      setErreur(err.message || "Erreur pendant l'import.")
    }

    setEnCours(false)
  }

  return (
    <div className="border rounded p-4">
      <h2 className="text-xl font-bold mb-2">Importer des recettes</h2>
      <p className="text-sm text-gray-500 mb-3">
        Colonnes attendues : <code>nom</code>, <code>lien_externe</code>,{' '}
        <code>instructions</code>, <code>tags</code>,{' '}
        <code>ingredients_obligatoires</code>,{' '}
        <code>ingredients_optionnels</code> (listes séparées par{' '}
        <code>;</code>)
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
            {nomFichier} — {lignes.length} recette(s) détectée(s)
          </p>

          {clesASignaler.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold mb-2">
                Ingrédients à résoudre ({clesASignaler.length})
              </h3>
              <div className="max-h-72 overflow-auto border rounded">
                {clesASignaler.map(([cle, resolution]) => {
                  const suggestion = trouverElementsProches(
                    resolution.nomOriginal,
                    ingredientsExistants,
                    (i) => i.nom,
                    0.55,
                    1
                  )[0]

                  return (
                    <div key={cle} className="border-b p-3">
                      <p className="font-semibold">{resolution.nomOriginal}</p>
                      {suggestion ? (
                        <p className="text-xs text-yellow-700 mb-1">
                          Proche de « {suggestion.nom} » (
                          {Math.round(suggestion.scoreSimilarite * 100)}%)
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 mb-1">
                          Aucune correspondance trouvée
                        </p>
                      )}

                      <div className="flex gap-4 text-sm items-center">
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name={`resolution-${cle}`}
                            checked={resolution.action === 'nouveau'}
                            onChange={() =>
                              modifierResolution(cle, {
                                ...resolution,
                                action: 'nouveau',
                              })
                            }
                          />
                          Créer un nouvel ingrédient
                        </label>

                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name={`resolution-${cle}`}
                            checked={resolution.action === 'existant'}
                            onChange={() =>
                              modifierResolution(cle, {
                                ...resolution,
                                action: 'existant',
                                ingredientIdExistant:
                                  resolution.ingredientIdExistant ??
                                  suggestion?.ingredient_id ??
                                  ingredientsExistants[0]?.ingredient_id ??
                                  null,
                              })
                            }
                          />
                          Utiliser un ingrédient existant
                        </label>

                        {resolution.action === 'existant' && (
                          <select
                            value={resolution.ingredientIdExistant ?? ''}
                            onChange={(e) =>
                              modifierResolution(cle, {
                                ...resolution,
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
            </div>
          )}

          <h3 className="font-semibold mb-2">Recettes à importer</h3>
          <div className="max-h-96 overflow-auto border rounded mb-4">
            {lignes.map((ligne, index) => {
              const suggestion = suggestionRecette(ligne.nom)
              const decision = decisionsRecettes[index]

              return (
                <div key={index} className="border-b p-3">
                  <p className="font-semibold">{ligne.nom}</p>
                  {suggestion && (
                    <p className="text-xs text-yellow-700 mb-1">
                      Recette proche existante : « {suggestion.nom} » (
                      {Math.round(suggestion.scoreSimilarite * 100)}%)
                    </p>
                  )}
                  {ligne.tagsNoms.length > 0 && (
                    <p className="text-xs text-gray-500">
                      Tags : {ligne.tagsNoms.join(', ')}
                    </p>
                  )}
                  {ligne.obligatoiresNoms.length > 0 && (
                    <p className="text-xs text-gray-500">
                      Obligatoires : {ligne.obligatoiresNoms.join(', ')}
                    </p>
                  )}
                  {ligne.optionnelsNoms.length > 0 && (
                    <p className="text-xs text-gray-500">
                      Optionnels : {ligne.optionnelsNoms.join(', ')}
                    </p>
                  )}

                  <div className="flex gap-4 mt-2 text-sm">
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`decision-recette-${index}`}
                        checked={decision.action === 'creer'}
                        onChange={() => modifierDecisionRecette(index, 'creer')}
                      />
                      Créer quand même
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`decision-recette-${index}`}
                        checked={decision.action === 'ignorer'}
                        onChange={() =>
                          modifierDecisionRecette(index, 'ignorer')
                        }
                      />
                      Ignorer cette ligne
                    </label>
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

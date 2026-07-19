'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { couleurTag } from '@/lib/tagColor'

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

type Position = { x: number; y: number }

type Modale = 'suppression' | 'fusion' | null

const CENTRE: Position = { x: 400, y: 380 }
const RAYON_BASE = 250
const RAYON_PROCHE = 125
const RAYON_SELECTIONNE = 65
const DUREE_ANIMATION = 650

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
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
  const router = useRouter()

  const [selected, setSelected] = useState<string[]>([])
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null)
  const [tagsFiltre, setTagsFiltre] = useState<number[]>([])
  const [positions, setPositions] = useState<Record<number, Position>>({})
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  const [modeGestion, setModeGestion] = useState(false)
  const [selectionGestion, setSelectionGestion] = useState<number[]>([])
  const [modale, setModale] = useState<Modale>(null)
  const [ingredientCible, setIngredientCible] = useState<number | null>(null)
  const [enCoursGestion, setEnCoursGestion] = useState(false)
  const [erreurGestion, setErreurGestion] = useState('')

  const animationRef = useRef<number | null>(null)
  const positionsRef = useRef<Record<number, Position>>({})

  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

  const toggleIngredient = (nom: string) => {
    setSelected((current) =>
      current.includes(nom)
        ? current.filter((i) => i !== nom)
        : [...current, nom]
    )
  }

  const toggleSelectionGestion = (ingredientId: number) => {
    setSelectionGestion((current) =>
      current.includes(ingredientId)
        ? current.filter((id) => id !== ingredientId)
        : [...current, ingredientId]
    )
  }

  const basculerModeGestion = () => {
    setModeGestion((current) => !current)
    setSelected([])
    setSelectedRecipeId(null)
    setSelectionGestion([])
    setModale(null)
    setIngredientCible(null)
    setErreurGestion('')
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
              (ingredientsTrouves.length / ingredientsRecette.length) * 100
            )
          : 0

      return {
        id: recette.recette_id,
        nom: recette.nom,
        score,
      }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  const ingredientsCompatibles = ingredients.map((ingredient) => {
    if (selected.includes(ingredient.nom)) {
      return { id: ingredient.ingredient_id, score: 0 }
    }

    let score = 0

    recettes.forEach((recette) => {
      const ingredientsRecette = recetteIngredients
        .filter((ri) => ri.recette_id === recette.recette_id)
        .map((ri) => ri.ingredient_id)

      const recetteContientSelection = selected.every((nom) => {
        const ingredientSelectionne = ingredients.find((i) => i.nom === nom)
        return (
          ingredientSelectionne &&
          ingredientsRecette.includes(ingredientSelectionne.ingredient_id)
        )
      })

      if (
        recetteContientSelection &&
        ingredientsRecette.includes(ingredient.ingredient_id)
      ) {
        score++
      }
    })

    return { id: ingredient.ingredient_id, score }
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
          return tagsFiltre.every((tagId) => tagsDeLIngredient.includes(tagId))
        })

  const angleParId = useMemo(() => {
    const map = new Map<number, number>()
    const trie = [...ingredients].sort((a, b) => a.ingredient_id - b.ingredient_id)
    const angleOr = Math.PI * (3 - Math.sqrt(5))
    trie.forEach((ingredient, index) => {
      map.set(ingredient.ingredient_id, index * angleOr)
    })
    return map
  }, [ingredients])

  const selectedIds = new Set(
    ingredients.filter((i) => selected.includes(i.nom)).map((i) => i.ingredient_id)
  )

  const scoreMax = Math.max(
    1,
    ...ingredientsAffiches.map((ing) => getCompatibilityScore(ing.ingredient_id))
  )

  const calculerCibles = () => {
    const cibles: Record<number, Position> = {}

    ingredientsAffiches.forEach((ingredient) => {
      const angle = angleParId.get(ingredient.ingredient_id) || 0
      let rayon = RAYON_BASE

      if (selected.includes(ingredient.nom)) {
        rayon = RAYON_SELECTIONNE
      } else if (selected.length > 0) {
        const score = getCompatibilityScore(ingredient.ingredient_id)
        if (score > 0) {
          rayon = RAYON_BASE - (score / scoreMax) * (RAYON_BASE - RAYON_PROCHE)
        }
      }

      cibles[ingredient.ingredient_id] = {
        x: CENTRE.x + Math.cos(angle) * rayon,
        y: CENTRE.y + Math.sin(angle) * rayon,
      }
    })

    return cibles
  }

  useEffect(() => {
    const cibles = calculerCibles()
    const depart = positionsRef.current
    const toutesPresentes = ingredientsAffiches.every(
      (ing) => depart[ing.ingredient_id]
    )

    if (animationRef.current) cancelAnimationFrame(animationRef.current)

    if (!toutesPresentes) {
      setPositions(cibles)
      return
    }

    const debut = performance.now()

    const step = (maintenant: number) => {
      const t = Math.min(1, (maintenant - debut) / DUREE_ANIMATION)
      const t2 = easeOutCubic(t)
      const suivant: Record<number, Position> = {}

      ingredientsAffiches.forEach((ing) => {
        const from = depart[ing.ingredient_id] || cibles[ing.ingredient_id]
        const to = cibles[ing.ingredient_id]
        suivant[ing.ingredient_id] = {
          x: from.x + (to.x - from.x) * t2,
          y: from.y + (to.y - from.y) * t2,
        }
      })

      setPositions(suivant)

      if (t < 1) {
        animationRef.current = requestAnimationFrame(step)
      }
    }

    animationRef.current = requestAnimationFrame(step)

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, tagsFiltre])

  const arcs: { a: number; b: number; poids: number }[] = []
  {
    const idsAffiches = new Set(ingredientsAffiches.map((i) => i.ingredient_id))
    const parRecette = new Map<number, number[]>()

    recetteIngredients.forEach((ri) => {
      if (!idsAffiches.has(ri.ingredient_id)) return
      const liste = parRecette.get(ri.recette_id) || []
      liste.push(ri.ingredient_id)
      parRecette.set(ri.recette_id, liste)
    })

    const poidsParPaire = new Map<string, number>()

    parRecette.forEach((liste) => {
      for (let i = 0; i < liste.length; i++) {
        for (let j = i + 1; j < liste.length; j++) {
          const a = Math.min(liste[i], liste[j])
          const b = Math.max(liste[i], liste[j])
          const cle = `${a}-${b}`
          poidsParPaire.set(cle, (poidsParPaire.get(cle) || 0) + 1)
        }
      }
    })

    poidsParPaire.forEach((poids, cle) => {
      const [a, b] = cle.split('-').map(Number)
      arcs.push({ a, b, poids })
    })
  }

  const recetteSelectionnee = recettesCompatibles.find(
    (r) => r.id === selectedRecipeId
  )

  // --- Mode gestion : suppression / fusion ---

  const ingredientsSelectionGestion = ingredients.filter((i) =>
    selectionGestion.includes(i.ingredient_id)
  )

  const nomIngredient = (id: number) =>
    ingredients.find((i) => i.ingredient_id === id)?.nom || `#${id}`

  const recettesImpacteesParSuppression = useMemo(() => {
    const recetteIdsImpactes = new Set(
      recetteIngredients
        .filter((ri) => selectionGestion.includes(ri.ingredient_id))
        .map((ri) => ri.recette_id)
    )
    return recettes.filter((r) => recetteIdsImpactes.has(r.recette_id))
  }, [selectionGestion, recetteIngredients, recettes])

  const ouvrirModaleSuppression = () => {
    setErreurGestion('')
    setModale('suppression')
  }

  const ouvrirModaleFusion = () => {
    if (selectionGestion.length !== 2) return
    setErreurGestion('')
    setIngredientCible(selectionGestion[0])
    setModale('fusion')
  }

  const fermerModale = () => {
    if (enCoursGestion) return
    setModale(null)
    setIngredientCible(null)
    setErreurGestion('')
  }

  const infoIngredientPourFusion = (id: number) => {
    const nomsTags = ingredientTags
      .filter((it) => it.ingredient_id === id)
      .map((it) => tags.find((t) => t.tag_id === it.tag_id)?.nom)
      .filter((nom): nom is string => Boolean(nom))

    const nomsRecettes = recetteIngredients
      .filter((ri) => ri.ingredient_id === id)
      .map((ri) => recettes.find((r) => r.recette_id === ri.recette_id)?.nom)
      .filter((nom): nom is string => Boolean(nom))

    return { nomsTags, nomsRecettes }
  }

  const confirmerSuppression = async () => {
    setErreurGestion('')
    setEnCoursGestion(true)

    try {
      const ids = selectionGestion

      const { error: errLiaisonsRecettes } = await supabase
        .from('recette_ingredients')
        .delete()
        .in('ingredient_id', ids)
      if (errLiaisonsRecettes) throw errLiaisonsRecettes

      const { error: errLiaisonsTags } = await supabase
        .from('ingredient_tags')
        .delete()
        .in('ingredient_id', ids)
      if (errLiaisonsTags) throw errLiaisonsTags

      const { error: errIngredients } = await supabase
        .from('ingredients')
        .delete()
        .in('ingredient_id', ids)
      if (errIngredients) throw errIngredients

      setSelectionGestion([])
      setModale(null)
      router.refresh()
    } catch (err: any) {
      setErreurGestion(err.message || 'Erreur pendant la suppression.')
    }

    setEnCoursGestion(false)
  }

  const confirmerFusion = async () => {
    if (selectionGestion.length !== 2 || !ingredientCible) return

    const idCible = ingredientCible
    const idSource = selectionGestion.find((id) => id !== idCible)

    if (!idSource) {
      setErreurGestion('Ingrédient source introuvable.')
      return
    }

    setErreurGestion('')
    setEnCoursGestion(true)

    try {
      const tagsSource = ingredientTags.filter(
        (it) => it.ingredient_id === idSource
      )
      const tagsCibleIds = new Set(
        ingredientTags
          .filter((it) => it.ingredient_id === idCible)
          .map((it) => it.tag_id)
      )

      for (const lien of tagsSource) {
        if (!tagsCibleIds.has(lien.tag_id)) {
          const { error: errInsertTag } = await supabase
            .from('ingredient_tags')
            .insert({ ingredient_id: idCible, tag_id: lien.tag_id })
          if (errInsertTag) throw errInsertTag
        }
      }

      const { error: errDeleteTagsSource } = await supabase
        .from('ingredient_tags')
        .delete()
        .eq('ingredient_id', idSource)
      if (errDeleteTagsSource) throw errDeleteTagsSource

      const liensSource = recetteIngredients.filter(
        (ri) => ri.ingredient_id === idSource
      )
      const liensCible = recetteIngredients.filter(
        (ri) => ri.ingredient_id === idCible
      )

      for (const lien of liensSource) {
        const lienCibleExistant = liensCible.find(
          (l) => l.recette_id === lien.recette_id
        )

        if (lienCibleExistant) {
          if (lien.obligatoire && !lienCibleExistant.obligatoire) {
            const { error: errUpdate } = await supabase
              .from('recette_ingredients')
              .update({ obligatoire: true })
              .eq('recette_id', lien.recette_id)
              .eq('ingredient_id', idCible)
            if (errUpdate) throw errUpdate
          }
        } else {
          const { error: errInsertLien } = await supabase
            .from('recette_ingredients')
            .insert({
              recette_id: lien.recette_id,
              ingredient_id: idCible,
              obligatoire: lien.obligatoire,
            })
          if (errInsertLien) throw errInsertLien
        }
      }

      const { error: errDeleteLiensSource } = await supabase
        .from('recette_ingredients')
        .delete()
        .eq('ingredient_id', idSource)
      if (errDeleteLiensSource) throw errDeleteLiensSource

      const { error: errDeleteIngredient } = await supabase
        .from('ingredients')
        .delete()
        .eq('ingredient_id', idSource)
      if (errDeleteIngredient) throw errDeleteIngredient

      setSelectionGestion([])
      setIngredientCible(null)
      setModale(null)
      router.refresh()
    } catch (err: any) {
      setErreurGestion(err.message || 'Erreur pendant la fusion.')
    }

    setEnCoursGestion(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={basculerModeGestion}
          className={`font-mono text-xs uppercase tracking-wide px-3 py-1.5 rounded-[--radius-champ] border transition-colors ${
            modeGestion
              ? 'bg-corail text-fond border-corail'
              : 'text-texte-muted border-ligne hover:border-corail hover:text-corail'
          }`}
        >
          {modeGestion ? 'Quitter le mode gestion' : 'Mode gestion'}
        </button>
      </div>

      {tags.length > 0 && (
        <div className="mb-6">
          <p className="font-mono text-xs uppercase tracking-wide text-texte-muted mb-2">
            Filtrer par tag
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const actif = tagsFiltre.includes(tag.tag_id)
              const couleur = couleurTag(tag.nom)
              return (
                <button
                  key={tag.tag_id}
                  onClick={() => toggleTagFiltre(tag.tag_id)}
                  className="px-3 py-1.5 rounded-[--radius-badge] text-xs font-medium transition-colors"
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

      {modeGestion && (
        <p className="font-sans text-sm text-texte-muted mb-4">
          Mode gestion actif — cliquez des ingrédients dans le réseau pour les sélectionner, puis supprimez-les ou fusionnez-en deux.
        </p>
      )}

      <div className="w-full max-w-3xl mx-auto">
        {ingredientsAffiches.length === 0 ? (
          <p className="text-texte-muted mt-4">
            Aucun ingrédient pour ces tags.
          </p>
        ) : (
          <svg viewBox="0 0 800 760" className="w-full h-auto">
            {arcs.map(({ a, b, poids }) => {
              const posA = positions[a]
              const posB = positions[b]
              if (!posA || !posB) return null

              const actif = selectedIds.has(a) || selectedIds.has(b)
              const mx = (posA.x + posB.x) / 2
              const my = (posA.y + posB.y) / 2
              const cx = mx + (CENTRE.x - mx) * 0.25
              const cy = my + (CENTRE.y - my) * 0.25

              return (
                <path
                  key={`${a}-${b}`}
                  d={`M ${posA.x} ${posA.y} Q ${cx} ${cy} ${posB.x} ${posB.y}`}
                  fill="none"
                  stroke={actif ? 'var(--color-or)' : 'var(--color-ligne)'}
                  strokeWidth={actif ? 1.5 : 0.75}
                  strokeOpacity={actif ? 0.85 : Math.min(0.45, 0.12 + poids * 0.08)}
                  style={{ transition: 'stroke 0.4s ease, stroke-opacity 0.4s ease' }}
                />
              )
            })}

            {ingredientsAffiches.map((ingredient) => {
              const pos = positions[ingredient.ingredient_id]
              if (!pos) return null

              const estSelectionneGestion = selectionGestion.includes(
                ingredient.ingredient_id
              )

              const score = getCompatibilityScore(ingredient.ingredient_id)
              const estSelectionne = selected.includes(ingredient.nom)
              const estSurvole = hoveredId === ingredient.ingredient_id
              const attenue =
                !modeGestion &&
                selected.length > 0 &&
                score === 0 &&
                !estSelectionne

              const rayonPoint = modeGestion
                ? estSelectionneGestion
                  ? 8
                  : 4
                : estSelectionne
                ? 8
                : 4 + (score > 0 ? Math.min(1, score / scoreMax) * 3 : 0)

              const couleurPoint = modeGestion
                ? estSelectionneGestion
                  ? 'var(--color-corail)'
                  : 'var(--color-texte-muted)'
                : estSelectionne
                ? 'var(--color-or)'
                : score > 0
                ? 'var(--color-emeraude)'
                : 'var(--color-texte-muted)'

              const versDroite = pos.x >= CENTRE.x

              return (
                <g
                  key={ingredient.ingredient_id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  opacity={attenue ? 0.35 : 1}
                  style={{ transition: 'opacity 0.4s ease', cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredId(ingredient.ingredient_id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() =>
                    modeGestion
                      ? toggleSelectionGestion(ingredient.ingredient_id)
                      : toggleIngredient(ingredient.nom)
                  }
                >
                  <circle
                    r={rayonPoint}
                    fill={couleurPoint}
                    stroke={
                      estSelectionneGestion
                        ? 'var(--color-corail)'
                        : estSurvole
                        ? 'var(--color-or)'
                        : 'none'
                    }
                    strokeWidth={estSelectionneGestion ? 3 : 2}
                    style={{ transition: 'r 0.3s ease, fill 0.3s ease' }}
                  />
                  <text
                    x={versDroite ? rayonPoint + 6 : -(rayonPoint + 6)}
                    textAnchor={versDroite ? 'start' : 'end'}
                    dy="0.32em"
                    className={`font-sans ${
                      estSelectionne || estSelectionneGestion
                        ? 'fill-texte font-semibold'
                        : 'fill-texte-muted'
                    }`}
                    style={{ fontSize: estSelectionne || estSurvole || estSelectionneGestion ? 12 : 10 }}
                  >
                    {ingredient.nom}
                    {score > 0 && !estSelectionne && !modeGestion && (
                      <tspan className="font-mono fill-emeraude" style={{ fontSize: 9 }}>
                        {' '}
                        {score}
                      </tspan>
                    )}
                  </text>
                  {estSurvole && !modeGestion && (
                    <text
                      x={versDroite ? rayonPoint + 6 : -(rayonPoint + 6)}
                      y={14}
                      textAnchor={versDroite ? 'start' : 'end'}
                      className="font-mono fill-or"
                      style={{ fontSize: 9, cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/ingredients/${ingredient.ingredient_id}`)
                      }}
                    >
                      ✎ modifier
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}

        <p className="text-center font-sans text-xs text-texte-muted mt-2">
          {modeGestion ? (
            <>
              <span className="text-corail">●</span> sélectionné pour gestion
            </>
          ) : (
            <>
              <span className="text-or">●</span> sélectionné&nbsp;&nbsp;
              <span className="text-emeraude">●</span> compatible&nbsp;&nbsp;
              <span className="text-texte-muted">●</span> neutre
            </>
          )}
        </p>
      </div>

      {!modeGestion && (
        <div className="mt-8 p-4 bg-surface border border-ligne rounded-[--radius-carte] shadow-[--shadow-carte]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display italic text-xl text-texte">
              Ingrédients sélectionnés
            </h2>
            {selected.length > 0 && (
              <button
                onClick={() => setSelected([])}
                className="font-mono text-xs text-texte-muted hover:text-or transition-colors"
              >
                Réinitialiser
              </button>
            )}
          </div>

          {selected.length === 0 ? (
            <p className="font-sans text-sm text-texte-muted">
              Cliquez un ingrédient dans le réseau pour révéler les recettes compatibles.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selected.map((nom) => (
                <button
                  key={nom}
                  onClick={() => toggleIngredient(nom)}
                  className="bg-or text-fond px-3 py-1.5 rounded-[--radius-badge] text-xs font-medium hover:opacity-80 transition-opacity"
                >
                  {nom} ×
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!modeGestion && (
        <div className="mt-6">
          <h2 className="font-display italic text-xl text-texte mb-3">
            Recettes compatibles
          </h2>

          {recettesCompatibles.length === 0 ? (
            <p className="font-sans text-sm text-texte-muted">
              Aucune recette compatible pour l'instant.
            </p>
          ) : (
            <div className="bg-surface border border-ligne rounded-[--radius-carte] shadow-[--shadow-carte] divide-y divide-ligne overflow-hidden">
              {recettesCompatibles.map((recette) => (
                <button
                  key={recette.id}
                  onClick={() => setSelectedRecipeId(recette.id)}
                  className="w-full flex justify-between items-center px-4 py-2 hover:bg-surface-2 transition-colors"
                >
                  <span className="font-sans text-texte">{recette.nom}</span>
                  <span className="font-mono text-sm text-or">{recette.score}%</span>
                </button>
              ))}
            </div>
          )}

          {recetteSelectionnee && (
            <div className="mt-4 p-4 bg-surface-2 border border-or rounded-[--radius-carte] flex items-center justify-between">
              <div>
                <p className="font-mono text-xs text-texte-muted uppercase tracking-wide">
                  Recette sélectionnée
                </p>
                <p className="font-display italic text-lg text-texte">
                  {recetteSelectionnee.nom}
                </p>
              </div>
              <Link
                href={`/recettes/${recetteSelectionnee.id}`}
                className="font-mono text-sm text-or hover:underline"
              >
                Voir la fiche →
              </Link>
            </div>
          )}
        </div>
      )}

      {modeGestion && selectionGestion.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-ligne px-6 py-4 flex items-center justify-between z-40">
          <p className="font-mono text-sm text-texte">
            {selectionGestion.length} ingrédient(s) sélectionné(s) :{' '}
            <span className="text-texte-muted">
              {ingredientsSelectionGestion.map((i) => i.nom).join(', ')}
            </span>
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectionGestion([])}
              className="font-mono text-xs text-texte-muted hover:text-texte transition-colors"
            >
              Annuler la sélection
            </button>
            <button
              onClick={ouvrirModaleFusion}
              disabled={selectionGestion.length !== 2}
              className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-[--radius-champ] border border-emeraude text-emeraude hover:bg-emeraude hover:text-fond transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-emeraude"
            >
              Fusionner
            </button>
            <button
              onClick={ouvrirModaleSuppression}
              className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-[--radius-champ] bg-corail text-fond hover:opacity-85 transition-opacity"
            >
              Supprimer
            </button>
          </div>
        </div>
      )}

      {modale === 'suppression' && (
        <div className="fixed inset-0 bg-fond/80 flex items-center justify-center z-50 px-4">
          <div className="bg-surface border border-ligne rounded-[--radius-carte] shadow-[--shadow-flottant] max-w-lg w-full p-6">
            <h3 className="font-display italic text-2xl text-texte mb-3">
              Supprimer {selectionGestion.length} ingrédient(s) ?
            </h3>

            <div className="flex flex-wrap gap-2 mb-4">
              {ingredientsSelectionGestion.map((i) => (
                <span
                  key={i.ingredient_id}
                  className="font-sans text-xs font-medium px-3 py-1.5 rounded-[--radius-badge] bg-surface-2 text-texte"
                >
                  {i.nom}
                </span>
              ))}
            </div>

            {recettesImpacteesParSuppression.length > 0 ? (
              <div className="mb-4">
                <p className="font-sans text-sm text-corail mb-2">
                  {recettesImpacteesParSuppression.length} recette(s) utilisent ces ingrédients et perdront ce lien :
                </p>
                <div className="max-h-40 overflow-auto bg-surface-2 border border-ligne rounded-[--radius-champ] p-3">
                  {recettesImpacteesParSuppression.map((r) => (
                    <p key={r.recette_id} className="font-sans text-sm text-texte-muted">
                      {r.nom}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <p className="font-sans text-sm text-texte-muted mb-4">
                Aucune recette n'utilise ces ingrédients.
              </p>
            )}

            {erreurGestion && (
              <p className="font-sans text-sm text-corail mb-3">{erreurGestion}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={fermerModale}
                disabled={enCoursGestion}
                className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-[--radius-champ] border border-ligne text-texte-muted hover:text-texte transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmerSuppression}
                disabled={enCoursGestion}
                className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-[--radius-champ] bg-corail text-fond hover:opacity-85 transition-opacity disabled:opacity-50"
              >
                {enCoursGestion ? 'Suppression...' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modale === 'fusion' && selectionGestion.length === 2 && (
        <div className="fixed inset-0 bg-fond/80 flex items-center justify-center z-50 px-4">
          <div className="bg-surface border border-ligne rounded-[--radius-carte] shadow-[--shadow-flottant] max-w-lg w-full p-6">
            <h3 className="font-display italic text-2xl text-texte mb-2">
              Fusionner deux ingrédients
            </h3>
            <p className="font-sans text-sm text-texte-muted mb-4">
              Choisissez l'ingrédient à conserver. L'autre sera supprimé et ses tags/recettes transférés vers celui-ci.
            </p>

            <div className="flex flex-col gap-3 mb-4">
              {selectionGestion.map((id) => {
                const info = infoIngredientPourFusion(id)
                return (
                  <label
                    key={id}
                    className={`flex flex-col gap-1 p-3 rounded-[--radius-champ] border cursor-pointer transition-colors ${
                      ingredientCible === id
                        ? 'border-or bg-surface-2'
                        : 'border-ligne hover:border-texte-muted'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="ingredient-cible"
                        checked={ingredientCible === id}
                        onChange={() => setIngredientCible(id)}
                      />
                      <span className="font-sans text-texte font-semibold">
                        {nomIngredient(id)}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-texte-muted pl-6">
                      {info.nomsTags.length > 0
                        ? `Tags : ${info.nomsTags.join(', ')}`
                        : 'Aucun tag'}
                    </span>
                    <span className="font-mono text-xs text-texte-muted pl-6">
                      {info.nomsRecettes.length > 0
                        ? `Recettes : ${info.nomsRecettes.join(', ')}`
                        : 'Aucune recette'}
                    </span>
                  </label>
                )
              })}
            </div>

            {erreurGestion && (
              <p className="font-sans text-sm text-corail mb-3">{erreurGestion}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={fermerModale}
                disabled={enCoursGestion}
                className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-[--radius-champ] border border-ligne text-texte-muted hover:text-texte transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmerFusion}
                disabled={enCoursGestion || !ingredientCible}
                className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-[--radius-champ] bg-emeraude text-fond hover:opacity-85 transition-opacity disabled:opacity-50"
              >
                {enCoursGestion ? 'Fusion...' : 'Confirmer la fusion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

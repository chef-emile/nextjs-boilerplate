'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { couleurTag } from '@/lib/tagColor'
import { normaliser } from '@/lib/similarite'

type Ingredient = {
  ingredient_id: number
  nom: string
  mois_disponibles?: number[] | null
  type_conservation?: string | null
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

type RecetteTag = {
  recette_id: number
  tag_id: number
}

type Position = { x: number; y: number }

type Modale = 'suppression' | 'fusion' | 'saison' | 'conservation' | null

const CENTRE: Position = { x: 400, y: 380 }
const RAYON_BASE = 250
const RAYON_PROCHE = 125
const RAYON_SELECTIONNE = 65
const DUREE_ANIMATION = 650

const LIMITES_AFFICHAGE: (number | null)[] = [25, 40, 80, null]
const LIMITE_PAR_DEFAUT = 40

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

const PRESETS_SAISONS: { libelle: string; mois: number[] }[] = [
  { libelle: 'Printemps', mois: [3, 4, 5] },
  { libelle: 'Été', mois: [6, 7, 8] },
  { libelle: 'Automne', mois: [9, 10, 11] },
  { libelle: 'Hiver', mois: [12, 1, 2] },
]

// Seule la valeur « frais » (légumes frais, viande) est considérée comme périssable.
const VALEUR_PERISSABLE = 'frais'

const OPTIONS_CONSERVATION: { valeur: string | null; libelle: string }[] = [
  { valeur: 'frais', libelle: 'Frais — périssable (légumes frais, viande…)' },
  { valeur: 'surgelé', libelle: 'Surgelé' },
  { valeur: 'conserve', libelle: 'Conserve' },
  { valeur: 'sec', libelle: 'Sec / épicerie (pâtes, riz, farine…)' },
  { valeur: 'épice', libelle: 'Épice / condiment' },
  { valeur: null, libelle: 'Non renseigné' },
]

function estImperissable(ingredient: Ingredient) {
  return (
    Boolean(ingredient.type_conservation) &&
    ingredient.type_conservation !== VALEUR_PERISSABLE
  )
}

const CLASSE_LABEL = 'font-mono text-xs uppercase tracking-wide text-texte-muted mb-2'

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3)
}

function normaliserMois(mois: number[]) {
  return Array.from(new Set(mois))
    .filter((m) => m >= 1 && m <= 12)
    .sort((a, b) => a - b)
}

function libelleMois(mois: number[] | null | undefined): string {
  if (!mois || mois.length === 0 || mois.length >= 12) return "Toute l'année"

  const tries = normaliserMois(mois)
  const plages: number[][] = []

  tries.forEach((m) => {
    const derniere = plages[plages.length - 1]
    if (derniere && m === derniere[derniere.length - 1] + 1) {
      derniere.push(m)
    } else {
      plages.push([m])
    }
  })

  return plages
    .map((plage) =>
      plage.length === 1
        ? MOIS_COURTS[plage[0] - 1]
        : `${MOIS_COURTS[plage[0] - 1]}–${MOIS_COURTS[plage[plage.length - 1] - 1]}`
    )
    .join(', ')
}

function decalageRayon(ingredientId: number) {
  return (((ingredientId * 37) % 3) - 1) * 18
}

export default function IngredientsSelector({
  ingredients,
  recettes,
  recetteIngredients,
  tags = [],
  ingredientTags = [],
  tagsRecettes = [],
  recetteTags = [],
}: {
  ingredients: Ingredient[]
  recettes: Recette[]
  recetteIngredients: RecetteIngredient[]
  tags?: Tag[]
  ingredientTags?: IngredientTag[]
  tagsRecettes?: Tag[]
  recetteTags?: RecetteTag[]
}) {
  const router = useRouter()

  const [selected, setSelected] = useState<string[]>([])
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null)
  const [tagsFiltre, setTagsFiltre] = useState<number[]>([])
  const [moisFiltre, setMoisFiltre] = useState<number | null>(null)
  const [inclureToutesAnnee, setInclureToutesAnnee] = useState(true)
  const [afficherImperissables, setAfficherImperissables] = useState(false)
  const [limite, setLimite] = useState<number | null>(LIMITE_PAR_DEFAUT)
  const [recherche, setRecherche] = useState('')
  const [tagsRecetteFiltre, setTagsRecetteFiltre] = useState<number[]>([])
  const [positions, setPositions] = useState<Record<number, Position>>({})
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  const [modeGestion, setModeGestion] = useState(false)
  const [selectionGestion, setSelectionGestion] = useState<number[]>([])
  const [modale, setModale] = useState<Modale>(null)
  const [ingredientCible, setIngredientCible] = useState<number | null>(null)
  const [moisEdition, setMoisEdition] = useState<number[]>([])
  const [conservationEdition, setConservationEdition] = useState<string | null | undefined>(undefined)
  const [enCoursGestion, setEnCoursGestion] = useState(false)
  const [erreurGestion, setErreurGestion] = useState('')

  const animationRef = useRef<number | null>(null)
  const positionsRef = useRef<Record<number, Position>>({})

  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

  // --- Index calculés une seule fois (évite les boucles imbriquées coûteuses) ---

  const ingredientsParRecette = useMemo(() => {
    const map = new Map<number, Set<number>>()
    recetteIngredients.forEach((ri) => {
      const ensemble = map.get(ri.recette_id) || new Set<number>()
      ensemble.add(ri.ingredient_id)
      map.set(ri.recette_id, ensemble)
    })
    return map
  }, [recetteIngredients])

  const usageParIngredient = useMemo(() => {
    const map = new Map<number, number>()
    recetteIngredients.forEach((ri) => {
      map.set(ri.ingredient_id, (map.get(ri.ingredient_id) || 0) + 1)
    })
    return map
  }, [recetteIngredients])

  const tagsParIngredient = useMemo(() => {
    const map = new Map<number, Set<number>>()
    ingredientTags.forEach((it) => {
      const ensemble = map.get(it.ingredient_id) || new Set<number>()
      ensemble.add(it.tag_id)
      map.set(it.ingredient_id, ensemble)
    })
    return map
  }, [ingredientTags])

  const selectedIds = useMemo(
    () =>
      new Set(
        ingredients
          .filter((i) => selected.includes(i.nom))
          .map((i) => i.ingredient_id)
      ),
    [ingredients, selected]
  )

  const idsSelectionPremiers = useMemo(
    () =>
      selected.map(
        (nom) => ingredients.find((i) => i.nom === nom)?.ingredient_id
      ),
    [selected, ingredients]
  )

  // Score : nombre de recettes contenant toute la sélection ET l'ingrédient.
  // Sans sélection, le score correspond au nombre de recettes utilisant l'ingrédient.
  const scoreParIngredient = useMemo(() => {
    const map = new Map<number, number>()

    if (selected.length === 0) {
      usageParIngredient.forEach((usage, id) => {
        map.set(id, usage)
      })
      return map
    }

    if (idsSelectionPremiers.some((id) => id === undefined)) return map

    ingredientsParRecette.forEach((ensemble) => {
      const contientSelection = idsSelectionPremiers.every(
        (id) => id !== undefined && ensemble.has(id)
      )
      if (!contientSelection) return

      ensemble.forEach((id) => {
        if (selectedIds.has(id)) return
        map.set(id, (map.get(id) || 0) + 1)
      })
    })

    return map
  }, [selected, idsSelectionPremiers, ingredientsParRecette, usageParIngredient, selectedIds])

  const getCompatibilityScore = (ingredientId: number) => {
    return scoreParIngredient.get(ingredientId) || 0
  }

  const tagsParRecette = useMemo(() => {
    const map = new Map<number, Set<number>>()
    recetteTags.forEach((rt) => {
      const ensemble = map.get(rt.recette_id) || new Set<number>()
      ensemble.add(rt.tag_id)
      map.set(rt.recette_id, ensemble)
    })
    return map
  }, [recetteTags])

  const recettesCompatibles = useMemo((): { id: number; nom: string; score: number }[] => {
    if (selected.length === 0) return []

    return recettes
      .map((recette) => {
        const ensemble = ingredientsParRecette.get(recette.recette_id)
        const total = ensemble ? ensemble.size : 0
        let trouves = 0

        if (ensemble) {
          ensemble.forEach((id) => {
            if (selectedIds.has(id)) trouves++
          })
        }

        const score = total > 0 ? Math.round((trouves / total) * 100) : 0

        return {
          id: recette.recette_id,
          nom: recette.nom,
          score,
        }
      })
      .filter((r) => r.score > 0)
      .filter((r) => {
        if (tagsRecetteFiltre.length === 0) return true
        const tagsDeLaRecette = tagsParRecette.get(r.id)
        return tagsRecetteFiltre.every((tagId) =>
          Boolean(tagsDeLaRecette && tagsDeLaRecette.has(tagId))
        )
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
  }, [selected, recettes, ingredientsParRecette, selectedIds, tagsRecetteFiltre, tagsParRecette])

  // --- Filtres (tags + saison), puis limite aux N plus pertinents ---

  // Le tri périssable / impérissable ne s'active que s'il y a un vrai classement
  // (évite de tout masquer si la colonne vaut false partout par défaut).
  const classificationActive = useMemo(() => {
    const aDesPerissables = ingredients.some(
      (i) => i.type_conservation === VALEUR_PERISSABLE
    )
    const aDesImperissables = ingredients.some((i) => estImperissable(i))
    const aDesNonRenseignes = ingredients.some((i) => !i.type_conservation)
    return aDesPerissables || (aDesImperissables && aDesNonRenseignes)
  }, [ingredients])

  const nbImperissables = useMemo(
    () => ingredients.filter((i) => estImperissable(i)).length,
    [ingredients]
  )

  const ingredientsFiltres = useMemo((): Ingredient[] => {
    return ingredients.filter((ingredient) => {
      if (
        classificationActive &&
        !afficherImperissables &&
        estImperissable(ingredient)
      ) {
        return false
      }

      if (tagsFiltre.length > 0) {
        const tagsDeLIngredient = tagsParIngredient.get(ingredient.ingredient_id)
        const tousPresents = tagsFiltre.every((tagId) =>
          Boolean(tagsDeLIngredient && tagsDeLIngredient.has(tagId))
        )
        if (!tousPresents) return false
      }

      if (moisFiltre !== null) {
        const mois = ingredient.mois_disponibles || []
        const estSaisonnier = mois.length > 0 && mois.length < 12
        if (!estSaisonnier) return inclureToutesAnnee
        if (!mois.includes(moisFiltre)) return false
      }

      return true
    })
  }, [ingredients, tagsFiltre, tagsParIngredient, moisFiltre, inclureToutesAnnee, classificationActive, afficherImperissables])

  const ingredientsAffiches = useMemo((): Ingredient[] => {
    const classes = [...ingredientsFiltres].sort((a, b) => {
      const ecartScore =
        (scoreParIngredient.get(b.ingredient_id) || 0) -
        (scoreParIngredient.get(a.ingredient_id) || 0)
      if (ecartScore !== 0) return ecartScore

      const ecartUsage =
        (usageParIngredient.get(b.ingredient_id) || 0) -
        (usageParIngredient.get(a.ingredient_id) || 0)
      if (ecartUsage !== 0) return ecartUsage

      return a.nom.localeCompare(b.nom, 'fr')
    })

    const retenus = limite === null ? classes : classes.slice(0, limite)
    const ids = new Set(retenus.map((i) => i.ingredient_id))

    selectedIds.forEach((id) => ids.add(id))
    selectionGestion.forEach((id) => ids.add(id))

    return ingredients.filter((i) => ids.has(i.ingredient_id))
  }, [ingredientsFiltres, ingredients, scoreParIngredient, usageParIngredient, limite, selectedIds, selectionGestion])

  // Mode gestion : liste alphabétique de TOUS les ingrédients filtrés (pas de limite « réseau »),
  // plus ceux déjà sélectionnés (ex. ajoutés par la recherche) même s'ils sont filtrés.
  const groupesGestion = useMemo((): { lettre: string; items: Ingredient[] }[] => {
    const cle = (nom: string) =>
      nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

    const ids = new Set(ingredientsFiltres.map((i) => i.ingredient_id))
    selectionGestion.forEach((id) => ids.add(id))

    const tries = ingredients
      .filter((i) => ids.has(i.ingredient_id))
      .sort((a, b) => cle(a.nom).localeCompare(cle(b.nom), 'fr'))

    const groupes: { lettre: string; items: Ingredient[] }[] = []
    tries.forEach((ingredient) => {
      const premiere = cle(ingredient.nom).charAt(0).toUpperCase()
      const lettre = /[A-Z]/.test(premiere) ? premiere : '#'
      const dernier = groupes[groupes.length - 1]
      if (dernier && dernier.lettre === lettre) dernier.items.push(ingredient)
      else groupes.push({ lettre, items: [ingredient] })
    })
    return groupes
  }, [ingredients, ingredientsFiltres, selectionGestion])

  const nbGestion = useMemo(
    () => groupesGestion.reduce((total, g) => total + g.items.length, 0),
    [groupesGestion]
  )

  const resultatsRecherche = useMemo((): Ingredient[] => {
    const terme = normaliser(recherche.trim())
    if (terme.length === 0) return []

    return ingredients
      .filter((i) => normaliser(i.nom).includes(terme))
      .sort((a, b) => {
        const ecartUsage =
          (usageParIngredient.get(b.ingredient_id) || 0) -
          (usageParIngredient.get(a.ingredient_id) || 0)
        if (ecartUsage !== 0) return ecartUsage
        return a.nom.localeCompare(b.nom, 'fr')
      })
      .slice(0, 8)
  }, [recherche, ingredients, usageParIngredient])

  const angleParId = useMemo(() => {
    const map = new Map<number, number>()
    const trie = [...ingredients].sort((a, b) => a.ingredient_id - b.ingredient_id)
    const angleOr = Math.PI * (3 - Math.sqrt(5))
    trie.forEach((ingredient, index) => {
      map.set(ingredient.ingredient_id, index * angleOr)
    })
    return map
  }, [ingredients])

  const scoreMax = Math.max(
    1,
    ...ingredientsAffiches.map((ing) => getCompatibilityScore(ing.ingredient_id))
  )

  const calculerCibles = () => {
    const cibles: Record<number, Position> = {}

    ingredientsAffiches.forEach((ingredient) => {
      const angle = angleParId.get(ingredient.ingredient_id) || 0
      const rayonDeBase = RAYON_BASE + decalageRayon(ingredient.ingredient_id)
      let rayon = rayonDeBase

      if (selected.includes(ingredient.nom)) {
        rayon = RAYON_SELECTIONNE
      } else if (selected.length > 0) {
        const score = getCompatibilityScore(ingredient.ingredient_id)
        if (score > 0) {
          rayon = rayonDeBase - (score / scoreMax) * (rayonDeBase - RAYON_PROCHE)
        }
      }

      cibles[ingredient.ingredient_id] = {
        x: CENTRE.x + Math.cos(angle) * rayon,
        y: CENTRE.y + Math.sin(angle) * rayon,
      }
    })

    return cibles
  }

  const cleAffichage =
    ingredientsAffiches.map((i) => i.ingredient_id).join(',') +
    '|' +
    selected.join(',')

  useEffect(() => {
    const cibles = calculerCibles()
    const depart = positionsRef.current

    if (animationRef.current) cancelAnimationFrame(animationRef.current)

    const debut = performance.now()

    const step = (maintenant: number) => {
      const t = Math.min(1, (maintenant - debut) / DUREE_ANIMATION)
      const t2 = easeOutCubic(t)
      const suivant: Record<number, Position> = {}

      ingredientsAffiches.forEach((ing) => {
        const to = cibles[ing.ingredient_id]
        const from = depart[ing.ingredient_id] || to
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
  }, [cleAffichage])

  const arcs = useMemo(() => {
    const idsAffiches = new Set(ingredientsAffiches.map((i) => i.ingredient_id))
    const poidsParPaire = new Map<string, number>()

    ingredientsParRecette.forEach((ensemble) => {
      const liste: number[] = []
      ensemble.forEach((id) => {
        if (idsAffiches.has(id)) liste.push(id)
      })

      for (let i = 0; i < liste.length; i++) {
        for (let j = i + 1; j < liste.length; j++) {
          const a = Math.min(liste[i], liste[j])
          const b = Math.max(liste[i], liste[j])
          const cle = `${a}-${b}`
          poidsParPaire.set(cle, (poidsParPaire.get(cle) || 0) + 1)
        }
      }
    })

    const resultat: { a: number; b: number; poids: number }[] = []
    poidsParPaire.forEach((poids, cle) => {
      const [a, b] = cle.split('-').map(Number)
      resultat.push({ a, b, poids })
    })
    return resultat
  }, [ingredientsAffiches, ingredientsParRecette])

  const recetteSelectionnee = recettesCompatibles.find(
    (r) => r.id === selectedRecipeId
  )

  // --- Handlers de sélection / filtres ---

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

  const toggleTagFiltre = (tagId: number) => {
    setTagsFiltre((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId]
    )
  }

  const toggleTagRecetteFiltre = (tagId: number) => {
    setTagsRecetteFiltre((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId]
    )
  }

  const choisirResultatRecherche = (ingredient: Ingredient) => {
    if (modeGestion) {
      setSelectionGestion((current) =>
        current.includes(ingredient.ingredient_id)
          ? current
          : [...current, ingredient.ingredient_id]
      )
    } else {
      setSelected((current) =>
        current.includes(ingredient.nom) ? current : [...current, ingredient.nom]
      )
    }
    setRecherche('')
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

  // --- Mode gestion : suppression / fusion / saison ---

  const ingredientsSelectionGestion = ingredients.filter((i) =>
    selectionGestion.includes(i.ingredient_id)
  )

  const nomIngredient = (id: number) =>
    ingredients.find((i) => i.ingredient_id === id)?.nom || `#${id}`

  const recettesImpacteesParSuppression = useMemo(() => {
    const recetteIdsImpactes = new Set<number>()
    ingredientsParRecette.forEach((ensemble, recetteId) => {
      if (selectionGestion.some((id) => ensemble.has(id))) {
        recetteIdsImpactes.add(recetteId)
      }
    })
    return recettes.filter((r) => recetteIdsImpactes.has(r.recette_id))
  }, [selectionGestion, ingredientsParRecette, recettes])

  const selectionnerAffiches = () => {
    setSelectionGestion(groupesGestion.flatMap((g) => g.items.map((i) => i.ingredient_id)))
  }

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

  const ouvrirModaleSaison = () => {
    if (selectionGestion.length === 0) return

    const premiers = normaliserMois(
      ingredientsSelectionGestion[0]?.mois_disponibles || []
    )
    const tousIdentiques = ingredientsSelectionGestion.every(
      (i) =>
        normaliserMois(i.mois_disponibles || []).join(',') === premiers.join(',')
    )

    setMoisEdition(tousIdentiques ? premiers : [])
    setErreurGestion('')
    setModale('saison')
  }

  const ouvrirModaleConservation = () => {
    if (selectionGestion.length === 0) return

    const valeurs = ingredientsSelectionGestion.map((i) => i.type_conservation || null)
    const tousIdentiques = valeurs.every((v) => v === valeurs[0])

    setConservationEdition(tousIdentiques ? valeurs[0] : undefined)
    setErreurGestion('')
    setModale('conservation')
  }

  const fermerModale = () => {
    if (enCoursGestion) return
    setModale(null)
    setIngredientCible(null)
    setErreurGestion('')
  }

  const toggleMoisEdition = (mois: number) => {
    setMoisEdition((current) =>
      current.includes(mois)
        ? current.filter((m) => m !== mois)
        : [...current, mois]
    )
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

    const saison = libelleMois(
      ingredients.find((i) => i.ingredient_id === id)?.mois_disponibles
    )

    return { nomsTags, nomsRecettes, saison }
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

  const appliquerSaison = async () => {
    setErreurGestion('')
    setEnCoursGestion(true)

    try {
      const mois = normaliserMois(moisEdition)
      const valeur = mois.length === 0 || mois.length === 12 ? null : mois

      const { data: lignesModifiees, error } = await supabase
        .from('ingredients')
        .update({ mois_disponibles: valeur })
        .in('ingredient_id', selectionGestion)
        .select('ingredient_id')

      if (error) throw error

      if (!lignesModifiees || lignesModifiees.length !== selectionGestion.length) {
        throw new Error(
          'Mise à jour incomplète : policy UPDATE manquante sur « ingredients » ?'
        )
      }

      setSelectionGestion([])
      setModale(null)
      router.refresh()
    } catch (err: any) {
      setErreurGestion(err.message || 'Erreur pendant la mise à jour des saisons.')
    }

    setEnCoursGestion(false)
  }

  const appliquerConservation = async () => {
    if (conservationEdition === undefined) return

    setErreurGestion('')
    setEnCoursGestion(true)

    try {
      const { data: lignesModifiees, error } = await supabase
        .from('ingredients')
        .update({ type_conservation: conservationEdition })
        .in('ingredient_id', selectionGestion)
        .select('ingredient_id')

      if (error) throw error

      if (!lignesModifiees || lignesModifiees.length !== selectionGestion.length) {
        throw new Error(
          'Mise à jour incomplète : policy UPDATE manquante sur « ingredients » ?'
        )
      }

      setSelectionGestion([])
      setModale(null)
      router.refresh()
    } catch (err: any) {
      setErreurGestion(err.message || 'Erreur pendant la mise à jour de la conservation.')
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

      const moisSource = normaliserMois(
        ingredients.find((i) => i.ingredient_id === idSource)?.mois_disponibles || []
      )
      const moisCible = normaliserMois(
        ingredients.find((i) => i.ingredient_id === idCible)?.mois_disponibles || []
      )

      if (moisSource.length > 0) {
        const moisFusionnes = normaliserMois([...moisCible, ...moisSource])

        if (moisFusionnes.join(',') !== moisCible.join(',')) {
          const { data: lignesMois, error: errMois } = await supabase
            .from('ingredients')
            .update({
              mois_disponibles: moisFusionnes.length === 12 ? null : moisFusionnes,
            })
            .eq('ingredient_id', idCible)
            .select('ingredient_id')
          if (errMois) throw errMois
          if (!lignesMois || lignesMois.length === 0) {
            throw new Error(
              'Impossible de fusionner les saisons : policy UPDATE manquante sur « ingredients » ?'
            )
          }
        }
      }

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
    <div className={modeGestion && selectionGestion.length > 0 ? 'pb-24' : ''}>
      <div className="flex items-center justify-between mb-4">
        <p className="font-mono text-xs text-texte-muted">
          {modeGestion
            ? `${nbGestion} ingrédient(s) dans la liste`
            : `${ingredientsAffiches.length} affiché(s) sur ${ingredientsFiltres.length}`}
        </p>
        <button
          onClick={basculerModeGestion}
          className={`font-mono text-xs uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors ${
            modeGestion
              ? 'bg-corail text-fond border-corail'
              : 'text-texte-muted border-ligne hover:border-corail hover:text-corail'
          }`}
        >
          {modeGestion ? 'Quitter le mode gestion' : 'Mode gestion'}
        </button>
      </div>

      <div className="mb-6 relative">
        <p className={CLASSE_LABEL}>Rechercher un ingrédient</p>
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Ex. courgette, basilic…"
          className="w-full bg-surface border border-ligne rounded-lg px-3 py-2 font-sans text-sm text-texte focus:outline-none focus:border-or"
        />
        {resultatsRecherche.length > 0 && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-surface border border-ligne rounded-lg divide-y divide-ligne max-h-72 overflow-auto">
            {resultatsRecherche.map((ingredient) => {
              const dejaSelectionne = modeGestion
                ? selectionGestion.includes(ingredient.ingredient_id)
                : selected.includes(ingredient.nom)
              const usage = usageParIngredient.get(ingredient.ingredient_id) || 0

              return (
                <button
                  key={ingredient.ingredient_id}
                  onClick={() => choisirResultatRecherche(ingredient)}
                  disabled={dejaSelectionne}
                  className="w-full flex justify-between items-center px-4 py-2 text-left hover:bg-surface-2 transition-colors disabled:opacity-40"
                >
                  <span className="font-sans text-sm text-texte">
                    {ingredient.nom}
                  </span>
                  <span className="font-mono text-xs text-texte-muted">
                    {dejaSelectionne ? '✓ sélectionné' : `${usage} recette(s)`}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <p className="font-sans text-xs text-texte-muted mt-1">
          Choisir un résultat le sélectionne et l'affiche dans le réseau, même s'il n'en fait pas partie.
        </p>
      </div>

      {tags.length > 0 && (
        <div className="mb-6">
          <p className={CLASSE_LABEL}>Filtrer par tag</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const actif = tagsFiltre.includes(tag.tag_id)
              const couleur = couleurTag(tag.nom)
              return (
                <button
                  key={tag.tag_id}
                  onClick={() => toggleTagFiltre(tag.tag_id)}
                  className="px-3 py-1 rounded-full text-sm border transition-colors duration-200"
                  style={{
                    borderColor: couleur,
                    backgroundColor: actif ? couleur : 'transparent',
                    color: actif ? '#17140F' : couleur,
                  }}
                >
                  {tag.nom}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="mb-6">
        <p className={CLASSE_LABEL}>Saison</p>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setMoisFiltre(null)}
            className={`px-2.5 py-1 rounded-full text-xs font-mono border transition-colors ${
              moisFiltre === null
                ? 'bg-emeraude text-fond border-emeraude'
                : 'text-texte-muted border-ligne hover:border-emeraude hover:text-emeraude'
            }`}
          >
            Tous
          </button>
          {MOIS_COURTS.map((libelle, index) => {
            const numero = index + 1
            const actif = moisFiltre === numero
            return (
              <button
                key={numero}
                onClick={() => setMoisFiltre(actif ? null : numero)}
                className={`px-2.5 py-1 rounded-full text-xs font-mono border transition-colors ${
                  actif
                    ? 'bg-emeraude text-fond border-emeraude'
                    : 'text-texte-muted border-ligne hover:border-emeraude hover:text-emeraude'
                }`}
              >
                {libelle}
              </button>
            )
          })}
          <button
            onClick={() => setMoisFiltre(new Date().getMonth() + 1)}
            className="font-mono text-xs text-texte-muted hover:text-or transition-colors ml-1"
          >
            Ce mois-ci
          </button>
        </div>
        {moisFiltre !== null && (
          <label className="flex items-center gap-2 mt-3 font-sans text-sm text-texte-muted">
            <input
              type="checkbox"
              checked={inclureToutesAnnee}
              onChange={(e) => setInclureToutesAnnee(e.target.checked)}
              className="accent-or"
            />
            Inclure les ingrédients disponibles toute l'année (ou sans saison renseignée)
          </label>
        )}
      </div>

      <div className="mb-6">
        {!modeGestion && (
        <>
        <p className={CLASSE_LABEL}>Ingrédients affichés dans le réseau</p>
        <div className="flex flex-wrap gap-2 items-center">
          {LIMITES_AFFICHAGE.map((valeur) => {
            const actif = limite === valeur
            return (
              <button
                key={valeur === null ? 'tous' : valeur}
                onClick={() => setLimite(valeur)}
                className={`px-2.5 py-1 rounded-full text-xs font-mono border transition-colors ${
                  actif
                    ? 'bg-or text-fond border-or'
                    : 'text-texte-muted border-ligne hover:border-or hover:text-or'
                }`}
              >
                {valeur === null ? 'Tous' : valeur}
              </button>
            )
          })}
          <span className="font-sans text-xs text-texte-muted ml-1">
            les plus utilisés (ou les plus compatibles avec la sélection)
          </span>
        </div>
        </>
        )}

        {classificationActive ? (
          <label className={`flex items-center gap-2 font-sans text-sm text-texte-muted ${modeGestion ? '' : 'mt-3'}`}>
            <input
              type="checkbox"
              checked={afficherImperissables}
              onChange={(e) => setAfficherImperissables(e.target.checked)}
              className="accent-or"
            />
            Afficher aussi les non périssables (surgelés, conserves, secs, épices…) — {nbImperissables} masqué(s) par défaut
          </label>
        ) : (
          <p className={`font-sans text-xs text-texte-muted ${modeGestion ? '' : 'mt-3'}`}>
            Aucun ingrédient n'a encore de type de conservation : le tri périssable / non périssable est inactif. Classez-les via Mode gestion → Conservation.
          </p>
        )}
      </div>

      {modeGestion && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <p className="font-sans text-sm text-texte-muted">
            Mode gestion actif — cochez des ingrédients, puis supprimez-les, fusionnez-en deux ou définissez leur saison / conservation.
          </p>
          <button
            onClick={selectionnerAffiches}
            className="font-mono text-xs text-texte-muted hover:text-corail transition-colors"
          >
            Tout sélectionner ({nbGestion})
          </button>
        </div>
      )}

      <div className={modeGestion ? 'w-full' : 'w-full max-w-3xl mx-auto'}>
        {modeGestion ? (
          groupesGestion.length === 0 ? (
            <p className="text-texte-muted mt-4">Aucun ingrédient pour ces filtres.</p>
          ) : (
            <div className="sm:columns-2 xl:columns-3 gap-8">
              {groupesGestion.map((groupe) => (
                <section key={groupe.lettre} className="mb-5">
                  <h3 className="font-display italic text-2xl text-or border-b border-ligne pb-1 mb-1 break-after-avoid">
                    {groupe.lettre}
                  </h3>
                  <ul>
                    {groupe.items.map((ingredient) => {
                      const coche = selectionGestion.includes(ingredient.ingredient_id)
                      const usage = usageParIngredient.get(ingredient.ingredient_id) || 0
                      const saison = libelleMois(ingredient.mois_disponibles)
                      const details = [
                        `${usage} recette${usage > 1 ? 's' : ''}`,
                        saison !== "Toute l'année" ? saison : null,
                        ingredient.type_conservation || null,
                      ]
                        .filter(Boolean)
                        .join(' · ')

                      return (
                        <li
                          key={ingredient.ingredient_id}
                          className={`flex items-center gap-2 rounded px-2 py-1.5 break-inside-avoid transition-colors ${
                            coche ? 'bg-surface-2' : 'hover:bg-surface-2'
                          }`}
                        >
                          <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={coche}
                              onChange={() => toggleSelectionGestion(ingredient.ingredient_id)}
                              className="accent-corail shrink-0"
                            />
                            <span className="min-w-0">
                              <span
                                className={`block font-sans text-sm truncate ${
                                  coche ? 'text-texte font-semibold' : 'text-texte'
                                }`}
                              >
                                {ingredient.nom}
                              </span>
                              <span className="block font-mono text-[11px] text-texte-muted truncate">
                                {details}
                              </span>
                            </span>
                          </label>
                          <Link
                            href={`/ingredients/${ingredient.ingredient_id}`}
                            className="font-mono text-xs text-texte-muted hover:text-or transition-colors shrink-0"
                            title="Modifier"
                          >
                            ✎
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )
        ) : ingredientsAffiches.length === 0 ? (
          <p className="text-texte-muted mt-4">
            Aucun ingrédient pour ces filtres.
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
                  {estSurvole && (
                    <text
                      x={versDroite ? rayonPoint + 6 : -(rayonPoint + 6)}
                      y={modeGestion ? 14 : 26}
                      textAnchor={versDroite ? 'start' : 'end'}
                      className="font-mono fill-texte-muted"
                      style={{ fontSize: 9 }}
                    >
                      {libelleMois(ingredient.mois_disponibles)}
                      {ingredient.type_conservation
                        ? ` · ${ingredient.type_conservation}`
                        : ''}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}

        {!modeGestion && (
          <p className="text-center font-sans text-xs text-texte-muted mt-2">
            <span className="text-or">●</span> sélectionné&nbsp;&nbsp;
            <span className="text-emeraude">●</span> compatible&nbsp;&nbsp;
            <span className="text-texte-muted">●</span> neutre
          </p>
        )}
      </div>

      {!modeGestion && (
        <div className="mt-8 p-4 bg-surface border border-ligne rounded-lg">
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
              Cliquez un ingrédient dans le réseau (ou cherchez-le) pour révéler les recettes compatibles.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selected.map((nom) => (
                <button
                  key={nom}
                  onClick={() => toggleIngredient(nom)}
                  className="bg-or text-fond px-3 py-1 rounded-full text-sm font-sans hover:opacity-80 transition-opacity"
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

          {tagsRecettes.length > 0 ? (
            <div className="mb-3">
              <div className="flex flex-wrap gap-2 items-center">
                {tagsRecettes.map((tag) => {
                  const actif = tagsRecetteFiltre.includes(tag.tag_id)
                  const couleur = couleurTag(tag.nom)
                  return (
                    <button
                      key={tag.tag_id}
                      onClick={() => toggleTagRecetteFiltre(tag.tag_id)}
                      className="px-3 py-1 rounded-full text-sm border transition-colors duration-200"
                      style={{
                        borderColor: couleur,
                        backgroundColor: actif ? couleur : 'transparent',
                        color: actif ? '#17140F' : couleur,
                      }}
                    >
                      {tag.nom}
                    </button>
                  )
                })}
                {tagsRecetteFiltre.length > 0 && (
                  <button
                    onClick={() => setTagsRecetteFiltre([])}
                    className="font-mono text-xs text-texte-muted hover:text-or transition-colors ml-1"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="font-sans text-xs text-texte-muted mb-3">
              Aucun tag de recette pour l'instant : ajoute-en depuis l'accueil (bouton Sélection) pour pouvoir filtrer ici.
            </p>
          )}

          {recettesCompatibles.length === 0 ? (
            <p className="font-sans text-sm text-texte-muted">
              Aucune recette compatible pour l'instant.
            </p>
          ) : (
            <div className="bg-surface border border-ligne rounded-lg divide-y divide-ligne">
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
            <div className="mt-4 p-4 bg-surface-2 border border-or rounded-lg flex items-center justify-between">
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
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-ligne px-6 py-4 flex flex-wrap items-center justify-between gap-3 z-40">
          <p className="font-mono text-sm text-texte">
            {selectionGestion.length} sélectionné(s) :{' '}
            <span className="text-texte-muted">
              {ingredientsSelectionGestion
                .slice(0, 4)
                .map((i) => i.nom)
                .join(', ')}
              {ingredientsSelectionGestion.length > 4 ? '…' : ''}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setSelectionGestion([])}
              className="font-mono text-xs text-texte-muted hover:text-texte transition-colors"
            >
              Annuler la sélection
            </button>
            <button
              onClick={ouvrirModaleSaison}
              className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full border border-or text-or hover:bg-or hover:text-fond transition-colors"
            >
              Saison
            </button>
            <button
              onClick={ouvrirModaleConservation}
              className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full border border-texte-muted text-texte-muted hover:bg-texte-muted hover:text-fond transition-colors"
            >
              Conservation
            </button>
            <button
              onClick={ouvrirModaleFusion}
              disabled={selectionGestion.length !== 2}
              className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full border border-emeraude text-emeraude hover:bg-emeraude hover:text-fond transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-emeraude"
            >
              Fusionner
            </button>
            <button
              onClick={ouvrirModaleSuppression}
              className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full bg-corail text-fond hover:opacity-85 transition-opacity"
            >
              Supprimer
            </button>
          </div>
        </div>
      )}

      {modale === 'suppression' && (
        <div className="fixed inset-0 bg-fond/80 flex items-center justify-center z-50 px-4">
          <div className="bg-surface border border-ligne rounded-lg max-w-lg w-full p-6">
            <h3 className="font-display italic text-2xl text-texte mb-3">
              Supprimer {selectionGestion.length} ingrédient(s) ?
            </h3>

            <div className="flex flex-wrap gap-2 mb-4 max-h-32 overflow-auto">
              {ingredientsSelectionGestion.map((i) => (
                <span
                  key={i.ingredient_id}
                  className="font-sans text-sm px-3 py-1 rounded-full bg-surface-2 text-texte"
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
                <div className="max-h-40 overflow-auto bg-surface-2 border border-ligne rounded p-3">
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
                className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full border border-ligne text-texte-muted hover:text-texte transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmerSuppression}
                disabled={enCoursGestion}
                className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full bg-corail text-fond hover:opacity-85 transition-opacity disabled:opacity-50"
              >
                {enCoursGestion ? 'Suppression...' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modale === 'saison' && (
        <div className="fixed inset-0 bg-fond/80 flex items-center justify-center z-50 px-4">
          <div className="bg-surface border border-ligne rounded-lg max-w-lg w-full p-6">
            <h3 className="font-display italic text-2xl text-texte mb-2">
              Définir la saison de {selectionGestion.length} ingrédient(s)
            </h3>
            <p className="font-sans text-sm text-texte-muted mb-4">
              Cochez les mois de disponibilité. Aucun mois sélectionné = disponible toute l'année.
            </p>

            <div className="flex flex-wrap gap-2 mb-3">
              {PRESETS_SAISONS.map((preset) => (
                <button
                  key={preset.libelle}
                  onClick={() => setMoisEdition(preset.mois)}
                  className="px-3 py-1 rounded-full text-xs font-mono border border-ligne text-texte-muted hover:border-or hover:text-or transition-colors"
                >
                  {preset.libelle}
                </button>
              ))}
              <button
                onClick={() => setMoisEdition([])}
                className="px-3 py-1 rounded-full text-xs font-mono border border-ligne text-texte-muted hover:border-or hover:text-or transition-colors"
              >
                Toute l'année
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {MOIS_COURTS.map((libelle, index) => {
                const numero = index + 1
                const actif = moisEdition.includes(numero)
                return (
                  <button
                    key={numero}
                    onClick={() => toggleMoisEdition(numero)}
                    className={`px-2.5 py-1 rounded-full text-xs font-mono border transition-colors ${
                      actif
                        ? 'bg-emeraude text-fond border-emeraude'
                        : 'text-texte-muted border-ligne hover:border-emeraude hover:text-emeraude'
                    }`}
                  >
                    {libelle}
                  </button>
                )
              })}
            </div>

            <p className="font-mono text-xs text-texte-muted mb-4">
              Résultat : {libelleMois(moisEdition)}
            </p>

            {erreurGestion && (
              <p className="font-sans text-sm text-corail mb-3">{erreurGestion}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={fermerModale}
                disabled={enCoursGestion}
                className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full border border-ligne text-texte-muted hover:text-texte transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={appliquerSaison}
                disabled={enCoursGestion}
                className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full bg-or text-fond hover:opacity-85 transition-opacity disabled:opacity-50"
              >
                {enCoursGestion ? 'Enregistrement...' : 'Appliquer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modale === 'conservation' && (
        <div className="fixed inset-0 bg-fond/80 flex items-center justify-center z-50 px-4">
          <div className="bg-surface border border-ligne rounded-lg max-w-md w-full p-6">
            <h3 className="font-display italic text-2xl text-texte mb-2">
              Conservation de {selectionGestion.length} ingrédient(s)
            </h3>
            <p className="font-sans text-sm text-texte-muted mb-4">
              Seuls les ingrédients « frais » (légumes frais, viande…) restent affichés par défaut dans le réseau ; surgelés, conserves, secs et épices sont masqués.
            </p>

            <div className="flex flex-col gap-2 mb-4">
              {OPTIONS_CONSERVATION.map((option) => (
                <label
                  key={String(option.valeur)}
                  className={`flex items-center gap-2 p-3 rounded border cursor-pointer transition-colors ${
                    conservationEdition === option.valeur
                      ? 'border-or bg-surface-2'
                      : 'border-ligne hover:border-texte-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="conservation"
                    checked={conservationEdition === option.valeur}
                    onChange={() => setConservationEdition(option.valeur)}
                  />
                  <span className="font-sans text-sm text-texte">
                    {option.libelle}
                  </span>
                </label>
              ))}
            </div>

            {erreurGestion && (
              <p className="font-sans text-sm text-corail mb-3">{erreurGestion}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={fermerModale}
                disabled={enCoursGestion}
                className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full border border-ligne text-texte-muted hover:text-texte transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={appliquerConservation}
                disabled={enCoursGestion || conservationEdition === undefined}
                className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full bg-or text-fond hover:opacity-85 transition-opacity disabled:opacity-50"
              >
                {enCoursGestion ? 'Enregistrement...' : 'Appliquer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modale === 'fusion' && selectionGestion.length === 2 && (
        <div className="fixed inset-0 bg-fond/80 flex items-center justify-center z-50 px-4">
          <div className="bg-surface border border-ligne rounded-lg max-w-lg w-full p-6">
            <h3 className="font-display italic text-2xl text-texte mb-2">
              Fusionner deux ingrédients
            </h3>
            <p className="font-sans text-sm text-texte-muted mb-4">
              Choisissez l'ingrédient à conserver. L'autre sera supprimé et ses tags, recettes et mois de disponibilité transférés vers celui-ci.
            </p>

            <div className="flex flex-col gap-3 mb-4">
              {selectionGestion.map((id) => {
                const info = infoIngredientPourFusion(id)
                return (
                  <label
                    key={id}
                    className={`flex flex-col gap-1 p-3 rounded border cursor-pointer transition-colors ${
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
                    <span className="font-mono text-xs text-texte-muted pl-6">
                      Saison : {info.saison}
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
                className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full border border-ligne text-texte-muted hover:text-texte transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmerFusion}
                disabled={enCoursGestion || !ingredientCible}
                className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full bg-emeraude text-fond hover:opacity-85 transition-opacity disabled:opacity-50"
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

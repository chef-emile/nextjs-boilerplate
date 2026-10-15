'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { lireToutesLesLignes } from '@/lib/supabaseLecture'
import { trouverElementsProches, normaliser } from '@/lib/similarite'
import { trouverOuCreerTag, TagCache } from '@/lib/tags'

type RecetteBase = {
  recette_id: number
  nom: string
  lien_externe: string | null
  instructions: string | null
}

type IngredientBase = {
  ingredient_id: number
  nom: string
}

type TagBase = {
  tag_id: number
  nom: string
  portee: string
}

type LienTag = {
  recette_id: number
  tag_id: number
}

type LienIngredient = {
  recette_id: number
  ingredient_id: number
  obligatoire: boolean
}

type DonneesBase = {
  recettes: RecetteBase[]
  ingredients: IngredientBase[]
  tags: TagBase[]
  liensTags: LienTag[]
  liensIngredients: LienIngredient[]
}

type ChampsModifies = {
  nom?: string
  lien_externe?: string | null
  instructions?: string | null
}

type LigneAnalysee = {
  numeroLigne: number
  recetteId: number | null
  nom: string
  lien: string | null | undefined
  instructions: string | null | undefined
  tagsNoms: string[] | undefined
  obligatoires: string[] | undefined
  optionnels: string[] | undefined
  statut: 'modification' | 'inchange' | 'creation' | 'erreur'
  changements: string[]
  messageErreur: string
  signalement: string
  decision: 'creer' | 'ignorer'
  champsModifies: ChampsModifies
  tagsRetires: number
  ingredientsRetires: number
}

type ResolutionIngredient = {
  nomOriginal: string
  action: 'existant' | 'nouveau'
  ingredientIdExistant: number | null
}

const TAILLE_MAX_CELLULE = 32000
const MARQUEUR_TRONQUE = '[…TRONQUÉ : ne pas modifier cette cellule…]'

const ALIAS_COLONNES: Record<string, string> = {
  recetteid: 'id',
  id: 'id',
  nom: 'nom',
  recette: 'nom',
  lienexterne: 'lien',
  lien: 'lien',
  url: 'lien',
  instructions: 'instructions',
  tags: 'tags',
  tag: 'tags',
  ingredientsobligatoires: 'obligatoires',
  obligatoires: 'obligatoires',
  ingredientsoptionnels: 'optionnels',
  optionnels: 'optionnels',
}

const LIGNES_AIDE = [
  "Mode d'emploi : modifie les lignes existantes (sans toucher à la colonne recette_id) et ajoute les nouvelles recettes en bas du tableau, en laissant recette_id vide.",
  'nom : nom de la recette (obligatoire).',
  "lien_externe : adresse du site d'origine (vide = aucun lien).",
  "instructions : texte libre. Une cellule vide efface les instructions de la recette.",
  "tags : liste séparée par des points-virgules, par exemple italien;rapide;végétarien. La cellule REMPLACE tous les tags de la recette (cellule vide = aucun tag). La feuille Listes donne les tags existants.",
  "ingredients_obligatoires et ingredients_optionnels : listes séparées par des points-virgules. Chaque colonne REMPLACE les ingrédients de sa catégorie. Écris les noms comme dans la feuille Listes : un nom inconnu te sera signalé avant l'import (création d'un nouvel ingrédient ou rapprochement avec un ingrédient existant).",
  "nb_ingredients : information en lecture seule, ignorée à l'import (utile pour repérer les recettes sans ingrédients).",
  "Pour ne pas toucher à un champ (par exemple les instructions), supprime la colonne entière du fichier.",
  "Les photos ne sont jamais modifiées par cet import.",
  "Avant toute écriture, l'application affiche un aperçu : modifications, créations, doublons possibles, ingrédients à résoudre et erreurs. Rien n'est enregistré tant que tu n'as pas cliqué sur Appliquer.",
]

function sansAccents(texte: string) {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function cleColonne(texte: string) {
  return sansAccents(texte).replace(/[^a-z0-9]/g, '')
}

function texteCellule(valeur: unknown) {
  if (valeur === null || valeur === undefined) return ''
  return String(valeur).trim()
}

function listeNoms(texte: string, cle: (nom: string) => string) {
  const vus = new Set<string>()
  return texte
    .split(';')
    .map((element) => element.trim())
    .filter((element) => {
      if (element === '') return false
      const k = cle(element)
      if (vus.has(k)) return false
      vus.add(k)
      return true
    })
}

function analyserMatrice(
  matrice: unknown[][],
  base: DonneesBase
): {
  lignes: LigneAnalysee[]
  erreurFichier: string
  resolutions: Record<string, ResolutionIngredient>
} {
  const resolutions: Record<string, ResolutionIngredient> = {}

  if (matrice.length < 2) {
    return { lignes: [], erreurFichier: 'Le fichier ne contient aucune ligne de données.', resolutions }
  }

  const indexColonne: Record<string, number> = {}
  matrice[0].forEach((cellule, index) => {
    const role = ALIAS_COLONNES[cleColonne(texteCellule(cellule))]
    if (role && indexColonne[role] === undefined) indexColonne[role] = index
  })

  if (indexColonne['nom'] === undefined) {
    return {
      lignes: [],
      erreurFichier: 'Colonne « nom » introuvable dans la première ligne du fichier.',
      resolutions,
    }
  }

  const recettesParId = new Map<number, RecetteBase>()
  const recettesParNom = new Map<string, RecetteBase>()
  base.recettes.forEach((recette) => {
    recettesParId.set(recette.recette_id, recette)
    const cle = normaliser(recette.nom)
    if (!recettesParNom.has(cle)) recettesParNom.set(cle, recette)
  })

  const ingredientsParId = new Map<number, IngredientBase>()
  const ingredientsParCle = new Map<string, IngredientBase>()
  base.ingredients.forEach((ingredient) => {
    ingredientsParId.set(ingredient.ingredient_id, ingredient)
    const cle = normaliser(ingredient.nom)
    if (!ingredientsParCle.has(cle)) ingredientsParCle.set(cle, ingredient)
  })

  const nomTagParId = new Map<number, string>()
  base.tags.forEach((tag) => nomTagParId.set(tag.tag_id, tag.nom))

  const nomsTagsParRecette = new Map<number, string[]>()
  base.liensTags.forEach((lien) => {
    const nomTag = nomTagParId.get(lien.tag_id)
    if (!nomTag) return
    const liste = nomsTagsParRecette.get(lien.recette_id) || []
    liste.push(nomTag)
    nomsTagsParRecette.set(lien.recette_id, liste)
  })

  const liensParRecette = new Map<number, Map<number, boolean>>()
  base.liensIngredients.forEach((lien) => {
    const liens = liensParRecette.get(lien.recette_id) || new Map<number, boolean>()
    liens.set(lien.ingredient_id, lien.obligatoire)
    liensParRecette.set(lien.recette_id, liens)
  })

  const lignes: LigneAnalysee[] = []
  const nomsNouveauxVus = new Map<string, number>()
  const nomsReferences = new Map<string, string>()

  for (let i = 1; i < matrice.length; i++) {
    const cellules = matrice[i]
    if (cellules.every((cellule) => texteCellule(cellule) === '')) continue

    const numeroLigne = i + 1

    const valeur = (role: string) => {
      const index = indexColonne[role]
      if (index === undefined) return undefined
      return texteCellule(cellules[index])
    }

    const texteId = valeur('id')
    const nom = valeur('nom') || ''
    const messagesErreur: string[] = []

    let recetteId: number | null = null
    if (texteId) {
      const numero = Number(texteId)
      if (Number.isInteger(numero) && numero > 0) {
        recetteId = numero
      } else {
        messagesErreur.push(`identifiant invalide « ${texteId} »`)
      }
    }

    if (nom === '') messagesErreur.push('nom manquant')

    const texteLien = valeur('lien')
    const lien: string | null | undefined =
      texteLien === undefined ? undefined : texteLien === '' ? null : texteLien

    let instructions: string | null | undefined = undefined
    const texteInstructions = valeur('instructions')
    if (texteInstructions !== undefined && !texteInstructions.includes(MARQUEUR_TRONQUE)) {
      instructions = texteInstructions === '' ? null : texteInstructions
    }

    let tagsNoms: string[] | undefined = undefined
    const texteTags = valeur('tags')
    if (texteTags !== undefined) {
      tagsNoms = listeNoms(texteTags, (nomTag) => nomTag.toLowerCase())
    }

    let obligatoires: string[] | undefined = undefined
    const texteObligatoires = valeur('obligatoires')
    if (texteObligatoires !== undefined) {
      obligatoires = listeNoms(texteObligatoires, normaliser)
    }

    let optionnels: string[] | undefined = undefined
    const texteOptionnels = valeur('optionnels')
    if (texteOptionnels !== undefined) {
      const clesObligatoires = new Set((obligatoires || []).map((element) => normaliser(element)))
      optionnels = listeNoms(texteOptionnels, normaliser).filter(
        (element) => !clesObligatoires.has(normaliser(element))
      )
    }

    const ligne: LigneAnalysee = {
      numeroLigne,
      recetteId,
      nom,
      lien,
      instructions,
      tagsNoms,
      obligatoires,
      optionnels,
      statut: 'inchange',
      changements: [],
      messageErreur: '',
      signalement: '',
      decision: 'creer',
      champsModifies: {},
      tagsRetires: 0,
      ingredientsRetires: 0,
    }

    if (messagesErreur.length > 0) {
      ligne.statut = 'erreur'
      ligne.messageErreur = messagesErreur.join(' ; ')
      lignes.push(ligne)
      continue
    }

    ;[...(obligatoires || []), ...(optionnels || [])].forEach((nomIngredient) => {
      const cle = normaliser(nomIngredient)
      if (!nomsReferences.has(cle)) nomsReferences.set(cle, nomIngredient)
    })

    if (recetteId !== null) {
      const existante = recettesParId.get(recetteId)

      if (!existante) {
        ligne.statut = 'erreur'
        ligne.messageErreur = `identifiant ${recetteId} introuvable dans la base`
        lignes.push(ligne)
        continue
      }

      if (nom !== existante.nom) {
        ligne.champsModifies.nom = nom
        ligne.changements.push(`nom : « ${existante.nom} » → « ${nom} »`)
      }

      if (lien !== undefined && (lien || '') !== (existante.lien_externe || '').trim()) {
        ligne.champsModifies.lien_externe = lien
        ligne.changements.push('lien externe modifié')
      }

      if (
        instructions !== undefined &&
        (instructions || '') !== (existante.instructions || '').trim()
      ) {
        ligne.champsModifies.instructions = instructions
        ligne.changements.push('instructions modifiées')
      }

      if (tagsNoms !== undefined) {
        const actuels = nomsTagsParRecette.get(recetteId) || []
        const clesActuelles = new Set(actuels.map((tag) => tag.toLowerCase()))
        const clesFichier = new Set(tagsNoms.map((tag) => tag.toLowerCase()))
        const ajoutes = tagsNoms.filter((tag) => !clesActuelles.has(tag.toLowerCase()))
        const retires = actuels.filter((tag) => !clesFichier.has(tag.toLowerCase()))

        if (ajoutes.length > 0 || retires.length > 0) {
          ligne.tagsRetires = retires.length
          ligne.changements.push(
            `tags : ${[...ajoutes.map((tag) => `+${tag}`), ...retires.map((tag) => `−${tag}`)].join(' ')}`
          )
        }
      }

      if (obligatoires !== undefined || optionnels !== undefined) {
        const actuel = liensParRecette.get(recetteId) || new Map<number, boolean>()

        const actuelParCle = new Map<string, boolean>()
        const nomParCle = new Map<string, string>()
        actuel.forEach((obligatoire, ingredientId) => {
          const ingredient = ingredientsParId.get(ingredientId)
          if (!ingredient) return
          const cle = normaliser(ingredient.nom)
          actuelParCle.set(cle, obligatoire)
          nomParCle.set(cle, ingredient.nom)
        })

        const souhaiteParCle = new Map<string, boolean>(actuelParCle)

        if (obligatoires !== undefined) {
          Array.from(souhaiteParCle.entries()).forEach(([cle, obligatoire]) => {
            if (obligatoire) souhaiteParCle.delete(cle)
          })
          obligatoires.forEach((nomIngredient) => {
            const cle = normaliser(nomIngredient)
            souhaiteParCle.set(cle, true)
            if (!nomParCle.has(cle)) nomParCle.set(cle, nomIngredient)
          })
        }

        if (optionnels !== undefined) {
          Array.from(souhaiteParCle.entries()).forEach(([cle, obligatoire]) => {
            if (!obligatoire) souhaiteParCle.delete(cle)
          })
          optionnels.forEach((nomIngredient) => {
            const cle = normaliser(nomIngredient)
            if (souhaiteParCle.get(cle) !== true) souhaiteParCle.set(cle, false)
            if (!nomParCle.has(cle)) nomParCle.set(cle, nomIngredient)
          })
        }

        const ajoutes: string[] = []
        const retires: string[] = []
        const bascules: string[] = []

        souhaiteParCle.forEach((obligatoire, cle) => {
          if (!actuelParCle.has(cle)) {
            ajoutes.push(`${obligatoire ? '+' : '+(opt.) '}${nomParCle.get(cle) || cle}`)
          } else if (actuelParCle.get(cle) !== obligatoire) {
            bascules.push(
              `${nomParCle.get(cle) || cle} : ${obligatoire ? 'optionnel → obligatoire' : 'obligatoire → optionnel'}`
            )
          }
        })
        actuelParCle.forEach((obligatoire, cle) => {
          if (!souhaiteParCle.has(cle)) retires.push(`−${nomParCle.get(cle) || cle}`)
        })

        if (ajoutes.length > 0 || retires.length > 0) {
          ligne.ingredientsRetires = retires.length
          ligne.changements.push(`ingrédients : ${[...ajoutes, ...retires].join(' ')}`)
        }
        bascules.forEach((texte) => ligne.changements.push(`ingrédient ${texte}`))
      }

      ligne.statut = ligne.changements.length > 0 ? 'modification' : 'inchange'
      lignes.push(ligne)
      continue
    }

    ligne.statut = 'creation'

    const cleNom = normaliser(nom)
    const existanteMemeNom = recettesParNom.get(cleNom)
    const ligneDejaVue = nomsNouveauxVus.get(cleNom)

    if (existanteMemeNom) {
      ligne.signalement = `existe déjà dans la base (id ${existanteMemeNom.recette_id})`
    } else if (ligneDejaVue !== undefined) {
      ligne.signalement = `déjà présente plus haut dans le fichier (ligne ${ligneDejaVue})`
    } else {
      const proche = trouverElementsProches(
        nom,
        base.recettes,
        (recette) => recette.nom,
        0.85,
        1
      )[0]
      if (proche) {
        ligne.signalement = `proche de « ${proche.nom} » (${Math.round(proche.scoreSimilarite * 100)} %)`
      }
    }

    if (!nomsNouveauxVus.has(cleNom)) nomsNouveauxVus.set(cleNom, numeroLigne)

    ligne.decision = ligne.signalement ? 'ignorer' : 'creer'
    lignes.push(ligne)
  }

  nomsReferences.forEach((nomOriginal, cle) => {
    if (ingredientsParCle.has(cle)) return

    const suggestion = trouverElementsProches(
      nomOriginal,
      base.ingredients,
      (ingredient) => ingredient.nom,
      0.55,
      1
    )[0]

    if (suggestion && suggestion.scoreSimilarite >= 0.85) {
      resolutions[cle] = {
        nomOriginal,
        action: 'existant',
        ingredientIdExistant: suggestion.ingredient_id,
      }
    } else {
      resolutions[cle] = {
        nomOriginal,
        action: 'nouveau',
        ingredientIdExistant: suggestion ? suggestion.ingredient_id : null,
      }
    }
  })

  return { lignes, erreurFichier: '', resolutions }
}

async function chargerBase(): Promise<DonneesBase> {
  const recettes = await lireToutesLesLignes<RecetteBase>(
    'recettes',
    'recette_id, nom, lien_externe, instructions',
    ['recette_id']
  )

  const ingredients = await lireToutesLesLignes<IngredientBase>(
    'ingredients',
    'ingredient_id, nom',
    ['ingredient_id']
  )

  const tousLesTags = await lireToutesLesLignes<TagBase>(
    'tags',
    'tag_id, nom, portee',
    ['tag_id']
  )

  const liensTags = await lireToutesLesLignes<LienTag>(
    'recette_tags',
    'recette_id, tag_id',
    ['recette_id', 'tag_id']
  )

  const liensIngredients = await lireToutesLesLignes<LienIngredient>(
    'recette_ingredients',
    'recette_id, ingredient_id, obligatoire',
    ['recette_id', 'ingredient_id']
  )

  return {
    recettes,
    ingredients,
    tags: tousLesTags.filter((tag) => tag.portee === 'recette'),
    liensTags,
    liensIngredients,
  }
}

export default function ExcelRecettes() {
  const [lignes, setLignes] = useState<LigneAnalysee[]>([])
  const [resolutions, setResolutions] = useState<Record<string, ResolutionIngredient>>({})
  const [ingredientsExistants, setIngredientsExistants] = useState<IngredientBase[]>([])
  const [nomFichier, setNomFichier] = useState('')
  const [cleInput, setCleInput] = useState(0)

  const [enCoursExport, setEnCoursExport] = useState(false)
  const [enCoursAnalyse, setEnCoursAnalyse] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [progression, setProgression] = useState('')
  const [resultat, setResultat] = useState('')
  const [erreur, setErreur] = useState('')

  const exporter = async () => {
    setEnCoursExport(true)
    setErreur('')
    setResultat('')

    try {
      const base = await chargerBase()

      const nomTagParId = new Map<number, string>()
      base.tags.forEach((tag) => nomTagParId.set(tag.tag_id, tag.nom))

      const nomIngredientParId = new Map<number, string>()
      base.ingredients.forEach((ingredient) =>
        nomIngredientParId.set(ingredient.ingredient_id, ingredient.nom)
      )

      const tagsParRecette = new Map<number, string[]>()
      base.liensTags.forEach((lien) => {
        const nomTag = nomTagParId.get(lien.tag_id)
        if (!nomTag) return
        const liste = tagsParRecette.get(lien.recette_id) || []
        liste.push(nomTag)
        tagsParRecette.set(lien.recette_id, liste)
      })

      const obligatoiresParRecette = new Map<number, string[]>()
      const optionnelsParRecette = new Map<number, string[]>()
      base.liensIngredients.forEach((lien) => {
        const nomIngredient = nomIngredientParId.get(lien.ingredient_id)
        if (!nomIngredient) return
        const cible = lien.obligatoire ? obligatoiresParRecette : optionnelsParRecette
        const liste = cible.get(lien.recette_id) || []
        liste.push(nomIngredient)
        cible.set(lien.recette_id, liste)
      })

      let nbTronquees = 0

      const entetes = [
        'recette_id',
        'nom',
        'lien_externe',
        'instructions',
        'tags',
        'ingredients_obligatoires',
        'ingredients_optionnels',
        'nb_ingredients',
      ]

      const donnees = [...base.recettes]
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
        .map((recette) => {
          let instructions = recette.instructions || ''
          if (instructions.length > TAILLE_MAX_CELLULE) {
            instructions = `${instructions.slice(0, TAILLE_MAX_CELLULE)} ${MARQUEUR_TRONQUE}`
            nbTronquees++
          }

          const obligatoires = obligatoiresParRecette.get(recette.recette_id) || []
          const optionnels = optionnelsParRecette.get(recette.recette_id) || []

          return [
            recette.recette_id,
            recette.nom,
            recette.lien_externe || '',
            instructions,
            (tagsParRecette.get(recette.recette_id) || []).join(';'),
            obligatoires.join(';'),
            optionnels.join(';'),
            obligatoires.length + optionnels.length,
          ]
        })

      const feuille = XLSX.utils.aoa_to_sheet([entetes, ...donnees])
      feuille['!cols'] = [
        { wch: 12 },
        { wch: 36 },
        { wch: 30 },
        { wch: 70 },
        { wch: 30 },
        { wch: 50 },
        { wch: 40 },
        { wch: 14 },
      ]
      feuille['!autofilter'] = { ref: `A1:H${donnees.length + 1}` }

      const nomsIngredients = base.ingredients
        .map((ingredient) => ingredient.nom)
        .sort((a, b) => a.localeCompare(b, 'fr'))
      const nomsTags = base.tags
        .map((tag) => tag.nom)
        .sort((a, b) => a.localeCompare(b, 'fr'))

      const nbLignesListes = Math.max(nomsIngredients.length, nomsTags.length)
      const lignesListes: string[][] = [['ingredients_existants', '', 'tags_de_recettes_existants']]
      for (let index = 0; index < nbLignesListes; index++) {
        lignesListes.push([nomsIngredients[index] || '', '', nomsTags[index] || ''])
      }

      const feuilleListes = XLSX.utils.aoa_to_sheet(lignesListes)
      feuilleListes['!cols'] = [{ wch: 40 }, { wch: 4 }, { wch: 34 }]

      const feuilleAide = XLSX.utils.aoa_to_sheet(LIGNES_AIDE.map((ligne) => [ligne]))
      feuilleAide['!cols'] = [{ wch: 130 }]

      const classeur = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(classeur, feuille, 'Recettes')
      XLSX.utils.book_append_sheet(classeur, feuilleListes, 'Listes')
      XLSX.utils.book_append_sheet(classeur, feuilleAide, 'Aide')

      XLSX.writeFile(
        classeur,
        `recettes_${new Date().toISOString().slice(0, 10)}.xlsx`
      )

      if (nbTronquees > 0) {
        setResultat(
          `Export terminé. Attention : ${nbTronquees} instruction(s) dépassaient la limite d'une cellule Excel et ont été tronquées ; elles sont ignorées à la réimportation.`
        )
      }
    } catch (err: any) {
      setErreur(err.message || "Erreur pendant l'export.")
    }

    setEnCoursExport(false)
  }

  const gererFichier = async (fichier: File) => {
    setErreur('')
    setResultat('')
    setLignes([])
    setResolutions({})
    setNomFichier(fichier.name)
    setEnCoursAnalyse(true)

    try {
      const tampon = await fichier.arrayBuffer()
      const classeur = XLSX.read(tampon, { type: 'array' })

      const nomFeuille =
        classeur.SheetNames.find((nom) => sansAccents(nom) === 'recettes') ||
        classeur.SheetNames[0]
      const feuille = classeur.Sheets[nomFeuille]

      if (!feuille) throw new Error('Aucune feuille trouvée dans le fichier.')

      const matrice = XLSX.utils.sheet_to_json(feuille, {
        header: 1,
        defval: '',
      }) as unknown[][]

      const base = await chargerBase()
      const analyse = analyserMatrice(matrice, base)

      if (analyse.erreurFichier) throw new Error(analyse.erreurFichier)

      setIngredientsExistants(base.ingredients)
      setResolutions(analyse.resolutions)
      setLignes(analyse.lignes)
    } catch (err: any) {
      setErreur(err.message || 'Erreur pendant la lecture du fichier.')
    }

    setEnCoursAnalyse(false)
  }

  const changerDecision = (numeroLigne: number, decision: 'creer' | 'ignorer') => {
    setLignes((precedentes) =>
      precedentes.map((ligne) =>
        ligne.numeroLigne === numeroLigne ? { ...ligne, decision } : ligne
      )
    )
  }

  const modifierResolution = (cle: string, resolution: ResolutionIngredient) => {
    setResolutions((precedentes) => ({ ...precedentes, [cle]: resolution }))
  }

  const modifications = lignes.filter((l) => l.statut === 'modification')
  const creations = lignes.filter((l) => l.statut === 'creation')
  const creationsSignalees = creations.filter((l) => l.signalement !== '')
  const creationsSimples = creations.filter((l) => l.signalement === '')
  const creationsAFaire = creations.filter((l) => l.decision === 'creer')
  const inchangees = lignes.filter((l) => l.statut === 'inchange')
  const erreurs = lignes.filter((l) => l.statut === 'erreur')
  const tagsRetiresTotal = modifications.reduce((total, l) => total + l.tagsRetires, 0)
  const ingredientsRetiresTotal = modifications.reduce(
    (total, l) => total + l.ingredientsRetires,
    0
  )

  const lignesActives = modifications.concat(creationsAFaire)
  const clesActives = new Set<string>()
  lignesActives.forEach((l) => {
    ;[...(l.obligatoires || []), ...(l.optionnels || [])].forEach((nomIngredient) => {
      clesActives.add(normaliser(nomIngredient))
    })
  })
  const resolutionsAffichees = Object.entries(resolutions).filter(([cle]) =>
    clesActives.has(cle)
  )
  const nbNouveauxIngredients = resolutionsAffichees.filter(
    ([, resolution]) => resolution.action === 'nouveau'
  ).length

  const appliquer = async () => {
    setEnCours(true)
    setErreur('')
    setResultat('')

    let etape = 'préparation'

    try {
      setProgression('Rechargement des données…')
      const base = await chargerBase()
      const tagsCache = base.tags as unknown as TagCache[]

      const aCreer = lignes.filter((l) => l.statut === 'creation' && l.decision === 'creer')
      const aModifier = lignes.filter((l) => l.statut === 'modification')
      const lignesATraiter = aCreer.concat(aModifier)

      // 1. Ingrédients inconnus : création des « nouveaux » retenus
      etape = 'création des ingrédients manquants'
      const clesATraiter = new Set<string>()
      lignesATraiter.forEach((l) => {
        ;[...(l.obligatoires || []), ...(l.optionnels || [])].forEach((nomIngredient) => {
          clesATraiter.add(normaliser(nomIngredient))
        })
      })

      const idParCleIngredient = new Map<string, number>()
      base.ingredients.forEach((ingredient) => {
        const cle = normaliser(ingredient.nom)
        if (!idParCleIngredient.has(cle)) idParCleIngredient.set(cle, ingredient.ingredient_id)
      })

      const resolutionsAStocker = Object.entries(resolutions).filter(([cle]) =>
        clesATraiter.has(cle)
      )

      let nbIngredientsCrees = 0
      for (let index = 0; index < resolutionsAStocker.length; index++) {
        const [cle, resolution] = resolutionsAStocker[index]

        if (resolution.action === 'existant') {
          if (resolution.ingredientIdExistant) {
            idParCleIngredient.set(cle, resolution.ingredientIdExistant)
          }
          continue
        }

        setProgression(`Création des ingrédients manquants… ${nbIngredientsCrees + 1}/${nbNouveauxIngredients}`)
        const { data, error } = await supabase
          .from('ingredients')
          .insert({ nom: resolution.nomOriginal })
          .select('ingredient_id')
          .single()
        if (error) throw error

        idParCleIngredient.set(cle, data.ingredient_id)
        nbIngredientsCrees++
      }

      // 2. Création des nouvelles recettes, par paquets de 100
      etape = 'création des recettes'
      const idsCrees = new Map<number, number>()

      for (let debut = 0; debut < aCreer.length; debut += 100) {
        setProgression(`Création des recettes… ${Math.min(debut + 100, aCreer.length)}/${aCreer.length}`)

        const paquet = aCreer.slice(debut, debut + 100)
        const { data, error } = await supabase
          .from('recettes')
          .insert(
            paquet.map((l) => ({
              nom: l.nom,
              lien_externe: l.lien || null,
              instructions: l.instructions || null,
            }))
          )
          .select('recette_id, nom')

        if (error) throw error
        if (!data || data.length !== paquet.length) {
          throw new Error('Le nombre de recettes créées ne correspond pas au nombre attendu.')
        }

        const filesParNom = new Map<string, number[]>()
        data.forEach((ligneCreee: { recette_id: number; nom: string }) => {
          const file = filesParNom.get(ligneCreee.nom) || []
          file.push(ligneCreee.recette_id)
          filesParNom.set(ligneCreee.nom, file)
        })

        paquet.forEach((l) => {
          const file = filesParNom.get(l.nom)
          const idCree = file ? file.shift() : undefined
          if (idCree === undefined) {
            throw new Error(`Recette créée introuvable dans la réponse : « ${l.nom} ».`)
          }
          idsCrees.set(l.numeroLigne, idCree)
        })
      }

      // 3. Résolution des tags (création des tags manquants)
      etape = 'résolution des tags'
      const nomsTagsAResoudre = new Map<string, string>()
      lignesATraiter.forEach((l) => {
        ;(l.tagsNoms || []).forEach((nomTag) => {
          const cle = nomTag.toLowerCase()
          if (!nomsTagsAResoudre.has(cle)) nomsTagsAResoudre.set(cle, nomTag)
        })
      })

      const idParCleTag = new Map<string, number>()
      const entreesTags = Array.from(nomsTagsAResoudre.entries())

      for (let index = 0; index < entreesTags.length; index++) {
        setProgression(`Résolution des tags… ${index + 1}/${entreesTags.length}`)
        const [cle, nomTag] = entreesTags[index]
        const tagId = await trouverOuCreerTag(nomTag, 'recette', tagsCache)
        idParCleTag.set(cle, tagId)
      }

      // 4. Liaisons recette / tag à ajouter et à retirer
      etape = 'mise à jour des tags'
      const liensTagsAInserer: { recette_id: number; tag_id: number }[] = []
      const retraitsTags: { recette_id: number; tag_ids: number[] }[] = []

      aCreer.forEach((l) => {
        const idCree = idsCrees.get(l.numeroLigne)
        if (idCree === undefined) return

        const vus = new Set<number>()
        ;(l.tagsNoms || []).forEach((nomTag) => {
          const tagId = idParCleTag.get(nomTag.toLowerCase())
          if (tagId !== undefined && !vus.has(tagId)) {
            vus.add(tagId)
            liensTagsAInserer.push({ recette_id: idCree, tag_id: tagId })
          }
        })
      })

      const liensTagsActuels = new Map<number, Set<number>>()
      base.liensTags.forEach((lien) => {
        const ensemble = liensTagsActuels.get(lien.recette_id) || new Set<number>()
        ensemble.add(lien.tag_id)
        liensTagsActuels.set(lien.recette_id, ensemble)
      })

      aModifier.forEach((l) => {
        const idRecette = l.recetteId
        if (idRecette === null || l.tagsNoms === undefined) return

        const souhaites = new Set<number>()
        l.tagsNoms.forEach((nomTag) => {
          const tagId = idParCleTag.get(nomTag.toLowerCase())
          if (tagId !== undefined) souhaites.add(tagId)
        })

        const actuels = liensTagsActuels.get(idRecette) || new Set<number>()

        souhaites.forEach((tagId) => {
          if (!actuels.has(tagId)) {
            liensTagsAInserer.push({ recette_id: idRecette, tag_id: tagId })
          }
        })

        const aRetirer: number[] = []
        actuels.forEach((tagId) => {
          if (!souhaites.has(tagId)) aRetirer.push(tagId)
        })

        if (aRetirer.length > 0) {
          retraitsTags.push({ recette_id: idRecette, tag_ids: aRetirer })
        }
      })

      for (let debut = 0; debut < liensTagsAInserer.length; debut += 500) {
        setProgression(`Ajout des tags… ${Math.min(debut + 500, liensTagsAInserer.length)}/${liensTagsAInserer.length}`)
        const { error } = await supabase
          .from('recette_tags')
          .insert(liensTagsAInserer.slice(debut, debut + 500))
        if (error) throw error
      }

      for (let index = 0; index < retraitsTags.length; index++) {
        setProgression(`Retrait des tags… ${index + 1}/${retraitsTags.length}`)
        const retrait = retraitsTags[index]
        const { error } = await supabase
          .from('recette_tags')
          .delete()
          .eq('recette_id', retrait.recette_id)
          .in('tag_id', retrait.tag_ids)
        if (error) throw error
      }

      // 5. Liaisons recette / ingrédient
      etape = 'mise à jour des ingrédients des recettes'
      const liensAInserer: { recette_id: number; ingredient_id: number; obligatoire: boolean }[] = []
      const retraitsIngredients: { recette_id: number; ingredient_ids: number[] }[] = []
      const bascules: { recette_id: number; obligatoire: boolean; ingredient_ids: number[] }[] = []

      const idPourNom = (nomIngredient: string) => idParCleIngredient.get(normaliser(nomIngredient))

      aCreer.forEach((l) => {
        const idCree = idsCrees.get(l.numeroLigne)
        if (idCree === undefined) return

        const souhaites = new Map<number, boolean>()
        ;(l.obligatoires || []).forEach((nomIngredient) => {
          const id = idPourNom(nomIngredient)
          if (id !== undefined) souhaites.set(id, true)
        })
        ;(l.optionnels || []).forEach((nomIngredient) => {
          const id = idPourNom(nomIngredient)
          if (id !== undefined && !souhaites.has(id)) souhaites.set(id, false)
        })

        souhaites.forEach((obligatoire, ingredientId) => {
          liensAInserer.push({ recette_id: idCree, ingredient_id: ingredientId, obligatoire })
        })
      })

      const liensActuels = new Map<number, Map<number, boolean>>()
      base.liensIngredients.forEach((lien) => {
        const liens = liensActuels.get(lien.recette_id) || new Map<number, boolean>()
        liens.set(lien.ingredient_id, lien.obligatoire)
        liensActuels.set(lien.recette_id, liens)
      })

      aModifier.forEach((l) => {
        const idRecette = l.recetteId
        if (idRecette === null) return
        if (l.obligatoires === undefined && l.optionnels === undefined) return

        const actuel = liensActuels.get(idRecette) || new Map<number, boolean>()
        const souhaites = new Map<number, boolean>(actuel)

        if (l.obligatoires !== undefined) {
          Array.from(souhaites.entries()).forEach(([ingredientId, obligatoire]) => {
            if (obligatoire) souhaites.delete(ingredientId)
          })
          l.obligatoires.forEach((nomIngredient) => {
            const id = idPourNom(nomIngredient)
            if (id !== undefined) souhaites.set(id, true)
          })
        }

        if (l.optionnels !== undefined) {
          Array.from(souhaites.entries()).forEach(([ingredientId, obligatoire]) => {
            if (!obligatoire) souhaites.delete(ingredientId)
          })
          l.optionnels.forEach((nomIngredient) => {
            const id = idPourNom(nomIngredient)
            if (id !== undefined && souhaites.get(id) !== true) souhaites.set(id, false)
          })
        }

        const aRetirer: number[] = []
        const versObligatoire: number[] = []
        const versOptionnel: number[] = []

        actuel.forEach((obligatoire, ingredientId) => {
          if (!souhaites.has(ingredientId)) {
            aRetirer.push(ingredientId)
          } else if (souhaites.get(ingredientId) !== obligatoire) {
            if (souhaites.get(ingredientId)) versObligatoire.push(ingredientId)
            else versOptionnel.push(ingredientId)
          }
        })

        souhaites.forEach((obligatoire, ingredientId) => {
          if (!actuel.has(ingredientId)) {
            liensAInserer.push({ recette_id: idRecette, ingredient_id: ingredientId, obligatoire })
          }
        })

        if (aRetirer.length > 0) {
          retraitsIngredients.push({ recette_id: idRecette, ingredient_ids: aRetirer })
        }
        if (versObligatoire.length > 0) {
          bascules.push({ recette_id: idRecette, obligatoire: true, ingredient_ids: versObligatoire })
        }
        if (versOptionnel.length > 0) {
          bascules.push({ recette_id: idRecette, obligatoire: false, ingredient_ids: versOptionnel })
        }
      })

      for (let debut = 0; debut < liensAInserer.length; debut += 500) {
        setProgression(`Ajout des ingrédients aux recettes… ${Math.min(debut + 500, liensAInserer.length)}/${liensAInserer.length}`)
        const { error } = await supabase
          .from('recette_ingredients')
          .insert(liensAInserer.slice(debut, debut + 500))
        if (error) throw error
      }

      for (let index = 0; index < retraitsIngredients.length; index++) {
        setProgression(`Retrait d'ingrédients… ${index + 1}/${retraitsIngredients.length}`)
        const retrait = retraitsIngredients[index]
        const { error } = await supabase
          .from('recette_ingredients')
          .delete()
          .eq('recette_id', retrait.recette_id)
          .in('ingredient_id', retrait.ingredient_ids)
        if (error) throw error
      }

      for (let index = 0; index < bascules.length; index++) {
        setProgression(`Obligatoire / optionnel… ${index + 1}/${bascules.length}`)
        const bascule = bascules[index]
        const { data, error } = await supabase
          .from('recette_ingredients')
          .update({ obligatoire: bascule.obligatoire })
          .eq('recette_id', bascule.recette_id)
          .in('ingredient_id', bascule.ingredient_ids)
          .select('ingredient_id')
        if (error) throw error
        if (!data || data.length !== bascule.ingredient_ids.length) {
          throw new Error(
            `Mise à jour refusée sur recette_ingredients (recette ${bascule.recette_id}) : policy UPDATE manquante ?`
          )
        }
      }

      // 6. Mise à jour des champs (nom, lien, instructions)
      etape = 'mise à jour des recettes'
      const aMettreAJour = aModifier.filter(
        (l) => l.recetteId !== null && Object.keys(l.champsModifies).length > 0
      )

      for (let index = 0; index < aMettreAJour.length; index++) {
        setProgression(`Mise à jour des recettes… ${index + 1}/${aMettreAJour.length}`)
        const l = aMettreAJour[index]

        const { data, error } = await supabase
          .from('recettes')
          .update(l.champsModifies)
          .eq('recette_id', l.recetteId as number)
          .select('recette_id')

        if (error) throw error
        if (!data || data.length !== 1) {
          throw new Error(
            `Mise à jour refusée pour « ${l.nom} » (policy UPDATE manquante sur « recettes » ?).`
          )
        }
      }

      setResultat(
        `Import terminé : ${aCreer.length} recette(s) créée(s), ${aModifier.length} modifiée(s), ${nbIngredientsCrees} nouvel(aux) ingrédient(s), ${liensAInserer.length} ingrédient(s) ajouté(s) aux recettes, ${retraitsIngredients.reduce((total, r) => total + r.ingredient_ids.length, 0)} retiré(s), ${liensTagsAInserer.length} tag(s) ajouté(s), ${retraitsTags.reduce((total, r) => total + r.tag_ids.length, 0)} retiré(s).`
      )
      setLignes([])
      setResolutions({})
      setNomFichier('')
      setCleInput((valeur) => valeur + 1)
    } catch (err: any) {
      setErreur(
        `Import interrompu pendant l'étape « ${etape} » : ${err.message || 'erreur inconnue'}. Les étapes déjà terminées restent appliquées : relance l'import avec le même fichier (les recettes déjà créées apparaîtront comme doublons à ignorer).`
      )
    }

    setProgression('')
    setEnCours(false)
  }

  return (
    <div className="border rounded p-4">
      <h2 className="text-xl font-bold mb-2">Recettes — export et import Excel</h2>
      <p className="text-sm text-gray-500 mb-3">
        Exporte toutes les recettes dans un fichier .xlsx (nom, lien, instructions,
        tags, ingrédients obligatoires et optionnels), modifie-le ou ajoute de
        nouvelles lignes, puis réimporte-le. Les recettes existantes sont mises à
        jour grâce à leur recette_id, sans doublon. Un aperçu s&apos;affiche avant
        toute écriture.
      </p>

      <button
        onClick={exporter}
        disabled={enCoursExport}
        className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50 mb-4"
      >
        {enCoursExport ? 'Export en cours...' : 'Exporter les recettes (.xlsx)'}
      </button>

      <p className="text-sm font-semibold mb-1">Importer un fichier modifié</p>
      <input
        key={cleInput}
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => {
          const fichier = e.target.files?.[0]
          if (fichier) gererFichier(fichier)
        }}
        className="mb-4 block"
      />

      {enCoursAnalyse && (
        <p className="text-sm text-gray-600 mb-2">Analyse du fichier…</p>
      )}
      {erreur && <p className="text-red-600 mb-2 text-sm">{erreur}</p>}
      {resultat && <p className="text-green-600 mb-2 text-sm">{resultat}</p>}
      {enCours && progression && (
        <p className="text-sm text-gray-600 mb-2">{progression}</p>
      )}

      {lignes.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-gray-600">
            {nomFichier} — {lignes.length} ligne(s) lue(s)
          </p>

          <ul className="text-sm mb-3 list-disc pl-5">
            <li>{modifications.length} recette(s) à modifier</li>
            <li>
              {creationsAFaire.length} recette(s) à créer
              {creationsSignalees.length > 0 &&
                ` (dont ${creationsSignalees.filter((l) => l.decision === 'creer').length} doublon(s) possible(s) que tu as choisi de créer)`}
            </li>
            <li>{inchangees.length} inchangée(s)</li>
            <li className={erreurs.length > 0 ? 'text-red-600' : ''}>
              {erreurs.length} ligne(s) en erreur (ignorées)
            </li>
            {nbNouveauxIngredients > 0 && (
              <li>{nbNouveauxIngredients} nouvel(aux) ingrédient(s) seront créés</li>
            )}
            {tagsRetiresTotal > 0 && (
              <li className="text-orange-700">
                ⚠ {tagsRetiresTotal} association(s) de tags seront retirées
              </li>
            )}
            {ingredientsRetiresTotal > 0 && (
              <li className="text-orange-700">
                ⚠ {ingredientsRetiresTotal} ingrédient(s) seront retirés de leur recette
              </li>
            )}
          </ul>

          {erreurs.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold mb-1 text-red-600">Lignes en erreur</h3>
              <div className="max-h-48 overflow-auto border rounded">
                {erreurs.map((l) => (
                  <p key={l.numeroLigne} className="border-b p-2 text-sm">
                    Ligne {l.numeroLigne}
                    {l.nom ? ` (« ${l.nom} »)` : ''} : {l.messageErreur}
                  </p>
                ))}
              </div>
            </div>
          )}

          {resolutionsAffichees.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold mb-1">
                Ingrédients à résoudre ({resolutionsAffichees.length})
              </h3>
              <p className="text-xs text-gray-500 mb-1">
                Ces noms ne correspondent exactement à aucun ingrédient existant.
              </p>
              <div className="max-h-72 overflow-auto border rounded">
                {resolutionsAffichees.map(([cle, resolution]) => {
                  const suggestion = trouverElementsProches(
                    resolution.nomOriginal,
                    ingredientsExistants,
                    (ingredient) => ingredient.nom,
                    0.55,
                    1
                  )[0]

                  return (
                    <div key={cle} className="border-b p-3">
                      <p className="font-semibold">{resolution.nomOriginal}</p>
                      {suggestion ? (
                        <p className="text-xs text-yellow-700 mb-1">
                          Proche de « {suggestion.nom} » ({Math.round(suggestion.scoreSimilarite * 100)}%)
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 mb-1">
                          Aucune correspondance trouvée
                        </p>
                      )}

                      <div className="flex flex-wrap gap-4 text-sm items-center">
                        <label className="flex items-center gap-1">
                          <input
                            type="radio"
                            name={`resolution-${cle}`}
                            checked={resolution.action === 'nouveau'}
                            onChange={() =>
                              modifierResolution(cle, { ...resolution, action: 'nouveau' })
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
                            {ingredientsExistants.map((ingredient) => (
                              <option
                                key={ingredient.ingredient_id}
                                value={ingredient.ingredient_id}
                              >
                                {ingredient.nom}
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

          {creationsSignalees.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold mb-1">
                Créations à vérifier ({creationsSignalees.length})
              </h3>
              <div className="max-h-72 overflow-auto border rounded">
                {creationsSignalees.map((l) => (
                  <div key={l.numeroLigne} className="border-b p-3">
                    <p className="font-semibold">
                      {l.nom}{' '}
                      <span className="font-normal text-xs text-gray-500">
                        (ligne {l.numeroLigne})
                      </span>
                    </p>
                    <p className="text-xs text-yellow-700 mb-1">{l.signalement}</p>
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name={`decision-${l.numeroLigne}`}
                          checked={l.decision === 'ignorer'}
                          onChange={() => changerDecision(l.numeroLigne, 'ignorer')}
                        />
                        Ignorer cette ligne
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name={`decision-${l.numeroLigne}`}
                          checked={l.decision === 'creer'}
                          onChange={() => changerDecision(l.numeroLigne, 'creer')}
                        />
                        Créer quand même
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {modifications.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold mb-1">
                Modifications ({modifications.length})
              </h3>
              <div className="max-h-72 overflow-auto border rounded">
                {modifications.map((l) => (
                  <div key={l.numeroLigne} className="border-b p-2 text-sm">
                    <p className="font-semibold">{l.nom}</p>
                    {l.changements.map((changement, index) => (
                      <p key={index} className="text-xs text-gray-600">
                        {changement}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {creationsSimples.length > 0 && (
            <div className="mb-4">
              <h3 className="font-semibold mb-1">
                Nouvelles recettes ({creationsSimples.length})
              </h3>
              <div className="max-h-48 overflow-auto border rounded p-2 text-sm text-gray-700">
                {creationsSimples.map((l) => l.nom).join(', ')}
              </div>
            </div>
          )}

          <button
            onClick={appliquer}
            disabled={
              enCours || (modifications.length === 0 && creationsAFaire.length === 0)
            }
            className="bg-green-500 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {enCours ? 'Import en cours...' : "Appliquer l'import"}
          </button>
        </div>
      )}
    </div>
  )
}

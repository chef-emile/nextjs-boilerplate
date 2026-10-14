'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { lireToutesLesLignes } from '@/lib/supabaseLecture'
import { trouverElementsProches, normaliser } from '@/lib/similarite'
import { trouverOuCreerTag, TagCache } from '@/lib/tags'

type IngredientBase = {
  ingredient_id: number
  nom: string
  type_conservation: string | null
  mois_disponibles: number[] | null
}

type TagBase = {
  tag_id: number
  nom: string
  portee: string
}

type LienTag = {
  ingredient_id: number
  tag_id: number
}

type LienRecette = {
  recette_id: number
  ingredient_id: number
}

type DonneesBase = {
  ingredients: IngredientBase[]
  liensTags: LienTag[]
  tags: TagBase[]
  liensRecettes: LienRecette[]
}

type ChampsModifies = {
  nom?: string
  type_conservation?: string | null
  mois_disponibles?: number[] | null
}

type LigneAnalysee = {
  numeroLigne: number
  ingredientId: number | null
  nom: string
  tagsNoms: string[] | undefined
  typeConservation: string | null | undefined
  mois: number[] | null | undefined
  statut: 'modification' | 'inchange' | 'creation' | 'erreur'
  changements: string[]
  messageErreur: string
  signalement: string
  decision: 'creer' | 'ignorer'
  champsModifies: ChampsModifies
  tagsRetires: number
}

// À garder cohérent avec les options du bouton « Conservation » de IngredientsSelector.tsx
const TYPES_CONSERVATION = ['frais', 'surgelé', 'conserve', 'sec', 'épice']

const ALIAS_CONSERVATION: Record<string, string> = {
  frais: 'frais',
  surgele: 'surgelé',
  surgeles: 'surgelé',
  conserve: 'conserve',
  conserves: 'conserve',
  sec: 'sec',
  secs: 'sec',
  epice: 'épice',
  epices: 'épice',
}

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

const MOIS_PAR_NOM: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1,
  fevrier: 2, fevr: 2, fev: 2,
  mars: 3,
  avril: 4, avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7, juil: 7,
  aout: 8, aou: 8,
  septembre: 9, sept: 9, sep: 9,
  octobre: 10, oct: 10,
  novembre: 11, nov: 11,
  decembre: 12, dec: 12,
}

const ALIAS_COLONNES: Record<string, string> = {
  ingredientid: 'id',
  id: 'id',
  nom: 'nom',
  ingredient: 'nom',
  tags: 'tags',
  tag: 'tags',
  typeconservation: 'conservation',
  conservation: 'conservation',
  moisdisponibles: 'mois',
  mois: 'mois',
  saison: 'mois',
}

const LIGNES_AIDE = [
  "Mode d'emploi : modifie les lignes existantes (sans toucher à la colonne ingredient_id) et ajoute les nouveaux ingrédients en bas du tableau, en laissant ingredient_id vide.",
  'nom : nom de l\'ingrédient (obligatoire).',
  "tags : liste séparée par des points-virgules, par exemple légume;frais. La cellule REMPLACE tous les tags de l'ingrédient (cellule vide = aucun tag).",
  'type_conservation : frais, surgelé, conserve, sec ou épice (vide = non renseigné). Seul « frais » est considéré comme périssable.',
  "mois_disponibles : mois en lettres séparés par des points-virgules (juin;juillet;août) ou plage en lettres (juin-août). Vide = toute l'année. Évite d'écrire 6-8 : Excel le convertit en date.",
  'nb_recettes : information en lecture seule, ignorée à l\'import.',
  'Pour ne pas toucher aux tags (ou à une autre colonne), supprime la colonne entière du fichier.',
  "Avant toute écriture, l'application affiche un aperçu : modifications, créations, doublons possibles et erreurs. Rien n'est enregistré tant que tu n'as pas cliqué sur Appliquer.",
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

function normaliserMois(mois: number[]) {
  return Array.from(new Set(mois))
    .filter((m) => m >= 1 && m <= 12)
    .sort((a, b) => a - b)
}

function cleMois(mois: number[] | null | undefined) {
  if (!mois || mois.length === 0) return ''
  const tries = normaliserMois(mois)
  return tries.length === 12 ? '' : tries.join(',')
}

function moisEnTexte(mois: number[] | null | undefined) {
  if (!mois || mois.length === 0 || mois.length >= 12) return ''
  return normaliserMois(mois)
    .map((m) => NOMS_MOIS[m - 1])
    .join(';')
}

function libelleMoisApercu(mois: number[] | null | undefined) {
  const texte = moisEnTexte(mois)
  return texte === '' ? "toute l'année" : texte
}

function numeroMois(token: string): number | null {
  const cle = sansAccents(token).replace(/\./g, '')

  if (/^\d{1,2}$/.test(cle)) {
    const numero = Number(cle)
    return numero >= 1 && numero <= 12 ? numero : null
  }

  return MOIS_PAR_NOM[cle] ?? null
}

function parserMois(texte: string): { mois: number[] | null; erreur: string | null } {
  const brut = texte.trim()
  if (brut === '') return { mois: null, erreur: null }

  const cle = sansAccents(brut)
  if (cle.startsWith('toute') || cle === 'tous' || cle === 'annee') {
    return { mois: null, erreur: null }
  }

  const resultat: number[] = []

  for (const morceau of brut.split(/[;,]/)) {
    const element = morceau.trim()
    if (element === '') continue

    const bornes = element.split(/\s*[-–—]\s*/)

    if (bornes.length === 1) {
      const numero = numeroMois(bornes[0])
      if (numero === null) return { mois: null, erreur: `mois inconnu « ${element} »` }
      resultat.push(numero)
    } else if (bornes.length === 2) {
      const debut = numeroMois(bornes[0])
      const fin = numeroMois(bornes[1])
      if (debut === null || fin === null) {
        return { mois: null, erreur: `plage de mois invalide « ${element} »` }
      }

      let courant = debut
      resultat.push(courant)
      while (courant !== fin) {
        courant = courant === 12 ? 1 : courant + 1
        resultat.push(courant)
      }
    } else {
      return { mois: null, erreur: `plage de mois invalide « ${element} »` }
    }
  }

  const mois = normaliserMois(resultat)
  if (mois.length === 0 || mois.length === 12) return { mois: null, erreur: null }
  return { mois, erreur: null }
}

function analyserMatrice(
  matrice: unknown[][],
  base: DonneesBase
): { lignes: LigneAnalysee[]; erreurFichier: string } {
  if (matrice.length < 2) {
    return { lignes: [], erreurFichier: 'Le fichier ne contient aucune ligne de données.' }
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
    }
  }

  const ingredientsParId = new Map<number, IngredientBase>()
  const ingredientsParNom = new Map<string, IngredientBase>()
  base.ingredients.forEach((ingredient) => {
    ingredientsParId.set(ingredient.ingredient_id, ingredient)
    const cle = normaliser(ingredient.nom)
    if (!ingredientsParNom.has(cle)) ingredientsParNom.set(cle, ingredient)
  })

  const nomTagParId = new Map<number, string>()
  base.tags.forEach((tag) => nomTagParId.set(tag.tag_id, tag.nom))

  const nomsTagsParIngredient = new Map<number, string[]>()
  base.liensTags.forEach((lien) => {
    const nomTag = nomTagParId.get(lien.tag_id)
    if (!nomTag) return
    const liste = nomsTagsParIngredient.get(lien.ingredient_id) || []
    liste.push(nomTag)
    nomsTagsParIngredient.set(lien.ingredient_id, liste)
  })

  const lignes: LigneAnalysee[] = []
  const nomsNouveauxVus = new Map<string, number>()

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

    let ingredientId: number | null = null
    if (texteId) {
      const numero = Number(texteId)
      if (Number.isInteger(numero) && numero > 0) {
        ingredientId = numero
      } else {
        messagesErreur.push(`identifiant invalide « ${texteId} »`)
      }
    }

    if (nom === '') messagesErreur.push('nom manquant')

    let typeConservation: string | null | undefined = undefined
    const texteConservation = valeur('conservation')
    if (texteConservation !== undefined) {
      if (texteConservation === '') {
        typeConservation = null
      } else {
        const canonique = ALIAS_CONSERVATION[sansAccents(texteConservation)]
        if (canonique) {
          typeConservation = canonique
        } else {
          messagesErreur.push(
            `type_conservation inconnu « ${texteConservation} » (attendu : ${TYPES_CONSERVATION.join(', ')})`
          )
        }
      }
    }

    let mois: number[] | null | undefined = undefined
    const texteMois = valeur('mois')
    if (texteMois !== undefined) {
      const analyseMois = parserMois(texteMois)
      if (analyseMois.erreur) {
        messagesErreur.push(`mois_disponibles : ${analyseMois.erreur}`)
      } else {
        mois = analyseMois.mois
      }
    }

    let tagsNoms: string[] | undefined = undefined
    const texteTags = valeur('tags')
    if (texteTags !== undefined) {
      const vus = new Set<string>()
      tagsNoms = texteTags
        .split(';')
        .map((tag) => tag.trim())
        .filter((tag) => {
          if (tag === '') return false
          const cle = tag.toLowerCase()
          if (vus.has(cle)) return false
          vus.add(cle)
          return true
        })
    }

    const ligne: LigneAnalysee = {
      numeroLigne,
      ingredientId,
      nom,
      tagsNoms,
      typeConservation,
      mois,
      statut: 'inchange',
      changements: [],
      messageErreur: '',
      signalement: '',
      decision: 'creer',
      champsModifies: {},
      tagsRetires: 0,
    }

    if (messagesErreur.length > 0) {
      ligne.statut = 'erreur'
      ligne.messageErreur = messagesErreur.join(' ; ')
      lignes.push(ligne)
      continue
    }

    if (ingredientId !== null) {
      const existant = ingredientsParId.get(ingredientId)

      if (!existant) {
        ligne.statut = 'erreur'
        ligne.messageErreur = `identifiant ${ingredientId} introuvable dans la base`
        lignes.push(ligne)
        continue
      }

      if (nom !== existant.nom) {
        ligne.champsModifies.nom = nom
        ligne.changements.push(`nom : « ${existant.nom} » → « ${nom} »`)
      }

      if (typeConservation !== undefined) {
        const actuel = existant.type_conservation || null
        if (typeConservation !== actuel) {
          ligne.champsModifies.type_conservation = typeConservation
          ligne.changements.push(
            `conservation : ${actuel || 'non renseigné'} → ${typeConservation || 'non renseigné'}`
          )
        }
      }

      if (mois !== undefined) {
        if (cleMois(mois) !== cleMois(existant.mois_disponibles)) {
          ligne.champsModifies.mois_disponibles = mois
          ligne.changements.push(
            `mois : ${libelleMoisApercu(existant.mois_disponibles)} → ${libelleMoisApercu(mois)}`
          )
        }
      }

      if (tagsNoms !== undefined) {
        const actuels = nomsTagsParIngredient.get(ingredientId) || []
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

      ligne.statut = ligne.changements.length > 0 ? 'modification' : 'inchange'
      lignes.push(ligne)
      continue
    }

    ligne.statut = 'creation'

    const cleNom = normaliser(nom)
    const existantMemeNom = ingredientsParNom.get(cleNom)
    const ligneDejaVue = nomsNouveauxVus.get(cleNom)

    if (existantMemeNom) {
      ligne.signalement = `existe déjà dans la base (id ${existantMemeNom.ingredient_id})`
    } else if (ligneDejaVue !== undefined) {
      ligne.signalement = `déjà présent plus haut dans le fichier (ligne ${ligneDejaVue})`
    } else {
      const proche = trouverElementsProches(
        nom,
        base.ingredients,
        (ingredient) => ingredient.nom,
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

  return { lignes, erreurFichier: '' }
}

async function chargerBase(): Promise<DonneesBase> {
  const ingredients = await lireToutesLesLignes<IngredientBase>(
    'ingredients',
    'ingredient_id, nom, type_conservation, mois_disponibles',
    ['ingredient_id']
  )

  const liensTags = await lireToutesLesLignes<LienTag>(
    'ingredient_tags',
    'ingredient_id, tag_id',
    ['ingredient_id', 'tag_id']
  )

  const tousLesTags = await lireToutesLesLignes<TagBase>(
    'tags',
    'tag_id, nom, portee',
    ['tag_id']
  )

  const liensRecettes = await lireToutesLesLignes<LienRecette>(
    'recette_ingredients',
    'recette_id, ingredient_id',
    ['recette_id', 'ingredient_id']
  )

  return {
    ingredients,
    liensTags,
    tags: tousLesTags.filter((tag) => tag.portee === 'ingredient'),
    liensRecettes,
  }
}

export default function ExcelIngredients() {
  const [lignes, setLignes] = useState<LigneAnalysee[]>([])
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

      const tagsParIngredient = new Map<number, string[]>()
      base.liensTags.forEach((lien) => {
        const nomTag = nomTagParId.get(lien.tag_id)
        if (!nomTag) return
        const liste = tagsParIngredient.get(lien.ingredient_id) || []
        liste.push(nomTag)
        tagsParIngredient.set(lien.ingredient_id, liste)
      })

      const usageParIngredient = new Map<number, number>()
      base.liensRecettes.forEach((lien) => {
        usageParIngredient.set(
          lien.ingredient_id,
          (usageParIngredient.get(lien.ingredient_id) || 0) + 1
        )
      })

      const entetes = [
        'ingredient_id',
        'nom',
        'tags',
        'type_conservation',
        'mois_disponibles',
        'nb_recettes',
      ]

      const donnees = [...base.ingredients]
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
        .map((ingredient) => [
          ingredient.ingredient_id,
          ingredient.nom,
          (tagsParIngredient.get(ingredient.ingredient_id) || []).join(';'),
          ingredient.type_conservation || '',
          moisEnTexte(ingredient.mois_disponibles),
          usageParIngredient.get(ingredient.ingredient_id) || 0,
        ])

      const feuille = XLSX.utils.aoa_to_sheet([entetes, ...donnees])
      feuille['!cols'] = [
        { wch: 14 },
        { wch: 32 },
        { wch: 36 },
        { wch: 18 },
        { wch: 34 },
        { wch: 12 },
      ]
      feuille['!autofilter'] = { ref: `A1:F${donnees.length + 1}` }

      const feuilleAide = XLSX.utils.aoa_to_sheet(LIGNES_AIDE.map((ligne) => [ligne]))
      feuilleAide['!cols'] = [{ wch: 120 }]

      const classeur = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(classeur, feuille, 'Ingrédients')
      XLSX.utils.book_append_sheet(classeur, feuilleAide, 'Aide')

      XLSX.writeFile(
        classeur,
        `ingredients_${new Date().toISOString().slice(0, 10)}.xlsx`
      )
    } catch (err: any) {
      setErreur(err.message || "Erreur pendant l'export.")
    }

    setEnCoursExport(false)
  }

  const gererFichier = async (fichier: File) => {
    setErreur('')
    setResultat('')
    setLignes([])
    setNomFichier(fichier.name)
    setEnCoursAnalyse(true)

    try {
      const tampon = await fichier.arrayBuffer()
      const classeur = XLSX.read(tampon, { type: 'array' })

      const nomFeuille =
        classeur.SheetNames.find((nom) => sansAccents(nom) === 'ingredients') ||
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

  const modifications = lignes.filter((l) => l.statut === 'modification')
  const creations = lignes.filter((l) => l.statut === 'creation')
  const creationsSignalees = creations.filter((l) => l.signalement !== '')
  const creationsSimples = creations.filter((l) => l.signalement === '')
  const creationsAFaire = creations.filter((l) => l.decision === 'creer')
  const inchangees = lignes.filter((l) => l.statut === 'inchange')
  const erreurs = lignes.filter((l) => l.statut === 'erreur')
  const tagsRetiresTotal = modifications.reduce((total, l) => total + l.tagsRetires, 0)

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

      // 1. Création des nouveaux ingrédients, par paquets de 100
      etape = 'création des ingrédients'
      const idsCrees = new Map<number, number>()

      for (let debut = 0; debut < aCreer.length; debut += 100) {
        setProgression(`Création des ingrédients… ${Math.min(debut + 100, aCreer.length)}/${aCreer.length}`)

        const paquet = aCreer.slice(debut, debut + 100)
        const { data, error } = await supabase
          .from('ingredients')
          .insert(
            paquet.map((l) => ({
              nom: l.nom,
              type_conservation: l.typeConservation ?? null,
              mois_disponibles: l.mois ?? null,
            }))
          )
          .select('ingredient_id, nom')

        if (error) throw error
        if (!data || data.length !== paquet.length) {
          throw new Error('Le nombre d’ingrédients créés ne correspond pas au nombre attendu.')
        }

        const filesParNom = new Map<string, number[]>()
        data.forEach((ligneCreee: { ingredient_id: number; nom: string }) => {
          const file = filesParNom.get(ligneCreee.nom) || []
          file.push(ligneCreee.ingredient_id)
          filesParNom.set(ligneCreee.nom, file)
        })

        paquet.forEach((l) => {
          const file = filesParNom.get(l.nom)
          const idCree = file ? file.shift() : undefined
          if (idCree === undefined) {
            throw new Error(`Ingrédient créé introuvable dans la réponse : « ${l.nom} ».`)
          }
          idsCrees.set(l.numeroLigne, idCree)
        })
      }

      // 2. Résolution des tags (création des tags manquants)
      etape = 'résolution des tags'
      const nomsTagsAResoudre = new Map<string, string>()
      aCreer.concat(aModifier).forEach((l) => {
        ;(l.tagsNoms || []).forEach((nomTag) => {
          const cle = nomTag.toLowerCase()
          if (!nomsTagsAResoudre.has(cle)) nomsTagsAResoudre.set(cle, nomTag)
        })
      })

      const idParCleTag = new Map<number | string, number>()
      const entreesTags = Array.from(nomsTagsAResoudre.entries())

      for (let index = 0; index < entreesTags.length; index++) {
        setProgression(`Résolution des tags… ${index + 1}/${entreesTags.length}`)
        const [cle, nomTag] = entreesTags[index]
        const tagId = await trouverOuCreerTag(nomTag, 'ingredient', tagsCache)
        idParCleTag.set(cle, tagId)
      }

      // 3. Liaisons ingrédient / tag à ajouter et à retirer
      etape = 'mise à jour des tags'
      const liensAInserer: { ingredient_id: number; tag_id: number }[] = []
      const retraits: { ingredient_id: number; tag_ids: number[] }[] = []

      aCreer.forEach((l) => {
        const idCree = idsCrees.get(l.numeroLigne)
        if (idCree === undefined) return

        const vus = new Set<number>()
        ;(l.tagsNoms || []).forEach((nomTag) => {
          const tagId = idParCleTag.get(nomTag.toLowerCase())
          if (tagId !== undefined && !vus.has(tagId)) {
            vus.add(tagId)
            liensAInserer.push({ ingredient_id: idCree, tag_id: tagId })
          }
        })
      })

      const liensActuels = new Map<number, Set<number>>()
      base.liensTags.forEach((lien) => {
        const ensemble = liensActuels.get(lien.ingredient_id) || new Set<number>()
        ensemble.add(lien.tag_id)
        liensActuels.set(lien.ingredient_id, ensemble)
      })

      aModifier.forEach((l) => {
        const idIngredient = l.ingredientId
        if (idIngredient === null || l.tagsNoms === undefined) return

        const souhaites = new Set<number>()
        l.tagsNoms.forEach((nomTag) => {
          const tagId = idParCleTag.get(nomTag.toLowerCase())
          if (tagId !== undefined) souhaites.add(tagId)
        })

        const actuels = liensActuels.get(idIngredient) || new Set<number>()

        souhaites.forEach((tagId) => {
          if (!actuels.has(tagId)) {
            liensAInserer.push({ ingredient_id: idIngredient, tag_id: tagId })
          }
        })

        const aRetirer: number[] = []
        actuels.forEach((tagId) => {
          if (!souhaites.has(tagId)) aRetirer.push(tagId)
        })

        if (aRetirer.length > 0) {
          retraits.push({ ingredient_id: idIngredient, tag_ids: aRetirer })
        }
      })

      for (let debut = 0; debut < liensAInserer.length; debut += 500) {
        setProgression(`Ajout des tags… ${Math.min(debut + 500, liensAInserer.length)}/${liensAInserer.length}`)
        const { error } = await supabase
          .from('ingredient_tags')
          .insert(liensAInserer.slice(debut, debut + 500))
        if (error) throw error
      }

      for (let index = 0; index < retraits.length; index++) {
        setProgression(`Retrait des tags… ${index + 1}/${retraits.length}`)
        const retrait = retraits[index]
        const { error } = await supabase
          .from('ingredient_tags')
          .delete()
          .eq('ingredient_id', retrait.ingredient_id)
          .in('tag_id', retrait.tag_ids)
        if (error) throw error
      }

      // 4. Mise à jour des champs (nom, conservation, mois)
      etape = 'mise à jour des ingrédients'
      const aMettreAJour = aModifier.filter(
        (l) => l.ingredientId !== null && Object.keys(l.champsModifies).length > 0
      )

      for (let index = 0; index < aMettreAJour.length; index++) {
        setProgression(`Mise à jour des ingrédients… ${index + 1}/${aMettreAJour.length}`)
        const l = aMettreAJour[index]

        const { data, error } = await supabase
          .from('ingredients')
          .update(l.champsModifies)
          .eq('ingredient_id', l.ingredientId as number)
          .select('ingredient_id')

        if (error) throw error
        if (!data || data.length !== 1) {
          throw new Error(
            `Mise à jour refusée pour « ${l.nom} » (policy UPDATE manquante sur « ingredients » ?).`
          )
        }
      }

      setResultat(
        `Import terminé : ${aCreer.length} ingrédient(s) créé(s), ${aModifier.length} modifié(s), ${liensAInserer.length} association(s) de tags ajoutée(s), ${retraits.reduce((total, r) => total + r.tag_ids.length, 0)} retirée(s).`
      )
      setLignes([])
      setNomFichier('')
      setCleInput((valeur) => valeur + 1)
    } catch (err: any) {
      setErreur(
        `Import interrompu pendant l'étape « ${etape} » : ${err.message || 'erreur inconnue'}. Les étapes déjà terminées restent appliquées : relance l'import avec le même fichier (les ingrédients déjà créés apparaîtront comme doublons à ignorer).`
      )
    }

    setProgression('')
    setEnCours(false)
  }

  return (
    <div className="border rounded p-4">
      <h2 className="text-xl font-bold mb-2">Ingrédients — export et import Excel</h2>
      <p className="text-sm text-gray-500 mb-3">
        Exporte tous les ingrédients dans un fichier .xlsx (avec leurs tags, leur
        conservation et leurs mois de disponibilité), modifie-le ou ajoute de
        nouvelles lignes, puis réimporte-le. Un aperçu s&apos;affiche avant toute
        écriture.
      </p>

      <button
        onClick={exporter}
        disabled={enCoursExport}
        className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50 mb-4"
      >
        {enCoursExport ? 'Export en cours...' : 'Exporter les ingrédients (.xlsx)'}
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
            <li>{modifications.length} ingrédient(s) à modifier</li>
            <li>
              {creationsAFaire.length} ingrédient(s) à créer
              {creationsSignalees.length > 0 &&
                ` (dont ${creationsSignalees.filter((l) => l.decision === 'creer').length} doublon(s) possible(s) que tu as choisi de créer)`}
            </li>
            <li>{inchangees.length} inchangé(s)</li>
            <li className={erreurs.length > 0 ? 'text-red-600' : ''}>
              {erreurs.length} ligne(s) en erreur (ignorées)
            </li>
            {tagsRetiresTotal > 0 && (
              <li className="text-orange-700">
                ⚠ {tagsRetiresTotal} association(s) de tags seront retirées
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
                Nouveaux ingrédients ({creationsSimples.length})
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

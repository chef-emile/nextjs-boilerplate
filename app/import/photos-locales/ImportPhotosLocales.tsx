'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const BUCKET = 'photos-recettes'
const LARGEUR_MAX = 1600
const QUALITE_JPEG = 0.82
const CONCURRENCE = 3
const TYPES_DIRECTS = ['image/jpeg', 'image/png', 'image/webp']

type RecetteLigne = {
  recette_id: number
  nom: string
  photo_url: string | null
}

type Correspondance = 'id' | 'exact' | 'proche' | 'aucune' | 'manuelle'

type Statut = 'attente' | 'envoi' | 'ok' | 'erreur'

type LignePhoto = {
  cle: string
  fichier: File
  apercu: string
  recetteId: number | null
  correspondance: Correspondance
  statut: Statut
  message: string
}

function normaliserTexte(texte: string) {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function motsSignificatifs(texte: string) {
  return new Set(normaliserTexte(texte).split(' ').filter((m) => m.length >= 3))
}

function similarite(a: string, b: string) {
  const motsA = motsSignificatifs(a)
  const motsB = motsSignificatifs(b)
  if (motsA.size === 0 || motsB.size === 0) return 0
  let communs = 0
  motsA.forEach((m) => {
    if (motsB.has(m)) communs++
  })
  return communs / (motsA.size + motsB.size - communs)
}

function nomDeBase(nomFichier: string) {
  return nomFichier
    .replace(/\.[^.]+$/, '')
    .replace(/\s*\(\d+\)$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

function trouverCorrespondance(nomFichier: string, recettes: RecetteLigne[]): { recetteId: number | null; correspondance: Correspondance } {
  const base = nomDeBase(nomFichier)

  // 1. Fichier nommé par identifiant : « 123.jpg » ou « 123 tarte.jpg »
  const motId = base.match(/^(\d+)(?:\s|$)/)
  if (motId) {
    const id = Number(motId[1])
    if (recettes.some((r) => r.recette_id === id)) {
      return { recetteId: id, correspondance: 'id' }
    }
  }

  // 2. Nom identique (accents, casse et ponctuation ignorés)
  const cleBase = normaliserTexte(base)
  const exactes = recettes.filter((r) => normaliserTexte(r.nom) === cleBase)
  if (exactes.length === 1) {
    return { recetteId: exactes[0].recette_id, correspondance: 'exact' }
  }

  // 3. Nom proche (mots en commun), seulement si un candidat se détache nettement
  const classees = recettes
    .map((r) => ({ id: r.recette_id, score: similarite(base, r.nom) }))
    .filter((c) => c.score >= 0.5)
    .sort((a, b) => b.score - a.score)
  if (classees.length > 0 && (classees.length === 1 || classees[0].score - classees[1].score >= 0.15)) {
    return { recetteId: classees[0].id, correspondance: 'proche' }
  }

  return { recetteId: null, correspondance: 'aucune' }
}

async function redimensionner(fichier: File): Promise<Blob | null> {
  try {
    const image = await createImageBitmap(fichier)
    const ratio = Math.min(1, LARGEUR_MAX / image.width)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.width * ratio)
    canvas.height = Math.round(image.height * ratio)
    const contexte = canvas.getContext('2d')
    if (!contexte) return null
    contexte.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob | null>((resoudre) => canvas.toBlob((b) => resoudre(b), 'image/jpeg', QUALITE_JPEG))
  } catch {
    return null
  }
}

export default function ImportPhotosLocales() {
  const [recettes, setRecettes] = useState<RecetteLigne[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreurChargement, setErreurChargement] = useState('')
  const [lignes, setLignes] = useState<LignePhoto[]>([])
  const [remplacer, setRemplacer] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [survol, setSurvol] = useState(false)
  const apercusRef = useRef<string[]>([])

  useEffect(() => {
    const charger = async () => {
      try {
        const toutes: RecetteLigne[] = []
        for (let debut = 0; ; debut += 1000) {
          const { data, error } = await supabase
            .from('recettes')
            .select('recette_id, nom, photo_url')
            .order('nom')
            .order('recette_id')
            .range(debut, debut + 999)
          if (error) throw error
          const page = (data || []) as RecetteLigne[]
          toutes.push(...page)
          if (page.length < 1000) break
        }
        setRecettes(toutes)
      } catch (e: any) {
        setErreurChargement(e.message || 'Impossible de charger les recettes.')
      }
      setChargement(false)
    }
    charger()

    return () => {
      apercusRef.current.forEach((adresse) => URL.revokeObjectURL(adresse))
    }
  }, [])

  const recetteParId = useMemo(() => {
    const map = new Map<number, RecetteLigne>()
    recettes.forEach((r) => map.set(r.recette_id, r))
    return map
  }, [recettes])

  // Une recette visée par plusieurs fichiers : conflit à résoudre avant l'envoi.
  const compteParRecette = useMemo(() => {
    const map = new Map<number, number>()
    lignes.forEach((l) => {
      if (l.recetteId !== null) map.set(l.recetteId, (map.get(l.recetteId) || 0) + 1)
    })
    return map
  }, [lignes])

  const aEnvoyer = (l: LignePhoto) => {
    if (l.statut === 'ok' || l.statut === 'envoi') return false
    if (l.recetteId === null) return false
    if ((compteParRecette.get(l.recetteId) || 0) > 1) return false
    const recette = recetteParId.get(l.recetteId)
    if (recette && recette.photo_url && !remplacer) return false
    return true
  }

  const nbAEnvoyer = lignes.filter(aEnvoyer).length
  const nbSansRecette = lignes.filter((l) => l.recetteId === null && l.statut !== 'ok').length
  const nbConflits = lignes.filter((l) => l.recetteId !== null && (compteParRecette.get(l.recetteId) || 0) > 1).length
  const nbDejaPhoto = lignes.filter((l) => {
    if (l.recetteId === null || l.statut === 'ok') return false
    const recette = recetteParId.get(l.recetteId)
    return Boolean(recette && recette.photo_url) && !remplacer
  }).length

  const ajouterFichiers = (liste: FileList | File[] | null) => {
    if (!liste) return
    const images = Array.from(liste).filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name))
    if (images.length === 0) return

    const nouvelles: LignePhoto[] = images.map((fichier, index) => {
      const adresse = URL.createObjectURL(fichier)
      apercusRef.current.push(adresse)
      const trouve = trouverCorrespondance(fichier.name, recettes)
      return {
        cle: `${Date.now()}-${index}-${fichier.name}`,
        fichier,
        apercu: adresse,
        recetteId: trouve.recetteId,
        correspondance: trouve.correspondance,
        statut: 'attente',
        message: '',
      }
    })
    setLignes((courant) => [...courant, ...nouvelles])
  }

  const choisirRecette = (cle: string, valeur: string) => {
    const recetteId = valeur === '' ? null : Number(valeur)
    setLignes((courant) =>
      courant.map((l) =>
        l.cle === cle
          ? { ...l, recetteId, correspondance: recetteId === null ? 'aucune' : 'manuelle', statut: l.statut === 'erreur' ? 'attente' : l.statut, message: '' }
          : l
      )
    )
  }

  const retirerLigne = (cle: string) => {
    setLignes((courant) => courant.filter((l) => l.cle !== cle))
  }

  const viderLaListe = () => {
    setLignes((courant) => courant.filter((l) => l.statut === 'envoi'))
  }

  const majLigne = (cle: string, changements: Partial<LignePhoto>) => {
    setLignes((courant) => courant.map((l) => (l.cle === cle ? { ...l, ...changements } : l)))
  }

  const envoyerUne = async (ligne: LignePhoto) => {
    const recetteId = ligne.recetteId
    if (recetteId === null) return
    const recette = recetteParId.get(recetteId)
    const anciennePhoto = recette ? recette.photo_url : null

    majLigne(ligne.cle, { statut: 'envoi', message: '' })

    try {
      let corps: Blob = ligne.fichier
      let type = ligne.fichier.type
      let extension = 'jpg'

      const redim = await redimensionner(ligne.fichier)
      if (redim) {
        corps = redim
        type = 'image/jpeg'
      } else if (TYPES_DIRECTS.includes(ligne.fichier.type)) {
        extension = ligne.fichier.type === 'image/png' ? 'png' : ligne.fichier.type === 'image/webp' ? 'webp' : 'jpg'
      } else {
        throw new Error('format non lisible par le navigateur (HEIC ? enregistre la photo en JPEG)')
      }

      const chemin = `${recetteId}-${Date.now()}.${extension}`

      const { error: erreurEnvoi } = await supabase.storage.from(BUCKET).upload(chemin, corps, { contentType: type, upsert: false })
      if (erreurEnvoi) throw new Error(`envoi impossible : ${erreurEnvoi.message}`)

      const { data: publique } = supabase.storage.from(BUCKET).getPublicUrl(chemin)

      const { data: modifiees, error: erreurMaj } = await supabase
        .from('recettes')
        .update({ photo_url: publique.publicUrl })
        .eq('recette_id', recetteId)
        .select('recette_id')

      if (erreurMaj || !modifiees || modifiees.length !== 1) {
        await supabase.storage.from(BUCKET).remove([chemin])
        throw new Error(erreurMaj ? erreurMaj.message : 'mise à jour refusée (policy UPDATE sur « recettes » ?)')
      }

      if (anciennePhoto) {
        const ancienChemin = anciennePhoto.split(`/${BUCKET}/`)[1]
        if (ancienChemin) await supabase.storage.from(BUCKET).remove([decodeURIComponent(ancienChemin)])
      }

      setRecettes((courant) => courant.map((r) => (r.recette_id === recetteId ? { ...r, photo_url: publique.publicUrl } : r)))
      majLigne(ligne.cle, { statut: 'ok', message: '' })
    } catch (e: any) {
      majLigne(ligne.cle, { statut: 'erreur', message: e.message || 'échec' })
    }
  }

  const lancer = async () => {
    const file = lignes.filter(aEnvoyer)
    if (file.length === 0) return

    setEnCours(true)
    let suivant = 0
    const ouvrier = async () => {
      while (suivant < file.length) {
        const ligne = file[suivant++]
        await envoyerUne(ligne)
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCE }, ouvrier))
    setEnCours(false)
  }

  const nbOk = lignes.filter((l) => l.statut === 'ok').length
  const nbErreurs = lignes.filter((l) => l.statut === 'erreur').length

  const libelleCorrespondance = (l: LignePhoto) => {
    if (l.statut === 'ok') return { texte: 'envoyée', classe: 'text-emeraude' }
    if (l.statut === 'envoi') return { texte: 'envoi…', classe: 'text-or' }
    if (l.statut === 'erreur') return { texte: l.message, classe: 'text-corail' }
    if (l.recetteId === null) return { texte: 'choisir une recette', classe: 'text-corail' }
    if ((compteParRecette.get(l.recetteId) || 0) > 1) return { texte: 'plusieurs fichiers pour cette recette', classe: 'text-corail' }
    const recette = recetteParId.get(l.recetteId)
    if (recette && recette.photo_url && !remplacer) return { texte: 'a déjà une photo (ignorée)', classe: 'text-texte-muted' }
    if (recette && recette.photo_url && remplacer) return { texte: 'remplacera la photo', classe: 'text-or' }
    if (l.correspondance === 'proche') return { texte: 'à vérifier', classe: 'text-or' }
    return { texte: 'prête', classe: 'text-emeraude' }
  }

  return (
    <div className="bg-surface border border-ligne rounded-(--radius-carte) p-5">
      {chargement && <p className="font-sans text-sm text-texte-muted">Chargement des recettes…</p>}
      {erreurChargement && <p className="font-sans text-sm text-corail">{erreurChargement}</p>}

      {!chargement && !erreurChargement && (
        <>
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setSurvol(true)
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => {
              e.preventDefault()
              setSurvol(false)
              ajouterFichiers(e.dataTransfer.files)
            }}
            className={`block cursor-pointer text-center rounded-(--radius-carte) border border-dashed px-4 py-8 transition-colors ${
              survol ? 'border-or bg-surface-2' : 'border-ligne hover:border-or'
            }`}
          >
            <span className="block font-display italic text-xl text-texte">Glisse tes photos ici</span>
            <span className="block font-sans text-sm text-texte-muted mt-1">
              ou clique pour les choisir (plusieurs à la fois)
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={enCours}
              onChange={(e) => {
                ajouterFichiers(e.target.files)
                e.target.value = ''
              }}
              className="hidden"
            />
          </label>

          <p className="font-sans text-xs text-texte-muted mt-3">
            Nomme chaque fichier d'après la recette (« Tarte aux pommes.jpg ») ou d'après son numéro (« 123.jpg »). Les accents et les majuscules n'ont pas d'importance. Tu peux corriger chaque correspondance ci-dessous avant d'envoyer.
          </p>

          {lignes.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-5">
                <p className="font-mono text-xs text-texte-muted">
                  {lignes.length} photo(s) · {nbAEnvoyer} prête(s) · {nbSansRecette} sans recette · {nbDejaPhoto} déjà pourvue(s)
                  {nbConflits > 0 ? ` · ${nbConflits} en conflit` : ''} · {nbOk} envoyée(s) · {nbErreurs} échec(s)
                </p>
                <label className="flex items-center gap-2 font-sans text-sm text-texte-muted">
                  <input
                    type="checkbox"
                    checked={remplacer}
                    disabled={enCours}
                    onChange={(e) => setRemplacer(e.target.checked)}
                    className="accent-or"
                  />
                  Remplacer les photos existantes
                </label>
              </div>

              <div className="flex flex-wrap gap-3 mt-3">
                <button
                  onClick={lancer}
                  disabled={enCours || nbAEnvoyer === 0}
                  className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full bg-or text-fond hover:opacity-85 transition-opacity disabled:opacity-40"
                >
                  {enCours ? 'Envoi en cours…' : `Envoyer ${nbAEnvoyer} photo(s)`}
                </button>
                <button
                  onClick={viderLaListe}
                  disabled={enCours}
                  className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full border border-ligne text-texte-muted hover:text-texte transition-colors disabled:opacity-40"
                >
                  Vider la liste
                </button>
              </div>

              <ul className="mt-4 divide-y divide-ligne border border-ligne rounded-lg">
                {lignes.map((l) => {
                  const etat = libelleCorrespondance(l)
                  return (
                    <li key={l.cle} className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <img src={l.apercu} alt="" loading="lazy" className="w-12 h-12 object-cover rounded shrink-0" />
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="font-sans text-sm text-texte truncate">{l.fichier.name}</p>
                        <p className={`font-mono text-[11px] truncate ${etat.classe}`}>{etat.texte}</p>
                      </div>
                      <select
                        value={l.recetteId === null ? '' : String(l.recetteId)}
                        disabled={enCours || l.statut === 'ok' || l.statut === 'envoi'}
                        onChange={(e) => choisirRecette(l.cle, e.target.value)}
                        className="bg-surface-2 border border-ligne rounded-lg px-2 py-1.5 font-sans text-sm text-texte max-w-full basis-64 grow focus:outline-none focus:border-or"
                      >
                        <option value="">— choisir une recette —</option>
                        {recettes.map((r) => (
                          <option key={r.recette_id} value={r.recette_id}>
                            {r.nom}
                            {r.photo_url ? '  ✓ photo' : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => retirerLigne(l.cle)}
                        disabled={enCours || l.statut === 'envoi'}
                        className="font-mono text-xs text-texte-muted hover:text-corail transition-colors disabled:opacity-40"
                        title="Retirer de la liste"
                      >
                        ✕
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}

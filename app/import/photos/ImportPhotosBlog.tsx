'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Candidate = {
  recette_id: number
  nom: string
  photo: string
}

type Echec = {
  nom: string
  raison: string
}

const CONCURRENCE = 3

function parserCsv(texte: string): string[][] {
  const lignes: string[][] = []
  let ligne: string[] = []
  let champ = ''
  let entreGuillemets = false

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"'
        i++
      } else if (c === '"') {
        entreGuillemets = false
      } else {
        champ += c
      }
    } else if (c === '"') {
      entreGuillemets = true
    } else if (c === ',') {
      ligne.push(champ)
      champ = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++
      ligne.push(champ)
      champ = ''
      if (ligne.some((x) => x !== '')) lignes.push(ligne)
      ligne = []
    } else {
      champ += c
    }
  }

  ligne.push(champ)
  if (ligne.some((x) => x !== '')) lignes.push(ligne)
  return lignes
}

// La seule miniature du blog (s72-w400-h269-c) est remplacée par la version pleine taille.
function photoPleineTaille(adresse: string) {
  return adresse.replace(/\/s72-w\d+-h\d+-c\//, '/s1600/')
}

export default function ImportPhotosBlog() {
  const [candidats, setCandidats] = useState<Candidate[]>([])
  const [resume, setResume] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [faites, setFaites] = useState(0)
  const [total, setTotal] = useState(0)
  const [echecs, setEchecs] = useState<Echec[]>([])
  const [termine, setTermine] = useState(false)

  const choisirFichier = async (fichier: File | undefined) => {
    setErreur('')
    setResume('')
    setCandidats([])
    setEchecs([])
    setFaites(0)
    setTotal(0)
    setTermine(false)
    if (!fichier) return

    try {
      const texte = (await fichier.text()).replace(/^﻿/, '')
      const [entete, ...donnees] = parserCsv(texte)
      const iUrl = entete.indexOf('url')
      const iPhoto = entete.indexOf('photo')
      if (iUrl < 0 || iPhoto < 0) {
        setErreur(
          'Colonnes « url » et « photo » introuvables. Il faut le fichier brut du blog (titre, date, url, photo, ingredients).'
        )
        return
      }

      const photosParLien = new Map<string, string>()
      donnees.forEach((l) => {
        const lien = (l[iUrl] || '').trim()
        const photo = (l[iPhoto] || '').trim()
        if (lien && photo) photosParLien.set(lien, photoPleineTaille(photo))
      })

      const recettes: any[] = []
      for (let debut = 0; ; debut += 1000) {
        const { data, error } = await supabase
          .from('recettes')
          .select('recette_id, nom, lien_externe, photo_url')
          .order('recette_id')
          .range(debut, debut + 999)
        if (error) throw error
        const page = data || []
        recettes.push(...page)
        if (page.length < 1000) break
      }

      const liste: Candidate[] = []
      let dejaPhoto = 0
      let sansPhotoDansCsv = 0
      recettes.forEach((r) => {
        const photo = r.lien_externe ? photosParLien.get(String(r.lien_externe).trim()) : undefined
        if (!photo) {
          sansPhotoDansCsv++
          return
        }
        if (r.photo_url) {
          dejaPhoto++
          return
        }
        liste.push({ recette_id: r.recette_id, nom: r.nom, photo })
      })

      setCandidats(liste)
      setTotal(liste.length)
      setResume(
        `${photosParLien.size} photo(s) dans le fichier · ${recettes.length} recette(s) en base · ` +
          `${liste.length} à envoyer · ${dejaPhoto} ont déjà une photo (ignorées) · ` +
          `${sansPhotoDansCsv} sans photo dans le fichier.`
      )
    } catch (e: any) {
      setErreur(e.message || 'Lecture du fichier impossible.')
    }
  }

  const lancer = async (limite: number | null) => {
    const lot = limite === null ? candidats : candidats.slice(0, limite)
    if (lot.length === 0) return

    setEnCours(true)
    setTermine(false)
    setEchecs([])
    setFaites(0)
    setTotal(lot.length)

    let suivant = 0
    let reussies = 0
    const nouveauxEchecs: Echec[] = []

    const ouvrier = async () => {
      while (suivant < lot.length) {
        const c = lot[suivant++]
        try {
          const reponse = await fetch('/api/photo-blog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recetteId: c.recette_id, photoUrl: c.photo }),
          })
          const resultat = await reponse.json()
          if (!resultat.ok) throw new Error(resultat.erreur || 'échec')
          reussies++
        } catch (e: any) {
          nouveauxEchecs.push({ nom: c.nom, raison: e.message || 'échec' })
        }
        setFaites(reussies + nouveauxEchecs.length)
        setEchecs([...nouveauxEchecs])
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCE }, ouvrier))

    // Les recettes réussies ne seront plus proposées : on retire du lot celles qui ont une photo.
    const echouees = new Set(nouveauxEchecs.map((e) => e.nom))
    setCandidats((courant) =>
      courant.filter((c) => !lot.includes(c) || echouees.has(c.nom))
    )
    setEnCours(false)
    setTermine(true)
  }

  return (
    <div className="bg-surface border border-ligne rounded-(--radius-carte) p-5">
      <label className="block font-mono text-xs uppercase tracking-wide text-texte-muted mb-2">
        1. Choisir recettes.csv (le fichier brut du blog)
      </label>
      <input
        type="file"
        accept=".csv,text/csv"
        disabled={enCours}
        onChange={(e) => choisirFichier(e.target.files?.[0])}
        className="block w-full font-sans text-sm text-texte-muted file:mr-3 file:rounded-full file:border file:border-or file:bg-transparent file:px-4 file:py-1.5 file:font-mono file:text-xs file:uppercase file:text-or hover:file:bg-or hover:file:text-fond"
      />

      {erreur && <p className="font-sans text-sm text-corail mt-3">{erreur}</p>}
      {resume && <p className="font-sans text-sm text-texte mt-3">{resume}</p>}

      {candidats.length > 0 && (
        <div className="mt-5">
          <p className="font-mono text-xs uppercase tracking-wide text-texte-muted mb-2">
            2. Envoyer
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => lancer(3)}
              disabled={enCours}
              className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full border border-or text-or hover:bg-or hover:text-fond transition-colors disabled:opacity-40"
            >
              Tester sur 3 recettes
            </button>
            <button
              onClick={() => lancer(null)}
              disabled={enCours}
              className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full bg-or text-fond hover:opacity-85 transition-opacity disabled:opacity-40"
            >
              Tout envoyer ({candidats.length})
            </button>
          </div>
        </div>
      )}

      {(enCours || termine) && (
        <div className="mt-5">
          <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-emeraude transition-all"
              style={{ width: `${total > 0 ? Math.round((faites / total) * 100) : 0}%` }}
            />
          </div>
          <p className="font-mono text-xs text-texte-muted mt-2">
            {faites} / {total} traitée(s) · {echecs.length} échec(s)
            {enCours ? ' — ne ferme pas cette page' : ' — terminé'}
          </p>
        </div>
      )}

      {echecs.length > 0 && (
        <div className="mt-4 max-h-48 overflow-auto bg-surface-2 border border-ligne rounded p-3">
          {echecs.map((e, i) => (
            <p key={i} className="font-sans text-xs text-corail">
              {e.nom} — {e.raison}
            </p>
          ))}
        </div>
      )}

      {termine && echecs.length === 0 && (
        <p className="font-sans text-sm text-emeraude mt-4">
          Terminé. Si tu as testé sur 3 recettes, reclique sur « Tout envoyer » pour le reste (les 3 déjà faites sont ignorées).
        </p>
      )}
    </div>
  )
}

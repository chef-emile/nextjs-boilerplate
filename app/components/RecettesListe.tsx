'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { couleurTag } from '@/lib/tagColor'
import { normaliser } from '@/lib/similarite'
import { trouverOuCreerTag, TagCache } from '@/lib/tags'

type Recette = {
  recette_id: number
  nom: string
  photo_url?: string | null
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

const CLASSE_LABEL = 'font-mono text-xs tracking-widest text-texte-muted uppercase mb-3'

export default function RecettesListe({
  recettes,
  tags,
  recetteTags,
}: {
  recettes: Recette[]
  tags: Tag[]
  recetteTags: RecetteTag[]
}) {
  const router = useRouter()

  const [tagsSelectionnes, setTagsSelectionnes] = useState<number[]>([])
  const [recherche, setRecherche] = useState('')

  const [modeSelection, setModeSelection] = useState(false)
  const [selection, setSelection] = useState<number[]>([])
  const [nouveauTag, setNouveauTag] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState('')
  const [erreur, setErreur] = useState('')

  const tagsRecette = tags.filter((tag) => tag.portee === 'recette')

  const toggleTag = (tagId: number) => {
    setTagsSelectionnes((current) =>
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId]
    )
  }

  const termeRecherche = normaliser(recherche.trim())

  const recettesFiltrees = recettes.filter((recette) => {
    if (
      termeRecherche !== '' &&
      !normaliser(recette.nom).includes(termeRecherche)
    ) {
      return false
    }

    if (tagsSelectionnes.length === 0) return true

    const tagsDeLaRecette = recetteTags
      .filter((rt) => rt.recette_id === recette.recette_id)
      .map((rt) => rt.tag_id)

    return tagsSelectionnes.every((tagId) => tagsDeLaRecette.includes(tagId))
  })

  const tagsDe = (recetteId: number) =>
    recetteTags
      .filter((rt) => rt.recette_id === recetteId)
      .map((rt) => tags.find((t) => t.tag_id === rt.tag_id))
      .filter((t): t is Tag => t !== undefined)

  // --- Mode sélection : ajout / retrait de tags en masse ---

  const ensembleSelection = new Set(selection)

  const tagsDeLaSelection = (() => {
    const comptes = new Map<number, number>()
    recetteTags.forEach((rt) => {
      if (ensembleSelection.has(rt.recette_id)) {
        comptes.set(rt.tag_id, (comptes.get(rt.tag_id) || 0) + 1)
      }
    })

    return tagsRecette
      .map((tag) => ({ tag, nb: comptes.get(tag.tag_id) || 0 }))
      .filter((element) => element.nb > 0)
  })()

  const basculerModeSelection = () => {
    setModeSelection((current) => !current)
    setSelection([])
    setNouveauTag('')
    setMessage('')
    setErreur('')
  }

  const toggleSelection = (recetteId: number) => {
    setSelection((current) =>
      current.includes(recetteId)
        ? current.filter((id) => id !== recetteId)
        : [...current, recetteId]
    )
  }

  const selectionnerAffichees = () => {
    setSelection(recettesFiltrees.map((recette) => recette.recette_id))
  }

  const ajouterTagALaSelection = async () => {
    const nom = nouveauTag.trim()
    if (nom === '' || selection.length === 0) return

    setEnCours(true)
    setErreur('')
    setMessage('')

    try {
      const tagsCache = [...tagsRecette] as unknown as TagCache[]
      const tagId = await trouverOuCreerTag(nom, 'recette', tagsCache)

      // Lecture directe en base (et non via les props) pour connaître les liens
      // déjà existants avec ce tag, même si la liste affichée est incomplète.
      const { data: existants, error: errExistants } = await supabase
        .from('recette_tags')
        .select('recette_id')
        .eq('tag_id', tagId)
      if (errExistants) throw errExistants

      const dejaLies = new Set<number>(
        (existants || []).map((ligne: { recette_id: number }) => ligne.recette_id)
      )

      const aInserer = selection
        .filter((recetteId) => !dejaLies.has(recetteId))
        .map((recetteId) => ({ recette_id: recetteId, tag_id: tagId }))

      for (let debut = 0; debut < aInserer.length; debut += 500) {
        const { error } = await supabase
          .from('recette_tags')
          .insert(aInserer.slice(debut, debut + 500))
        if (error) throw error
      }

      const dejaPresents = selection.length - aInserer.length
      setMessage(
        `Tag « ${nom} » ajouté à ${aInserer.length} recette(s)` +
          (dejaPresents > 0 ? ` (${dejaPresents} l'avaient déjà).` : '.')
      )
      setNouveauTag('')
      router.refresh()
    } catch (err: any) {
      setErreur(err.message || "Erreur pendant l'ajout du tag.")
    }

    setEnCours(false)
  }

  const retirerTagDeLaSelection = async (tag: Tag, nb: number) => {
    const confirmation = confirm(
      `Retirer le tag « ${tag.nom} » de ${nb} recette(s) sélectionnée(s) ?`
    )
    if (!confirmation) return

    setEnCours(true)
    setErreur('')
    setMessage('')

    try {
      const { data, error } = await supabase
        .from('recette_tags')
        .delete()
        .eq('tag_id', tag.tag_id)
        .in('recette_id', selection)
        .select('recette_id')
      if (error) throw error

      setMessage(
        `Tag « ${tag.nom} » retiré de ${(data || []).length} recette(s).`
      )
      router.refresh()
    } catch (err: any) {
      setErreur(err.message || 'Erreur pendant le retrait du tag.')
    }

    setEnCours(false)
  }

  const barreVisible = modeSelection && selection.length > 0

  return (
    <div className={barreVisible ? 'pb-40' : ''}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher une recette…"
          className="flex-1 min-w-[200px] max-w-md bg-surface border border-ligne rounded-lg px-3 py-2 font-sans text-sm text-texte focus:outline-none focus:border-or"
        />
        <button
          onClick={basculerModeSelection}
          className={`font-mono text-xs uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors ${
            modeSelection
              ? 'bg-or text-fond border-or'
              : 'text-texte-muted border-ligne hover:border-or hover:text-or'
          }`}
        >
          {modeSelection ? 'Quitter la sélection' : 'Sélection'}
        </button>
      </div>

      {tagsRecette.length > 0 ? (
        <div className="mb-8">
          <p className={CLASSE_LABEL}>Filtrer par tag</p>
          <div className="flex flex-wrap gap-2">
            {tagsRecette.map((tag) => {
              const couleur = couleurTag(tag.nom)
              const actif = tagsSelectionnes.includes(tag.tag_id)
              return (
                <button
                  key={tag.tag_id}
                  onClick={() => toggleTag(tag.tag_id)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-[--radius-badge] text-xs font-medium transition-colors"
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
      ) : (
        <p className="font-sans text-sm text-texte-muted mb-8">
          Aucun tag de recette pour l&apos;instant. Active le mode Sélection pour en
          ajouter à plusieurs recettes d&apos;un coup : le filtre par tag apparaîtra ici.
        </p>
      )}

      {modeSelection && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <p className="font-sans text-sm text-texte-muted">
            Mode sélection : clique des recettes pour les sélectionner, puis ajoute ou retire un tag.
          </p>
          <button
            onClick={selectionnerAffichees}
            className="font-mono text-xs text-texte-muted hover:text-or transition-colors"
          >
            Sélectionner les {recettesFiltrees.length} affichées
          </button>
        </div>
      )}

      {message && <p className="font-sans text-sm text-emeraude mb-4">{message}</p>}
      {erreur && <p className="font-sans text-sm text-corail mb-4">{erreur}</p>}

      {recettesFiltrees.length === 0 ? (
        <p className="text-texte-muted">Aucune recette pour ces filtres.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {recettesFiltrees.map((recette) => {
            const tagsRecetteCarte = tagsDe(recette.recette_id)
            const estSelectionnee = ensembleSelection.has(recette.recette_id)
            return (
              <Link
                key={recette.recette_id}
                href={`/recettes/${recette.recette_id}`}
                onClick={(e) => {
                  if (modeSelection) {
                    e.preventDefault()
                    toggleSelection(recette.recette_id)
                  }
                }}
                className={`relative block rounded-[--radius-carte] shadow-[--shadow-carte] overflow-hidden bg-surface hover:bg-surface-2 border transition-colors ${
                  estSelectionnee ? 'border-or' : 'border-ligne'
                }`}
              >
                {modeSelection && (
                  <span
                    className={`absolute top-2 right-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                      estSelectionnee
                        ? 'bg-or text-fond border-or'
                        : 'bg-fond/70 text-transparent border-texte-muted'
                    }`}
                  >
                    ✓
                  </span>
                )}
                <div className="h-36 bg-surface-2 flex items-center justify-center overflow-hidden">
                  {recette.photo_url ? (
                    <img
                      src={recette.photo_url}
                      alt={recette.nom}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <i className="text-texte-muted text-2xl">🍽</i>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-display italic text-2xl text-texte mb-2">
                    {recette.nom}
                  </p>
                  {tagsRecetteCarte.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tagsRecetteCarte.map((tag) => {
                        const couleur = couleurTag(tag.nom)
                        return (
                          <span
                            key={tag.tag_id}
                            className="text-xs font-medium px-2 py-0.5 rounded-[--radius-badge]"
                            style={{
                              backgroundColor: couleur,
                              color: '#17140F',
                            }}
                          >
                            {tag.nom}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {barreVisible && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-ligne px-6 py-4 z-40">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <p className="font-mono text-sm text-texte">
              {selection.length} recette(s) sélectionnée(s)
            </p>
            <button
              onClick={() => setSelection([])}
              className="font-mono text-xs text-texte-muted hover:text-texte transition-colors"
            >
              Annuler la sélection
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              value={nouveauTag}
              onChange={(e) => setNouveauTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') ajouterTagALaSelection()
              }}
              list="tags-recette-existants"
              placeholder="Ajouter un tag (existant ou nouveau)…"
              disabled={enCours}
              className="flex-1 min-w-[220px] max-w-sm bg-fond border border-ligne rounded-lg px-3 py-2 font-sans text-sm text-texte focus:outline-none focus:border-or disabled:opacity-50"
            />
            <datalist id="tags-recette-existants">
              {tagsRecette.map((tag) => (
                <option key={tag.tag_id} value={tag.nom} />
              ))}
            </datalist>
            <button
              onClick={ajouterTagALaSelection}
              disabled={enCours || nouveauTag.trim() === ''}
              className="font-mono text-xs uppercase tracking-wide px-4 py-2 rounded-full bg-or text-fond hover:opacity-85 transition-opacity disabled:opacity-50"
            >
              {enCours ? 'En cours...' : 'Ajouter à la sélection'}
            </button>
          </div>

          {tagsDeLaSelection.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-texte-muted">
                Retirer :
              </span>
              {tagsDeLaSelection.map(({ tag, nb }) => (
                <button
                  key={tag.tag_id}
                  onClick={() => retirerTagDeLaSelection(tag, nb)}
                  disabled={enCours}
                  className="px-2.5 py-1 rounded-full text-xs font-mono border border-ligne text-texte-muted hover:border-corail hover:text-corail transition-colors disabled:opacity-50"
                >
                  {tag.nom} ({nb}) ×
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BUCKET = 'photos-recettes'
const TAILLE_MAX = 10 * 1024 * 1024
const HOTES_AUTORISES = ['googleusercontent.com', 'blogspot.com', 'bp.blogspot.com']

function hoteAutorise(adresse: string) {
  try {
    const url = new URL(adresse)
    if (url.protocol !== 'https:') return false
    return HOTES_AUTORISES.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))
  } catch {
    return false
  }
}

// POST { recetteId: number, photoUrl: string }
// Télécharge la photo côté serveur, l'envoie dans le bucket et renseigne recettes.photo_url.
export async function POST(requete: Request) {
  let corps: { recetteId?: number; photoUrl?: string }
  try {
    corps = await requete.json()
  } catch {
    return NextResponse.json({ ok: false, erreur: 'Requête invalide.' }, { status: 400 })
  }

  const recetteId = Number(corps.recetteId)
  const photoUrl = String(corps.photoUrl || '')

  if (!Number.isFinite(recetteId) || recetteId <= 0) {
    return NextResponse.json({ ok: false, erreur: 'recetteId invalide.' }, { status: 400 })
  }
  if (!hoteAutorise(photoUrl)) {
    return NextResponse.json({ ok: false, erreur: 'Adresse de photo non autorisée.' }, { status: 400 })
  }

  try {
    const reponse = await fetch(photoUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    if (!reponse.ok) throw new Error(`téléchargement refusé (HTTP ${reponse.status})`)

    const type = reponse.headers.get('content-type') || ''
    if (!type.startsWith('image/')) throw new Error(`pas une image (${type || 'type inconnu'})`)

    const tampon = await reponse.arrayBuffer()
    if (tampon.byteLength > TAILLE_MAX) throw new Error('image trop lourde (plus de 10 Mo)')

    const extension = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
    const chemin = `${recetteId}-${Date.now()}.${extension}`

    const { error: erreurEnvoi } = await supabase.storage
      .from(BUCKET)
      .upload(chemin, tampon, { contentType: type, upsert: false })
    if (erreurEnvoi) throw new Error(`envoi impossible : ${erreurEnvoi.message}`)

    const { data: publique } = supabase.storage.from(BUCKET).getPublicUrl(chemin)

    const { data: lignes, error: erreurMaj } = await supabase
      .from('recettes')
      .update({ photo_url: publique.publicUrl })
      .eq('recette_id', recetteId)
      .select('recette_id')

    if (erreurMaj || !lignes || lignes.length !== 1) {
      await supabase.storage.from(BUCKET).remove([chemin])
      throw new Error(erreurMaj ? erreurMaj.message : 'mise à jour refusée (policy UPDATE sur « recettes » ?)')
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, erreur: e.message || 'Erreur inconnue.' }, { status: 200 })
  }
}

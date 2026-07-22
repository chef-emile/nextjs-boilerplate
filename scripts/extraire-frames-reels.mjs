import { createClient } from '@supabase/supabase-js'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'

const execFileP = promisify(execFile)

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Définis SUPABASE_URL et SUPABASE_KEY en variables d\'environnement.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const DELAI_ENTRE_RECETTES_MS = 3000
const SECONDE_FRAME = 1 // moment de la vidéo où extraire l'image

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function traiterRecette(recette, dossierTemp) {
  console.log(`→ ${recette.nom}`)

  const cheminVideo = path.join(dossierTemp, `${recette.recette_id}.mp4`)
  const cheminFrame = path.join(dossierTemp, `${recette.recette_id}.jpg`)

  try {
    // 1. Téléchargement du reel avec yt-dlp
    await execFileP('yt-dlp', [
      '-f', 'mp4',
      '-o', cheminVideo,
      recette.lien_externe,
    ])

    // 2. Extraction d'une frame avec ffmpeg
    await execFileP('ffmpeg', [
      '-y',
      '-ss', String(SECONDE_FRAME),
      '-i', cheminVideo,
      '-frames:v', '1',
      '-q:v', '2',
      cheminFrame,
    ])

    // 3. Upload vers Supabase Storage
    const buffer = fs.readFileSync(cheminFrame)
    const cheminStorage = `${recette.recette_id}-${Date.now()}.jpg`

    const { error: uploadError } = await supabase.storage
      .from('photos-recettes')
      .upload(cheminStorage, buffer, { contentType: 'image/jpeg', upsert: true })

    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage
      .from('photos-recettes')
      .getPublicUrl(cheminStorage)

    const { error: updateError } = await supabase
      .from('recettes')
      .update({ photo_url: urlData.publicUrl })
      .eq('recette_id', recette.recette_id)

    if (updateError) throw updateError

    console.log(`  ✓ frame extraite et associée`)
    return true
  } catch (err) {
    console.log(`  ✗ échec : ${err.message}`)
    return false
  } finally {
    // Nettoyage des fichiers temporaires, qu'il y ait eu succès ou échec
    if (fs.existsSync(cheminVideo)) fs.unlinkSync(cheminVideo)
    if (fs.existsSync(cheminFrame)) fs.unlinkSync(cheminFrame)
  }
}

async function main() {
  const { data: recettes, error } = await supabase
    .from('recettes')
    .select('recette_id, nom, lien_externe, photo_url')
    .not('lien_externe', 'is', null)
    .ilike('lien_externe', '%instagram.com%')
    .order('recette_id')

  if (error) {
    console.error('Erreur de récupération des recettes :', error.message)
    process.exit(1)
  }

  const aTraiter = recettes.filter((r) => !r.photo_url)

  console.log(`${aTraiter.length} reel(s) Instagram à traiter\n`)

  const dossierTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'reels-'))
  let reussies = 0
  const echecs = []

  for (const recette of aTraiter) {
    const ok = await traiterRecette(recette, dossierTemp)
    if (ok) {
      reussies++
    } else {
      echecs.push(recette)
    }
    await attendre(DELAI_ENTRE_RECETTES_MS)
  }

  fs.rmdirSync(dossierTemp)

  console.log(`\n${reussies}/${aTraiter.length} frames extraites avec succès.`)

  if (echecs.length > 0) {
    console.log(`\nÉchecs (probablement reels privés, supprimés, ou format non reconnu par yt-dlp) :`)
    echecs.forEach((r) => console.log(`  - #${r.recette_id} ${r.nom} : ${r.lien_externe}`))
  }
}

main()

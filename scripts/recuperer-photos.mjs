import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import fs from 'fs'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY // clé anon (les policies sont ouvertes)

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Définis SUPABASE_URL et SUPABASE_KEY en variables d\'environnement.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const DELAI_ENTRE_REQUETES_MS = 1500 // pour rester poli avec les sites cibles
const echecs = []

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function recupererOgImage(url) {
  const reponse = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    redirect: 'follow',
  })

  if (!reponse.ok) {
    throw new Error(`HTTP ${reponse.status}`)
  }

  const html = await reponse.text()
  const $ = cheerio.load(html)

  const ogImage =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content')

  if (!ogImage) {
    throw new Error('Aucune balise og:image trouvée')
  }

  return new URL(ogImage, url).toString()
}

async function telechargerImage(url) {
  const reponse = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
  })

  if (!reponse.ok) {
    throw new Error(`Téléchargement échoué : HTTP ${reponse.status}`)
  }

  const contentType = reponse.headers.get('content-type') || 'image/jpeg'
  const buffer = Buffer.from(await reponse.arrayBuffer())

  return { buffer, contentType }
}

function extensionDepuisContentType(contentType) {
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('gif')) return 'gif'
  return 'jpg'
}

async function traiterRecette(recette) {
  console.log(`→ ${recette.nom}`)

  try {
    const ogImageUrl = await recupererOgImage(recette.lien_externe)
    const { buffer, contentType } = await telechargerImage(ogImageUrl)
    const extension = extensionDepuisContentType(contentType)
    const cheminFichier = `${recette.recette_id}-${Date.now()}.${extension}`

    const { error: uploadError } = await supabase.storage
      .from('photos-recettes')
      .upload(cheminFichier, buffer, { contentType, upsert: true })

    if (uploadError) throw uploadError

    const { data: urlData } = supabase.storage
      .from('photos-recettes')
      .getPublicUrl(cheminFichier)

    const { error: updateError } = await supabase
      .from('recettes')
      .update({ photo_url: urlData.publicUrl })
      .eq('recette_id', recette.recette_id)

    if (updateError) throw updateError

    console.log(`  ✓ photo ajoutée`)
    return true
  } catch (err) {
    console.log(`  ✗ échec : ${err.message}`)
    echecs.push({ recette_id: recette.recette_id, nom: recette.nom, lien_externe: recette.lien_externe, erreur: err.message })
    return false
  }
}

async function main() {
  const { data: recettes, error } = await supabase
    .from('recettes')
    .select('recette_id, nom, lien_externe, photo_url')
    .not('lien_externe', 'is', null)
    .order('recette_id')

  if (error) {
    console.error('Erreur de récupération des recettes :', error.message)
    process.exit(1)
  }

  const aTraiter = recettes.filter((r) => !r.photo_url)

  console.log(`${aTraiter.length} recette(s) à traiter (sur ${recettes.length} avec un lien externe)\n`)

  let reussies = 0

  for (const recette of aTraiter) {
    const ok = await traiterRecette(recette)
    if (ok) reussies++
    await attendre(DELAI_ENTRE_REQUETES_MS)
  }

  console.log(`\n${reussies}/${aTraiter.length} photos récupérées avec succès.`)

  if (echecs.length > 0) {
    const csv = [
      'recette_id,nom,lien_externe,erreur',
      ...echecs.map(
        (e) =>
          `${e.recette_id},"${e.nom.replace(/"/g, '""')}","${e.lien_externe}","${e.erreur.replace(/"/g, '""')}"`
      ),
    ].join('\n')
    fs.writeFileSync('echecs-photos.csv', csv, 'utf-8')
    console.log(`${echecs.length} échec(s) listés dans echecs-photos.csv`)
  }
}

main()

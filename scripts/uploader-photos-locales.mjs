import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Définis SUPABASE_URL et SUPABASE_KEY en variables d\'environnement.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const DOSSIER = './photos-a-importer'

const EXTENSIONS_CONTENT_TYPE = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

async function main() {
  if (!fs.existsSync(DOSSIER)) {
    console.error(`Dossier introuvable : ${DOSSIER}`)
    process.exit(1)
  }

  const fichiers = fs
    .readdirSync(DOSSIER)
    .filter((f) => Object.keys(EXTENSIONS_CONTENT_TYPE).includes(path.extname(f).toLowerCase()))

  console.log(`${fichiers.length} fichier(s) trouvé(s) dans ${DOSSIER}\n`)

  let reussies = 0
  const echecs = []

  for (const fichier of fichiers) {
    const nomSansExtension = path.basename(fichier, path.extname(fichier))
    const recetteId = Number(nomSansExtension)

    if (!Number.isInteger(recetteId)) {
      console.log(`✗ ${fichier} — nom de fichier invalide (doit être un recette_id numérique)`)
      echecs.push({ fichier, erreur: 'nom de fichier invalide' })
      continue
    }

    const cheminComplet = path.join(DOSSIER, fichier)
    const extension = path.extname(fichier).toLowerCase()
    const contentType = EXTENSIONS_CONTENT_TYPE[extension]
    const buffer = fs.readFileSync(cheminComplet)

    const cheminStorage = `${recetteId}-${Date.now()}${extension}`

    console.log(`→ recette #${recetteId} (${fichier})`)

    const { error: uploadError } = await supabase.storage
      .from('photos-recettes')
      .upload(cheminStorage, buffer, { contentType, upsert: true })

    if (uploadError) {
      console.log(`  ✗ upload échoué : ${uploadError.message}`)
      echecs.push({ fichier, erreur: uploadError.message })
      continue
    }

    const { data: urlData } = supabase.storage
      .from('photos-recettes')
      .getPublicUrl(cheminStorage)

    const { error: updateError } = await supabase
      .from('recettes')
      .update({ photo_url: urlData.publicUrl })
      .eq('recette_id', recetteId)

    if (updateError) {
      console.log(`  ✗ mise à jour base échouée : ${updateError.message}`)
      echecs.push({ fichier, erreur: updateError.message })
      continue
    }

    console.log(`  ✓ associée à la recette #${recetteId}`)
    reussies++
  }

  console.log(`\n${reussies}/${fichiers.length} photos importées avec succès.`)

  if (echecs.length > 0) {
    console.log(`\nÉchecs :`)
    echecs.forEach((e) => console.log(`  - ${e.fichier} : ${e.erreur}`))
  }
}

main()


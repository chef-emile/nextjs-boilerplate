import Link from 'next/link'
import ImportPhotosLocales from './ImportPhotosLocales'

export const dynamic = 'force-dynamic'

export default function PhotosLocalesPage() {
  return (
    <main className="min-h-screen bg-fond text-texte px-6 py-10 md:px-10">
      <div className="max-w-3xl">
        <Link href="/import" className="font-mono text-xs text-texte-muted hover:text-or transition-colors">
          ← Import
        </Link>
        <h1 className="font-display italic text-4xl md:text-5xl text-texte mt-3 mb-2">
          Photos de l'ordinateur
        </h1>
        <p className="font-sans text-sm text-texte-muted mb-6">
          Envoie plusieurs photos d'un coup. Chacune est associée à une recette d'après le nom du fichier, et tu peux corriger l'association avant l'envoi. Les photos sont réduites à 1600 px de large avant l'envoi.
        </p>
        <ImportPhotosLocales />
      </div>
    </main>
  )
}

import Link from 'next/link'
import ImportPhotosBlog from './ImportPhotosBlog'

export const dynamic = 'force-dynamic'

export default function PhotosBlogPage() {
  return (
    <main className="min-h-screen bg-fond text-texte px-6 py-10 md:px-10">
      <div className="max-w-2xl">
        <Link href="/import" className="font-mono text-xs text-texte-muted hover:text-or transition-colors">
          ← Import
        </Link>
        <h1 className="font-display italic text-4xl md:text-5xl text-texte mt-3 mb-2">
          Photos du blog
        </h1>
        <p className="font-sans text-sm text-texte-muted mb-6">
          Envoie en une fois les photos des recettes du blog. Chaque recette est retrouvée par son lien ; celles qui ont déjà une photo sont ignorées, et tu peux relancer sans risque.
        </p>
        <ImportPhotosBlog />
      </div>
    </main>
  )
}

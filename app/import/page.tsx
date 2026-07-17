'use client'

import ImportIngredients from './ImportIngredients'
import ImportRecettes from './ImportRecettes'
import ExportEtReset from './ExportEtReset'

export default function ImportPage() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-6">Import en masse</h1>
      <div className="flex flex-col gap-6 max-w-2xl">
        <ImportIngredients />
        <ImportRecettes />
        <ExportEtReset />
      </div>
    </main>
  )
}

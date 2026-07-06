'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AjouterIngredient() {
  const [nom, setNom] = useState('')
  const [categorie, setCategorie] = useState('')
  const [typeConservation, setTypeConservation] = useState('')
  const [perissable, setPerissable] = useState(false)
  const [frais, setFrais] = useState(false)
  const [sec, setSec] = useState(false)
  const [surgele, setSurgele] = useState(false)
  const [message, setMessage] = useState('')


  const ajouterIngredient = async () => {
    const { error } = await supabase
      .from('ingredients')
      .insert({
        nom,
        categorie,
        type_conservation: typeConservation,
        perissable,
        frais,
        sec,
        surgele
      })

    if (error) {
      setMessage('Erreur')
    } else {
      setMessage('Ingrédient ajouté')
      setNom('')
    }
  }

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        Ajouter un ingrédient
      </h1>

      <input
        value={nom}
        onChange={(e) => setNom(e.target.value)}
        placeholder="Nom de l'ingrédient"
        className="border p-2 rounded mr-2"
      />

      <input
        className="border p-2 rounded block mb-2"
        placeholder="Catégorie"
        value={categorie}
        onChange={(e) => setCategorie(e.target.value)}
      />

      <input
        className="border p-2 rounded block mb-4"
        placeholder="Type de conservation"
        value={typeConservation}
        onChange={(e) => setTypeConservation(e.target.value)}
      />

      <label className="block">
        <input
          type="checkbox"
          checked={perissable}
          onChange={(e) => setPerissable(e.target.checked)}
        />
        Périssable
      </label>

      <label className="block">
        <input
          type="checkbox"
          checked={frais}
          onChange={(e) => setFrais(e.target.checked)}
        />
        Frais
      </label>

      <label className="block">
        <input
          type="checkbox"
          checked={sec}
          onChange={(e) => setSec(e.target.checked)}
        />
        Sec
      </label>

      <label className="block mb-4">
        <input
          type="checkbox"
          checked={surgele}
          onChange={(e) => setSurgele(e.target.checked)}
        />
        Surgelé
      </label>

      <button
        onClick={ajouterIngredient}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Ajouter
      </button>

      <p className="mt-4">{message}</p>
    </main>
  )
}









xxx
      
      <button
        onClick={ajouterIngredient}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Ajouter
      </button>

      <p className="mt-4">{message}</p>
    </main>
  )
}

'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import TagSelector from '@/app/components/TagSelector'
import { trouverElementsProches } from '@/lib/similarite'

type Tag = {
  tag_id: number
  nom: string
  portee: string
}

type IngredientExistant = {
  ingredient_id: number
  nom: string
}

export default function AjouterIngredient() {
  const [nom, setNom] = useState('')
  const [categorie, setCategorie] = useState('')
  const [typeConservation, setTypeConservation] = useState('')
  const [périssable, setPérissable] = useState(false)
  const [frais, setFrais] = useState(false)
  const [sec, setSec] = useState(false)
  const [surgelé, setSurgelé] = useState(false)
  const [message, setMessage] = useState('')

  const [ingredientsExistants, setIngredientsExistants] = useState<IngredientExistant[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [tagsSelection, setTagsSelection] = useState<number[]>([])

  useEffect(() => {
    const charger = async () => {
      const { data: ingredientsData } = await supabase
        .from('ingredients')
        .select('ingredient_id, nom')
        .order('nom')
      setIngredientsExistants(ingredientsData || [])

      const { data: tagsData } = await supabase
        .from('tags')
        .select('*')
        .eq('portee', 'ingredient')
        .order('nom')
      setTags(tagsData || [])
    }
    charger()
  }, [])

  const categories = [
    'Légume',
    'Fruit',
    'Viande',
    'Poisson',
    'Produit laitier',
    'Féculent',
    'Épice',
    'Aromate',
    'Condiment',
    'Épicerie',
  ]

  const ingredientsProches = trouverElementsProches(
    nom,
    ingredientsExistants,
    (i) => i.nom
  )

  const correspondanceExacte = ingredientsProches.find(
    (i) => i.scoreSimilarite >= 0.9
  )

  const ajouterIngredient = async () => {
    if (nom.trim().length === 0) {
      setMessage('Le nom est obligatoire.')
      return
    }

    if (correspondanceExacte) {
      const confirmation = confirm(
        `Un ingrédient très proche existe déjà : "${correspondanceExacte.nom}". Ajouter quand même "${nom}" ?`
      )
      if (!confirmation) return
    }

    const { data, error } = await supabase
      .from('ingredients')
      .insert({
        nom,
        categorie,
        type_conservation: typeConservation,
        périssable,
        frais,
        sec,
        surgelé,
      })
      .select()
      .single()

    if (error) {
      console.log(error)
      setMessage(JSON.stringify(error))
      return
    }

    if (tagsSelection.length > 0 && data) {
      const { error: tagError } = await supabase
        .from('ingredient_tags')
        .insert(
          tagsSelection.map((tagId) => ({
            ingredient_id: data.ingredient_id,
            tag_id: tagId,
          }))
        )
      if (tagError) {
        setMessage(
          `Ingrédient ajouté, mais erreur sur les tags : ${tagError.message}`
        )
        return
      }
    }

    setMessage('Ingrédient ajouté')
    setNom('')
    setTagsSelection([])
    if (data) {
      setIngredientsExistants([
        ...ingredientsExistants,
        { ingredient_id: data.ingredient_id, nom: data.nom },
      ])
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

      {ingredientsProches.length > 0 && (
        <div className="border border-yellow-300 bg-yellow-50 rounded p-3 my-2 max-w-md">
          <p className="text-sm font-semibold mb-1">
            Ingrédients proches déjà existants :
          </p>
          <ul className="text-sm">
            {ingredientsProches.map((i) => (
              <li key={i.ingredient_id}>
                {i.nom}{' '}
                <span className="text-gray-500">
                  ({Math.round(i.scoreSimilarite * 100)}%)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <select
        value={categorie}
        onChange={(e) => setCategorie(e.target.value)}
        className="border p-2 rounded block mb-2"
      >
        <option value="">Choisir une catégorie</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        value={typeConservation}
        onChange={(e) => setTypeConservation(e.target.value)}
        className="border p-2 rounded block mb-4"
      >
        <option value="">Choisir une conservation</option>
        <option value="Frais">Frais</option>
        <option value="Sec">Sec</option>
        <option value="Surgelé">Surgelé</option>
        <option value="Conserve">Conserve</option>
      </select>

      <label className="block">
        <input
          type="checkbox"
          checked={périssable}
          onChange={(e) => setPérissable(e.target.checked)}
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
          checked={surgelé}
          onChange={(e) => setSurgelé(e.target.checked)}
        />
        Surgelé
      </label>

      <div className="mb-4 max-w-md">
        <p className="font-semibold mb-2">Tags</p>
        <TagSelector
          portee="ingredient"
          tagsDisponibles={tags}
          selection={tagsSelection}
          onChange={setTagsSelection}
          onTagCree={(tag) => setTags([...tags, tag])}
        />
      </div>

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

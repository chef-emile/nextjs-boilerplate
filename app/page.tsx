import { supabase } from "../lib/supabase";
import Link from "next/link";
export const dynamic = 'force-dynamic'

export default async function Home() {
  const { data: recettes } = await supabase
    .from("recettes")
    .select("*");

  return (

    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        Mes recettes
      </h1>

      <div className="flex gap-4 mb-6 flex-wrap">
        <Link
          href="/ingredients"
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Explorer les ingrédients
        </Link>

         <Link
          href="/ajouter-ingredient"
          className="bg-blue-500 text-white px-4 py-2 rounded"
          >
          Ajouter un ingrédient      
        </Link>

        <Link
          href="/ajouter-recette"
          className="bg-blue-500 text-white px-4 py-2 rounded"
          >
          Ajouter une recette      
         </Link>

        <li key={recette.recette_id}>
          <Link href={`/recettesrecette_id}`}
            {recette.nom}
          </Link>
      </li>

        
      </div>

      <ul>
        {recettes?.map((recette) => (
          <li key={recette.recette_id}>
            {recette.nom}
          </li>
        ))}
      </ul>


    </main>
  );
}



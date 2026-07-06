import { supabase } from "../lib/supabase";
import Link from "next/link";

export default async function Home() {
  const { data: recettes } = await supabase
    .from("recettes")
    .select("*");

  return (
    <main>
      <h1>Mes recettes</h1>

 

<div className="flex gap-4 my-4">
  <Link
    href="/ingredients"
    className="bg-blue-500 text-white px-4 py-2 rounded"
 ="bg-green-500 text-white px-4 py-2 rounded"
  >
    Ajouter un ingrédient
  </Link>

  -recette"
    className="bg-orange-500 text-white px-4 py-2 rounded"
  >
    Ajouter une recette
  </Link>
</div>

      <ul>
        {recettes?.map((recette) => (
          <li key={recette.recette_id}>
            {recette.nom}
          </li>
        )) }
      </ul>
    </main>
  );
}

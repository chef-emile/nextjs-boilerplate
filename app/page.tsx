import { supabase } from "../lib/supabase";
import Link from "next/link";

export default async function Home() {
  const { data: recettes } = await supabase
    .from("recettes")
    .select("*");

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">
        Mes recettes
      </h1>

      <Link
        href="/ingredients"
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
       <ul>
        {recettes?.map(function (recette) {
          return (
            <li key={recette.recette_id}>
            {recette.nom}
            </li>
          )
        })}
      </ul>
      </Link>
      
    </main>
  );
}

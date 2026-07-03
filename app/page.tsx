import { supabase } from "../lib/supabase";
import Link from "next/link";

export default async function Home() {
  const { data: recettes } = await supabase
    .from("recettes")
    .select("*");

  return (
    <main>
      <h1>Mes recettes</h1>

      <Link
        href="/ingredients"
        className="inline-block mt-4 mb-4 bg-blue-500 text-white px-4 py-2 rounded-lg"
      >
        Explorer les ingrédients
      </Link>

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

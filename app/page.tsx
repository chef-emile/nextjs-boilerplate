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

      <div className="flex gap-4 mb-6">
        /ingredientsName="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Explorer les ingrédients
        </Link>

        <Link
          href="/ajouter-ingredient"
          className="bg>

        <Link
          href="/ajouter-recette"
          className="bg-orange-500>

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

import { supabase } from "../lib/supabase";
import Link from "next/link";
import RecettesListe from "./components/RecettesListe";
export const dynamic = 'force-dynamic'
export default async function Home() {
  const { data: recettes } = await supabase
    .from("recettes")
    .select("*")
    .order("nom");

  const { data: tags } = await supabase
    .from("tags")
    .select("*")
    .eq("portee", "recette")
    .order("nom");

  const { data: recetteTags } = await supabase
    .from("recette_tags")
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
        <Link
          href="/import"
          className="bg-purple-500 text-white px-4 py-2 rounded"
        >
          Import en masse
        </Link>
      </div>

      <RecettesListe
        recettes={recettes || []}
        tags={tags || []}
        recetteTags={recetteTags || []}
      />
    </main>
  );
}

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
    <main className="min-h-screen bg-fond px-6 py-10 md:px-10">
      <div className="max-w-5xl mx-auto">
        <p className="font-mono text-xs tracking-widest text-or uppercase mb-2">
          Carnet de cuisine
        </p>
        <h1 className="font-display italic text-5xl md:text-6xl text-texte mb-8">
          Mes recettes
        </h1>

        <div className="flex gap-3 mb-10 flex-wrap">
          <Link
            href="/ingredients"
            className="border border-ligne text-texte px-4 py-2 rounded-full text-sm hover:border-or hover:text-or transition-colors"
          >
            Explorer les ingrédients
          </Link>
          <Link
            href="/ajouter-ingredient"
            className="border border-ligne text-texte px-4 py-2 rounded-full text-sm hover:border-or hover:text-or transition-colors"
          >
            Ajouter un ingrédient
          </Link>
          <Link
            href="/ajouter-recette"
            className="bg-or text-fond px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Ajouter une recette
          </Link>
          <Link
            href="/import"
            className="border border-ligne text-texte-muted px-4 py-2 rounded-full text-sm hover:border-or hover:text-or transition-colors"
          >
            Import en masse
          </Link>
        </div>

        <RecettesListe
          recettes={recettes || []}
          tags={tags || []}
          recetteTags={recetteTags || []}
        />
      </div>
    </main>
  );
}

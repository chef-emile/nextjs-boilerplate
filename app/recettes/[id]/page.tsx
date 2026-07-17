import { supabase } from "@/lib/supabase";
import RecetteDetail from "./RecetteDetail";

export const dynamic = "force-dynamic";

export default async function RecettePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recetteId = Number(id);

  const { data: recette } = await supabase
    .from("recettes")
    .select("*")
    .eq("recette_id", recetteId)
    .single();

  if (!recette) {
    return (
      <main className="min-h-screen bg-fond text-texte px-6 py-10 md:px-10">
        <div className="max-w-2xl mx-auto">
          <p className="font-sans text-sm text-texte-muted">
            Recette introuvable.
          </p>
        </div>
      </main>
    );
  }

  const { data: recetteIngredients } = await supabase
    .from("recette_ingredients")
    .select("*")
    .eq("recette_id", recetteId);
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("*")
    .order("nom");
  const { data: tags } = await supabase
    .from("tags")
    .select("*")
    .eq("portee", "recette")
    .order("nom");
  const { data: recetteTags } = await supabase
    .from("recette_tags")
    .select("*")
    .eq("recette_id", recetteId);

  return (
    <RecetteDetail
      recette={recette}
      recetteIngredientsInitial={recetteIngredients || []}
      ingredients={ingredients || []}
      tagsDisponibles={tags || []}
      recetteTagsInitial={recetteTags || []}
    />
  );
}

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
      <main className="p-6">
        <p>Recette introuvable.</p>
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

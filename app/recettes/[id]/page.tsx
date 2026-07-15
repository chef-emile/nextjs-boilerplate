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

  return (
    <RecetteDetail
      recette={recette}
      recetteIngredientsInitial={recetteIngredients || []}
      ingredients={ingredients || []}
    />
  );
}

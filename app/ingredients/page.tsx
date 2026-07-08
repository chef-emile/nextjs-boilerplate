import { supabase } from "@/lib/supabase";
import IngredientsSelector from "@/app/components/IngredientsSelector";

export const dynamic = 'force-dynamic'

export default async function IngredientsPage() {
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("*")
    .order("nom");

  const { data: recettes } = await supabase
    .from("recettes")
    .select("*");

  const { data: recetteIngredients } = await supabase
    .from("recette_ingredients")
    .select("*");

  return (
    <main>
      <h1>Ingrédients</h1>

      <IngredientsSelector
        ingredients={ingredients || []}
        recettes={recettes || []}
        recetteIngredients={recetteIngredients || []}
      />
    </main>
  );
}

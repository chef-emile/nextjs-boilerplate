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
  const { data: tags } = await supabase
    .from("tags")
    .select("*")
    .eq("portee", "ingredient")
    .order("nom");
  const { data: ingredientTags } = await supabase
    .from("ingredient_tags")
    .select("*");
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-2">Ingrédients</h1>
      <p className="mb-4">{ingredients?.length} ingrédients</p>
      <IngredientsSelector
        ingredients={ingredients || []}
        recettes={recettes || []}
        recetteIngredients={recetteIngredients || []}
        tags={tags || []}
        ingredientTags={ingredientTags || []}
      />
    </main>
  );
}

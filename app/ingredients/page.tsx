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
    <main className="min-h-screen bg-fond text-texte px-6 py-10 md:px-10">
      <div className="mb-8">
        <h1 className="font-serif italic text-4xl md:text-5xl text-texte">
          Ingrédients
        </h1>
        <p className="font-mono text-sm text-texte-muted mt-2">
          {ingredients?.length ?? 0} ingrédients référencés
        </p>
      </div>
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

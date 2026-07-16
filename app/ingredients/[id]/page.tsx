import { supabase } from "@/lib/supabase";
import IngredientDetail from "./IngredientDetail";

export const dynamic = "force-dynamic";

export default async function IngredientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ingredientId = Number(id);

  const { data: ingredient } = await supabase
    .from("ingredients")
    .select("*")
    .eq("ingredient_id", ingredientId)
    .single();

  if (!ingredient) {
    return (
      <main className="p-6">
        <p>Ingrédient introuvable.</p>
      </main>
    );
  }

  const { data: tags } = await supabase
    .from("tags")
    .select("*")
    .eq("portee", "ingredient")
    .order("nom");

  const { data: ingredientTags } = await supabase
    .from("ingredient_tags")
    .select("*")
    .eq("ingredient_id", ingredientId);

  return (
    <IngredientDetail
      ingredient={ingredient}
      tagsDisponibles={tags || []}
      ingredientTagsInitial={ingredientTags || []}
    />
  );
}

import { supabase } from "@/lib/supabase";

export default async function IngredientsPage() {
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("*")
    .order("nom");

  return (
    <main>
      <h1>Ingrédients</h1>

      <ul>
        {ingredients?.map((ingredient) => (
          <li key={ingredient.ingredient_id}>
            {ingredient.nom}
          </li>
        ))}
      </ul>
    </main>
  );
}

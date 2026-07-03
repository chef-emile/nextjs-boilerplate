import { supabase } from "@/lib/supabase";
import IngredientsSelector from "@/app/components/IngredientsSelector";

export default async function IngredientsPage() {
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("*")
    .order("nom");

  return (
    <main>
      <h1>Ingrédients</h1>

      <IngredientsSelector
        ingredients={ingredients || []}
      />
    </main>
  );
}

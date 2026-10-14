import { supabase } from "@/lib/supabase";
import { lireToutesLesLignes } from "@/lib/supabaseLecture";
import IngredientsSelector from "@/app/components/IngredientsSelector";
export const dynamic = 'force-dynamic'
export default async function IngredientsPage() {
  // Lectures paginées : l'API Supabase tronque à 1000 lignes par requête,
  // ce qui faussait les liaisons recette / ingrédient dès que la base grossit.
  // Colonnes réduites : le réseau n'a besoin ni des instructions ni des liens des recettes.
  const ingredients = await lireToutesLesLignes<any>("ingredients", "*", ["nom", "ingredient_id"]);
  const recettes = await lireToutesLesLignes<any>("recettes", "recette_id, nom", ["recette_id"]);
  const recetteIngredients = await lireToutesLesLignes<any>("recette_ingredients", "recette_id, ingredient_id, obligatoire", ["recette_id", "ingredient_id"]);
  const { data: tags } = await supabase
    .from("tags")
    .select("*")
    .eq("portee", "ingredient")
    .order("nom");
  const ingredientTags = await lireToutesLesLignes<any>("ingredient_tags", "ingredient_id, tag_id", ["ingredient_id", "tag_id"]);
  const { data: tagsRecettes } = await supabase
    .from("tags")
    .select("*")
    .eq("portee", "recette")
    .order("nom");
  const recetteTags = await lireToutesLesLignes<any>("recette_tags", "recette_id, tag_id", ["recette_id", "tag_id"]);
  return (
    <main className="min-h-screen bg-fond text-texte px-6 py-10 md:px-10">
      <div className="mb-8">
        <h1 className="font-serif italic text-4xl md:text-5xl text-texte">
          Ingrédients
        </h1>
        <p className="font-mono text-sm text-texte-muted mt-2">
          {ingredients.length} ingrédients référencés
        </p>
      </div>
      <IngredientsSelector
        ingredients={ingredients}
        recettes={recettes}
        recetteIngredients={recetteIngredients}
        tags={tags || []}
        ingredientTags={ingredientTags}
        tagsRecettes={tagsRecettes || []}
        recetteTags={recetteTags}
      />
    </main>
  );
}

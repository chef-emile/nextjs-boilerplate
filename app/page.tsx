import { supabase } from "../lib/supabase";

export default async function Home() {
  const { data: recettes } = await supabase
    .from("recettes")
    .select("*");

  return (
    <main>
      <h1>Mes recettes</h1>

      <ul>
        {recettes?.map((recette) => (
          <li key={recette.recette_id}>
            {recette.nom}
          </li>
        ))}
      </ul>
    </main>
  );
}

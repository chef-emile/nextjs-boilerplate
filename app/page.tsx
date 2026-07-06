import { supabase } from "../lib/supabase";
import Link from "next/link";

export default async function Home() {
  const { data: recettes } = await supabase
    .from("recettes")
    .select("*");

  return (
    <main>
      <h1>Mes recettes</h1>

      <div className="flex gap-4 my-4">
        /ingredients
          Explorer les ingrédients
        </Link>

        /ajouter-ingredient
          Ajouter un ingrédient
        </Link>

        /ajouter-recette
          Ajouter une recette
        </Link>
      </div>

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

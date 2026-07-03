import { supabase } from "../lib/supabase";

export default async function Home() {
  const { data, error } = await supabase
    .from("ingredients")
    .select("*");

  return (
    <main>
      <h1>Mes recettes</h1>

      <pre>{JSON.stringify({ data, error }, null, 2)}</pre>
    </main>
  );
}

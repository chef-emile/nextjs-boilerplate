import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function RecettePage({
  params,
}: {
  params: { id: string };
}) {
  const { data: recette } = await supabase
    .from("recettes")
    .select("*")
    .eq("recette_id", params.id)
    .single();

  return (
    <main className="p-6">
      <h1 className="text-3xl font-bold">
        {recette.nom}
      </h1>
    </main>
  );
}

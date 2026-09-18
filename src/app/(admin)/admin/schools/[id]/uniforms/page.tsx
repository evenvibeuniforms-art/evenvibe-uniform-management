import { requireAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { UniformConfigManager } from "./UniformConfigManager";
import { STANDARD_CLASSES } from "@/lib/constants/classes";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const metadata = {
  title: "Uniform Configuration | EvenVibe Admin",
};

export default async function AdminUniformConfigPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id: schoolId } = await params;
  const supabase = await createClient();

  // Fetch school details
  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .select("name")
    .eq("id", schoolId)
    .single();

  if (schoolError || !school) {
    return <div>School not found</div>;
  }

  // Fetch existing configurations
  const { data: configs } = await supabase
    .from("school_uniform_configurations")
    .select(`
      id,
      gender,
      is_active,
      items:school_uniform_configuration_items (
        id,
        item_name,
        available_sizes,
        is_required,
        sort_order,
        is_active
      ),
      classes:school_uniform_configuration_classes (
        class_name
      )
    `)
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .order("gender");

  // Format all configs for the manager component
  const allConfigs = (configs || []).map(c => ({
    ...c,
    items: ((c.items as {is_active: boolean, sort_order: number, item_name: string, available_sizes: string[], is_required: boolean, id?: string}[]) || []).filter(i => i.is_active).sort((a, b) => a.sort_order - b.sort_order),
    classes: (c.classes as {class_name: string}[]) || []
  }));

  const availableClasses = STANDARD_CLASSES;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex items-center gap-4">
        <Link href="/admin/schools" className="p-2 hover:bg-slate-100 rounded-md transition-colors">
          <ChevronLeft className="h-5 w-5 text-slate-500" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Uniform Configuration</h1>
          <p className="text-slate-500 mt-2">
            Managing uniform items and sizes for <span className="font-semibold text-slate-800">{school.name}</span>
          </p>
        </div>
      </div>

      <div className="mt-8">
        <UniformConfigManager schoolId={schoolId} allConfigs={allConfigs} availableClasses={availableClasses} />
      </div>
    </div>
  );
}

import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RequirementRealtimeListener } from "@/components/school/RequirementRealtimeListener";

interface RequirementItem {
  id: string;
  requirement_id: string;
  uniform_type?: string;
  item_type?: string;
  gender?: string;
  item_name?: string;
  size: string;
  quantity: number;
}

export default async function RequirementDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  // Fetch requirement
  const { data: requirement, error } = await supabase
    .from("requirements")
    .select(`
      *,
      requirement_items (*)
    `)
    .eq("id", id)
    .eq("school_id", profile.school_id)
    .single();

  if (error || !requirement) {
    return notFound();
  }

  // Calculate total items across all categories
  const totalItems = requirement.requirement_items.reduce((acc: number, item: RequirementItem) => acc + item.quantity, 0);

  // Group by Gender -> Item Name (New) OR Uniform Type -> Item Type (Legacy)
  const groupedItems = requirement.requirement_items.reduce((acc: Record<string, Record<string, RequirementItem[]>>, item: RequirementItem) => {
    // Determine category (e.g. Male, Female OR Regular, T-Shirt)
    const category = item.gender || item.uniform_type || "Other";
    // Determine subcategory (e.g. Shirt, Pant)
    const subCategory = item.item_name || item.item_type || "Unknown Item";

    if (!acc[category]) acc[category] = {};
    if (!acc[category][subCategory]) acc[category][subCategory] = [];
    acc[category][subCategory].push(item);
    return acc;
  }, {});

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <RequirementRealtimeListener schoolId={profile.school_id} />
      <div className="flex items-center gap-4">
        <Link href="/school/requirements">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Requirement Details</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-slate-500 font-medium">{requirement.requirement_number}</span>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 uppercase">
              {requirement.status}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between border-b pb-2">
              <span className="text-slate-500">Total Students</span>
              <span className="font-bold">{requirement.total_students}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-slate-500">Regular Uniforms</span>
              <span className="font-bold">{requirement.regular_uniform_students}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-slate-500">T-Shirt Uniforms</span>
              <span className="font-bold">{requirement.tshirt_uniform_students}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-500 font-semibold">Total Items</span>
              <span className="font-bold text-emerald-600 text-lg">
                {totalItems}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Detailed Item Quantities</CardTitle>
            <CardDescription>Size-wise breakdown of required items.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-6">
              {Object.keys(groupedItems).sort().map((category: string) => {
                const subCategories = groupedItems[category] as Record<string, RequirementItem[]>;
                // Calculate total items in this category
                const categoryTotal = (Object.values(subCategories).flat() as RequirementItem[]).reduce((acc: number, curr: RequirementItem) => acc + curr.quantity, 0);

                return (
                  <div key={category} className="space-y-4 border rounded-lg p-4 bg-slate-50">
                    <h3 className="font-semibold text-slate-800 flex justify-between capitalize">
                      {category.replace("_", " ")}
                      <Badge variant="secondary">{categoryTotal} items</Badge>
                    </h3>
                    <div className="space-y-3">
                      {Object.keys(subCategories).sort().map((subCategory) => {
                        const items = subCategories[subCategory] as RequirementItem[];
                        return (
                          <div key={subCategory}>
                            <h4 className="text-xs font-semibold text-slate-500 capitalize">{subCategory.replace("_", " ")}</h4>
                            <ul className="text-sm">
                              {items
                                .sort((a, b) => a.size.localeCompare(b.size, undefined, { numeric: true }))
                                .map((item) => (
                                  <li key={item.id} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                                    <span>Size {item.size}</span>
                                    <span className="font-medium">{item.quantity}</span>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {Object.keys(groupedItems).length === 0 && (
                <div className="col-span-full py-8 text-center text-slate-500 border rounded-lg border-dashed">
                  No uniform items found in this requirement.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

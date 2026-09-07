import { requireSchoolAdmin } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
interface RequirementItem {
  id: string;
  requirement_id: string;
  uniform_type: "regular" | "tshirt";
  item_type: "shirt" | "tshirt" | "pant" | "short";
  size: string;
  quantity: number;
}

export default async function RequirementDetailsPage({ params }: { params: { id: string } }) {
  const profile = await requireSchoolAdmin();
  const supabase = await createClient();

  // Fetch requirement
  const { data: requirement, error } = await supabase
    .from("requirements")
    .select(`
      *,
      requirement_items (*)
    `)
    .eq("id", params.id)
    .eq("school_id", profile.school_id)
    .single();

  if (error || !requirement) {
    return notFound();
  }

  // Calculate totals
  let totalShirts = 0;
  let totalTShirts = 0;
  let totalPants = 0;
  let totalShorts = 0;

  requirement.requirement_items.forEach((item: RequirementItem) => {
    if (item.item_type === "shirt") totalShirts += item.quantity;
    if (item.item_type === "tshirt") totalTShirts += item.quantity;
    if (item.item_type === "pant") totalPants += item.quantity;
    if (item.item_type === "short") totalShorts += item.quantity;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/school">
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
                {totalShirts + totalTShirts + totalPants + totalShorts}
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
              {/* Regular Uniform */}
              <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
                <h3 className="font-semibold text-slate-800 flex justify-between">
                  Regular Uniform 
                  <Badge variant="secondary">{totalShirts + totalPants + totalShorts} items</Badge>
                </h3>
                <div className="space-y-3">
                  {/* Shirts */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase">Shirts</h4>
                    <ul className="text-sm">
                      {requirement.requirement_items
                        .filter((i: RequirementItem) => i.uniform_type === "regular" && i.item_type === "shirt")
                        .sort((a: RequirementItem, b: RequirementItem) => a.size.localeCompare(b.size, undefined, { numeric: true }))
                        .map((item: RequirementItem) => (
                          <li key={item.id} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                            <span>Size {item.size}</span>
                            <span className="font-medium">{item.quantity}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                  {/* Pants */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase">Pants</h4>
                    <ul className="text-sm">
                      {requirement.requirement_items
                        .filter((i: RequirementItem) => i.uniform_type === "regular" && i.item_type === "pant")
                        .sort((a: RequirementItem, b: RequirementItem) => a.size.localeCompare(b.size, undefined, { numeric: true }))
                        .map((item: RequirementItem) => (
                          <li key={item.id} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                            <span>Size {item.size}</span>
                            <span className="font-medium">{item.quantity}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                  {/* Shorts */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase">Shorts</h4>
                    <ul className="text-sm">
                      {requirement.requirement_items
                        .filter((i: RequirementItem) => i.uniform_type === "regular" && i.item_type === "short")
                        .sort((a: RequirementItem, b: RequirementItem) => a.size.localeCompare(b.size, undefined, { numeric: true }))
                        .map((item: RequirementItem) => (
                          <li key={item.id} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                            <span>Size {item.size}</span>
                            <span className="font-medium">{item.quantity}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* T-Shirt Uniform */}
              <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
                <h3 className="font-semibold text-slate-800 flex justify-between">
                  T-Shirt Uniform 
                  <Badge variant="secondary">{totalTShirts + totalPants + totalShorts} items</Badge>
                </h3>
                <div className="space-y-3">
                  {/* T-Shirts */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase">T-Shirts</h4>
                    <ul className="text-sm">
                      {requirement.requirement_items
                        .filter((i: RequirementItem) => i.uniform_type === "tshirt" && i.item_type === "tshirt")
                        .sort((a: RequirementItem, b: RequirementItem) => a.size.localeCompare(b.size, undefined, { numeric: true }))
                        .map((item: RequirementItem) => (
                          <li key={item.id} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                            <span>Size {item.size}</span>
                            <span className="font-medium">{item.quantity}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                  {/* Pants */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase">Pants</h4>
                    <ul className="text-sm">
                      {requirement.requirement_items
                        .filter((i: RequirementItem) => i.uniform_type === "tshirt" && i.item_type === "pant")
                        .sort((a: RequirementItem, b: RequirementItem) => a.size.localeCompare(b.size, undefined, { numeric: true }))
                        .map((item: RequirementItem) => (
                          <li key={item.id} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                            <span>Size {item.size}</span>
                            <span className="font-medium">{item.quantity}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                  {/* Shorts */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase">Shorts</h4>
                    <ul className="text-sm">
                      {requirement.requirement_items
                        .filter((i: RequirementItem) => i.uniform_type === "tshirt" && i.item_type === "short")
                        .sort((a: RequirementItem, b: RequirementItem) => a.size.localeCompare(b.size, undefined, { numeric: true }))
                        .map((item: RequirementItem) => (
                          <li key={item.id} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                            <span>Size {item.size}</span>
                            <span className="font-medium">{item.quantity}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              </div>

            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

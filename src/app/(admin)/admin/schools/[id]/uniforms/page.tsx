import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/server";

export default async function AdminUniformConfigPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id: schoolId } = await params;
  redirect(`/admin/uniform-designs?schoolId=${schoolId}`);
}

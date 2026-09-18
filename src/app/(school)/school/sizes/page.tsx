import { Metadata } from "next";
import { getStudentSizes } from "./actions";
import { SizesWorkflow } from "@/components/school/SizesWorkflow";

export const metadata: Metadata = {
  title: "Uniform Size Collection - EvenVibe",
  description: "Collect and manage student uniform sizes",
};

export default async function SizesPage() {
  const { students, allConfigs } = await getStudentSizes();

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Uniform Size Collection</h2>
      </div>

      <SizesWorkflow students={students} allConfigs={allConfigs} />
    </div>
  );
}

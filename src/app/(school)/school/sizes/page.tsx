import { Metadata } from "next";
import { getStudentSizes } from "./actions";
import { SizeProgressCards } from "@/components/school/SizeProgressCards";
import { SizeCollectionTable } from "@/components/school/SizeCollectionTable";
import { PendingSizesTable } from "@/components/school/PendingSizesTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata: Metadata = {
  title: "Uniform Size Collection - EvenVibe",
  description: "Collect and manage student uniform sizes",
};

export default async function SizesPage() {
  const { students } = await getStudentSizes();

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Uniform Size Collection</h2>
      </div>

      <SizeProgressCards students={students} />

      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">All Students</TabsTrigger>
          <TabsTrigger value="pending">Pending Collection</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="space-y-4">
          <SizeCollectionTable students={students} />
        </TabsContent>
        <TabsContent value="pending" className="space-y-4">
          <PendingSizesTable students={students} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

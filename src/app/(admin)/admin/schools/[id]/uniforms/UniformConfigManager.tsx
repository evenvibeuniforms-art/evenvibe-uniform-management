"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Plus, Pencil, Loader2, Trash2 } from "lucide-react";
import { UniformConfigClient } from "./UniformConfigClient";
import { UniformItemDraft, deactivateUniformConfiguration } from "./actions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

type ConfigData = {
  id: string;
  gender: string;
  classes: { class_name: string }[];
  items: UniformItemDraft[];
};

export function UniformConfigManager({ schoolId, allConfigs, availableClasses }: { schoolId: string, allConfigs: ConfigData[], availableClasses: string[] }) {
  const [editingConfigId, setEditingConfigId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<"Male" | "Female" | null>(null);
  
  const [deactivatingConfigId, setDeactivatingConfigId] = useState<string | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const router = useRouter();

  const handleDeactivate = async () => {
    if (!deactivatingConfigId || isDeactivating) return;
    setIsDeactivating(true);
    
    try {
      const res = await deactivateUniformConfiguration(deactivatingConfigId, schoolId);
      if (res.error) {
        alert(res.error);
      } else {
        router.refresh();
      }
    } catch {
      alert("Failed to deactivate configuration");
    } finally {
      setIsDeactivating(false);
      setDeactivatingConfigId(null);
    }
  };

  if (editingConfigId) {
    const config = allConfigs.find(c => c.id === editingConfigId);
    if (!config) return null;

    const disabledClasses = new Set(
      allConfigs
        .filter(c => c.gender === config.gender && c.id !== config.id)
        .flatMap(c => c.classes.map(cls => cls.class_name))
    );

    return (
      <UniformConfigClient 
        schoolId={schoolId} 
        gender={config.gender as "Male" | "Female"} 
        initialItems={config.items} 
        initialClasses={config.classes.map(c => c.class_name)}
        availableClasses={availableClasses}
        disabledClasses={disabledClasses}
        configId={config.id}
        onCancel={() => setEditingConfigId(null)}
      />
    );
  }

  if (isCreating) {
    const disabledClasses = new Set(
      allConfigs
        .filter(c => c.gender === isCreating)
        .flatMap(c => c.classes.map(cls => cls.class_name))
    );

    return (
      <UniformConfigClient 
        schoolId={schoolId} 
        gender={isCreating} 
        initialItems={[]} 
        initialClasses={[]}
        availableClasses={availableClasses}
        disabledClasses={disabledClasses}
        onCancel={() => setIsCreating(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4 mb-4">
        <Button onClick={() => setIsCreating("Male")}><Plus className="w-4 h-4 mr-2"/> New Male Configuration</Button>
        <Button onClick={() => setIsCreating("Female")}><Plus className="w-4 h-4 mr-2"/> New Female Configuration</Button>
      </div>

      {allConfigs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-slate-500">
            No configurations exist for this school yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {allConfigs.map(config => (
            <Card key={config.id}>
              <CardHeader>
                <CardTitle>{config.gender} Uniform</CardTitle>
                <CardDescription>
                  Classes: {config.classes.map(c => c.class_name).join(", ") || "None assigned"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 mb-2">{config.items.length} items configured:</p>
                <ul className="text-sm list-disc pl-4 space-y-1">
                  {config.items.map(item => (
                    <li key={item.id}>{item.item_name} ({item.available_sizes.join(", ")})</li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" size="sm" onClick={() => setEditingConfigId(config.id)}>
                  <Pencil className="w-4 h-4 mr-2"/> Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeactivatingConfigId(config.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                  <Trash2 className="w-4 h-4 mr-2"/> Deactivate
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!deactivatingConfigId} onOpenChange={(open) => !open && !isDeactivating && setDeactivatingConfigId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription className="pt-4">
              This configuration will be deactivated.{" "}
              It will no longer be available for new student size collection.{" "}
              <span className="font-medium text-slate-700">
                Historical size, requirement and order data will not be affected.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setDeactivatingConfigId(null)} disabled={isDeactivating}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={isDeactivating}>
              {isDeactivating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isDeactivating ? "Deactivating..." : "Deactivate Configuration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

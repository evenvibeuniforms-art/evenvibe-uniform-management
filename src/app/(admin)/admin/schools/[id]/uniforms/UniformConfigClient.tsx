"use client";

import { useState, useTransition } from "react";
import { UniformItemDraft, saveUniformConfiguration } from "./actions";
import { UniformConfigSchema, normalizeSizes, validateDuplicateItemNames } from "@/lib/validations/uniform-config";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, Loader2 } from "lucide-react";

interface Props {
  schoolId: string;
  gender: "Male" | "Female";
  initialItems: UniformItemDraft[];
  initialClasses: string[];
  availableClasses: string[];
  configId?: string;
  disabledClasses?: Set<string>;
  onCancel?: () => void;
}

type ClientItemDraft = UniformItemDraft & { rawSizes: string };

export function UniformConfigClient({ schoolId, gender, initialItems, initialClasses, availableClasses, configId, disabledClasses, onCancel }: Props) {
  const [items, setItems] = useState<ClientItemDraft[]>(
    initialItems.map(i => ({ ...i, rawSizes: i.available_sizes.join(", ") }))
  );
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set(initialClasses));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  const isAllDisabled = availableClasses.length > 0 && availableClasses.every(cls => disabledClasses?.has(cls));

  const addItem = () => {
    setItems([
      ...items,
      { item_name: "", available_sizes: [], rawSizes: "", is_required: true, sort_order: items.length },
    ]);
  };

  const removeItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const updateItem = (index: number, updates: Partial<ClientItemDraft>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    setItems(newItems);
  };

  const toggleClass = (className: string) => {
    if (disabledClasses?.has(className)) return;
    const newSet = new Set(selectedClasses);
    if (newSet.has(className)) {
      newSet.delete(className);
    } else {
      newSet.add(className);
    }
    setSelectedClasses(newSet);
  };

  const selectAllClasses = () => {
    setSelectedClasses(new Set(availableClasses.filter(c => !disabledClasses?.has(c))));
  };

  const clearAllClasses = () => {
    setSelectedClasses(new Set());
  };

  const handleSave = () => {
    if (isPending) return;
    setError(null);
    setSuccess(null);
    
    // Validation
    const targetClasses = Array.from(selectedClasses);

    // Normalize items
    const finalItems = items.map(item => ({
      ...item,
      available_sizes: normalizeSizes(item.rawSizes)
    }));

    // Zod Validation
    const result = UniformConfigSchema.safeParse({
      gender,
      targetClasses,
      items: finalItems
    });

    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }

    // Custom Item Name Duplication Validation
    const duplicateError = validateDuplicateItemNames(finalItems);
    if (duplicateError) {
      setError(duplicateError);
      return;
    }

    startTransition(async () => {
      try {
        const res = await saveUniformConfiguration(schoolId, gender, result.data.items, result.data.targetClasses, configId);
        if (res.error) setError(res.error);
        if (res.success) {
          setSuccess(res.success);
          setTimeout(() => {
            setSuccess(null);
            if (onCancel) onCancel(); // Return to list view
            router.refresh();
          }, 1500);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{gender} Uniform Configuration {configId ? "(Edit)" : "(New)"}</CardTitle>
        <CardDescription>Configure the items and available sizes for {gender.toLowerCase()} students.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isAllDisabled && (
          <div className="bg-amber-50 text-amber-800 p-4 rounded-md text-sm border border-amber-200">
            All classes already have an active configuration for this gender.
          </div>
        )}
        <div className="space-y-4 bg-slate-50 p-6 rounded-md border border-slate-200">
          <div className="flex items-center justify-between">
            <Label className="font-semibold text-slate-800 text-lg">Target Classes</Label>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={selectAllClasses} className="h-8 text-xs" disabled={isAllDisabled}>Select All</Button>
              <Button variant="ghost" size="sm" onClick={clearAllClasses} className="h-8 text-xs">Clear All</Button>
            </div>
          </div>
          
          {availableClasses.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {availableClasses.map((cls) => {
                const isDisabled = disabledClasses?.has(cls);
                return (
                  <div key={cls} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`class-${cls}`} 
                      checked={selectedClasses.has(cls)} 
                      disabled={isDisabled}
                      onCheckedChange={() => toggleClass(cls)}
                    />
                    <Label htmlFor={`class-${cls}`} className={`text-sm font-medium leading-none ${isDisabled ? 'text-slate-400' : 'cursor-pointer'}`}>
                      {cls} {isDisabled && <span className="text-xs font-normal ml-1">[Already Configured]</span>}
                    </Label>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-slate-500 italic">No classes found for this school.</div>
          )}

          <div className="pt-2 border-t text-sm font-medium text-slate-600">
            {selectedClasses.size} class{selectedClasses.size !== 1 ? 'es' : ''} selected
          </div>
        </div>
        {items.length === 0 ? (
          <div className="text-center py-6 text-slate-500 bg-slate-50 rounded-md border border-dashed">
            No items configured. Click &apos;Add Item&apos; to start.
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={item.id || `new-${index}`} className="flex flex-col sm:flex-row gap-4 p-4 border rounded-md bg-white relative group">
                <div className="flex-1 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Item Name (e.g., Shirt, Tie)</Label>
                      <Input
                        value={item.item_name}
                        onChange={(e) => updateItem(index, { item_name: e.target.value })}
                        placeholder="Shirt"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Available Sizes (comma separated)</Label>
                      <Input
                        value={item.rawSizes}
                        onChange={(e) => updateItem(index, { rawSizes: e.target.value })}
                        placeholder="26, 28, 30 OR Free Size"
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={item.is_required}
                      onCheckedChange={(checked) => updateItem(index, { is_required: checked })}
                      id={`required-${gender}-${index}`}
                    />
                    <Label htmlFor={`required-${gender}-${index}`}>Required Item</Label>
                  </div>
                </div>
                <div className="flex sm:flex-col justify-end gap-2 mt-4 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-t-0 sm:border-l pl-0 sm:pl-4 sm:w-12 items-center">
                  <Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Button variant="outline" onClick={addItem} className="w-full border-dashed">
          <Plus className="mr-2 h-4 w-4" /> Add Item
        </Button>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-4 bg-slate-50 rounded-b-xl border-t mt-4 p-6">
        {error && <div className="text-sm font-medium text-red-600">{error}</div>}
        {success && <div className="text-sm font-medium text-emerald-600">{success}</div>}
        <div className="flex justify-between w-full">
          <div className="text-sm text-slate-500 pt-2 flex items-center gap-2">
            {onCancel && (
              <Button variant="ghost" onClick={onCancel} disabled={isPending}>
                Cancel
              </Button>
            )}
          </div>
          <Button onClick={handleSave} disabled={isPending || isAllDisabled}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isPending ? "Saving..." : `Save ${gender} Config`}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

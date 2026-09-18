"use client";

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UNIFORM_TYPES } from "@/lib/constants/uniformSizes";
import { StudentWithSize, SizeCollectionFormValues } from "@/app/(school)/school/sizes/schema";
import { saveStudentSizes, AllConfigItem } from "@/app/(school)/school/sizes/actions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SizeFormDialogProps {
  student: StudentWithSize;
  configurations: AllConfigItem[];
  trigger: React.ReactElement;
}

export function SizeFormDialog({ student, configurations, trigger }: SizeFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const activeConfig = useMemo(() => {
    const config = configurations.find(c => c.gender === student.gender && c.classes.includes(student.class_name));
    return config?.items || [];
  }, [student.gender, student.class_name, configurations]);

  const hasDynamicConfig = activeConfig.length > 0;

  // Form state
  const [dynamicSizes, setDynamicSizes] = useState<Record<string, string>>(student.size_record?.dynamic_sizes || {});

  // Reset form when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setDynamicSizes(student.size_record?.dynamic_sizes || {});
    }
    setOpen(newOpen);
  };

  const handleDynamicSizeChange = (itemId: string, size: string) => {
    setDynamicSizes(prev => ({
      ...prev,
      [itemId]: size
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasDynamicConfig) {
      toast.error("No uniform configuration is available for this class.");
      return;
    }
    
    for (const item of activeConfig) {
      if (item.is_required && !dynamicSizes[item.id]) {
        toast.error(`Please select a size for ${item.item_name}.`);
        return;
      }
    }

    setIsLoading(true);

    const data: SizeCollectionFormValues = {
      student_id: student.id,
      uniform_type: UNIFORM_TYPES.REGULAR, // Default to satisfy DB type if needed
      dynamic_sizes: dynamicSizes,
      is_dynamic_only: true,
    };

    const result = await saveStudentSizes(data);
    
    setIsLoading(false);
    
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Sizes saved successfully");
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Collect Uniform Sizes</DialogTitle>
          <DialogDescription>
            {student.student_name} • Class {student.class_name} • Sec {student.section} • Adm No {student.admission_number}
            {student.gender ? ` • ${student.gender}` : ""}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          
          {hasDynamicConfig ? (
            <>
              <div className="space-y-4">
                {activeConfig.map((item) => (
                  <div key={item.id} className="space-y-2">
                    <Label htmlFor={`size-${item.id}`}>
                      {item.item_name} {item.is_required && <span className="text-red-500">*</span>}
                    </Label>
                    <Select 
                      value={dynamicSizes[item.id] || ""} 
                      onValueChange={(v) => handleDynamicSizeChange(item.id, v || "")} 
                      required={item.is_required}
                    >
                      <SelectTrigger id={`size-${item.id}`}>
                        <SelectValue placeholder={`Select ${item.item_name} size`} />
                      </SelectTrigger>
                      <SelectContent>
                        {item.available_sizes.map(size => (
                          <SelectItem key={size} value={size}>{size}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Sizes
                </Button>
              </div>
            </>
          ) : (
            <div className="py-6 flex flex-col items-center justify-center space-y-4 text-center">
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 text-amber-800">
                <p className="font-medium text-lg">No uniform configuration is available for this class.</p>
                <p className="text-sm mt-1">Please contact your EvenVive Admin to configure uniforms for this class.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

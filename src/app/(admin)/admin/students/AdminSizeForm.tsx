"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { sizeCollectionSchema, SizeCollectionFormValues } from "@/app/(school)/school/sizes/schema";
import { saveAdminStudentSizes, ConfigItem } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { UNIFORM_TYPES } from "@/lib/constants/uniformSizes";

interface AdminSizeFormProps {
  studentId: string;
  config: {
    id: string;
    items: ConfigItem[];
  };
  sizeRecord: Record<string, unknown> | null;
  onSuccess?: () => void;
  updateFilters?: (newFilters: Record<string, string | number | undefined | null>) => void;
}

export function AdminSizeForm({ studentId, config, sizeRecord, onSuccess }: AdminSizeFormProps) {
  const [isSaving, setIsSaving] = useState(false);

  const activeItems = config.items || [];
  
  const initialDynamicSizes: Record<string, string> = { ...((sizeRecord?.dynamic_sizes as Record<string, string>) || {}) };
  activeItems.forEach(item => {
    if (initialDynamicSizes[item.id] === undefined) {
      initialDynamicSizes[item.id] = "";
    }
  });

  const defaultValues: Partial<SizeCollectionFormValues> = {
    student_id: studentId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    uniform_type: (sizeRecord?.uniform_type as any) || UNIFORM_TYPES.REGULAR,
    is_dynamic_only: true,
    dynamic_sizes: initialDynamicSizes,
  };

  const form = useForm<SizeCollectionFormValues>({
    resolver: zodResolver(sizeCollectionSchema),
    defaultValues,
  });

  const onSubmit = async (data: SizeCollectionFormValues) => {
    try {
      setIsSaving(true);
      const res = await saveAdminStudentSizes(data);
      if (res.error) {
        toast.error("Failed to save sizes.");
      } else {
        toast.success("Sizes saved successfully.");
        onSuccess?.();
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save sizes.");
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeItems.map((item) => (
            <FormField
              key={item.id}
              control={form.control}
              name={`dynamic_sizes.${item.id}`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {item.item_name}
                    {item.is_required && <span className="text-red-500 ml-1">*</span>}
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {item.available_sizes.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>

        <Button type="submit" disabled={isSaving} className="w-full mt-4">
          {isSaving ? "Saving..." : "Save Sizes"}
        </Button>
      </form>
    </Form>
  );
}

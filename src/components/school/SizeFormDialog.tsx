"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UNIFORM_TYPES, REGULAR_UNIFORM_SIZES, TSHIRT_UNIFORM_SIZES, PANT_SHORT_SIZES, UniformType } from "@/lib/constants/uniformSizes";
import { StudentWithSize, SizeCollectionFormValues } from "@/app/(school)/school/sizes/schema";
import { saveStudentSizes } from "@/app/(school)/school/sizes/actions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface SizeFormDialogProps {
  student: StudentWithSize;
  trigger: React.ReactElement;
}

export function SizeFormDialog({ student, trigger }: SizeFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const initialType = (student.size_record?.uniform_type as UniformType) || UNIFORM_TYPES.REGULAR;
  const [uniformType, setUniformType] = useState<UniformType>(initialType);
  const [shirtSize, setShirtSize] = useState<string>(student.size_record?.shirt_size || "");
  const [tshirtSize, setTshirtSize] = useState<string>(student.size_record?.tshirt_size || "");
  const [pantSize, setPantSize] = useState<string>(student.size_record?.pant_size || "");
  const [shortSize, setShortSize] = useState<string>(student.size_record?.short_size || "");

  // Reset form when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setUniformType((student.size_record?.uniform_type as UniformType) || UNIFORM_TYPES.REGULAR);
      setShirtSize(student.size_record?.shirt_size || "");
      setTshirtSize(student.size_record?.tshirt_size || "");
      setPantSize(student.size_record?.pant_size || "");
      setShortSize(student.size_record?.short_size || "");
    }
    setOpen(newOpen);
  };

  const handleUniformTypeChange = (value: string) => {
    const type = value as UniformType;
    setUniformType(type);
    // Clear irrelevant size
    if (type === UNIFORM_TYPES.REGULAR) {
      setTshirtSize("");
    } else {
      setShirtSize("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pantSize && !shortSize) {
      toast.error("Please select either Pant Size or Short Size.");
      return;
    }

    setIsLoading(true);

    const data: SizeCollectionFormValues = {
      student_id: student.id,
      uniform_type: uniformType,
      shirt_size: shirtSize || null,
      tshirt_size: tshirtSize || null,
      pant_size: pantSize || null,
      short_size: shortSize || null,
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Collect Uniform Sizes</DialogTitle>
          <DialogDescription>
            {student.student_name} • Class {student.class_name} • Sec {student.section} • Roll {student.roll_number}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Uniform Type</Label>
            <div className="flex gap-2">
              <Button 
                type="button" 
                variant={uniformType === UNIFORM_TYPES.REGULAR ? "default" : "outline"}
                className="flex-1"
                onClick={() => handleUniformTypeChange(UNIFORM_TYPES.REGULAR)}
              >
                Regular Uniform
              </Button>
              <Button 
                type="button" 
                variant={uniformType === UNIFORM_TYPES.TSHIRT ? "default" : "outline"}
                className="flex-1"
                onClick={() => handleUniformTypeChange(UNIFORM_TYPES.TSHIRT)}
              >
                T-Shirt Uniform
              </Button>
            </div>
          </div>

          {uniformType === UNIFORM_TYPES.REGULAR && (
            <div className="space-y-2">
              <Label htmlFor="shirt_size">Shirt Size <span className="text-red-500">*</span></Label>
              <Select value={shirtSize} onValueChange={(v) => { if (v) setShirtSize(v); }} required>
                <SelectTrigger id="shirt_size">
                  <SelectValue placeholder="Select shirt size" />
                </SelectTrigger>
                <SelectContent>
                  {REGULAR_UNIFORM_SIZES.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {uniformType === UNIFORM_TYPES.TSHIRT && (
            <div className="space-y-2">
              <Label htmlFor="tshirt_size">T-Shirt Size <span className="text-red-500">*</span></Label>
              <Select value={tshirtSize} onValueChange={(v) => { if (v) setTshirtSize(v); }} required>
                <SelectTrigger id="tshirt_size">
                  <SelectValue placeholder="Select t-shirt size" />
                </SelectTrigger>
                <SelectContent>
                  {TSHIRT_UNIFORM_SIZES.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="pant_size">Pant Size</Label>
            <Select value={pantSize} onValueChange={(v) => { if (v) setPantSize(v); }}>
              <SelectTrigger id="pant_size">
                <SelectValue placeholder="Select pant size" />
              </SelectTrigger>
              <SelectContent>
                {PANT_SHORT_SIZES.map(size => (
                  <SelectItem key={size} value={size}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="short_size">Short Size</Label>
            <Select value={shortSize} onValueChange={(v) => { if (v) setShortSize(v); }}>
              <SelectTrigger id="short_size">
                <SelectValue placeholder="Select short size" />
              </SelectTrigger>
              <SelectContent>
                {PANT_SHORT_SIZES.map(size => (
                  <SelectItem key={size} value={size}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 mt-1">Pant or Short — at least one is required.</p>
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
        </form>
      </DialogContent>
    </Dialog>
  );
}

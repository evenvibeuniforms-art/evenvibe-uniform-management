"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { alterationFormSchema, AlterationFormValues, ISSUE_TYPES } from "./schema";
import { submitAlteration, searchStudents } from "./actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Check, ChevronsUpDown, X } from "lucide-react";
import { toast } from "sonner";

type Student = {
  id: string;
  full_name?: string;
  name?: string;
  class_name: string;
  section: string;
  roll_number: string;
};

type DeliveredOrder = {
  id: string;
  order_number: string;
  status: string;
};

export function AlterationForm({ deliveredOrders: initialDeliveredOrders }: { deliveredOrders?: DeliveredOrder[] }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Student Combobox state
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [deliveredOrders, setDeliveredOrders] = useState<DeliveredOrder[]>(initialDeliveredOrders || []);
  const [hasDeliveredOrders, setHasDeliveredOrders] = useState<boolean>(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const form = useForm<AlterationFormValues>({
    resolver: zodResolver(alterationFormSchema),
    defaultValues: {
      studentId: "",
      orderId: "",
      uniformType: undefined,
      itemType: undefined,
      issueType: undefined,
      description: "",
    },
  });

  const selectedUniformType = form.watch("uniformType");

  // Fetch initial/searched students & check delivered orders status
  useEffect(() => {
    if (!comboboxOpen) return;

    const timer = setTimeout(async () => {
      setIsLoadingStudents(true);
      const res = await searchStudents(searchQuery);
      if (res.success) {
        setHasDeliveredOrders(res.hasDeliveredOrders ?? true);
        setStudents(res.students || []);
        if (res.deliveredOrders && res.deliveredOrders.length > 0) {
          setDeliveredOrders(res.deliveredOrders);
        }
      }
      setIsLoadingStudents(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, comboboxOpen]);

  // Initial load when combobox opens if empty
  const handleOpenCombobox = () => {
    setComboboxOpen(true);
    if (students.length === 0) {
      setIsLoadingStudents(true);
      searchStudents("").then((res) => {
        if (res.success) {
          setHasDeliveredOrders(res.hasDeliveredOrders ?? true);
          setStudents(res.students || []);
          if (res.deliveredOrders && res.deliveredOrders.length > 0) {
            setDeliveredOrders(res.deliveredOrders);
          }
        }
        setIsLoadingStudents(false);
      });
    }
  };

  const onSubmit = async (data: AlterationFormValues) => {
    setIsSubmitting(true);
    const result = await submitAlteration(data);
    setIsSubmitting(false);

    if (result.success) {
      toast.success("Request Created", {
        description: `Successfully created request ${result.request_number}`,
      });
      setOpen(false);
      setSelectedStudent(null);
      form.reset();
    } else {
      toast.error("Error", {
        description: result.error,
      });
    }
  };

  return (
    <>
      <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)}>Create Request</Button>
      <Dialog open={open} onOpenChange={(val) => {
        setOpen(val);
        if (!val) {
          setComboboxOpen(false);
        }
      }}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Alteration Request</DialogTitle>
            <DialogDescription>
              Report an issue with a student&apos;s uniform.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Searchable Student Combobox */}
              <FormField
                control={form.control}
                name="studentId"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Student</FormLabel>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={handleOpenCombobox}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm border rounded-md bg-background hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring text-left"
                      >
                        {selectedStudent ? (
                          <div className="truncate">
                            <span className="font-medium text-slate-900">{selectedStudent.full_name || selectedStudent.name}</span>
                            <span className="text-slate-500 text-xs ml-2">
                              Class {selectedStudent.class_name} • Section {selectedStudent.section} • Roll No: {selectedStudent.roll_number}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Search student...</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </button>

                      {comboboxOpen && (
                        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95">
                          <div className="flex items-center border-b px-3 py-2">
                            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                            <Input
                              placeholder="Search student by name, class, section, roll..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-8 text-sm"
                              autoFocus
                            />
                            {searchQuery && (
                              <button type="button" onClick={() => setSearchQuery("")}>
                                <X className="h-4 w-4 opacity-50 hover:opacity-100" />
                              </button>
                            )}
                          </div>

                          <div className="max-h-60 overflow-y-auto p-1 text-sm">
                            {isLoadingStudents ? (
                              <div className="flex items-center justify-center py-6 text-slate-500 text-xs gap-2">
                                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                                Searching students...
                              </div>
                            ) : !hasDeliveredOrders ? (
                              <div className="py-6 px-4 text-center">
                                <p className="text-slate-700 font-medium text-xs mb-1">
                                  No students are currently eligible for alteration.
                                </p>
                                <p className="text-slate-500 text-[11px]">
                                  Alteration requests can be created after the uniform order is delivered.
                                </p>
                              </div>
                            ) : students.length === 0 ? (
                              <div className="py-6 text-center text-slate-500 text-xs">
                                No students found matching &quot;{searchQuery}&quot;.
                              </div>
                            ) : (
                              students.map((student) => {
                                const isSelected = field.value === student.id;
                                const studentName = student.full_name || student.name || "Unnamed";
                                return (
                                  <div
                                    key={student.id}
                                    onClick={() => {
                                      field.onChange(student.id);
                                      setSelectedStudent(student);
                                      setComboboxOpen(false);

                                      // Auto-select single delivered order if present
                                      if (deliveredOrders.length === 1) {
                                        form.setValue("orderId", deliveredOrders[0].id);
                                      }
                                    }}
                                    className={`flex items-center justify-between px-3 py-2 rounded-sm cursor-pointer hover:bg-slate-100 text-slate-900 ${
                                      isSelected ? "bg-emerald-50 text-emerald-900 font-medium" : ""
                                    }`}
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium">{studentName}</span>
                                      <span className="text-xs text-slate-500">
                                        Class {student.class_name} • Section {student.section} • Roll No: {student.roll_number}
                                      </span>
                                    </div>
                                    {isSelected && <Check className="h-4 w-4 text-emerald-600" />}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="uniformType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Uniform Type</FormLabel>
                      <Select onValueChange={(val: "regular" | "tshirt" | null) => {
                        if (!val) return;
                        field.onChange(val);
                        // Reset item if incompatible
                        const currItem = form.getValues("itemType");
                        if (val === "regular" && currItem === "tshirt") form.setValue("itemType", undefined as unknown as typeof currItem);
                        if (val === "tshirt" && currItem === "shirt") form.setValue("itemType", undefined as unknown as typeof currItem);
                      }} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select uniform" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="regular">Regular</SelectItem>
                          <SelectItem value="tshirt">T-Shirt</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="itemType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""} disabled={!selectedUniformType}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select item" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {selectedUniformType !== "tshirt" && <SelectItem value="shirt">Shirt</SelectItem>}
                          {selectedUniformType !== "regular" && <SelectItem value="tshirt">T-Shirt</SelectItem>}
                          <SelectItem value="pant">Pant</SelectItem>
                          <SelectItem value="short">Short</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="issueType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Issue Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select issue type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ISSUE_TYPES.map(issue => (
                          <SelectItem key={issue} value={issue}>
                            {issue.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="orderId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Related Order (Optional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an order if applicable" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">None / Not specific to an order</SelectItem>
                        {deliveredOrders.map(o => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.order_number} — Delivered
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Describe the alteration or rework issue..." className="resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="pt-2">
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

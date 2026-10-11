"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { UniformStyleWithDetails } from "@/types/database";
import { STANDARD_CLASSES } from "@/lib/constants/classes";
import {
  createUniformStyle,
  updateUniformStyle,
  toggleStyleStatus,
  deleteUniformStyle,
} from "./actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Shirt,
  Plus,
  Search,
  Eye,
  Edit2,
  Trash2,
  Power,
  UploadCloud,
  X,
  Download,
  Image as ImageIcon,
  Building2,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Palette,
} from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { ColorManagementDialog } from "@/components/admin/uniform-designs/ColorManagementDialog";

export interface SelectedSchool {
  id: string;
  name: string;
  school_code?: string;
  city?: string | null;
  state?: string | null;
  is_active?: boolean;
}

interface UniformDesignsClientProps {
  selectedSchool: SelectedSchool;
  initialStyles: UniformStyleWithDetails[];
  initialConfiguredItems?: string[];
}

function groupColorsByClass(colors?: UniformStyleWithDetails["colors"]) {
  if (!colors || colors.length === 0) return {};
  const map: Record<string, string[]> = {};
  colors.forEach((c) => {
    if (!map[c.class_name]) map[c.class_name] = [];
    if (!map[c.class_name].includes(c.color_name)) {
      map[c.class_name].push(c.color_name);
    }
  });
  return map;
}

export default function UniformDesignsClient({
  selectedSchool,
  initialStyles,
  initialConfiguredItems = [],
}: UniformDesignsClientProps) {
  const [styles, setStyles] = useState<UniformStyleWithDetails[]>(initialStyles);
  const [isPending, startTransition] = useTransition();

  // Filters (strictly scoped to selectedSchool)
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all");
  const [selectedItemFilter, setSelectedItemFilter] = useState<string>("all");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Create Modal State - school is determined by selectedSchool (Colors removed per requirement)
  const [createOpen, setCreateOpen] = useState(false);
  const createSchoolId = selectedSchool.id;
  const [createStyleName, setCreateStyleName] = useState<string>("");
  const [createItemName, setCreateItemName] = useState<string>(
    initialConfiguredItems[0] || ""
  );
  const [createCustomItem, setCreateCustomItem] = useState<string>("");
  const [createGender, setCreateGender] = useState<"All" | "Male" | "Female">("All");
  const [createFromClass, setCreateFromClass] = useState<string>("");
  const [createToClass, setCreateToClass] = useState<string>("");
  const [createSelectedClasses, setCreateSelectedClasses] = useState<string[]>([]);
  const [createIsRequired, setCreateIsRequired] = useState<boolean>(true);
  const [createImageFiles, setCreateImageFiles] = useState<File[]>([]);
  const [createImagePreviews, setCreateImagePreviews] = useState<string[]>([]);
  const configuredItems = initialConfiguredItems;

  // Edit Modal State (Colors removed per requirement)
  const [editOpen, setEditOpen] = useState(false);
  const [editingStyle, setEditingStyle] = useState<UniformStyleWithDetails | null>(null);
  const [editStyleName, setEditStyleName] = useState<string>("");
  const [editGender, setEditGender] = useState<"All" | "Male" | "Female">("All");
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
  const [editFromClass, setEditFromClass] = useState<string>("");
  const [editToClass, setEditToClass] = useState<string>("");
  const [editSelectedClasses, setEditSelectedClasses] = useState<string[]>([]);
  const [editIsRequired, setEditIsRequired] = useState<boolean>(true);
  const [editRemoveImageIds, setEditRemoveImageIds] = useState<string[]>([]);
  const [editNewImageFiles, setEditNewImageFiles] = useState<File[]>([]);
  const [editNewImagePreviews, setEditNewImagePreviews] = useState<string[]>([]);

  // Dedicated Color Management Dialog State
  const [colorModalOpen, setColorModalOpen] = useState<boolean>(false);
  const [colorModalStyleId, setColorModalStyleId] = useState<string | null>(null);

  // View Modal State (Gallery)
  const [viewOpen, setViewOpen] = useState(false);
  const [viewingStyle, setViewingStyle] = useState<UniformStyleWithDetails | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);

  // Sync state if initialStyles changes
  const [prevInitialStyles, setPrevInitialStyles] = useState(initialStyles);
  if (initialStyles !== prevInitialStyles) {
    setPrevInitialStyles(initialStyles);
    setStyles(initialStyles);
  }

  // Helper to resolve range from FromClass to ToClass
  const handleRangeChange = (from: string, to: string, isEditMode = false) => {
    if (!from || !to) return;
    const fromIdx = STANDARD_CLASSES.indexOf(from);
    const toIdx = STANDARD_CLASSES.indexOf(to);
    if (fromIdx === -1 || toIdx === -1) return;

    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);
    const resolved = STANDARD_CLASSES.slice(start, end + 1);

    if (isEditMode) {
      setEditSelectedClasses(resolved);
    } else {
      setCreateSelectedClasses(resolved);
    }
  };

  // Handle class checkbox toggle
  const toggleClass = (cls: string, isEditMode = false) => {
    if (isEditMode) {
      setEditSelectedClasses((prev) =>
        prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]
      );
    } else {
      setCreateSelectedClasses((prev) =>
        prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]
      );
    }
  };

  // Handle image files selection for Create
  // Handle image files selection for Create
  const handleCreateImagesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const validFiles: File[] = [];

    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`"${f.name}" exceeds the 5MB size limit.`);
      } else {
        validFiles.push(f);
      }
    }

    if (validFiles.length === 0) return;

    setCreateImageFiles((prev) => [...prev, ...validFiles]);
    const newPreviews = validFiles.map((f) => URL.createObjectURL(f));
    setCreateImagePreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeCreateImage = (index: number) => {
    setCreateImageFiles((prev) => prev.filter((_, i) => i !== index));
    setCreateImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Handle image files selection for Edit
  const handleEditNewImagesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const validFiles: File[] = [];

    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`"${f.name}" exceeds the 5MB size limit.`);
      } else {
        validFiles.push(f);
      }
    }

    if (validFiles.length === 0) return;

    setEditNewImageFiles((prev) => [...prev, ...validFiles]);
    const newPreviews = validFiles.map((f) => URL.createObjectURL(f));
    setEditNewImagePreviews((prev) => [...prev, ...newPreviews]);
  };

  const removeEditNewImage = (index: number) => {
    setEditNewImageFiles((prev) => prev.filter((_, i) => i !== index));
    setEditNewImagePreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const toggleRemoveExistingImage = (imageId: string) => {
    setEditRemoveImageIds((prev) =>
      prev.includes(imageId) ? prev.filter((id) => id !== imageId) : [...prev, imageId]
    );
  };

  // Unique item names for filter bar
  const uniqueItemOptions = useMemo(() => {
    const set = new Set<string>();
    styles.forEach((s) => set.add(s.item_name));
    return Array.from(set).sort();
  }, [styles]);

  // Filtered styles (strictly for selectedSchool)
  const filteredStyles = useMemo(() => {
    return styles.filter((s) => {
      if (s.school_id !== selectedSchool.id) return false;
      if (selectedClassFilter !== "all" && !s.classes.includes(selectedClassFilter)) return false;
      if (selectedItemFilter !== "all" && s.item_name.toLowerCase() !== selectedItemFilter.toLowerCase()) return false;
      if (selectedStatusFilter === "active" && !s.is_active) return false;
      if (selectedStatusFilter === "inactive" && s.is_active) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.style_name.toLowerCase().includes(q);
        const matchesItem = s.item_name.toLowerCase().includes(q);
        if (!matchesName && !matchesItem) return false;
      }
      return true;
    });
  }, [
    styles,
    selectedSchool.id,
    selectedClassFilter,
    selectedItemFilter,
    selectedStatusFilter,
    searchQuery,
  ]);

  // Submit Create Style
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalItem = createItemName === "__custom__" ? createCustomItem.trim() : createItemName.trim();

    if (!createSchoolId) {
      toast.error("Please select a school.");
      return;
    }
    if (!createStyleName.trim()) {
      toast.error("Please enter a style name.");
      return;
    }
    if (!finalItem) {
      toast.error("Please specify an item name.");
      return;
    }
    if (createSelectedClasses.length === 0) {
      toast.error("Please select at least one applicable class.");
      return;
    }
    const totalImagesSize = createImageFiles.reduce((acc, f) => acc + f.size, 0);
    if (totalImagesSize > 20 * 1024 * 1024) {
      toast.error("Total images size exceeds 20MB. Please select fewer or smaller images.");
      return;
    }

    const formData = new FormData();
    formData.append("school_id", createSchoolId);
    formData.append("style_name", createStyleName.trim());
    formData.append("item_name", finalItem);
    formData.append("gender", createGender);
    formData.append("classes", JSON.stringify(createSelectedClasses));
    formData.append("available_sizes", JSON.stringify([]));
    formData.append("is_required", String(createIsRequired));
    
    createImageFiles.forEach((f) => formData.append("images", f));

    startTransition(async () => {
      const res = await createUniformStyle(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Style "${createStyleName.trim()}" created successfully.`);
        setCreateOpen(false);
        // Reset create form
        setCreateStyleName("");
        setCreateItemName("");
        setCreateCustomItem("");
        setCreateSelectedClasses([]);
        setCreateFromClass("");
        setCreateToClass("");
        setCreateIsRequired(true);
        setCreateImageFiles([]);
        setCreateImagePreviews([]);
      }
    });
  };

  // Open Edit Modal
  const openEditModal = (style: UniformStyleWithDetails) => {
    setEditingStyle(style);
    setEditStyleName(style.style_name);
    setEditGender(style.gender || "All");
    setEditIsActive(style.is_active);
    setEditSelectedClasses([...style.classes]);
    setEditFromClass(style.classes[0] || "");
    setEditToClass(style.classes[style.classes.length - 1] || "");
    setEditIsRequired(style.is_required ?? true);
    setEditRemoveImageIds([]);
    setEditNewImageFiles([]);
    setEditNewImagePreviews([]);
    setEditOpen(true);
  };

  // Submit Edit Style
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStyle) return;

    if (!editStyleName.trim()) {
      toast.error("Style name cannot be blank.");
      return;
    }
    if (editSelectedClasses.length === 0) {
      toast.error("Please select at least one class.");
      return;
    }

    const totalNewImagesSize = editNewImageFiles.reduce((acc, f) => acc + f.size, 0);
    if (totalNewImagesSize > 20 * 1024 * 1024) {
      toast.error("Total new images size exceeds 20MB. Please select fewer or smaller images.");
      return;
    }

    const formData = new FormData();
    formData.append("style_name", editStyleName.trim());
    formData.append("gender", editGender);
    formData.append("is_active", String(editIsActive));
    formData.append("classes", JSON.stringify(editSelectedClasses));
    formData.append("available_sizes", JSON.stringify(editingStyle.available_sizes || []));
    formData.append("is_required", String(editIsRequired));
    formData.append("remove_image_ids", JSON.stringify(editRemoveImageIds));

    editNewImageFiles.forEach((f) => formData.append("new_images", f));

    startTransition(async () => {
      const res = await updateUniformStyle(editingStyle.id, formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Style updated successfully.`);
        setEditOpen(false);
        setEditingStyle(null);
      }
    });
  };

  // Toggle active status
  const handleToggleStatus = (style: UniformStyleWithDetails) => {
    const nextState = !style.is_active;
    startTransition(async () => {
      const res = await toggleStyleStatus(style.id, nextState);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(
          `Style "${style.style_name}" is now ${nextState ? "active" : "deactivated"}.`
        );
      }
    });
  };

  // Delete Style
  const handleDelete = (style: UniformStyleWithDetails) => {
    if (!confirm(`Are you sure you want to delete style "${style.style_name}"?`)) return;

    startTransition(async () => {
      const res = await deleteUniformStyle(style.id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`Style "${style.style_name}" was deleted successfully.`);
      }
    });
  };

  // Open View Gallery Modal
  const openViewModal = (style: UniformStyleWithDetails) => {
    setViewingStyle(style);
    setActiveImageIndex(0);
    setViewOpen(true);
  };

  // Format Class Range display string (e.g. "Class 6 – Class 9" or "Class 1, Class 2")
  const formatClassDisplay = (classes: string[]) => {
    if (classes.length === 0) return "No classes assigned";
    if (classes.length === 1) return classes[0];

    const sorted = [...classes].sort((a, b) => {
      const idxA = STANDARD_CLASSES.indexOf(a);
      const idxB = STANDARD_CLASSES.indexOf(b);
      return idxA - idxB;
    });

    const isContiguous = sorted.every((cls, i) => {
      if (i === 0) return true;
      const prevIdx = STANDARD_CLASSES.indexOf(sorted[i - 1]);
      const currIdx = STANDARD_CLASSES.indexOf(cls);
      return currIdx === prevIdx + 1;
    });

    if (isContiguous && sorted.length > 2) {
      return `${sorted[0]} – ${sorted[sorted.length - 1]}`;
    }
    return sorted.join(", ");
  };

  return (
    <div className="space-y-6">
      {/* Back to Schools link */}
      <div>
        <Link
          href="/admin/uniform-designs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700 transition-colors group mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
          Back to Schools
        </Link>

        {/* Header section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-evenvibe-light border border-emerald-100 flex items-center justify-center text-evenvibe-primary flex-shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  {selectedSchool.name}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Uniform Designs · Manage styles, class assignments, size ranges, and design specs
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white flex items-center gap-2 shadow-sm font-semibold text-xs sm:text-sm"
            >
              <Plus className="h-4 w-4" />
              Create Uniform Design
            </Button>
            <Button
              onClick={() => {
                setColorModalStyleId(null);
                setColorModalOpen(true);
              }}
              variant="outline"
              className="border-evenvibe-primary text-evenvibe-deep hover:bg-emerald-50 flex items-center gap-2 shadow-sm font-semibold text-xs sm:text-sm bg-white"
            >
              <Palette className="h-4 w-4 text-evenvibe-primary" />
              Create Color
            </Button>
          </div>
        </div>
      </div>

      {/* Filter Bar (Scoped to this school) */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search style name or item..."
                className="pl-9 bg-slate-50 border-slate-200"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Item Filter */}
            <Select value={selectedItemFilter} onValueChange={(v) => setSelectedItemFilter(v || "all")}>
              <SelectTrigger className="w-full md:w-[160px] bg-slate-50 border-slate-200">
                <SelectValue placeholder="All Items" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                {uniqueItemOptions.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Class Filter */}
            <Select value={selectedClassFilter} onValueChange={(v) => setSelectedClassFilter(v || "all")}>
              <SelectTrigger className="w-full md:w-[150px] bg-slate-50 border-slate-200">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Classes</SelectItem>
                {STANDARD_CLASSES.map((cls) => (
                  <SelectItem key={cls} value={cls}>
                    {cls}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={selectedStatusFilter} onValueChange={(v) => setSelectedStatusFilter(v || "all")}>
              <SelectTrigger className="w-full md:w-[140px] bg-slate-50 border-slate-200">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Styles Grid */}
      {filteredStyles.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 bg-white">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
            <Shirt className="h-12 w-12 text-slate-300 mb-3" />
            <p className="text-lg font-bold text-slate-900">
              {styles.length === 0
                ? "No uniform designs configured for this school."
                : "No uniform styles match your filter criteria."}
            </p>
            <p className="text-sm mt-1 max-w-md text-slate-500">
              {styles.length === 0
                ? `Click the button below to configure the first uniform style for ${selectedSchool.name}.`
                : "Try adjusting or clearing the search and filters above."}
            </p>
            {styles.length === 0 && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="mt-5 bg-evenvibe-primary hover:bg-evenvibe-deep text-white flex items-center gap-2 shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Create Uniform Design
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStyles.map((style) => {
            const firstImage = style.images[0]?.signed_url;
            const imagesCount = style.images.length;

            return (
              <Card
                key={style.id}
                className={`overflow-hidden border bg-white shadow-sm transition-all hover:shadow-md ${
                  style.is_active ? "border-slate-200" : "border-slate-200 bg-slate-50/50 opacity-80"
                }`}
              >
                {/* Image Preview Banner */}
                <div
                  onClick={() => openViewModal(style)}
                  className="relative h-48 w-full bg-slate-100 cursor-pointer overflow-hidden group flex items-center justify-center border-b border-slate-100"
                >
                  {firstImage ? (
                    <Image
                      src={firstImage}
                      alt={style.style_name}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      className="object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <ImageIcon className="h-10 w-10 stroke-1 mb-1" />
                      <span className="text-xs">No images uploaded</span>
                    </div>
                  )}

                  {/* Multi-Image Badge */}
                  <div className="absolute bottom-2 right-2 bg-slate-900/80 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1 shadow">
                    <ImageIcon className="h-3 w-3" />
                    <span>{imagesCount} {imagesCount === 1 ? "Image" : "Images"}</span>
                  </div>

                  {/* Status Overlay Badge */}
                  <div className="absolute top-2 left-2">
                    {style.is_active ? (
                      <Badge className="bg-evenvibe-primary text-white font-medium hover:bg-emerald-600 border-none shadow-sm">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-slate-200 text-slate-700 font-medium">
                        Inactive
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Content Details */}
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg leading-tight">
                        {style.style_name}
                      </h3>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3 w-3 text-slate-400" />
                        {style.schools?.name || "School"}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="font-semibold text-evenvibe-deep border-emerald-300 bg-evenvibe-light">
                        {style.item_name}
                      </Badge>
                      {style.gender && style.gender !== "All" && (
                        <span className="text-[11px] text-slate-500 font-medium">{style.gender}</span>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-1 space-y-3">
                  {/* Applicable Classes */}
                  <div className="rounded-md bg-slate-50 border border-slate-200/80 p-2.5 text-xs">
                    <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider mb-1">
                      Applicable Classes:
                    </span>
                    <p className="font-semibold text-slate-800">
                      {formatClassDisplay(style.classes)}
                    </p>
                  </div>

                  {/* Configured Colors Summary */}
                  <div className="rounded-md bg-slate-50 border border-slate-200/80 p-2.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium uppercase tracking-wider flex items-center gap-1">
                        <Palette className="h-3 w-3 text-evenvibe-primary" /> Colors:
                      </span>
                      {style.colors && style.colors.length > 0 && (
                        <span className="text-slate-400 text-[10px]">
                          {Object.keys(groupColorsByClass(style.colors)).length} class(es)
                        </span>
                      )}
                    </div>
                    {style.colors && style.colors.length > 0 ? (
                      <div className="space-y-1 pt-0.5 max-h-24 overflow-y-auto pr-1">
                        {Object.entries(groupColorsByClass(style.colors)).map(([cls, colList]) => (
                          <div key={cls} className="text-[11px] leading-relaxed flex items-start gap-1">
                            <span className="font-semibold text-slate-700 shrink-0">{cls}:</span>
                            <span className="text-slate-600">{colList.join(", ")}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">No colors configured</p>
                    )}
                  </div>

                  {/* Requirement Status */}
                  <div className="flex items-center justify-between rounded-md bg-slate-50 border border-slate-200/80 px-3 py-2 text-xs">
                    <span className="text-slate-500 text-[11px] font-medium uppercase tracking-wider">
                      Requirement:
                    </span>
                    <Badge
                      variant="secondary"
                      className={
                        style.is_required
                          ? "bg-emerald-100 text-emerald-800 text-[10px] font-semibold"
                          : "bg-slate-200 text-slate-700 text-[10px] font-medium"
                      }
                    >
                      {style.is_required ? "Required" : "Optional"}
                    </Badge>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openViewModal(style)}
                      className="text-xs text-slate-600 hover:text-slate-900 px-2"
                      title="View Gallery"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1 text-slate-400" />
                      View
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(style)}
                      className="text-xs text-slate-600 hover:text-slate-900 px-2"
                      title="Edit Style"
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1 text-slate-400" />
                      Edit
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setColorModalStyleId(style.id);
                        setColorModalOpen(true);
                      }}
                      className="text-xs text-evenvibe-deep hover:text-emerald-800 hover:bg-emerald-50 px-2 font-medium"
                      title="Manage Colors"
                    >
                      <Palette className="h-3.5 w-3.5 mr-1 text-evenvibe-primary" />
                      Manage Colors
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleStatus(style)}
                      disabled={isPending}
                      className={`text-xs px-2 ${
                        style.is_active
                          ? "text-status-warning hover:text-amber-700 hover:bg-amber-50"
                          : "text-evenvibe-primary hover:text-emerald-700 hover:bg-emerald-50"
                      }`}
                      title={style.is_active ? "Deactivate Style" : "Activate Style"}
                    >
                      <Power className="h-3.5 w-3.5 mr-1" />
                      {style.is_active ? "Deactivate" : "Activate"}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(style)}
                      disabled={isPending}
                      className="text-xs text-status-error hover:text-red-700 hover:bg-red-50 px-2"
                      title="Delete Style"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* CREATE STYLE DIALOG                                                       */}
      {/* ========================================================================= */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Shirt className="h-5 w-5 text-evenvibe-primary" />
              Create Uniform Style
            </DialogTitle>
            <DialogDescription>
              Define a new uniform style design and map it to uniform items and applicable classes.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
            {/* Selected School (Read-Only Context) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-slate-600">
                School
              </Label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800">
                <Building2 className="h-4 w-4 text-evenvibe-primary flex-shrink-0" />
                <span>{selectedSchool.name}</span>
              </div>
            </div>

            {/* Style Name & Item Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="create-style-name" className="text-xs font-semibold uppercase text-slate-600">
                  Style Name <span className="text-status-error">*</span>
                </Label>
                <Input
                  id="create-style-name"
                  placeholder="e.g. Style 1, Summer Shirt"
                  value={createStyleName}
                  onChange={(e) => setCreateStyleName(e.target.value)}
                  required
                />
                <span className="text-[11px] text-slate-400">Admin defined design identifier</span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="create-item-name" className="text-xs font-semibold uppercase text-slate-600">
                  Item Type <span className="text-status-error">*</span>
                </Label>
                <Select
                  value={createItemName}
                  onValueChange={(v) => { if (v) setCreateItemName(v); }}
                  disabled={!createSchoolId}
                >
                  <SelectTrigger id="create-item-name">
                    <SelectValue
                      placeholder={
                        configuredItems.length > 0
                          ? "Select uniform item"
                          : "Select or type item"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {configuredItems.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">+ Custom Item Name</SelectItem>
                  </SelectContent>
                </Select>

                {createItemName === "__custom__" && (
                  <Input
                    placeholder="Enter custom item name (e.g. Blazer, Tie)"
                    value={createCustomItem}
                    onChange={(e) => setCreateCustomItem(e.target.value)}
                    className="mt-2"
                    required
                  />
                )}
              </div>
            </div>

            {/* Gender Scope */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase text-slate-600">Gender Applicability</Label>
              <div className="flex gap-4">
                {(["All", "Male", "Female"] as const).map((g) => (
                  <label key={g} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="create-gender"
                      value={g}
                      checked={createGender === g}
                      onChange={() => setCreateGender(g)}
                      className="accent-emerald-600"
                    />
                    <span>{g === "All" ? "All (Unisex / Both)" : g}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Class Range Picker */}
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase text-slate-700">
                  Applicable Classes <span className="text-status-error">*</span>
                </Label>
                <span className="text-xs text-slate-500">
                  Selected: {createSelectedClasses.length} {createSelectedClasses.length === 1 ? "class" : "classes"}
                </span>
              </div>

              {/* Range helpers: From Class -> To Class */}
              <div className="flex flex-col sm:flex-row gap-2 items-center bg-white p-2.5 rounded-md border border-slate-200">
                <span className="text-xs font-medium text-slate-600">Quick Range:</span>
                <div className="flex items-center gap-2 flex-1 w-full">
                  <Select
                    value={createFromClass}
                    onValueChange={(val) => {
                      if (val) {
                        setCreateFromClass(val);
                        if (createToClass) handleRangeChange(val, createToClass, false);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="From Class" />
                    </SelectTrigger>
                    <SelectContent>
                      {STANDARD_CLASSES.map((c) => (
                        <SelectItem key={c} value={c} className="text-xs">
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <span className="text-xs text-slate-400">to</span>

                  <Select
                    value={createToClass}
                    onValueChange={(val) => {
                      if (val) {
                        setCreateToClass(val);
                        if (createFromClass) handleRangeChange(createFromClass, val, false);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="To Class" />
                    </SelectTrigger>
                    <SelectContent>
                      {STANDARD_CLASSES.map((c) => (
                        <SelectItem key={c} value={c} className="text-xs">
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Individual Class Checkboxes */}
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-1.5 pt-1">
                {STANDARD_CLASSES.map((cls) => {
                  const isSelected = createSelectedClasses.includes(cls);
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => toggleClass(cls, false)}
                      className={`text-xs py-1.5 px-2 rounded border font-medium transition-colors text-center ${
                        isSelected
                          ? "bg-evenvibe-primary text-white border-evenvibe-primary shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {cls}
                    </button>
                  );
                })}
              </div>
            </div>


            {/* Required / Optional Item */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
              <Label className="text-xs font-bold uppercase text-slate-700">
                Item Requirement <span className="text-status-error">*</span>
              </Label>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="create-is-required"
                    checked={createIsRequired}
                    onChange={() => setCreateIsRequired(true)}
                    className="accent-emerald-600"
                  />
                  <div>
                    <span className="font-semibold text-slate-900">Required</span>
                    <span className="text-xs text-slate-500 block">Students must enter a size during size collection.</span>
                  </div>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="create-is-required"
                    checked={!createIsRequired}
                    onChange={() => setCreateIsRequired(false)}
                    className="accent-emerald-600"
                  />
                  <div>
                    <span className="font-semibold text-slate-900">Optional</span>
                    <span className="text-xs text-slate-500 block">Students may leave this item empty or opt out.</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Multiple Images Upload */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-slate-600 flex items-center justify-between">
                <span>Style Design Images</span>
                <span className="text-slate-400 font-normal">Any number of images (front, back, details)</span>
              </Label>

              <div className="border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-emerald-500 transition-colors bg-white">
                <input
                  type="file"
                  id="create-images-input"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleCreateImagesSelect}
                  className="hidden"
                />
                <label
                  htmlFor="create-images-input"
                  className="cursor-pointer flex flex-col items-center justify-center gap-1 text-slate-600 hover:text-emerald-600"
                >
                  <UploadCloud className="h-8 w-8 text-slate-400" />
                  <span className="text-sm font-medium">Click to browse or drag images here</span>
                  <span className="text-xs text-slate-400">Supports JPG, PNG, WEBP up to 5MB each</span>
                </label>
              </div>

              {/* Image Previews */}
              {createImagePreviews.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {createImagePreviews.map((previewUrl, idx) => (
                    <div
                      key={idx}
                      className="relative h-20 w-20 rounded-md border border-slate-200 overflow-hidden bg-slate-50 group"
                    >
                      <Image
                        src={previewUrl}
                        alt={`Preview ${idx + 1}`}
                        fill
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeCreateImage(idx)}
                        className="absolute top-1 right-1 bg-status-error text-white p-0.5 rounded-full opacity-80 hover:opacity-100 shadow"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Uniform Style
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* EDIT STYLE DIALOG                                                         */}
      {/* ========================================================================= */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-evenvibe-primary" />
              Edit Uniform Style
            </DialogTitle>
            <DialogDescription>
              Modify style name, applicable classes, active status, or add/remove images.
            </DialogDescription>
          </DialogHeader>

          {editingStyle && (
            <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
              {/* School (Read-Only Context) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-slate-600">
                  School
                </Label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800">
                  <Building2 className="h-4 w-4 text-evenvibe-primary flex-shrink-0" />
                  <span>{editingStyle.schools?.name || selectedSchool.name}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-style-name" className="text-xs font-semibold uppercase text-slate-600">
                    Style Name <span className="text-status-error">*</span>
                  </Label>
                  <Input
                    id="edit-style-name"
                    value={editStyleName}
                    onChange={(e) => setEditStyleName(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="item_name" className="text-xs font-semibold uppercase text-slate-600">Item Type (Immutable)</Label>
                  <Input id="item_name" name="item_name" value={editingStyle.item_name} disabled className="bg-slate-100 text-slate-600" />
                </div>
              </div>

              {/* Gender & Active Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase text-slate-600">Gender Applicability</Label>
                  <div className="flex gap-4">
                    {(["All", "Male", "Female"] as const).map((g) => (
                      <label key={g} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="edit-gender"
                          value={g}
                          checked={editGender === g}
                          onChange={() => setEditGender(g)}
                          className="accent-emerald-600"
                        />
                        <span>{g === "All" ? "All (Unisex)" : g}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase text-slate-600">Active Status</Label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editIsActive}
                        onChange={(e) => setEditIsActive(e.target.checked)}
                        className="h-4 w-4 rounded accent-emerald-600"
                      />
                      <span>Active for Size Collection</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Class Range Picker */}
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase text-slate-700">
                    Applicable Classes <span className="text-status-error">*</span>
                  </Label>
                  <span className="text-xs text-slate-500">
                    Selected: {editSelectedClasses.length} {editSelectedClasses.length === 1 ? "class" : "classes"}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 items-center bg-white p-2.5 rounded-md border border-slate-200">
                  <span className="text-xs font-medium text-slate-600">Quick Range:</span>
                  <div className="flex items-center gap-2 flex-1 w-full">
                    <Select
                      value={editFromClass}
                      onValueChange={(val) => {
                        if (val) {
                          setEditFromClass(val);
                          if (editToClass) handleRangeChange(val, editToClass, true);
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="From Class" />
                      </SelectTrigger>
                      <SelectContent>
                        {STANDARD_CLASSES.map((c) => (
                          <SelectItem key={c} value={c} className="text-xs">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <span className="text-xs text-slate-400">to</span>

                    <Select
                      value={editToClass}
                      onValueChange={(val) => {
                        if (val) {
                          setEditToClass(val);
                          if (editFromClass) handleRangeChange(editFromClass, val, true);
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="To Class" />
                      </SelectTrigger>
                      <SelectContent>
                        {STANDARD_CLASSES.map((c) => (
                          <SelectItem key={c} value={c} className="text-xs">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-1.5 pt-1">
                  {STANDARD_CLASSES.map((cls) => {
                    const isSelected = editSelectedClasses.includes(cls);
                    return (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => toggleClass(cls, true)}
                        className={`text-xs py-1.5 px-2 rounded border font-medium transition-colors text-center ${
                          isSelected
                            ? "bg-evenvibe-primary text-white border-evenvibe-primary shadow-xs"
                            : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {cls}
                      </button>
                    );
                  })}
                </div>
              </div>


              {/* Required / Optional Item */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-700">
                  Item Requirement <span className="text-status-error">*</span>
                </Label>
                <div className="flex flex-wrap gap-6">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="edit-is-required"
                      checked={editIsRequired}
                      onChange={() => setEditIsRequired(true)}
                      className="accent-emerald-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-900">Required</span>
                      <span className="text-xs text-slate-500 block">Students must enter a size during size collection.</span>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="edit-is-required"
                      checked={!editIsRequired}
                      onChange={() => setEditIsRequired(false)}
                      className="accent-emerald-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-900">Optional</span>
                      <span className="text-xs text-slate-500 block">Students may leave this item empty or opt out.</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Manage Existing Images */}
              {editingStyle.images.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase text-slate-600">Existing Images</Label>
                  <div className="flex flex-wrap gap-2.5">
                    {editingStyle.images.map((img) => {
                      const isMarkedForRemoval = editRemoveImageIds.includes(img.id);
                      return (
                        <div
                          key={img.id}
                          className={`relative h-20 w-20 rounded-md border overflow-hidden bg-slate-100 transition-all ${
                            isMarkedForRemoval ? "opacity-40 ring-2 ring-status-error" : "border-slate-200"
                          }`}
                        >
                          {img.signed_url && (
                            <Image
                              src={img.signed_url}
                              alt="Style Image"
                              fill
                              className="object-cover"
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => toggleRemoveExistingImage(img.id)}
                            className={`absolute top-1 right-1 p-0.5 rounded-full text-white shadow ${
                              isMarkedForRemoval ? "bg-slate-700" : "bg-status-error hover:bg-red-700"
                            }`}
                            title={isMarkedForRemoval ? "Undo Remove" : "Remove Image"}
                          >
                            <X className="h-3 w-3" />
                          </button>
                          {isMarkedForRemoval && (
                            <div className="absolute inset-0 bg-red-900/30 flex items-center justify-center text-[10px] text-white font-bold">
                              REMOVED
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add More Images */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-slate-600">Add New Images</Label>
                <div className="border border-dashed border-slate-200 rounded-lg p-3 text-center bg-white">
                  <input
                    type="file"
                    id="edit-new-images-input"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleEditNewImagesSelect}
                    className="hidden"
                  />
                  <label
                    htmlFor="edit-new-images-input"
                    className="cursor-pointer text-xs font-medium text-evenvibe-primary hover:text-emerald-700 flex items-center justify-center gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    Browse & Add Images
                  </label>
                </div>

                {editNewImagePreviews.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {editNewImagePreviews.map((previewUrl, idx) => (
                      <div
                        key={idx}
                        className="relative h-16 w-16 rounded-md border border-slate-200 overflow-hidden group"
                      >
                        <Image
                          src={previewUrl}
                          alt={`New preview ${idx + 1}`}
                          fill
                          className="object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeEditNewImage(idx)}
                          className="absolute top-1 right-1 bg-status-error text-white p-0.5 rounded-full"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white"
                >
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* VIEW GALLERY MODAL                                                        */}
      {/* ========================================================================= */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-6">
          {viewingStyle && (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b pb-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{viewingStyle.style_name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {viewingStyle.schools?.name} • Item: <span className="font-semibold text-slate-800">{viewingStyle.item_name}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-medium text-evenvibe-deep bg-evenvibe-light border-emerald-200">
                    {viewingStyle.classes.length} Classes ({formatClassDisplay(viewingStyle.classes)})
                  </Badge>
                  {viewingStyle.is_active ? (
                    <Badge className="bg-evenvibe-primary text-white">Active</Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </div>
              </div>

              {/* Main Image Display */}
              {viewingStyle.images.length > 0 ? (
                <div className="space-y-3">
                  <div className="relative h-80 sm:h-96 w-full rounded-lg bg-slate-900/5 border border-slate-200 overflow-hidden flex items-center justify-center">
                    {viewingStyle.images[activeImageIndex]?.signed_url ? (
                      <Image
                        src={viewingStyle.images[activeImageIndex].signed_url!}
                        alt={`${viewingStyle.style_name} view`}
                        fill
                        className="object-contain p-2"
                      />
                    ) : (
                      <span className="text-slate-400 text-sm">Image preview unavailable</span>
                    )}

                    {/* Left/Right Navigation Arrows */}
                    {viewingStyle.images.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveImageIndex((prev) =>
                              prev > 0 ? prev - 1 : viewingStyle.images.length - 1
                            )
                          }
                          className="absolute left-2 bg-slate-900/70 hover:bg-slate-900 text-white p-1.5 rounded-full shadow transition-colors"
                        >
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveImageIndex((prev) =>
                              prev < viewingStyle.images.length - 1 ? prev + 1 : 0
                            )
                          }
                          className="absolute right-2 bg-slate-900/70 hover:bg-slate-900 text-white p-1.5 rounded-full shadow transition-colors"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </>
                    )}

                    {/* Download Button */}
                    {viewingStyle.images[activeImageIndex]?.signed_url && (
                      <a
                        href={viewingStyle.images[activeImageIndex].signed_url!}
                        download={viewingStyle.images[activeImageIndex].original_filename || "uniform-style-image.jpg"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute bottom-2 right-2 bg-slate-900/80 hover:bg-slate-900 text-white text-xs px-2.5 py-1.5 rounded-md flex items-center gap-1.5 shadow"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </a>
                    )}
                  </div>

                  {/* Thumbnail Row */}
                  {viewingStyle.images.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {viewingStyle.images.map((img, idx) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => setActiveImageIndex(idx)}
                          className={`relative h-16 w-16 shrink-0 rounded-md overflow-hidden border-2 transition-all ${
                            activeImageIndex === idx
                              ? "border-evenvibe-primary ring-2 ring-emerald-500/20"
                              : "border-slate-200 opacity-60 hover:opacity-100"
                          }`}
                        >
                          {img.signed_url && (
                            <Image
                              src={img.signed_url}
                              alt="Thumbnail"
                              fill
                              className="object-cover"
                            />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-slate-400 border border-dashed rounded-lg">
                  <ImageIcon className="h-10 w-10 stroke-1 mb-2" />
                  <p className="text-sm">No images uploaded for this style.</p>
                </div>
              )}

              {/* Class List Detailed view */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
                <span className="font-semibold text-slate-700 block">Applicable Class List:</span>
                <div className="flex flex-wrap gap-1">
                  {viewingStyle.classes.map((cls) => (
                    <span
                      key={cls}
                      className="bg-white border border-slate-200 text-slate-800 px-2 py-0.5 rounded font-medium"
                    >
                      {cls}
                    </span>
                  ))}
                </div>
              </div>

              {/* Class-Wise Color Configurations */}
              {viewingStyle.colors && viewingStyle.colors.length > 0 && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <Palette className="h-3.5 w-3.5 text-evenvibe-primary" />
                    Class-Wise Color Configurations:
                  </span>
                  <div className="space-y-1.5">
                    {Array.from(new Set(viewingStyle.colors.map((c) => c.class_name))).map((cls) => {
                      const clsColors = viewingStyle.colors?.filter((c) => c.class_name === cls) || [];
                      return (
                        <div key={cls} className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded border border-slate-200">
                          <span className="font-bold text-slate-800 w-20">{cls}:</span>
                          <div className="flex flex-wrap gap-1">
                            {clsColors.map((c) => (
                              <Badge key={c.id || c.color_name} variant="outline" className="text-[10px] font-semibold bg-slate-50 border-slate-300 text-slate-700">
                                {c.color_name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Dedicated Color Management Dialog */}
      <ColorManagementDialog
        open={colorModalOpen}
        onOpenChange={setColorModalOpen}
        selectedSchool={{ id: selectedSchool.id, name: selectedSchool.name }}
        styles={styles}
        initialStyleId={colorModalStyleId}
        onSaved={(styleId, updatedColors) => {
          setStyles((prev) =>
            prev.map((s) => (s.id === styleId ? { ...s, colors: updatedColors } : s))
          );
        }}
      />
    </div>
  );
}

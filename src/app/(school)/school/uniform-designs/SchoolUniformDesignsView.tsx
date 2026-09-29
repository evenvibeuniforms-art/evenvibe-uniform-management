"use client";

import { useState, useMemo } from "react";
import { UniformStyleWithDetails } from "@/types/database";
import { STANDARD_CLASSES } from "@/lib/constants/classes";
import { useRealtimeRefresh } from "@/lib/supabase/useRealtime";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Shirt,
  Search,
  Download,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  Palette,
} from "lucide-react";
import Image from "next/image";

interface SchoolUniformDesignsViewProps {
  initialStyles: UniformStyleWithDetails[];
  schoolName?: string;
}

export default function SchoolUniformDesignsView({
  initialStyles,
  schoolName,
}: SchoolUniformDesignsViewProps) {
  // Setup Realtime refresh so when EvenVibe Admin creates/updates/deactivates a style, this page automatically refreshes smoothly
  useRealtimeRefresh({
    tables: [
      { table: "uniform_styles" },
      { table: "uniform_style_classes" },
      { table: "uniform_style_images" },
      { table: "uniform_style_colors" },
    ],
  });

  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("all");
  const [selectedItemFilter, setSelectedItemFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Lightbox / Gallery modal state
  const [viewOpen, setViewOpen] = useState(false);
  const [activeStyle, setActiveStyle] = useState<UniformStyleWithDetails | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);

  // Derive unique items
  const uniqueItems = useMemo(() => {
    const set = new Set<string>();
    initialStyles.forEach((s) => set.add(s.item_name));
    return Array.from(set).sort();
  }, [initialStyles]);

  // Filter styles
  const filteredStyles = useMemo(() => {
    return initialStyles.filter((s) => {
      if (selectedClassFilter !== "all" && !s.classes.includes(selectedClassFilter)) return false;
      if (selectedItemFilter !== "all" && s.item_name.toLowerCase() !== selectedItemFilter.toLowerCase()) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = s.style_name.toLowerCase().includes(q);
        const matchesItem = s.item_name.toLowerCase().includes(q);
        if (!matchesName && !matchesItem) return false;
      }
      return true;
    });
  }, [initialStyles, selectedClassFilter, selectedItemFilter, searchQuery]);

  const openLightbox = (style: UniformStyleWithDetails, imgIndex = 0) => {
    setActiveStyle(style);
    setActiveImageIndex(imgIndex);
    setViewOpen(true);
  };

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
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Shirt className="h-6 w-6 text-evenvibe-primary" />
            Uniform Designs
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Approved uniform designs and styling references for {schoolName || "your school"}.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600 bg-evenvibe-light border border-emerald-200 rounded-lg px-3 py-2 self-start sm:self-auto">
          <Info className="h-4 w-4 text-evenvibe-primary shrink-0" />
          <span>Configured by EvenVibe Admin. Used for student size measurements.</span>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by style or item name..."
                className="pl-9 bg-slate-50 border-slate-200"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Select value={selectedItemFilter} onValueChange={(v) => setSelectedItemFilter(v || "all")}>
              <SelectTrigger className="w-full sm:w-[170px] bg-slate-50 border-slate-200">
                <SelectValue placeholder="All Items" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                {uniqueItems.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedClassFilter} onValueChange={(v) => setSelectedClassFilter(v || "all")}>
              <SelectTrigger className="w-full sm:w-[160px] bg-slate-50 border-slate-200">
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
          </div>
        </CardContent>
      </Card>

      {/* Design Cards Grid */}
      {filteredStyles.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 bg-white">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-slate-500">
            <Shirt className="h-12 w-12 text-slate-300 mb-3" />
            <p className="text-lg font-medium text-slate-900">No Uniform Designs Available</p>
            <p className="text-sm mt-1 max-w-md">
              {initialStyles.length === 0
                ? "Uniform design specifications have not been configured for your school yet. Please contact EvenVibe Admin."
                : "No uniform styles match your current filter selection."}
            </p>
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
                className="overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow flex flex-col"
              >
                {/* Image Banner */}
                <div
                  onClick={() => openLightbox(style, 0)}
                  className="relative h-52 w-full bg-slate-100 cursor-pointer overflow-hidden group flex items-center justify-center border-b border-slate-100"
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
                      <span className="text-xs">No preview available</span>
                    </div>
                  )}

                  {/* Images count badge */}
                  <div className="absolute bottom-2 right-2 bg-slate-900/80 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1 shadow">
                    <ImageIcon className="h-3 w-3" />
                    <span>{imagesCount} {imagesCount === 1 ? "Image" : "Images"}</span>
                  </div>

                  {/* Quick view button overlay */}
                  <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="bg-white text-slate-900 font-medium text-xs px-3 py-1.5 rounded-md shadow flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5 text-evenvibe-primary" />
                      View Gallery
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg leading-tight">
                        {style.style_name}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {style.item_name} {style.gender && style.gender !== "All" ? `• ${style.gender}` : ""}
                      </p>
                    </div>

                    <Badge variant="outline" className="font-semibold text-evenvibe-deep border-emerald-300 bg-evenvibe-light">
                      {style.item_name}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-1 space-y-3 flex-1 flex flex-col justify-between">
                  {/* Applicable Classes */}
                  <div className="rounded-md bg-slate-50 border border-slate-200/80 p-2.5 text-xs space-y-1">
                    <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider">
                      Applicable Classes:
                    </span>
                    <p className="font-semibold text-slate-800 text-sm">
                      {formatClassDisplay(style.classes)}
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {style.classes.map((c) => (
                        <span key={c} className="bg-white border border-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[11px]">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Available Sizes & Requirement */}
                  <div className="rounded-md bg-slate-50 border border-slate-200/80 p-2.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 text-[11px] font-medium uppercase tracking-wider">
                        Available Sizes:
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
                    <div className="flex flex-wrap gap-1">
                      {style.available_sizes && style.available_sizes.length > 0 ? (
                        style.available_sizes.map((sz) => (
                          <span
                            key={sz}
                            className="bg-white border border-slate-200 text-slate-800 font-semibold px-2 py-0.5 rounded text-xs shadow-2xs"
                          >
                            {sz}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 italic text-xs">No sizes configured</span>
                      )}
                    </div>
                  </div>

                  {/* Configured Colors */}
                  {style.colors && style.colors.length > 0 && (
                    <div className="rounded-md bg-slate-50 border border-slate-200/80 p-2.5 text-xs space-y-1">
                      <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider flex items-center gap-1">
                        <Palette className="h-3 w-3 text-evenvibe-primary" /> Configured Colors:
                      </span>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {Array.from(new Set(style.colors.map((c) => c.color_name))).map((col) => (
                          <span
                            key={col}
                            className="bg-white border border-slate-200 text-slate-700 text-[10px] font-semibold px-1.5 py-0.5 rounded shadow-2xs"
                          >
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Secondary Thumbnails Row */}
                  {imagesCount > 1 && (
                    <div className="flex gap-1.5 overflow-x-auto pt-1">
                      {style.images.slice(0, 5).map((img, i) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => openLightbox(style, i)}
                          className="relative h-12 w-12 shrink-0 rounded border border-slate-200 overflow-hidden bg-slate-50 hover:border-emerald-500 transition-colors"
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
                      {imagesCount > 5 && (
                        <button
                          type="button"
                          onClick={() => openLightbox(style, 5)}
                          className="h-12 w-12 shrink-0 rounded border border-dashed border-slate-300 flex items-center justify-center text-xs font-semibold text-slate-500 bg-slate-50"
                        >
                          +{imagesCount - 5}
                        </button>
                      )}
                    </div>
                  )}

                  {/* View Details / Download Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openLightbox(style, 0)}
                    className="w-full text-xs mt-2 border-slate-200 hover:border-emerald-500 hover:text-emerald-700"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    View Design Details & Images
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* READ-ONLY LIGHTBOX MODAL                                                  */}
      {/* ========================================================================= */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-6">
          {activeStyle && (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b pb-3">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{activeStyle.style_name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Item: <span className="font-semibold text-slate-800">{activeStyle.item_name}</span>
                    {activeStyle.gender && activeStyle.gender !== "All" ? ` • Gender: ${activeStyle.gender}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className="font-medium text-evenvibe-deep bg-evenvibe-light border-emerald-200">
                  {formatClassDisplay(activeStyle.classes)}
                </Badge>
              </div>

              {/* Main Image */}
              {activeStyle.images.length > 0 ? (
                <div className="space-y-3">
                  <div className="relative h-80 sm:h-96 w-full rounded-lg bg-slate-900/5 border border-slate-200 overflow-hidden flex items-center justify-center">
                    {activeStyle.images[activeImageIndex]?.signed_url ? (
                      <Image
                        src={activeStyle.images[activeImageIndex].signed_url!}
                        alt={`${activeStyle.style_name} view`}
                        fill
                        className="object-contain p-2"
                      />
                    ) : (
                      <span className="text-slate-400 text-sm">Image preview unavailable</span>
                    )}

                    {/* Navigation buttons */}
                    {activeStyle.images.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setActiveImageIndex((prev) =>
                              prev > 0 ? prev - 1 : activeStyle.images.length - 1
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
                              prev < activeStyle.images.length - 1 ? prev + 1 : 0
                            )
                          }
                          className="absolute right-2 bg-slate-900/70 hover:bg-slate-900 text-white p-1.5 rounded-full shadow transition-colors"
                        >
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </>
                    )}

                    {/* Download Image */}
                    {activeStyle.images[activeImageIndex]?.signed_url && (
                      <a
                        href={activeStyle.images[activeImageIndex].signed_url!}
                        download={activeStyle.images[activeImageIndex].original_filename || "uniform-design.jpg"}
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
                  {activeStyle.images.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {activeStyle.images.map((img, idx) => (
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

              {/* Class List */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5">
                <span className="font-semibold text-slate-700 block">Applicable Classes:</span>
                <div className="flex flex-wrap gap-1">
                  {activeStyle.classes.map((cls) => (
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
              {activeStyle.colors && activeStyle.colors.length > 0 && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <Palette className="h-3.5 w-3.5 text-evenvibe-primary" />
                    Configured Colors by Class:
                  </span>
                  <div className="space-y-1.5">
                    {Array.from(new Set(activeStyle.colors.map((c) => c.class_name))).map((cls) => {
                      const clsColors = activeStyle.colors?.filter((c) => c.class_name === cls) || [];
                      return (
                        <div key={cls} className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded border border-slate-200">
                          <span className="font-bold text-slate-800 w-20">{cls}:</span>
                          <div className="flex flex-wrap gap-1">
                            {clsColors.map((c) => (
                              <span key={c.id || c.color_name} className="text-[10px] font-semibold bg-slate-50 border border-slate-300 text-slate-700 px-2 py-0.5 rounded">
                                {c.color_name}
                              </span>
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
    </div>
  );
}

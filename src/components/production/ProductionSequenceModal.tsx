"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  CheckCircle2,
  Layers,
  Printer,
  Sparkles,
  Scissors,
  CheckCheck,
  Shirt,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ArrowDown,
  Lock,
  Save,
  Shuffle,
  LucideIcon,
  AlertCircle,
} from "lucide-react";
import {
  OrderWorkflowStage,
  ProductionStageKey,
  formatWorkflowStageLabel,
} from "@/lib/productionWorkflow";
import { saveOrderProductionSequenceAction } from "@/app/(admin)/admin/production/actions";

export interface ProductionSequenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  schoolName?: string;
  initialMiddleStages?: ProductionStageKey[];
  onSequenceSaved: (newWorkflows: OrderWorkflowStage[], firstStageKey: ProductionStageKey) => void;
}

interface StageCardMeta {
  key: ProductionStageKey;
  name: string;
  description: string;
  icon: LucideIcon;
  colorClass: string;
  bgLightClass: string;
  borderClass: string;
  badgeClass: string;
}

const STAGE_METAS: Record<ProductionStageKey, StageCardMeta> = {
  stitching: {
    key: "stitching",
    name: "Stitching",
    description: "Garment assembly, seam reinforcement & precision tailoring",
    icon: Layers,
    colorClass: "text-evenvibe-deep",
    bgLightClass: "bg-evenvibe-light/60 hover:bg-evenvibe-light",
    borderClass: "border-evenvibe-light",
    badgeClass: "bg-evenvibe-light text-evenvibe-deep border-evenvibe-light",
  },
  printing: {
    key: "printing",
    name: "Printing",
    description: "Heat-press, screen-print logos & student graphics",
    icon: Printer,
    colorClass: "text-fuchsia-700",
    bgLightClass: "bg-fuchsia-50/60 hover:bg-fuchsia-50",
    borderClass: "border-fuchsia-200",
    badgeClass: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  },
  embroidering: {
    key: "embroidering",
    name: "Embroidering",
    description: "High-density needle embroidery of school crest & emblems",
    icon: Sparkles,
    colorClass: "text-pink-700",
    bgLightClass: "bg-pink-50/60 hover:bg-pink-50",
    borderClass: "border-pink-200",
    badgeClass: "bg-pink-100 text-pink-800 border-pink-200",
  },
  stock_sizes: {
    key: "stock_sizes",
    name: "Stock Sizes",
    description: "Base uniform blanks",
    icon: Scissors,
    colorClass: "text-slate-500",
    bgLightClass: "bg-slate-50",
    borderClass: "border-slate-200",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
  inventory: {
    key: "inventory",
    name: "Inventory",
    description: "Fabric & trims",
    icon: Scissors,
    colorClass: "text-slate-500",
    bgLightClass: "bg-slate-50",
    borderClass: "border-slate-200",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
  cutting: {
    key: "cutting",
    name: "Cutting Output",
    description: "Cut fabric panels",
    icon: Scissors,
    colorClass: "text-evenvibe-deep",
    bgLightClass: "bg-evenvibe-light",
    borderClass: "border-evenvibe-light",
    badgeClass: "bg-evenvibe-light text-evenvibe-deep border-evenvibe-light",
  },
  checking: {
    key: "checking",
    name: "Checking",
    description: "Quality line inspection",
    icon: CheckCheck,
    colorClass: "text-slate-600",
    bgLightClass: "bg-slate-50",
    borderClass: "border-slate-200",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
  ironing_packing: {
    key: "ironing_packing",
    name: "Ironing & Packing",
    description: "Pressing, folding & bagging",
    icon: Shirt,
    colorClass: "text-slate-600",
    bgLightClass: "bg-slate-50",
    borderClass: "border-slate-200",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
  },
};

export const ALL_SIX_PERMUTATIONS: {
  id: string;
  label: string;
  shortLabel: string;
  sequence: ProductionStageKey[];
}[] = [
  {
    id: "s-p-e",
    label: "1. Stitching → Printing → Embroidering",
    shortLabel: "Stitching → Printing → Embroidering",
    sequence: ["stitching", "printing", "embroidering"],
  },
  {
    id: "s-e-p",
    label: "2. Stitching → Embroidering → Printing",
    shortLabel: "Stitching → Embroidering → Printing",
    sequence: ["stitching", "embroidering", "printing"],
  },
  {
    id: "p-s-e",
    label: "3. Printing → Stitching → Embroidering",
    shortLabel: "Printing → Stitching → Embroidering",
    sequence: ["printing", "stitching", "embroidering"],
  },
  {
    id: "p-e-s",
    label: "4. Printing → Embroidering → Stitching",
    shortLabel: "Printing → Embroidering → Stitching",
    sequence: ["printing", "embroidering", "stitching"],
  },
  {
    id: "e-s-p",
    label: "5. Embroidering → Stitching → Printing",
    shortLabel: "Embroidering → Stitching → Printing",
    sequence: ["embroidering", "stitching", "printing"],
  },
  {
    id: "e-p-s",
    label: "6. Embroidering → Printing → Stitching",
    shortLabel: "Embroidering → Printing → Stitching",
    sequence: ["embroidering", "printing", "stitching"],
  },
];

export default function ProductionSequenceModal({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  schoolName,
  initialMiddleStages,
  onSequenceSaved,
}: ProductionSequenceModalProps) {
  const sanitizeInitial = (): ProductionStageKey[] => {
    const validKeys: ProductionStageKey[] = ["stitching", "printing", "embroidering"];
    if (
      initialMiddleStages &&
      initialMiddleStages.length === 3 &&
      validKeys.every((k) => initialMiddleStages.includes(k))
    ) {
      return [...initialMiddleStages];
    }
    return ["stitching", "printing", "embroidering"];
  };

  const [stages, setStages] = useState<ProductionStageKey[]>(sanitizeInitial);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Sync state if initialMiddleStages changes
  const initialKey = (initialMiddleStages || []).join(",");
  const [prevInitialKey, setPrevInitialKey] = useState(initialKey);
  if (initialKey !== prevInitialKey) {
    setPrevInitialKey(initialKey);
    setStages(sanitizeInitial());
  }

  // Move up action
  const handleMoveUp = (index: number) => {
    if (index <= 0 || isSaving) return;
    setStages((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // Move down action
  const handleMoveDown = (index: number) => {
    if (index >= stages.length - 1 || isSaving) return;
    setStages((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (isSaving) {
      e.preventDefault();
      return;
    }
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${index}`);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index || isSaving) return;
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === null || draggedIndex === targetIndex || isSaving) return;

    setStages((prev) => {
      const next = [...prev];
      const [draggedItem] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedItem);
      return next;
    });
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Apply a preset permutation directly
  const handleApplyPreset = (presetSequence: ProductionStageKey[]) => {
    if (isSaving) return;
    setStages([...presetSequence]);
  };

  // Current sequence string to match against presets
  const currentSequenceKey = stages.join(",");

  // Save handler
  const handleSave = async () => {
    // 1. Client-side validation: exactly 3 stages, stitching, printing, embroidering without duplicate
    if (!Array.isArray(stages) || stages.length !== 3) {
      toast.error("Production sequence must contain exactly 3 stages.");
      return;
    }

    const uniqueSet = new Set(stages);
    const requiredStages: ProductionStageKey[] = ["stitching", "printing", "embroidering"];
    const isValid =
      uniqueSet.size === 3 && requiredStages.every((s) => uniqueSet.has(s));

    if (!isValid) {
      toast.error(
        "Invalid arrangement: Stitching, Printing, and Embroidering must each be selected exactly once."
      );
      return;
    }

    setIsSaving(true);
    try {
      const res = await saveOrderProductionSequenceAction(orderId, stages);
      if (res.error) {
        toast.error(res.error);
        setIsSaving(false);
        return;
      }

      toast.success("Production sequence saved successfully.");
      if (res.workflows && res.firstStageKey) {
        onSequenceSaved(res.workflows, res.firstStageKey as ProductionStageKey);
      }
      onClose();
    } catch (err: unknown) {
      console.error("handleSave sequence error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to save production sequence");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSaving && onClose()}>
      <DialogContent className="max-w-2xl sm:max-w-3xl max-h-[92vh] overflow-y-auto p-0 gap-0 border-slate-200 shadow-2xl rounded-2xl">
        {/* 1. Modal Top Banner & Header */}
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white p-6 sm:p-7 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-64 h-64 bg-evenvibe-primary/10 rounded-full blur-3xl pointer-events-none" />

          {/* Cutting Completed Tag */}
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 backdrop-blur-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              CUTTING COMPLETED ✓
            </span>
            <span className="text-xs text-evenvibe-light/80 font-mono">
              Order #{orderNumber} {schoolName ? `• ${schoolName}` : ""}
            </span>
          </div>

          <DialogHeader className="text-left space-y-1">
            <DialogTitle className="text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
              Arrange Production Sequence
            </DialogTitle>
            <DialogDescription className="text-sm text-evenvibe-light/90 leading-relaxed max-w-xl">
              Cutting is complete. Arrange the next 3 production stages for this order.
              Choose the order in which Stitching, Printing, and Embroidering should be performed.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 p-3 rounded-lg bg-evenvibe-deep/60 border border-evenvibe-deep/40 text-xs text-evenvibe-light flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 -evenvibe-primary shrink-0 mt-0.5" />
            <p>
              <strong className="text-white font-semibold">Important Workflow Rule: </strong>
              The first selected stage will receive the full Cutting Output. Subsequent stages receive the output of the preceding stage.
            </p>
          </div>
        </div>

        {/* 2. Modal Body */}
        <div className="p-6 sm:p-7 space-y-6 bg-slate-50/40">
          {/* Quick Permutation Presets (Section 6) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Shuffle className="h-3.5 w-3.5 text-evenvibe-primary" />
                Quick Selection (6 Valid Permutations)
              </span>
              <span className="text-[11px] text-slate-400">Click to set or drag cards below</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {ALL_SIX_PERMUTATIONS.map((perm) => {
                const isActive = perm.sequence.join(",") === currentSequenceKey;
                return (
                  <button
                    key={perm.id}
                    type="button"
                    onClick={() => handleApplyPreset(perm.sequence)}
                    disabled={isSaving}
                    className={`text-left p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between cursor-pointer ${
                      isActive
                        ? "bg-evenvibe-primary text-white border-evenvibe-primary font-semibold shadow-xs ring-2 -evenvibe-primary/60"
                        : "bg-white text-slate-700 border-slate-200 hover:-evenvibe-primary hover:bg-evenvibe-light/40"
                    }`}
                  >
                    <span className="truncate pr-1">{perm.shortLabel}</span>
                    {isActive && <CheckCircle2 className="h-3.5 w-3.5 text-white shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: 3 Large Numbered Cards for Reordering */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Arranged Stages (01, 02, 03)
              </span>
              <span className="text-[11px] text-slate-500">
                Drag using handle or use Move Up / Move Down buttons
              </span>
            </div>

            <div className="space-y-2.5" role="list">
              {stages.map((stageKey, idx) => {
                const meta = STAGE_METAS[stageKey];
                const IconComponent = meta.icon;
                const positionNumber = `0${idx + 1}`;
                const isDragging = draggedIndex === idx;
                const isDragOver = dragOverIndex === idx;

                return (
                  <div
                    key={stageKey}
                    draggable={!isSaving}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`group relative flex items-center justify-between p-4 rounded-xl border bg-white transition-all shadow-2xs select-none ${
                      isDragging
                        ? "opacity-40 -evenvibe-primary scale-[0.98]"
                        : isDragOver
                        ? "border-evenvibe-primary bg-evenvibe-light/50 ring-2 -evenvibe-primary shadow-md"
                        : "border-slate-200/90 hover:-evenvibe-primary hover:shadow-xs"
                    }`}
                  >
                    {/* Left: Drag Handle, Number, Icon & Title */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Drag Handle */}
                      <div
                        className="cursor-grab active:cursor-grabbing text-slate-400 group-hover:text-evenvibe-primary transition-colors p-1 -ml-1 rounded hover:bg-slate-100"
                        title="Drag to reorder"
                      >
                        <GripVertical className="h-5 w-5" />
                      </div>

                      {/* Number Badge (01, 02, 03) */}
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-evenvibe-light border border-evenvibe-light/80 font-black text-evenvibe-deep font-mono text-base shrink-0 shadow-2xs">
                        {positionNumber}
                      </div>

                      {/* Stage Details */}
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                            <IconComponent className={`h-4 w-4 ${meta.colorClass}`} />
                            {meta.name}
                          </h4>
                          <Badge variant="outline" className={`text-[10px] px-2 py-0 ${meta.badgeClass}`}>
                            {idx === 0
                              ? "First Dynamic Stage (Receives Cutting Output)"
                              : idx === 1
                              ? "Second Dynamic Stage"
                              : "Third Dynamic Stage"}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 truncate max-w-md">
                          {meta.description}
                        </p>
                      </div>
                    </div>

                    {/* Right: Accessible Fallback Controls (Move Up / Down) */}
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={idx === 0 || isSaving}
                        onClick={() => handleMoveUp(idx)}
                        className="h-8 px-2 text-xs border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40"
                        title="Move Up"
                      >
                        <ChevronUp className="h-4 w-4 mr-1 text-slate-600" />
                        <span className="hidden sm:inline">Move Up</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={idx === stages.length - 1 || isSaving}
                        onClick={() => handleMoveDown(idx)}
                        className="h-8 px-2 text-xs border-slate-200 hover:bg-slate-100 text-slate-700 disabled:opacity-40"
                        title="Move Down"
                      >
                        <ChevronDown className="h-4 w-4 mr-1 text-slate-600" />
                        <span className="hidden sm:inline">Move Down</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 5: LIVE PRODUCTION FLOW PREVIEW */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowDown className="h-3.5 w-3.5 text-evenvibe-primary" />
                Live Production Flow Preview
              </span>
              <span className="text-[11px] text-evenvibe-deep font-semibold bg-evenvibe-light px-2 py-0.5 rounded border border-emerald-200">
                Updates in real-time
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
              {/* Flow Pipeline Display */}
              <div className="flex flex-col items-center space-y-1.5 max-w-md mx-auto">
                {/* 1. Cutting Output */}
                <div className="w-full flex items-center justify-between p-2.5 rounded-lg bg-evenvibe-light/70 border border-evenvibe-light text-xs">
                  <div className="flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-evenvibe-primary" />
                    <span className="font-bold text-evenvibe-deep">Cutting Output</span>
                  </div>
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] py-0">
                    Completed ✓
                  </Badge>
                </div>

                <ArrowDown className="h-4 w-4 -evenvibe-primary shrink-0" />

                {/* 2. Dynamic Stage 1 */}
                <div className="w-full flex items-center justify-between p-2.5 rounded-lg bg-evenvibe-primary text-white shadow-xs text-xs ring-2 -evenvibe-primary">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold bg-white/20 px-1.5 py-0.5 rounded text-[11px]">
                      01
                    </span>
                    <span className="font-bold">{formatWorkflowStageLabel(stages[0])}</span>
                  </div>
                  <Badge className="bg-white/20 text-white border-white/30 text-[10px] py-0">
                    Will Start First (In Progress)
                  </Badge>
                </div>

                <ArrowDown className="h-4 w-4 -evenvibe-primary shrink-0" />

                {/* 3. Dynamic Stage 2 */}
                <div className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[11px]">
                      02
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formatWorkflowStageLabel(stages[1])}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Locked until Stage 1 completes
                  </span>
                </div>

                <ArrowDown className="h-4 w-4 text-slate-400 shrink-0" />

                {/* 4. Dynamic Stage 3 */}
                <div className="w-full flex items-center justify-between p-2.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[11px]">
                      03
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formatWorkflowStageLabel(stages[2])}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Locked until Stage 2 completes
                  </span>
                </div>

                <ArrowDown className="h-4 w-4 text-slate-400 shrink-0" />

                {/* 5. Checking */}
                <div className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs">
                  <div className="flex items-center gap-2">
                    <CheckCheck className="h-3.5 w-3.5 text-slate-500" />
                    <span className="font-medium text-slate-700">Checking (Fixed Stage 7)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Locked
                  </span>
                </div>

                <ArrowDown className="h-4 w-4 text-slate-400 shrink-0" />

                {/* 6. Ironing & Packing */}
                <div className="w-full flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs">
                  <div className="flex items-center gap-2">
                    <Shirt className="h-3.5 w-3.5 text-slate-500" />
                    <span className="font-medium text-slate-700">Ironing & Packing (Fixed Stage 8)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Locked
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Modal Footer / Action Buttons */}
        <div className="p-4 sm:p-5 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500 text-center sm:text-left">
            <span className="font-medium text-slate-700">Notice: </span>
            Dynamic stages remain locked until you save a production sequence.
          </p>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="w-full sm:w-auto border-slate-300 text-slate-700 hover:bg-slate-50 font-medium"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="w-full sm:w-auto bg-evenvibe-primary hover:bg-evenvibe-deep text-white font-semibold shadow-md gap-2 px-5"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving Sequence..." : "Save Production Sequence"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

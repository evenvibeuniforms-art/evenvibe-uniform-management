"use client";

import React, { useState } from "react";
import {
  ALL_PRODUCTION_STAGES,
  FIXED_INITIAL_STAGES,
  FIXED_FINAL_STAGES,
  OrderWorkflowStage,
  ProductionStageKey,
  STAGE_CONFIG_MAP,
  getWorkflowStageBadgeColor,
} from "@/lib/productionWorkflow";
import { saveOrderWorkflow } from "@/app/(admin)/admin/production/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  GripVertical,
  ChevronUp,
  ChevronDown,
  Lock,
  Save,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  ArrowDown,
  Sliders,
} from "lucide-react";

interface OrderWorkflowConfiguratorProps {
  orderId: string;
  initialWorkflows: OrderWorkflowStage[];
  isLocked: boolean;
  orderNumber?: string;
  onWorkflowUpdated?: (newWorkflows: OrderWorkflowStage[]) => void;
}

const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return null;
  const d = new Date(dateString);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function OrderWorkflowConfigurator({
  orderId,
  initialWorkflows,
  isLocked,
  orderNumber,
  onWorkflowUpdated,
}: OrderWorkflowConfiguratorProps) {
  // Find stage workflow object by key from initialWorkflows
  const findStage = (key: ProductionStageKey) =>
    initialWorkflows.find((w) => w.stage_key === key);

  // Check if first 3 stages are completed
  const isInitialFinished =
    findStage("stock_sizes")?.status === "completed" &&
    findStage("inventory")?.status === "completed" &&
    findStage("cutting")?.status === "completed";

  // Check if any middle stage (4, 5, 6) or final stage (7, 8) has already started or completed
  const hasStartedMiddleOrFinalStage = (initialWorkflows || []).some(
    (w) => w.sequence_order >= 4 && (w.status === "in_progress" || w.status === "completed")
  );

  // Workflow sequence is locked if middle stages have started/completed, or order is past production
  const effectiveIsLocked = isLocked || hasStartedMiddleOrFinalStage;

  // Extract initial middle stages (stitching, printing, embroidering) sorted by existing sequence_order
  const getInitialMiddleStages = (): { key: ProductionStageKey; originalStage?: OrderWorkflowStage }[] => {
    const middleKeys: ProductionStageKey[] = ["stitching", "printing", "embroidering"];
    const foundMiddle = (initialWorkflows || [])
      .filter((w) => middleKeys.includes(w.stage_key))
      .sort((a, b) => a.sequence_order - b.sequence_order);

    if (foundMiddle.length === 3) {
      return foundMiddle.map((w) => ({
        key: w.stage_key,
        originalStage: w,
      }));
    }

    // Default fallback middle order
    return [
      { key: "stitching", originalStage: findStage("stitching") },
      { key: "printing", originalStage: findStage("printing") },
      { key: "embroidering", originalStage: findStage("embroidering") },
    ];
  };

  const [middleStages, setMiddleStages] = useState(getInitialMiddleStages);
  const [prevInitialWorkflows, setPrevInitialWorkflows] = useState(initialWorkflows);

  if (initialWorkflows !== prevInitialWorkflows) {
    setPrevInitialWorkflows(initialWorkflows);
    setMiddleStages(getInitialMiddleStages());
  }

  const [isSaving, setIsSaving] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Initial middle keys for change tracking
  const initialMiddleOrder = getInitialMiddleStages().map((s) => s.key).join(",");
  const currentMiddleOrder = middleStages.map((s) => s.key).join(",");
  const hasChanges = initialMiddleOrder !== currentMiddleOrder;

  // Move middle stage up (within indices 0..2)
  const handleMoveUp = (index: number) => {
    if (effectiveIsLocked || index <= 0) return;
    setMiddleStages((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // Move middle stage down (within indices 0..2)
  const handleMoveDown = (index: number) => {
    if (effectiveIsLocked || index >= middleStages.length - 1) return;
    setMiddleStages((prev) => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  // Drag and drop handlers within middle stages only
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (effectiveIsLocked) {
      e.preventDefault();
      return;
    }
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${index}`);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (effectiveIsLocked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    if (effectiveIsLocked) return;
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    setMiddleStages((prev) => {
      const next = [...prev];
      const [draggedItem] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, draggedItem);
      return next;
    });

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleResetToDefault = () => {
    if (effectiveIsLocked) return;
    setMiddleStages([
      { key: "stitching", originalStage: findStage("stitching") },
      { key: "printing", originalStage: findStage("printing") },
      { key: "embroidering", originalStage: findStage("embroidering") },
    ]);
  };

  // Save workflow (3 fixed initial + 3 middle + 2 fixed final)
  const handleSave = async () => {
    if (!isInitialFinished) {
      toast.error("Complete Stock Sizes, Inventory and Cutting to arrange the production sequence.");
      return;
    }

    if (effectiveIsLocked) {
      toast.error("Production sequence is locked because production has started.");
      return;
    }

    setIsSaving(true);
    const orderedKeys: ProductionStageKey[] = [
      ...FIXED_INITIAL_STAGES,
      ...middleStages.map((s) => s.key),
      ...FIXED_FINAL_STAGES,
    ];

    const res = await saveOrderWorkflow(orderId, orderedKeys);

    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Production sequence saved successfully for this order.");
      if (onWorkflowUpdated) {
        const updatedList: OrderWorkflowStage[] = orderedKeys.map((key, idx) => {
          const original = findStage(key);
          const isFirstMiddleAfterCutting = isInitialFinished && idx === 3;
          return {
            order_id: orderId,
            stage_key: key,
            sequence_order: idx + 1,
            status: isFirstMiddleAfterCutting
              ? "in_progress"
              : original?.status || "pending",
            started_at: isFirstMiddleAfterCutting
              ? new Date().toISOString()
              : original?.started_at || null,
            completed_at: original?.completed_at || null,
          };
        });
        onWorkflowUpdated(updatedList);
      }
    }
    setIsSaving(false);
  };

  // Middle configuration section is strictly shown only after the first 3 stages are completed,
  // or if middle stages have already begun/completed in execution.
  const showMiddleSection = isInitialFinished || hasStartedMiddleOrFinalStage;

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden">
      <CardHeader className="bg-slate-50/80 border-b pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-wider text-slate-500 uppercase">
                Production Workflow
              </span>
              {orderNumber && (
                <Badge variant="outline" className="font-mono text-xs bg-white">
                  Order #{orderNumber}
                </Badge>
              )}
            </div>
            <CardTitle className="text-xl text-slate-900 mt-1">
              Production Sequence Configuration
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              3 fixed initial stages, 3 order-specific customizable middle stages, and 2 fixed final stages.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {!effectiveIsLocked && showMiddleSection && hasChanges && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetToDefault}
                disabled={isSaving}
                className="gap-1.5 text-xs text-slate-600 h-9"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Default
              </Button>
            )}

            {!effectiveIsLocked && showMiddleSection && (
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white gap-2 text-xs font-semibold px-4 h-9 shadow-sm"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving Sequence..." : "Save Sequence"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-6">
        {/* Locking Banner */}
        {effectiveIsLocked && (
          <div className="flex items-center gap-3 p-3.5 rounded-lg bg-amber-50/90 border border-amber-200 text-amber-900 text-sm">
            <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <Lock className="h-4 w-4 text-amber-700" />
            </div>
            <div>
              <p className="font-semibold text-amber-950">
                Production sequence is locked because production has started.
              </p>
              <p className="text-xs text-amber-800/90 mt-0.5">
                The stage sequence is permanently locked to preserve manufacturing integrity and historical tracking.
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SECTION 1: FIXED INITIAL STAGES                                          */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Fixed Stages
                </span>
                <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600 border-slate-300 gap-1 font-semibold">
                  <Lock className="h-3 w-3" /> FIXED / LOCKED
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Stages 1, 2, and 3 must always remain in this exact sequence: Stock Sizes → Inventory → Cutting.
              </p>
            </div>
            <span className="text-xs font-mono font-medium text-slate-400">Stages 1–3</span>
          </div>

          <div className="space-y-2">
            {FIXED_INITIAL_STAGES.map((key, idx) => {
              const stageConfig = STAGE_CONFIG_MAP[key] || ALL_PRODUCTION_STAGES[0];
              const Icon = stageConfig.icon;
              const original = findStage(key);
              const status = original?.status || "pending";
              const sequenceNumber = idx + 1;

              return (
                <div
                  key={key}
                  className={`flex items-center justify-between p-3 rounded-lg border select-none ${
                    status === "completed"
                      ? "bg-emerald-50/40 border-emerald-200"
                      : status === "in_progress"
                      ? "bg-blue-50/40 border-blue-200 ring-1 ring-blue-300"
                      : "bg-slate-50/60 border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Sequence Badge */}
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-7 w-7 rounded-md font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                          status === "completed"
                            ? "bg-evenvibe-primary text-white"
                            : status === "in_progress"
                            ? "bg-evenvibe-primary text-white shadow-xs"
                            : "bg-white text-slate-700 border border-slate-200 shadow-xs"
                        }`}
                      >
                        {status === "completed" ? "✓" : sequenceNumber}
                      </div>
                    </div>

                    {/* Icon */}
                    <div
                      className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                        status === "completed"
                          ? "bg-emerald-100 text-evenvibe-deep"
                          : status === "in_progress"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-white text-slate-500 border border-slate-200"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Details */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {sequenceNumber}. {stageConfig.label}
                        </p>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 capitalize ${getWorkflowStageBadgeColor(
                            key
                          )}`}
                        >
                          {key.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 truncate hidden sm:block">
                        {stageConfig.description}
                      </p>
                    </div>
                  </div>

                  {/* Status & Fixed Indicator */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right hidden md:block">
                      {status === "completed" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-evenvibe-deep">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Completed
                        </span>
                      ) : status === "in_progress" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                          <Play className="h-3.5 w-3.5" />
                          In Progress
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                          <Clock className="h-3.5 w-3.5" />
                          Pending
                        </span>
                      )}

                      {original?.completed_at && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDate(original.completed_at)}
                        </p>
                      )}
                      {status === "in_progress" && original?.started_at && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Started: {formatDate(original.started_at)}
                        </p>
                      )}
                    </div>

                    <Badge variant="outline" className="text-[10px] bg-white text-slate-500 border-slate-200 gap-1 shrink-0">
                      <Lock className="h-2.5 w-2.5" /> Fixed
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Transition Divider */}
        <div className="flex items-center justify-center gap-2 py-1 text-slate-400 text-xs font-medium">
          <div className="h-px bg-slate-200 flex-1" />
          <span className="inline-flex items-center gap-1 bg-slate-100 px-3 py-1 rounded-full text-slate-600 text-[11px] font-semibold border border-slate-200">
            <ArrowDown className="h-3.5 w-3.5 text-slate-500" />
            {isInitialFinished ? "ALL 3 FINISHED — CONFIGURE MIDDLE SEQUENCE" : "AFTER THESE 3 ARE COMPLETED"}
          </span>
          <div className="h-px bg-slate-200 flex-1" />
        </div>

        {/* ========================================================================= */}
        {/* SECTION 2: ARRANGE THE PRODUCTION SEQUENCE                                */}
        {/* Only shown automatically once the first 3 stages are completed, or       */}
        {/* if user chooses to pre-configure before production starts                 */}
        {/* ========================================================================= */}
        {!showMiddleSection ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-center space-y-2">
            <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 text-slate-400 mx-auto flex items-center justify-center">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-800">
                Arrange the Production Sequence
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Complete Stock Sizes, Inventory and Cutting to arrange the production sequence.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-evenvibe-light bg-evenvibe-light/30 p-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-evenvibe-light pb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-evenvibe-deep">
                    Arrange the Production Sequence
                  </span>
                  {!effectiveIsLocked ? (
                    <Badge variant="outline" className="text-[10px] bg-evenvibe-light text-evenvibe-deep -evenvibe-primary gap-1 font-semibold">
                      <Sliders className="h-3 w-3" /> CUSTOMIZABLE PER ORDER
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300 gap-1 font-semibold">
                      <Lock className="h-3 w-3" /> LOCKED
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-evenvibe-deep/80 mt-0.5">
                  Admin arranges ONLY these 3 stages for this specific order.
                </p>
              </div>

              {!effectiveIsLocked && (
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white gap-1.5 text-xs font-semibold px-3 h-8 shadow-xs shrink-0 self-start sm:self-auto"
                >
                  <Save className="h-3.5 w-3.5" />
                  {isSaving ? "Saving..." : "Save Sequence"}
                </Button>
              )}
            </div>

            {!effectiveIsLocked && (
              <div className="text-[11px] text-slate-500 flex items-center justify-between pb-1">
                <span>Use drag handle ☰ or Up (↑) / Down (↓) buttons to arrange sequence.</span>
                <span className="font-semibold text-evenvibe-deep">3 Middle Stages</span>
              </div>
            )}

            <div className="space-y-2">
              {middleStages.map((item, idx) => {
                const stageConfig = STAGE_CONFIG_MAP[item.key] || ALL_PRODUCTION_STAGES[0];
                const Icon = stageConfig.icon;
                const original = item.originalStage;
                const status = original?.status || "pending";
                const displayNum = idx + 1; // 1, 2, 3 in middle section
                const overallSeq = 4 + idx; // Overall sequence 4, 5, 6

                const isDragging = draggedIndex === idx;
                const isOver = dragOverIndex === idx;

                return (
                  <div
                    key={item.key}
                    draggable={!effectiveIsLocked}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`group flex items-center justify-between p-3 rounded-lg border transition-all select-none ${
                      isDragging
                        ? "opacity-40 bg-slate-100 border-dashed border-slate-400"
                        : isOver
                        ? "border-evenvibe-primary ring-2 ring-evenvibe-primary/20 bg-evenvibe-light/50"
                        : status === "completed"
                        ? "bg-emerald-50/50 border-emerald-200"
                        : status === "in_progress"
                        ? "bg-blue-50/50 border-blue-200 ring-1 ring-blue-300"
                        : "bg-white border-slate-200 hover:-evenvibe-primary hover:shadow-xs"
                    } ${!effectiveIsLocked ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Drag Handle & Sequence */}
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-slate-400 ${
                            !effectiveIsLocked ? "hover:text-slate-700 cursor-grab" : "opacity-40 cursor-default"
                          }`}
                          title={effectiveIsLocked ? "Locked" : "Drag to reorder"}
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <div
                          className={`h-7 w-7 rounded-md font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                            status === "completed"
                              ? "bg-evenvibe-primary text-white"
                              : status === "in_progress"
                              ? "bg-evenvibe-primary text-white shadow-xs"
                              : "bg-evenvibe-primary text-white shadow-xs"
                          }`}
                        >
                          {status === "completed" ? "✓" : displayNum}
                        </div>
                      </div>

                      {/* Icon */}
                      <div
                        className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                          status === "completed"
                            ? "bg-emerald-100 text-evenvibe-deep"
                            : status === "in_progress"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-evenvibe-light text-evenvibe-deep"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Details */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {stageConfig.label}
                          </p>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 capitalize ${getWorkflowStageBadgeColor(
                              item.key
                            )}`}
                          >
                            {item.key.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-[10px] font-mono text-slate-400">
                            (Stage {overallSeq})
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate hidden sm:block">
                          {stageConfig.description}
                        </p>
                      </div>
                    </div>

                    {/* Status & Up/Down Reorder Controls */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden md:block">
                        {status === "completed" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-evenvibe-deep">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Completed
                          </span>
                        ) : status === "in_progress" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                            <Play className="h-3.5 w-3.5" />
                            In Progress
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                            <Clock className="h-3.5 w-3.5" />
                            Pending
                          </span>
                        )}

                        {original?.completed_at && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatDate(original.completed_at)}
                          </p>
                        )}
                        {status === "in_progress" && original?.started_at && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Started: {formatDate(original.started_at)}
                          </p>
                        )}
                      </div>

                      {/* Accessible Up/Down Buttons */}
                      {!effectiveIsLocked ? (
                        <div className="flex items-center gap-1 bg-slate-50 p-0.5 rounded-md border border-slate-200">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-600 hover:text-evenvibe-deep hover:bg-white disabled:opacity-30"
                            onClick={() => handleMoveUp(idx)}
                            disabled={idx === 0}
                            title={`Move ${stageConfig.label} Up`}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-600 hover:text-evenvibe-deep hover:bg-white disabled:opacity-30"
                            onClick={() => handleMoveDown(idx)}
                            disabled={idx === middleStages.length - 1}
                            title={`Move ${stageConfig.label} Down`}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-white text-slate-500 border-slate-200 gap-1 shrink-0">
                          <Lock className="h-2.5 w-2.5" /> Locked
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Save Sequence Button within middle section */}
            {!effectiveIsLocked && (
              <div className="pt-2 flex justify-end">
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-evenvibe-primary hover:bg-evenvibe-deep text-white gap-2 font-semibold shadow-sm w-full sm:w-auto"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving Sequence..." : "Save Sequence"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Transition Divider */}
        <div className="flex items-center justify-center gap-2 py-1 text-slate-400 text-xs font-medium">
          <div className="h-px bg-slate-200 flex-1" />
          <span className="inline-flex items-center gap-1 bg-slate-100 px-3 py-1 rounded-full text-slate-600 text-[11px] font-semibold border border-slate-200">
            <ArrowDown className="h-3.5 w-3.5 text-slate-500" />
            AFTER MIDDLE STAGES ARE COMPLETED
          </span>
          <div className="h-px bg-slate-200 flex-1" />
        </div>

        {/* ========================================================================= */}
        {/* SECTION 3: FIXED FINAL STAGES                                             */}
        {/* ========================================================================= */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Fixed Final Stages
                </span>
                <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-600 border-slate-300 gap-1 font-semibold">
                  <Lock className="h-3 w-3" /> FIXED / LOCKED
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Checking must always be stage 7, followed by Ironing and Packing as stage 8.
              </p>
            </div>
            <span className="text-xs font-mono font-medium text-slate-400">Stages 7–8</span>
          </div>

          <div className="space-y-2">
            {FIXED_FINAL_STAGES.map((key, idx) => {
              const stageConfig = STAGE_CONFIG_MAP[key] || ALL_PRODUCTION_STAGES[0];
              const Icon = stageConfig.icon;
              const original = findStage(key);
              const status = original?.status || "pending";
              const sequenceNumber = 7 + idx;

              return (
                <div
                  key={key}
                  className={`flex items-center justify-between p-3 rounded-lg border select-none ${
                    status === "completed"
                      ? "bg-emerald-50/40 border-emerald-200"
                      : status === "in_progress"
                      ? "bg-blue-50/40 border-blue-200 ring-1 ring-blue-300"
                      : "bg-slate-50/60 border-slate-200"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Sequence Badge */}
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-7 w-7 rounded-md font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                          status === "completed"
                            ? "bg-evenvibe-primary text-white"
                            : status === "in_progress"
                            ? "bg-evenvibe-primary text-white shadow-xs"
                            : "bg-white text-slate-700 border border-slate-200 shadow-xs"
                        }`}
                      >
                        {status === "completed" ? "✓" : sequenceNumber}
                      </div>
                    </div>

                    {/* Icon */}
                    <div
                      className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                        status === "completed"
                          ? "bg-emerald-100 text-evenvibe-deep"
                          : status === "in_progress"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-white text-slate-500 border border-slate-200"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    {/* Details */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {sequenceNumber}. {stageConfig.label}
                        </p>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 capitalize ${getWorkflowStageBadgeColor(
                            key
                          )}`}
                        >
                          {key.replace(/_/g, " ")}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 truncate hidden sm:block">
                        {stageConfig.description}
                      </p>
                    </div>
                  </div>

                  {/* Status & Fixed Indicator */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right hidden md:block">
                      {status === "completed" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-evenvibe-deep">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Completed
                        </span>
                      ) : status === "in_progress" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                          <Play className="h-3.5 w-3.5" />
                          In Progress
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                          <Clock className="h-3.5 w-3.5" />
                          Pending
                        </span>
                      )}

                      {original?.completed_at && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDate(original.completed_at)}
                        </p>
                      )}
                      {status === "in_progress" && original?.started_at && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Started: {formatDate(original.started_at)}
                        </p>
                      )}
                    </div>

                    <Badge variant="outline" className="text-[10px] bg-white text-slate-500 border-slate-200 gap-1 shrink-0">
                      <Lock className="h-2.5 w-2.5" /> Fixed
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

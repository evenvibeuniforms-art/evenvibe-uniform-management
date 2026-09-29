import {
  Ruler,
  Boxes,
  Scissors,
  Layers,
  Printer,
  Sparkles,
  Shirt,
  CheckCheck,
  LucideIcon,
} from "lucide-react";

export type ProductionStageKey =
  | "stock_sizes"
  | "inventory"
  | "cutting"
  | "stitching"
  | "printing"
  | "embroidering"
  | "ironing_packing"
  | "checking";

export interface StageDefinition {
  key: ProductionStageKey;
  label: string;
  shortLabel?: string;
  description: string;
  icon: LucideIcon;
}

export const ALL_PRODUCTION_STAGES: StageDefinition[] = [
  {
    key: "stock_sizes",
    label: "Stock Sizes",
    description: "Verify sizing requirements and pull base uniform blanks",
    icon: Ruler,
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "Check fabric batches, thread, buttons, and material availability",
    icon: Boxes,
  },
  {
    key: "cutting",
    label: "Cutting",
    description: "Precision cutting of uniform panels based on graded measurements",
    icon: Scissors,
  },
  {
    key: "stitching",
    label: "Stitching",
    description: "Garment assembly, seam reinforcement, and tailoring",
    icon: Layers,
  },
  {
    key: "printing",
    label: "Printing",
    description: "Heat-press, screen-print logos, and custom student graphics",
    icon: Printer,
  },
  {
    key: "embroidering",
    label: "Embroidering",
    description: "High-density needle embroidery of school crest and emblems",
    icon: Sparkles,
  },
  {
    key: "checking",
    label: "Checking",
    description: "Pre-QC dimensional inspection and final line check",
    icon: CheckCheck,
  },
  {
    key: "ironing_packing",
    label: "Ironing and Packing",
    description: "Industrial steam pressing, folding, tagging, and bagging",
    icon: Shirt,
  },
];

export const FIXED_INITIAL_STAGES: readonly ProductionStageKey[] = [
  "stock_sizes",
  "inventory",
  "cutting",
] as const;

export const REORDERABLE_MIDDLE_STAGES: readonly ProductionStageKey[] = [
  "stitching",
  "printing",
  "embroidering",
] as const;

export const FIXED_FINAL_STAGES: readonly ProductionStageKey[] = [
  "checking",
  "ironing_packing",
] as const;

export const DEFAULT_PRODUCTION_SEQUENCE: ProductionStageKey[] = [
  "stock_sizes",
  "inventory",
  "cutting",
  "stitching",
  "printing",
  "embroidering",
  "checking",
  "ironing_packing",
];

export function validateWorkflowSequence(stageKeys: string[]): { valid: boolean; error?: string } {
  if (!stageKeys || stageKeys.length !== 8) {
    return { valid: false, error: "Workflow must contain exactly 8 stages." };
  }
  if (stageKeys[0] !== "stock_sizes") {
    return { valid: false, error: "Stage 1 must be Stock Sizes (stock_sizes)." };
  }
  if (stageKeys[1] !== "inventory") {
    return { valid: false, error: "Stage 2 must be Inventory (inventory)." };
  }
  if (stageKeys[2] !== "cutting") {
    return { valid: false, error: "Stage 3 must be Cutting (cutting)." };
  }
  if (stageKeys[6] !== "checking") {
    return { valid: false, error: "Stage 7 must be Checking (checking)." };
  }
  if (stageKeys[7] !== "ironing_packing") {
    return { valid: false, error: "Stage 8 must be Ironing and Packing (ironing_packing)." };
  }

  const middle = [stageKeys[3], stageKeys[4], stageKeys[5]];
  const expectedMiddle = new Set<string>(["stitching", "printing", "embroidering"]);
  const middleSet = new Set<string>(middle);

  if (middleSet.size !== 3 || ![...expectedMiddle].every((m) => middleSet.has(m))) {
    return {
      valid: false,
      error: "Stages 4, 5, and 6 must strictly contain a unique permutation of Stitching, Printing, and Embroidering.",
    };
  }

  return { valid: true };
}

export interface OrderWorkflowStage {
  id?: string;
  order_id: string;
  stage_key: ProductionStageKey;
  sequence_order: number;
  status: "pending" | "in_progress" | "completed";
  started_at: string | null;
  completed_at: string | null;
  ironing_completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const STAGE_CONFIG_MAP: Record<ProductionStageKey, StageDefinition> =
  ALL_PRODUCTION_STAGES.reduce((acc, stage) => {
    acc[stage.key] = stage;
    return acc;
  }, {} as Record<ProductionStageKey, StageDefinition>);

export function formatWorkflowStageLabel(stageKey: string): string {
  if (stageKey === "ready_to_start") return "Ready to Start";
  if (stageKey === "production_started") return "Production Started";
  if (stageKey === "production_completed") return "Production Completed";
  if (stageKey === "finishing") return "Finishing";

  const match = STAGE_CONFIG_MAP[stageKey as ProductionStageKey];
  if (match) return match.label;

  return stageKey
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getWorkflowStageBadgeColor(stageKey: string): string {
  switch (stageKey) {
    case "ready_to_start":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "stock_sizes":
      return "bg-cyan-100 text-cyan-800 border-cyan-200";
    case "inventory":
      return "bg-sky-100 text-sky-800 border-sky-200";
    case "cutting":
      return "bg-evenvibe-light text-evenvibe-deep border-evenvibe-light";
    case "stitching":
      return "bg-evenvibe-light text-evenvibe-deep border-evenvibe-light";
    case "printing":
      return "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200";
    case "embroidering":
      return "bg-pink-100 text-pink-800 border-pink-200";
    case "ironing_packing":
      return "bg-evenvibe-light text-evenvibe-deep border-evenvibe-light";
    case "checking":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "production_started":
      return "bg-blue-100 text-blue-800 border-blue-200";
    case "finishing":
      return "bg-pink-100 text-pink-800 border-pink-200";
    case "production_completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-800 border-slate-200";
  }
}

/**
 * Resolves current stage from an order's specific workflow list.
 * Workflows are sorted by sequence_order ASC (1..8).
 */
export function resolveOrderCurrentStage(
  workflows: OrderWorkflowStage[] | null | undefined,
  orderStatus?: string,
  legacyStage?: string
): {
  currentStageKey: string;
  currentStageLabel: string;
  currentSequence: number | null;
  isCompleted: boolean;
  isReadyToStart: boolean;
} {
  const sorted = [...(workflows || [])].sort((a, b) => a.sequence_order - b.sequence_order);

  // If no workflows available, fallback gracefully
  if (sorted.length === 0) {
    if (orderStatus === "confirmed" && !legacyStage) {
      return {
        currentStageKey: "ready_to_start",
        currentStageLabel: "Ready to Start",
        currentSequence: null,
        isCompleted: false,
        isReadyToStart: true,
      };
    }
    const key = legacyStage || "ready_to_start";
    return {
      currentStageKey: key,
      currentStageLabel: formatWorkflowStageLabel(key),
      currentSequence: null,
      isCompleted: key === "production_completed",
      isReadyToStart: key === "ready_to_start",
    };
  }

  // Check if order is in post-production lifecycle
  if (
    (orderStatus &&
      ["quality_check", "packed", "dispatched", "in_transit", "delivered"].includes(
        orderStatus
      )) ||
    legacyStage === "production_completed"
  ) {
    return {
      currentStageKey: "production_completed",
      currentStageLabel: "Production Completed",
      currentSequence: 8,
      isCompleted: true,
      isReadyToStart: false,
    };
  }

  // Check if all 8 stages are completed
  const allCompleted = sorted.every((s) => s.status === "completed");
  if (allCompleted) {
    return {
      currentStageKey: "production_completed",
      currentStageLabel: "Production Completed",
      currentSequence: 8,
      isCompleted: true,
      isReadyToStart: false,
    };
  }

  // If active legacyStage is provided (from production_records.stage)
  if (
    legacyStage &&
    legacyStage !== "ready_to_start" &&
    legacyStage !== "production_completed"
  ) {
    const matchingWorkflow = sorted.find((s) => s.stage_key === legacyStage);
    const inProgress = sorted.find((s) => s.status === "in_progress");

    // If both exist, take the more advanced stage sequence or authoritative legacyStage
    if (inProgress && matchingWorkflow) {
      if (inProgress.sequence_order >= matchingWorkflow.sequence_order) {
        return {
          currentStageKey: inProgress.stage_key,
          currentStageLabel: formatWorkflowStageLabel(inProgress.stage_key),
          currentSequence: inProgress.sequence_order,
          isCompleted: false,
          isReadyToStart: false,
        };
      }
      return {
        currentStageKey: matchingWorkflow.stage_key,
        currentStageLabel: formatWorkflowStageLabel(matchingWorkflow.stage_key),
        currentSequence: matchingWorkflow.sequence_order,
        isCompleted: false,
        isReadyToStart: false,
      };
    } else if (matchingWorkflow) {
      return {
        currentStageKey: matchingWorkflow.stage_key,
        currentStageLabel: formatWorkflowStageLabel(matchingWorkflow.stage_key),
        currentSequence: matchingWorkflow.sequence_order,
        isCompleted: false,
        isReadyToStart: false,
      };
    } else {
      return {
        currentStageKey: legacyStage,
        currentStageLabel: formatWorkflowStageLabel(legacyStage),
        currentSequence: null,
        isCompleted: false,
        isReadyToStart: false,
      };
    }
  }

  // Check for currently in_progress stage
  const inProgress = sorted.find((s) => s.status === "in_progress");
  if (inProgress) {
    return {
      currentStageKey: inProgress.stage_key,
      currentStageLabel: formatWorkflowStageLabel(inProgress.stage_key),
      currentSequence: inProgress.sequence_order,
      isCompleted: false,
      isReadyToStart: false,
    };
  }

  // Check if all are pending (before production has started)
  const allPending = sorted.every((s) => s.status === "pending");
  if (allPending) {
    return {
      currentStageKey: "ready_to_start",
      currentStageLabel: "Ready to Start",
      currentSequence: sorted[0]?.sequence_order || 1,
      isCompleted: false,
      isReadyToStart: true,
    };
  }

  // If some are completed and next is pending
  const firstPending = sorted.find((s) => s.status === "pending");
  if (firstPending) {
    return {
      currentStageKey: firstPending.stage_key,
      currentStageLabel: formatWorkflowStageLabel(firstPending.stage_key),
      currentSequence: firstPending.sequence_order,
      isCompleted: false,
      isReadyToStart: false,
    };
  }

  return {
    currentStageKey: sorted[0]?.stage_key || "ready_to_start",
    currentStageLabel: formatWorkflowStageLabel(sorted[0]?.stage_key || "ready_to_start"),
    currentSequence: sorted[0]?.sequence_order || 1,
    isCompleted: false,
    isReadyToStart: false,
  };
}

/**
 * Determines the next valid production stage and button action text.
 * Strictly adheres to the mandatory production flow:
 * 1. stock_sizes -> inventory ("Move to Inventory")
 * 2. inventory -> cutting ("Move to Cutting")
 * 3. cutting -> cutting_completed ("Complete Cutting")
 * 4..6. middle stages sequencing
 * 7. checking -> ironing_packing ("Move to Ironing and Packing")
 * 8. ironing_packing -> production_completed ("Mark Production Completed")
 *
 * HARD INVARIANT: nextStageKey must NEVER equal currentStageKey.
 */
export function getNextProductionStage(
  currentStageKey: string,
  workflows?: OrderWorkflowStage[] | null
): {
  nextStageKey: string | null;
  nextStageActionText: string | null;
} {
  const sorted = [...(workflows || [])].sort((a, b) => a.sequence_order - b.sequence_order);

  // Ready to Start -> Stock Sizes
  if (currentStageKey === "ready_to_start") {
    return {
      nextStageKey: "stock_sizes",
      nextStageActionText: "Start Production",
    };
  }

  // Stage 1: Stock Sizes -> Inventory
  if (currentStageKey === "stock_sizes") {
    return {
      nextStageKey: "inventory",
      nextStageActionText: "Move to Inventory",
    };
  }

  // Stage 2: Inventory -> Cutting
  // CRITICAL RULE: UI must NEVER generate "Move to Inventory" when currentStage is "inventory"
  if (currentStageKey === "inventory") {
    return {
      nextStageKey: "cutting",
      nextStageActionText: "Move to Cutting",
    };
  }

  // Stage 3: Cutting -> Complete Cutting (advances to first dynamic stage at sequence 4)
  if (currentStageKey === "cutting") {
    const seq4 = sorted.find((w) => w.sequence_order === 4);
    return {
      nextStageKey: seq4?.stage_key || "stitching",
      nextStageActionText: "Complete Cutting",
    };
  }

  // Cutting completed -> await or move to 4th stage
  if (currentStageKey === "cutting_completed") {
    const seq4 = sorted.find((w) => w.sequence_order === 4);
    if (seq4) {
      return {
        nextStageKey: seq4.stage_key,
        nextStageActionText: `Move to ${formatWorkflowStageLabel(seq4.stage_key)}`,
      };
    }
    return {
      nextStageKey: null,
      nextStageActionText: null,
    };
  }

  // Production completed
  if (currentStageKey === "production_completed") {
    return {
      nextStageKey: null,
      nextStageActionText: null,
    };
  }

  // Middle stages (sequences 4..6) and Checking (7), Ironing & Packing (8)
  const currentItem = sorted.find((w) => w.stage_key === currentStageKey);
  if (currentItem) {
    const currSeq = currentItem.sequence_order;
    if (currSeq < 8) {
      const nextItem = sorted.find((w) => w.sequence_order === currSeq + 1);
      if (nextItem) {
        return {
          nextStageKey: nextItem.stage_key,
          nextStageActionText: `Move to ${formatWorkflowStageLabel(nextItem.stage_key)}`,
        };
      }
    } else if (currSeq === 8) {
      return {
        nextStageKey: "production_completed",
        nextStageActionText: "Mark Production Completed",
      };
    }
  }

  return {
    nextStageKey: null,
    nextStageActionText: null,
  };
}

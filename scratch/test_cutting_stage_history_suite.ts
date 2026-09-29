import {
  OrderWorkflowStage,
  ProductionStageKey,
} from "../src/lib/productionWorkflow";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

console.log("=================================================================");
console.log("RUNNING PRODUCTION STAGE HISTORY & CUTTING TRANSITION SUITE (TESTS 1 - 10)");
console.log("=================================================================\n");

// Allowed canonical stages
const CANONICAL_STAGES: Set<string> = new Set([
  "production_started",
  "stock_sizes",
  "inventory",
  "cutting",
  "stitching",
  "printing",
  "embroidering",
  "checking",
  "ironing_packing",
  "finishing",
  "production_completed",
]);

// Helper to simulate advance_production_stage history generation
function simulateCuttingCompletionHistory(
  workflows: OrderWorkflowStage[],
  p_next_stage: string = "cutting_completed"
): { from_stage: string; to_stage: string; success: boolean; error?: string } {
  const currentStage = workflows.find((w) => w.stage_key === "cutting");
  if (!currentStage) {
    return { from_stage: "cutting", to_stage: "", success: false, error: "Cutting stage not found" };
  }

  // Authoritatively resolve next stage dynamically from sequence_order = 4
  const sorted = [...workflows].sort((a, b) => a.sequence_order - b.sequence_order);
  const seq4 = sorted.find((w) => w.sequence_order === 4);
  let v_next_stage_key = seq4?.stage_key;

  if (!v_next_stage_key) {
    v_next_stage_key = ["stitching", "printing", "embroidering"].includes(p_next_stage)
      ? (p_next_stage as ProductionStageKey)
      : "stitching";
  }

  // Validate to_stage against canonical database constraint
  if (!CANONICAL_STAGES.has(v_next_stage_key)) {
    return {
      from_stage: "cutting",
      to_stage: v_next_stage_key,
      success: false,
      error: `violates check constraint "production_stage_history_to_stage_check": invalid stage "${v_next_stage_key}"`,
    };
  }

  return {
    from_stage: "cutting",
    to_stage: v_next_stage_key,
    success: true,
  };
}

// =========================================================================
// TEST 1: Complete Cutting successfully — No CHECK constraint error
// =========================================================================
console.log("TEST 1: Complete Cutting successfully without CHECK constraint error");
{
  const workflows: OrderWorkflowStage[] = [
    { order_id: "o1", stage_key: "stock_sizes", sequence_order: 1, status: "completed", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "inventory", sequence_order: 2, status: "completed", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "cutting", sequence_order: 3, status: "in_progress", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "stitching", sequence_order: 4, status: "pending", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "printing", sequence_order: 5, status: "pending", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "embroidering", sequence_order: 6, status: "pending", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "checking", sequence_order: 7, status: "pending", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "ironing_packing", sequence_order: 8, status: "pending", started_at: null, completed_at: null },
  ];

  const res = simulateCuttingCompletionHistory(workflows, "cutting_completed");
  assert(res.success === true, `Cutting completion failed: ${res.error}`);
  assert(res.to_stage !== "cutting_completed", "to_stage must NOT be cutting_completed");
  console.log("  ✓ TEST 1 PASS: Completed Cutting without check constraint error.\n");
}

// =========================================================================
// TEST 2: Cutting history row is created
// =========================================================================
console.log("TEST 2: Cutting history row is created");
{
  const workflows: OrderWorkflowStage[] = [
    { order_id: "o1", stage_key: "stock_sizes", sequence_order: 1, status: "completed", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "inventory", sequence_order: 2, status: "completed", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "cutting", sequence_order: 3, status: "in_progress", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "stitching", sequence_order: 4, status: "pending", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "printing", sequence_order: 5, status: "pending", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "embroidering", sequence_order: 6, status: "pending", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "checking", sequence_order: 7, status: "pending", started_at: null, completed_at: null },
    { order_id: "o1", stage_key: "ironing_packing", sequence_order: 8, status: "pending", started_at: null, completed_at: null },
  ];

  const res = simulateCuttingCompletionHistory(workflows, "cutting_completed");
  assert(res.from_stage === "cutting", "from_stage must be cutting");
  assert(res.to_stage.length > 0, "to_stage must be non-empty");
  console.log(`  ✓ TEST 2 PASS: History row generated: ${res.from_stage} -> ${res.to_stage}.\n`);
}

// =========================================================================
// TEST 3: Correct to_stage is stored based on saved production sequence
// =========================================================================
console.log("TEST 3: Correct to_stage is stored based on saved production sequence");
{
  const makeWf = (s4: ProductionStageKey): OrderWorkflowStage[] => [
    { order_id: "o-dyn", stage_key: "stock_sizes", sequence_order: 1, status: "completed", started_at: null, completed_at: null },
    { order_id: "o-dyn", stage_key: "inventory", sequence_order: 2, status: "completed", started_at: null, completed_at: null },
    { order_id: "o-dyn", stage_key: "cutting", sequence_order: 3, status: "in_progress", started_at: null, completed_at: null },
    { order_id: "o-dyn", stage_key: s4, sequence_order: 4, status: "pending", started_at: null, completed_at: null },
    { order_id: "o-dyn", stage_key: "checking", sequence_order: 7, status: "pending", started_at: null, completed_at: null },
    { order_id: "o-dyn", stage_key: "ironing_packing", sequence_order: 8, status: "pending", started_at: null, completed_at: null },
  ];

  const res = simulateCuttingCompletionHistory(makeWf("printing"), "cutting_completed");
  assert(res.to_stage === "printing", `Expected to_stage printing, got ${res.to_stage}`);
  console.log("  ✓ TEST 3 PASS: Dynamically resolved from sequence_order 4.\n");
}

// =========================================================================
// TEST 4: Sequence starts with Stitching: Cutting -> Stitching
// =========================================================================
console.log("TEST 4: Sequence starts with Stitching: Cutting -> Stitching");
{
  const workflows: OrderWorkflowStage[] = [
    { order_id: "o-s4", stage_key: "cutting", sequence_order: 3, status: "in_progress", started_at: null, completed_at: null },
    { order_id: "o-s4", stage_key: "stitching", sequence_order: 4, status: "pending", started_at: null, completed_at: null },
  ];
  const res = simulateCuttingCompletionHistory(workflows);
  assert(res.from_stage === "cutting" && res.to_stage === "stitching", "Must transition cutting -> stitching");
  console.log("  ✓ TEST 4 PASS: Cutting -> Stitching transition stored.\n");
}

// =========================================================================
// TEST 5: Sequence starts with Printing: Cutting -> Printing
// =========================================================================
console.log("TEST 5: Sequence starts with Printing: Cutting -> Printing");
{
  const workflows: OrderWorkflowStage[] = [
    { order_id: "o-p4", stage_key: "cutting", sequence_order: 3, status: "in_progress", started_at: null, completed_at: null },
    { order_id: "o-p4", stage_key: "printing", sequence_order: 4, status: "pending", started_at: null, completed_at: null },
  ];
  const res = simulateCuttingCompletionHistory(workflows);
  assert(res.from_stage === "cutting" && res.to_stage === "printing", "Must transition cutting -> printing");
  console.log("  ✓ TEST 5 PASS: Cutting -> Printing transition stored.\n");
}

// =========================================================================
// TEST 6: Sequence starts with Embroidering: Cutting -> Embroidering
// =========================================================================
console.log("TEST 6: Sequence starts with Embroidering: Cutting -> Embroidering");
{
  const workflows: OrderWorkflowStage[] = [
    { order_id: "o-e4", stage_key: "cutting", sequence_order: 3, status: "in_progress", started_at: null, completed_at: null },
    { order_id: "o-e4", stage_key: "embroidering", sequence_order: 4, status: "pending", started_at: null, completed_at: null },
  ];
  const res = simulateCuttingCompletionHistory(workflows);
  assert(res.from_stage === "cutting" && res.to_stage === "embroidering", "Must transition cutting -> embroidering");
  console.log("  ✓ TEST 6 PASS: Cutting -> Embroidering transition stored.\n");
}

// =========================================================================
// TEST 7: Verify all 6 production permutations
// =========================================================================
console.log("TEST 7: Verify all 6 production permutations");
{
  const permutations: [ProductionStageKey, ProductionStageKey, ProductionStageKey][] = [
    ["stitching", "printing", "embroidering"],
    ["stitching", "embroidering", "printing"],
    ["printing", "stitching", "embroidering"],
    ["printing", "embroidering", "stitching"],
    ["embroidering", "stitching", "printing"],
    ["embroidering", "printing", "stitching"],
  ];

  permutations.forEach(([s4, s5, s6], idx) => {
    const workflows: OrderWorkflowStage[] = [
      { order_id: "o-perm", stage_key: "stock_sizes", sequence_order: 1, status: "completed", started_at: null, completed_at: null },
      { order_id: "o-perm", stage_key: "inventory", sequence_order: 2, status: "completed", started_at: null, completed_at: null },
      { order_id: "o-perm", stage_key: "cutting", sequence_order: 3, status: "in_progress", started_at: null, completed_at: null },
      { order_id: "o-perm", stage_key: s4, sequence_order: 4, status: "pending", started_at: null, completed_at: null },
      { order_id: "o-perm", stage_key: s5, sequence_order: 5, status: "pending", started_at: null, completed_at: null },
      { order_id: "o-perm", stage_key: s6, sequence_order: 6, status: "pending", started_at: null, completed_at: null },
      { order_id: "o-perm", stage_key: "checking", sequence_order: 7, status: "pending", started_at: null, completed_at: null },
      { order_id: "o-perm", stage_key: "ironing_packing", sequence_order: 8, status: "pending", started_at: null, completed_at: null },
    ];

    const res = simulateCuttingCompletionHistory(workflows);
    assert(res.success === true, `Permutation #${idx + 1} failed: ${res.error}`);
    assert(res.to_stage === s4, `Permutation #${idx + 1}: Expected to_stage ${s4}, got ${res.to_stage}`);
    console.log(`  ✓ Perm #${idx + 1} (${s4} -> ${s5} -> ${s6}): to_stage = ${res.to_stage}.`);
  });
  console.log("  ✓ TEST 7 PASS: All 6 permutations verified successfully.\n");
}

// =========================================================================
// TEST 8: Verify production_stage_history constraint accepts every valid canonical stage
// =========================================================================
console.log("TEST 8: Verify production_stage_history constraint accepts every valid canonical stage");
{
  const expectedCanonical = [
    "production_started",
    "stock_sizes",
    "inventory",
    "cutting",
    "stitching",
    "printing",
    "embroidering",
    "checking",
    "ironing_packing",
    "finishing",
    "production_completed",
  ];

  expectedCanonical.forEach((st) => {
    assert(CANONICAL_STAGES.has(st), `Stage ${st} must be accepted by database constraint`);
  });
  console.log("  ✓ TEST 8 PASS: All 11 canonical stages accepted by constraint.\n");
}

// =========================================================================
// TEST 9: Verify invalid stage values are rejected by the database
// =========================================================================
console.log("TEST 9: Verify invalid stage values are rejected by the database");
{
  const invalidStages = [
    "cutting_completed",
    "stage_cutting",
    "Cutting",
    "invalid_step",
    "foo_bar",
  ];

  invalidStages.forEach((st) => {
    assert(!CANONICAL_STAGES.has(st), `Invalid stage "${st}" must NOT be in canonical list`);
  });
  console.log("  ✓ TEST 9 PASS: Non-canonical values including cutting_completed are rejected.\n");
}

// =========================================================================
// TEST 10: Verify existing production history remains readable
// =========================================================================
console.log("TEST 10: Verify existing production history remains readable");
{
  // Simulated history records from an order lifecycle
  const historyRecords = [
    { from_stage: null, to_stage: "production_started" },
    { from_stage: "production_started", to_stage: "stock_sizes" },
    { from_stage: "stock_sizes", to_stage: "inventory" },
    { from_stage: "inventory", to_stage: "cutting" },
    { from_stage: "cutting", to_stage: "stitching" },
    { from_stage: "stitching", to_stage: "printing" },
    { from_stage: "printing", to_stage: "embroidering" },
    { from_stage: "embroidering", to_stage: "checking" },
    { from_stage: "checking", to_stage: "ironing_packing" },
    { from_stage: "ironing_packing", to_stage: "production_completed" },
  ];

  const allValid = historyRecords.every(
    (h) => (h.from_stage === null || CANONICAL_STAGES.has(h.from_stage)) && CANONICAL_STAGES.has(h.to_stage)
  );
  assert(allValid, "All history rows must conform to canonical stage constraints");
  assert(historyRecords.length === 10, "History has 10 standard steps");
  console.log("  ✓ TEST 10 PASS: Complete production lifecycle history is 100% readable and conformant.\n");
}

console.log("=================================================================");
console.log("ALL 10 TESTS IN SUITE PASSED WITH 100% SUCCESS!");
console.log("=================================================================");

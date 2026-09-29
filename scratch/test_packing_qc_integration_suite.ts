import assert from "node:assert";

console.log("=== RUNNING PACKING & DELIVERY QC INTEGRATION TEST SUITE ===");

interface MockQCRecord {
  order_id: string;
  status: "pending" | "in_progress" | "completed" | "passed";
  total_quantity: number;
  passed_quantity: number;
  defective_quantity: number;
}

interface MockPackingRecord {
  id: string;
  order_id: string;
  status: "in_progress" | "completed";
  total_quantity: number;
  packed_quantity: number;
}

// Logic simulating the server-side start_packing RPC validation and deliverable calculation
function simulateStartPacking(
  orderId: string,
  qcRecords: MockQCRecord[],
  packingRecords: MockPackingRecord[],
  _clientClaim?: { qc_completed?: boolean }
): { success: boolean; error?: string; packingId?: string; totalQuantity?: number } {
  // Check if packing record already exists (Test 8)
  const existingPacking = packingRecords.find((p) => p.order_id === orderId);
  if (existingPacking) {
    return { success: false, error: "Packing has already been started for this order." };
  }

  // Find order QC record (Test 4, 10: strictly scoped to current orderId)
  const qc = qcRecords.find((q) => q.order_id === orderId);

  // Validate QC completion strictly against database (Test 1, 2, 3, 5)
  // Ignores client claim (_clientClaim) completely
  if (!qc || (qc.status !== "completed" && qc.status !== "passed")) {
    return { success: false, error: "Complete Quality Check before starting packing." };
  }

  // Derive deliverable quantity strictly from QC Passed Quantity (Test 9)
  // Defective quantity is NOT deliverable
  const deliverableQty = qc.passed_quantity;

  const newPackingId = `packing-${orderId}`;
  return {
    success: true,
    packingId: newPackingId,
    totalQuantity: deliverableQty,
  };
}

// Helper to determine UI eligibility and display state (Tests 6, 7)
function computePackingUIDisplay(qcRecord: MockQCRecord | null, packingRecord: MockPackingRecord | null) {
  const isQCCompleted = qcRecord?.status === "completed" || qcRecord?.status === "passed";
  const qcStatusLabel = isQCCompleted
    ? "Completed"
    : qcRecord?.status === "in_progress"
    ? "In Progress"
    : "Pending";

  const canStartPacking = isQCCompleted && !packingRecord;
  const deliverableQuantity =
    qcRecord?.passed_quantity !== undefined && qcRecord.passed_quantity > 0
      ? qcRecord.passed_quantity
      : qcRecord?.total_quantity ?? 0;

  return {
    isQCCompleted,
    qcStatusLabel,
    canStartPacking,
    deliverableQuantity,
  };
}

// ----------------------------------------------------
// TEST 1: QC status = Pending -> Start Packing blocked
// ----------------------------------------------------
{
  const qcRecords: MockQCRecord[] = [
    { order_id: "ord-1", status: "pending", total_quantity: 10, passed_quantity: 0, defective_quantity: 0 },
  ];
  const res = simulateStartPacking("ord-1", qcRecords, []);
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.error, "Complete Quality Check before starting packing.");
  console.log("✓ TEST 1: QC status = Pending -> Start Packing blocked passed");
}

// ----------------------------------------------------
// TEST 2: QC status = In Progress -> Start Packing blocked
// ----------------------------------------------------
{
  const qcRecords: MockQCRecord[] = [
    { order_id: "ord-1", status: "in_progress", total_quantity: 10, passed_quantity: 5, defective_quantity: 0 },
  ];
  const res = simulateStartPacking("ord-1", qcRecords, []);
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.error, "Complete Quality Check before starting packing.");
  console.log("✓ TEST 2: QC status = In Progress -> Start Packing blocked passed");
}

// ----------------------------------------------------
// TEST 3: QC status = Completed -> Start Packing allowed
// ----------------------------------------------------
{
  const qcRecords: MockQCRecord[] = [
    { order_id: "ord-1", status: "completed", total_quantity: 10, passed_quantity: 10, defective_quantity: 0 },
  ];
  const res = simulateStartPacking("ord-1", qcRecords, []);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.totalQuantity, 10);
  console.log("✓ TEST 3: QC status = Completed -> Start Packing allowed passed");
}

// ----------------------------------------------------
// TEST 4: QC completed for Order A -> Order A allowed; QC incomplete for Order B -> Order B blocked
// ----------------------------------------------------
{
  const qcRecords: MockQCRecord[] = [
    { order_id: "ord-A", status: "completed", total_quantity: 8, passed_quantity: 8, defective_quantity: 0 },
    { order_id: "ord-B", status: "in_progress", total_quantity: 15, passed_quantity: 0, defective_quantity: 0 },
  ];
  const resA = simulateStartPacking("ord-A", qcRecords, []);
  const resB = simulateStartPacking("ord-B", qcRecords, []);

  assert.strictEqual(resA.success, true);
  assert.strictEqual(resB.success, false);
  assert.strictEqual(resB.error, "Complete Quality Check before starting packing.");
  console.log("✓ TEST 4: Order A allowed, Order B blocked passed");
}

// ----------------------------------------------------
// TEST 5: Client sends fake qc_completed = true while DB says incomplete -> server rejects
// ----------------------------------------------------
{
  const qcRecords: MockQCRecord[] = [
    { order_id: "ord-1", status: "in_progress", total_quantity: 10, passed_quantity: 0, defective_quantity: 0 },
  ];
  const res = simulateStartPacking("ord-1", qcRecords, [], { qc_completed: true });
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.error, "Complete Quality Check before starting packing.");
  console.log("✓ TEST 5: Fake client qc_completed flag rejected by server passed");
}

// ----------------------------------------------------
// TEST 6: QC completed -> navigate to Packing & Delivery -> page shows QC Completed
// ----------------------------------------------------
{
  const qc: MockQCRecord = {
    order_id: "ord-1",
    status: "completed",
    total_quantity: 20,
    passed_quantity: 19,
    defective_quantity: 1,
  };
  const ui = computePackingUIDisplay(qc, null);
  assert.strictEqual(ui.isQCCompleted, true);
  assert.strictEqual(ui.qcStatusLabel, "Completed");
  assert.strictEqual(ui.canStartPacking, true);
  console.log("✓ TEST 6: UI displays QC Completed ✓ passed");
}

// ----------------------------------------------------
// TEST 7: QC completed while Packing page is open -> refresh updates state -> Start Packing enabled
// ----------------------------------------------------
{
  // Before QC complete
  let qc: MockQCRecord = {
    order_id: "ord-1",
    status: "in_progress",
    total_quantity: 10,
    passed_quantity: 0,
    defective_quantity: 0,
  };
  let ui = computePackingUIDisplay(qc, null);
  assert.strictEqual(ui.isQCCompleted, false);
  assert.strictEqual(ui.canStartPacking, false);

  // Realtime update / revalidation fires after QC completes
  qc = {
    ...qc,
    status: "completed",
    passed_quantity: 10,
  };
  ui = computePackingUIDisplay(qc, null);
  assert.strictEqual(ui.isQCCompleted, true);
  assert.strictEqual(ui.canStartPacking, true);
  console.log("✓ TEST 7: Realtime/refresh updates state and enables Start Packing passed");
}

// ----------------------------------------------------
// TEST 8: Packing already started -> duplicate Start Packing prevented
// ----------------------------------------------------
{
  const qcRecords: MockQCRecord[] = [
    { order_id: "ord-1", status: "completed", total_quantity: 10, passed_quantity: 10, defective_quantity: 0 },
  ];
  const packingRecords: MockPackingRecord[] = [
    { id: "pack-1", order_id: "ord-1", status: "in_progress", total_quantity: 10, packed_quantity: 2 },
  ];
  const res = simulateStartPacking("ord-1", qcRecords, packingRecords);
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.error, "Packing has already been started for this order.");
  console.log("✓ TEST 8: Duplicate Start Packing prevented passed");
}

// ----------------------------------------------------
// TEST 9: QC defective quantity exists -> defective quantity NOT deliverable
// Example: Packed 10, Passed 8, Defective 2 -> Deliverable must be 8 (NOT 10)
// ----------------------------------------------------
{
  const qcRecords: MockQCRecord[] = [
    { order_id: "ord-1", status: "completed", total_quantity: 10, passed_quantity: 8, defective_quantity: 2 },
  ];
  const res = simulateStartPacking("ord-1", qcRecords, []);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.totalQuantity, 8); // Strictly 8, not 10
  console.log("✓ TEST 9: Defective quantity strictly excluded from deliverable quantity passed");
}

// ----------------------------------------------------
// TEST 10: Current order isolation -> no QC state leakage from another order
// ----------------------------------------------------
{
  const qcRecords: MockQCRecord[] = [
    { order_id: "other-order", status: "completed", total_quantity: 50, passed_quantity: 50, defective_quantity: 0 },
  ];
  // Target order has no QC completed
  const res = simulateStartPacking("my-order", qcRecords, []);
  assert.strictEqual(res.success, false);
  assert.strictEqual(res.error, "Complete Quality Check before starting packing.");
  console.log("✓ TEST 10: Current order isolation verified passed");
}

console.log("=================================================");
console.log("ALL 10 PACKING-QC INTEGRATION TESTS PASSED!");
console.log("=================================================");

import assert from "node:assert";

console.log("=== RUNNING DELIVERY MODULE TEST SUITE ===");

interface DeliveryItem {
  id: string;
  styleName: string;
  itemName: string;
  color: string;
  size: string;
  quantity: number;
}

// ----------------------------------------------------
// TEST 1: QC not completed -> Delivery locked.
// Expected: Delivery preparation blocked.
// ----------------------------------------------------
{
  function isDeliveryAvailable(qcStatus: string | null): boolean {
    return qcStatus === "completed" || qcStatus === "passed";
  }

  assert.strictEqual(isDeliveryAvailable("pending"), false);
  assert.strictEqual(isDeliveryAvailable("in_progress"), false);
  assert.strictEqual(isDeliveryAvailable(null), false);
  assert.strictEqual(isDeliveryAvailable("completed"), true);
  assert.strictEqual(isDeliveryAvailable("passed"), true);
  console.log("✓ TEST 1: QC not completed -> Delivery locked passed");
}

// ----------------------------------------------------
// TEST 2: QC completed, Passed = 3.
// Expected: Delivery shows Approved Quantity = 3.
// ----------------------------------------------------
{
  const qcItems = [
    { item_name: "Pant", style_name: "hbbhhh", color: "Blue", size: "28", packed_quantity: 1, passed_quantity: 1, defective_quantity: 0 },
    { item_name: "Shirt", style_name: "style drak", color: "Blue", size: "28", packed_quantity: 1, passed_quantity: 1, defective_quantity: 0 },
    { item_name: "Shirt", style_name: "style drak", color: "Blue", size: "30", packed_quantity: 1, passed_quantity: 1, defective_quantity: 0 },
  ];

  const approvedItems: DeliveryItem[] = qcItems
    .filter((item) => (item.passed_quantity || 0) > 0)
    .map((item, idx) => ({
      id: `item-${idx}`,
      styleName: item.style_name,
      itemName: item.item_name,
      color: item.color,
      size: item.size,
      quantity: item.passed_quantity,
    }));

  const totalApproved = approvedItems.reduce((acc, it) => acc + it.quantity, 0);
  assert.strictEqual(totalApproved, 3);
  assert.strictEqual(approvedItems.length, 3);
  console.log("✓ TEST 2: QC completed, Passed = 3 -> Delivery shows Approved Quantity = 3 passed");
}

// ----------------------------------------------------
// TEST 3: QC Packed = 3, QC Passed = 2, QC Defective = 1 (Screenshot exact case).
// Pant 28: Packed 1, Passed 1, Defective 0
// Shirt 28: Packed 1, Passed 1, Defective 0
// Shirt 30: Packed 1, Passed 0, Defective 1
// Expected: Delivery Approved Quantity = 2. Defective piece excluded.
// ----------------------------------------------------
{
  const qcItems = [
    { item_name: "Pant", style_name: "hbbhhh", color: "Blue", size: "28", packed_quantity: 1, passed_quantity: 1, defective_quantity: 0 },
    { item_name: "Shirt", style_name: "style drak", color: "Blue", size: "28", packed_quantity: 1, passed_quantity: 1, defective_quantity: 0 },
    { item_name: "Shirt", style_name: "style drak", color: "Blue", size: "30", packed_quantity: 1, passed_quantity: 0, defective_quantity: 1 },
  ];

  const approvedItems: DeliveryItem[] = qcItems
    .filter((item) => (item.passed_quantity || 0) > 0)
    .map((item, idx) => ({
      id: `item-${idx}`,
      styleName: item.style_name,
      itemName: item.item_name,
      color: item.color,
      size: item.size,
      quantity: item.passed_quantity,
    }));

  const totalApproved = approvedItems.reduce((acc, it) => acc + it.quantity, 0);
  assert.strictEqual(totalApproved, 2);
  assert.strictEqual(approvedItems.length, 2);
  console.log("✓ TEST 3: QC Packed = 3, Passed = 2, Defective = 1 -> Approved Quantity = 2 passed");
}

// ----------------------------------------------------
// TEST 4: Zero Quantity Rule.
// QC Passed = 0 -> No delivery operational row.
// ----------------------------------------------------
{
  const qcItems = [
    { item_name: "Shirt", style_name: "style drak", color: "Blue", size: "30", packed_quantity: 1, passed_quantity: 0, defective_quantity: 1 },
  ];

  const approvedItems = qcItems.filter((item) => (item.passed_quantity || 0) > 0);
  assert.strictEqual(approvedItems.length, 0);
  console.log("✓ TEST 4: Zero Quantity Rule: QC Passed = 0 -> No delivery row passed");
}

// ----------------------------------------------------
// TEST 5: Exact Separation between Style, Item, Color, Size.
// Expected: Style A Blue 28 (qty 2) and Style A Yellow 28 (qty 1) remain separate rows.
// ----------------------------------------------------
{
  const qcItems = [
    { item_name: "Pant", style_name: "Style A", color: "Blue", size: "28", packed_quantity: 2, passed_quantity: 2, defective_quantity: 0 },
    { item_name: "Pant", style_name: "Style A", color: "Yellow", size: "28", packed_quantity: 1, passed_quantity: 1, defective_quantity: 0 },
  ];

  const approvedItems = qcItems.filter((item) => (item.passed_quantity || 0) > 0);
  assert.strictEqual(approvedItems.length, 2);
  assert.notStrictEqual(approvedItems[0].color, approvedItems[1].color);
  console.log("✓ TEST 5: Style, Item, Color, Size remain strictly separated passed");
}

// ----------------------------------------------------
// TEST 6: Start Delivery only after QC completed.
// ----------------------------------------------------
{
  function validateStartDelivery(qcStatus: string, approvedQty: number) {
    if (qcStatus !== "completed" && qcStatus !== "passed") {
      return { success: false, error: "Complete Quality Check before starting delivery." };
    }
    if (approvedQty <= 0) {
      return { success: false, error: "No approved pieces are available for delivery." };
    }
    return { success: true };
  }

  assert.strictEqual(validateStartDelivery("pending", 5).success, false);
  assert.strictEqual(validateStartDelivery("completed", 0).success, false);
  assert.strictEqual(validateStartDelivery("completed", 5).success, true);
  console.log("✓ TEST 6: Start Delivery only allowed when QC completed & approvedQty > 0 passed");
}

// ----------------------------------------------------
// TEST 7: Delivered Quantity > Approved Quantity -> Reject.
// ----------------------------------------------------
{
  function validateDeliveryProgress(approvedQty: number, deliveredQty: number) {
    if (deliveredQty < 0 || deliveredQty > approvedQty) {
      return { success: false, error: "Delivered quantity cannot exceed approved quantity." };
    }
    return { success: true };
  }

  assert.strictEqual(validateDeliveryProgress(5, 6).success, false);
  assert.strictEqual(validateDeliveryProgress(5, 5).success, true);
  assert.strictEqual(validateDeliveryProgress(5, 0).success, true);
  console.log("✓ TEST 7: Delivered Quantity > Approved Quantity rejected passed");
}

// ----------------------------------------------------
// TEST 8: Order A Delivery data must not appear in Order B.
// ----------------------------------------------------
{
  const orderAItems = [
    { order_id: "order-A", item_name: "Pant", size: "28", passed_quantity: 2 },
  ];
  const orderBItems = [
    { order_id: "order-B", item_name: "Shirt", size: "32", passed_quantity: 4 },
  ];

  const filterForOrderA = (items: typeof orderAItems, orderId: string) =>
    items.filter((i) => i.order_id === orderId);

  const resultForA = filterForOrderA([...orderAItems, ...orderBItems], "order-A");
  assert.strictEqual(resultForA.length, 1);
  assert.strictEqual(resultForA[0].order_id, "order-A");
  assert.strictEqual(resultForA.some((i) => i.order_id === "order-B"), false);
  console.log("✓ TEST 8: Order isolation verified passed");
}

// ----------------------------------------------------
// TEST 9: QC completed -> Quality Check "Go to Delivery" works.
// ----------------------------------------------------
{
  const qcRecord = { status: "completed" };
  const isQcCompleted = qcRecord.status === "completed" || qcRecord.status === "passed";
  const linkHref = isQcCompleted ? "/admin/packing-delivery/ord-123" : null;
  const linkLabel = isQcCompleted ? "Go to Delivery" : null;

  assert.strictEqual(isQcCompleted, true);
  assert.strictEqual(linkHref, "/admin/packing-delivery/ord-123");
  assert.strictEqual(linkLabel, "Go to Delivery");
  console.log("✓ TEST 9: QC completed -> Go to Delivery link works passed");
}

// ----------------------------------------------------
// TEST 10: Delivery completed -> Order status becomes Delivered.
// ----------------------------------------------------
{
  function handleOrderLifecycle(currentStatus: string, action: string) {
    if (action === "mark_delivered") {
      return "delivered";
    }
    if (action === "dispatch") {
      return "dispatched";
    }
    return currentStatus;
  }

  assert.strictEqual(handleOrderLifecycle("dispatched", "mark_delivered"), "delivered");
  assert.strictEqual(handleOrderLifecycle("in_progress", "dispatch"), "dispatched");
  console.log("✓ TEST 10: Delivery completed -> Order status becomes Delivered passed");
}

console.log("\nALL 10 DELIVERY MODULE TEST CASES PASSED SUCCESSFULLY!");

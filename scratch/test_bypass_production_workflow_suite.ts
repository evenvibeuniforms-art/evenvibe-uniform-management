import assert from "node:assert";

console.log("=== RUNNING BYPASS PRODUCTION WORKFLOW TEST SUITE ===");

// ----------------------------------------------------
// TEST 1: Order Status Transitions
// ----------------------------------------------------
{
  const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
    submitted: ["under_review"],
    under_review: ["confirmed"],
    confirmed: ["packed", "production"],
    production: ["packed", "quality_check"],
    quality_check: ["packed"],
    packed: ["dispatched"],
    dispatched: ["in_transit"],
    in_transit: ["delivered"],
    delivered: [],
  };

  function isValidTransition(curr: string, next: string): boolean {
    const allowed = VALID_STATUS_TRANSITIONS[curr];
    return allowed ? allowed.includes(next) : false;
  }

  // Valid path: submitted -> under_review -> confirmed -> packed -> dispatched -> in_transit -> delivered
  assert.strictEqual(isValidTransition("submitted", "under_review"), true);
  assert.strictEqual(isValidTransition("under_review", "confirmed"), true);
  assert.strictEqual(isValidTransition("confirmed", "packed"), true, "Confirmed must be allowed to transition directly to packed (Delivery)");
  assert.strictEqual(isValidTransition("packed", "dispatched"), true);
  assert.strictEqual(isValidTransition("dispatched", "in_transit"), true);
  assert.strictEqual(isValidTransition("in_transit", "delivered"), true);

  // Backward compatibility: existing orders in production/qc can move directly to packed
  assert.strictEqual(isValidTransition("production", "packed"), true, "Orders in production can move directly to packed");
  assert.strictEqual(isValidTransition("quality_check", "packed"), true, "Orders in quality_check can move to packed");
  assert.strictEqual(isValidTransition("confirmed", "production"), true, "Confirmed can still access production if needed");

  // Invalid shortcuts
  assert.strictEqual(isValidTransition("submitted", "packed"), false, "Submitted cannot skip review/confirmation");
  assert.strictEqual(isValidTransition("submitted", "delivered"), false, "Submitted cannot jump to delivered");
  assert.strictEqual(isValidTransition("confirmed", "dispatched"), false, "Confirmed cannot jump directly to dispatched without entering delivery");
  assert.strictEqual(isValidTransition("delivered", "packed"), false, "Delivered cannot transition backward");

  console.log("✓ TEST 1: Order status transitions passed");
}

// ----------------------------------------------------
// TEST 2: Delivery items fallback when QC is bypassed
// ----------------------------------------------------
{
  interface DeliveryItemRow {
    id: string;
    styleName: string;
    itemName: string;
    color: string;
    size: string;
    quantity: number;
    status: string;
  }

  interface QCItem {
    id: string;
    style_name: string | null;
    item_name: string;
    color: string | null;
    size: string;
    passed_quantity: number | null;
  }

  interface ReqItem {
    id: string;
    item_name: string;
    style_name?: string | null;
    color?: string | null;
    size: string;
    quantity: number;
  }

  function resolveDeliveryItems(
    qcItems: QCItem[] | null,
    reqItems: ReqItem[] | null,
    rowStatus: string
  ): DeliveryItemRow[] {
    let items: DeliveryItemRow[] = (qcItems || [])
      .filter((item) => (item.passed_quantity || 0) > 0)
      .map((item) => ({
        id: item.id,
        styleName: item.style_name?.trim() || "Standard",
        itemName: item.item_name,
        color: item.color?.trim() || "Default",
        size: item.size,
        quantity: item.passed_quantity || 0,
        status: rowStatus,
      }));

    if (items.length === 0 && reqItems) {
      items = reqItems
        .filter((item) => (item.quantity || 0) > 0)
        .map((item) => ({
          id: item.id,
          styleName: item.style_name?.trim() || "Standard",
          itemName: item.item_name,
          color: item.color?.trim() || "Default",
          size: item.size,
          quantity: item.quantity,
          status: rowStatus,
        }));
    }
    return items;
  }

  // Case A: QC bypassed (no QC items) -> Uses requirement items
  const reqItems: ReqItem[] = [
    { id: "ri-1", item_name: "Shirt", style_name: "Boys Regular", color: "Sky Blue", size: "32", quantity: 15 },
    { id: "ri-2", item_name: "Pant", style_name: "Boys Regular", color: "Navy Blue", size: "30", quantity: 15 },
  ];
  const itemsBypassed = resolveDeliveryItems(null, reqItems, "ready");
  assert.strictEqual(itemsBypassed.length, 2);
  assert.strictEqual(itemsBypassed[0].itemName, "Shirt");
  assert.strictEqual(itemsBypassed[0].styleName, "Boys Regular");
  assert.strictEqual(itemsBypassed[0].color, "Sky Blue");
  assert.strictEqual(itemsBypassed[0].size, "32");
  assert.strictEqual(itemsBypassed[0].quantity, 15);
  assert.strictEqual(itemsBypassed.reduce((sum, i) => sum + i.quantity, 0), 30);

  // Case B: Historical order with QC items -> Uses QC passed quantity
  const qcItems: QCItem[] = [
    { id: "qci-1", item_name: "Shirt", style_name: "Boys Regular", color: "Sky Blue", size: "32", passed_quantity: 14 },
    { id: "qci-2", item_name: "Pant", style_name: "Boys Regular", color: "Navy Blue", size: "30", passed_quantity: 13 },
  ];
  const itemsHistorical = resolveDeliveryItems(qcItems, reqItems, "ready");
  assert.strictEqual(itemsHistorical.length, 2);
  assert.strictEqual(itemsHistorical[0].quantity, 14, "Uses QC passed quantity when available");
  assert.strictEqual(itemsHistorical[1].quantity, 13);
  assert.strictEqual(itemsHistorical.reduce((sum, i) => sum + i.quantity, 0), 27);

  console.log("✓ TEST 2: Delivery items fallback when QC is bypassed passed");
}

// ----------------------------------------------------
// TEST 3: Delivery readiness without QC record
// ----------------------------------------------------
{
  function checkDeliveryReadiness(
    qcRecord: { status: string } | null,
    orderStatus: string,
    hasPackingRecord: boolean
  ) {
    const isQcCompleted =
      qcRecord?.status === "completed" ||
      qcRecord?.status === "passed" ||
      (!qcRecord && ["confirmed", "packed", "dispatched", "in_transit", "delivered"].includes(orderStatus));

    const isDelivered = orderStatus === "delivered";
    const isDispatched = orderStatus === "dispatched" || orderStatus === "in_transit";
    const hasStartedDelivery = hasPackingRecord || isDispatched || isDelivered;

    let deliveryStatus: "pending_qc" | "ready" | "in_progress" | "dispatched" | "delivered";
    if (!isQcCompleted) {
      deliveryStatus = "pending_qc";
    } else if (isDelivered) {
      deliveryStatus = "delivered";
    } else if (isDispatched) {
      deliveryStatus = "dispatched";
    } else if (hasStartedDelivery) {
      deliveryStatus = "in_progress";
    } else {
      deliveryStatus = "ready";
    }

    return { isQcCompleted, deliveryStatus };
  }

  // Confirmed order with NO QC record -> should be ready!
  const res1 = checkDeliveryReadiness(null, "confirmed", false);
  assert.strictEqual(res1.isQcCompleted, true, "Bypassed order is marked ready without QC");
  assert.strictEqual(res1.deliveryStatus, "ready", "Status is ready for delivery");

  // Packed order with NO QC record, delivery not started -> should be ready
  const res2 = checkDeliveryReadiness(null, "packed", false);
  assert.strictEqual(res2.deliveryStatus, "ready");

  // Packed order with delivery in progress
  const res3 = checkDeliveryReadiness(null, "packed", true);
  assert.strictEqual(res3.deliveryStatus, "in_progress");

  // Dispatched order
  const res4 = checkDeliveryReadiness(null, "dispatched", true);
  assert.strictEqual(res4.deliveryStatus, "dispatched");

  // Delivered order
  const res5 = checkDeliveryReadiness(null, "delivered", true);
  assert.strictEqual(res5.deliveryStatus, "delivered");

  // Unfinished QC on an order that actually started QC -> correctly blocked
  const res6 = checkDeliveryReadiness({ status: "in_progress" }, "production", false);
  assert.strictEqual(res6.isQcCompleted, false);
  assert.strictEqual(res6.deliveryStatus, "pending_qc");

  console.log("✓ TEST 3: Delivery readiness without QC record passed");
}

console.log("\nALL BYPASS PRODUCTION WORKFLOW TESTS PASSED SUCCESSFULLY!");

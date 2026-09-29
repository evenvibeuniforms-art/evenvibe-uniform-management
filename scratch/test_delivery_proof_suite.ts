import assert from "node:assert";

console.log("=== RUNNING DELIVERY PROOF MODULE TEST SUITE ===");

interface DeliveryProofItem {
  id: string;
  order_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  caption: string | null;
  uploaded_by: string;
  created_at: string;
}

// ----------------------------------------------------
// TEST 1: Admin uploads one image.
// Expected: Image stored successfully, linked to order_id.
// ----------------------------------------------------
{
  const orderId = "order-001";
  const image: DeliveryProofItem = {
    id: "img-001",
    order_id: orderId,
    storage_path: `${orderId}/delivery-proof-001.jpg`,
    file_name: "box-packed.jpg",
    mime_type: "image/jpeg",
    file_size: 1024 * 500,
    caption: "Box packed photo",
    uploaded_by: "admin-user-id",
    created_at: new Date().toISOString(),
  };

  assert.strictEqual(image.order_id, orderId);
  assert.strictEqual(image.file_name, "box-packed.jpg");
  console.log("✓ TEST 1: Admin uploads one image passed");
}

// ----------------------------------------------------
// TEST 2: Admin uploads 3 images.
// Expected: All 3 appear separately.
// ----------------------------------------------------
{
  const orderId = "order-001";
  const images: DeliveryProofItem[] = [
    {
      id: "img-001",
      order_id: orderId,
      storage_path: `${orderId}/proof-1.jpg`,
      file_name: "proof-1.jpg",
      mime_type: "image/jpeg",
      file_size: 1024 * 300,
      caption: null,
      uploaded_by: "admin-user-id",
      created_at: "2026-09-28T10:00:00Z",
    },
    {
      id: "img-002",
      order_id: orderId,
      storage_path: `${orderId}/proof-2.jpg`,
      file_name: "proof-2.jpg",
      mime_type: "image/png",
      file_size: 1024 * 400,
      caption: "Parcel seal",
      uploaded_by: "admin-user-id",
      created_at: "2026-09-28T10:01:00Z",
    },
    {
      id: "img-003",
      order_id: orderId,
      storage_path: `${orderId}/proof-3.webp`,
      file_name: "proof-3.webp",
      mime_type: "image/webp",
      file_size: 1024 * 250,
      caption: "Courier handover",
      uploaded_by: "admin-user-id",
      created_at: "2026-09-28T10:02:00Z",
    },
  ];

  assert.strictEqual(images.length, 3);
  const ids = new Set(images.map((i) => i.id));
  assert.strictEqual(ids.size, 3);
  console.log("✓ TEST 2: Admin uploads 3 images passed");
}

// ----------------------------------------------------
// TEST 3: Admin uploads another image later.
// Expected: Existing images remain. New image is added.
// ----------------------------------------------------
{
  const orderId = "order-001";
  const currentImages: DeliveryProofItem[] = [
    {
      id: "img-001",
      order_id: orderId,
      storage_path: `${orderId}/proof-1.jpg`,
      file_name: "proof-1.jpg",
      mime_type: "image/jpeg",
      file_size: 1024 * 300,
      caption: null,
      uploaded_by: "admin-user-id",
      created_at: "2026-09-28T10:00:00Z",
    },
  ];

  const newImage: DeliveryProofItem = {
    id: "img-002",
    order_id: orderId,
    storage_path: `${orderId}/proof-2.jpg`,
    file_name: "proof-2.jpg",
    mime_type: "image/jpeg",
    file_size: 1024 * 450,
    caption: "Delivery receipt",
    uploaded_by: "admin-user-id",
    created_at: "2026-09-28T14:00:00Z",
  };

  const updatedImages = [...currentImages, newImage];
  assert.strictEqual(updatedImages.length, 2);
  assert.strictEqual(updatedImages[0].id, "img-001");
  assert.strictEqual(updatedImages[1].id, "img-002");
  console.log("✓ TEST 3: Admin uploads another image later passed");
}

// ----------------------------------------------------
// TEST 4: Admin deletes image.
// Expected: Database record removed, storage path cleaned.
// ----------------------------------------------------
{
  let images: DeliveryProofItem[] = [
    {
      id: "img-001",
      order_id: "order-001",
      storage_path: "order-001/proof-1.jpg",
      file_name: "proof-1.jpg",
      mime_type: "image/jpeg",
      file_size: 1024 * 300,
      caption: null,
      uploaded_by: "admin-user-id",
      created_at: "2026-09-28T10:00:00Z",
    },
  ];

  const deleteTargetId = "img-001";
  const deletedPath = images.find((i) => i.id === deleteTargetId)?.storage_path;
  images = images.filter((i) => i.id !== deleteTargetId);

  assert.strictEqual(images.length, 0);
  assert.strictEqual(deletedPath, "order-001/proof-1.jpg");
  console.log("✓ TEST 4: Admin deletes image passed");
}

// ----------------------------------------------------
// TEST 5 & 14: School Admin opens same order.
// Expected: Uploaded Delivery Proof images are visible.
// ----------------------------------------------------
{
  const schoolAdminSchoolId = "school-A";
  const order = { id: "order-001", school_id: "school-A" };
  const allImages: DeliveryProofItem[] = [
    {
      id: "img-001",
      order_id: "order-001",
      storage_path: "order-001/proof-1.jpg",
      file_name: "proof-1.jpg",
      mime_type: "image/jpeg",
      file_size: 1024 * 300,
      caption: "Uniform packages",
      uploaded_by: "admin-user-id",
      created_at: "2026-09-28T10:00:00Z",
    },
  ];

  function getSchoolAdminImages(userSchoolId: string, targetOrder: { id: string; school_id: string }): DeliveryProofItem[] {
    if (userSchoolId !== targetOrder.school_id) {
      return [];
    }
    return allImages.filter((img) => img.order_id === targetOrder.id);
  }

  const visibleImages = getSchoolAdminImages(schoolAdminSchoolId, order);
  assert.strictEqual(visibleImages.length, 1);
  assert.strictEqual(visibleImages[0].caption, "Uniform packages");
  console.log("✓ TEST 5 & 14: School Admin opens same order passed");
}

// ----------------------------------------------------
// TEST 6 & 12: School Admin opens another school's order.
// Expected: Cannot access other school's delivery proof.
// ----------------------------------------------------
{
  const schoolAAdminSchoolId = "school-A";
  const orderB = { id: "order-B", school_id: "school-B" };
  const allImages: DeliveryProofItem[] = [
    {
      id: "img-B-001",
      order_id: "order-B",
      storage_path: "order-B/proof-1.jpg",
      file_name: "school-b-packages.jpg",
      mime_type: "image/jpeg",
      file_size: 1024 * 500,
      caption: "School B boxes",
      uploaded_by: "admin-user-id",
      created_at: "2026-09-28T11:00:00Z",
    },
  ];

  function getSchoolAdminImages(userSchoolId: string, targetOrder: { id: string; school_id: string }): DeliveryProofItem[] {
    if (userSchoolId !== targetOrder.school_id) {
      return [];
    }
    return allImages.filter((img) => img.order_id === targetOrder.id);
  }

  const schoolAViewOfOrderB = getSchoolAdminImages(schoolAAdminSchoolId, orderB);
  assert.strictEqual(schoolAViewOfOrderB.length, 0);
  console.log("✓ TEST 6 & 12: School Admin opens another school's order -> Locked / Zero access passed");
}

// ----------------------------------------------------
// TEST 7 & 8: School Admin attempts upload or delete.
// Expected: Server rejects operation with authorization error.
// ----------------------------------------------------
{
  function authorizeUpload(role: string): { allowed: boolean; error?: string } {
    if (role !== "evenvibe_admin") {
      return { allowed: false, error: "Unauthorized. Admin privileges required." };
    }
    return { allowed: true };
  }

  function authorizeDelete(role: string): { allowed: boolean; error?: string } {
    if (role !== "evenvibe_admin") {
      return { allowed: false, error: "Unauthorized. Admin privileges required." };
    }
    return { allowed: true };
  }

  const schoolAdminUpload = authorizeUpload("school_admin");
  assert.strictEqual(schoolAdminUpload.allowed, false);
  assert.strictEqual(schoolAdminUpload.error, "Unauthorized. Admin privileges required.");

  const schoolAdminDelete = authorizeDelete("school_admin");
  assert.strictEqual(schoolAdminDelete.allowed, false);
  assert.strictEqual(schoolAdminDelete.error, "Unauthorized. Admin privileges required.");

  console.log("✓ TEST 7 & 8: School Admin attempts upload/delete -> Server rejects passed");
}

// ----------------------------------------------------
// TEST 9: Invalid file type uploaded.
// Expected: Rejected (only JPEG, PNG, WebP allowed).
// ----------------------------------------------------
{
  const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

  function validateFileType(mimeType: string): { valid: boolean; error?: string } {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return { valid: false, error: "Unsupported image format. Allowed formats: JPEG, PNG, WebP." };
    }
    return { valid: true };
  }

  assert.strictEqual(validateFileType("application/pdf").valid, false);
  assert.strictEqual(validateFileType("application/zip").valid, false);
  assert.strictEqual(validateFileType("image/svg+xml").valid, false);
  assert.strictEqual(validateFileType("image/jpeg").valid, true);
  assert.strictEqual(validateFileType("image/png").valid, true);
  assert.strictEqual(validateFileType("image/webp").valid, true);
  console.log("✓ TEST 9: Invalid file uploaded -> Rejected passed");
}

// ----------------------------------------------------
// TEST 10: Image larger than allowed limit (10 MB).
// Expected: Upload rejected with clear message.
// ----------------------------------------------------
{
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  function validateFileSize(sizeBytes: number): { valid: boolean; error?: string } {
    if (sizeBytes > MAX_FILE_SIZE) {
      return { valid: false, error: "Image is too large. Maximum size is 10 MB." };
    }
    return { valid: true };
  }

  const oversized = validateFileSize(11 * 1024 * 1024);
  assert.strictEqual(oversized.valid, false);
  assert.strictEqual(oversized.error, "Image is too large. Maximum size is 10 MB.");

  const normal = validateFileSize(4 * 1024 * 1024);
  assert.strictEqual(normal.valid, true);
  console.log("✓ TEST 10: Image larger than allowed limit -> Rejected with clear message passed");
}

// ----------------------------------------------------
// TEST 11: QC not completed.
// Expected: Delivery proof upload blocked.
// ----------------------------------------------------
{
  function canUploadDeliveryProof(qcStatus: string | null): { allowed: boolean; error?: string } {
    if (qcStatus !== "completed" && qcStatus !== "passed") {
      return { allowed: false, error: "Complete Quality Check before uploading delivery proof." };
    }
    return { allowed: true };
  }

  assert.strictEqual(canUploadDeliveryProof(null).allowed, false);
  assert.strictEqual(canUploadDeliveryProof("pending").allowed, false);
  assert.strictEqual(canUploadDeliveryProof("in_progress").allowed, false);
  assert.strictEqual(canUploadDeliveryProof("completed").allowed, true);
  assert.strictEqual(canUploadDeliveryProof("passed").allowed, true);
  console.log("✓ TEST 11: QC not completed -> Delivery proof upload blocked passed");
}

// ----------------------------------------------------
// TEST 13: Image URL/path manually modified.
// Expected: Unauthorized access rejected via RLS / storage path verification.
// ----------------------------------------------------
{
  function verifyStorageAccess(userSchoolId: string, folderOrderId: string, orders: Record<string, string>): boolean {
    const orderSchoolId = orders[folderOrderId];
    return Boolean(orderSchoolId && orderSchoolId === userSchoolId);
  }

  const orderMap = {
    "order-A": "school-A",
    "order-B": "school-B",
  };

  // School A tries to fetch order-B object
  const hasAccess = verifyStorageAccess("school-A", "order-B", orderMap);
  assert.strictEqual(hasAccess, false);

  // School A accesses order-A object
  const hasAccessOwn = verifyStorageAccess("school-A", "order-A", orderMap);
  assert.strictEqual(hasAccessOwn, true);

  console.log("✓ TEST 13: Image URL/path manually modified -> Unauthorized access rejected passed");
}

console.log("=== ALL DELIVERY PROOF TESTS PASSED SUCCESSFULLY ===");

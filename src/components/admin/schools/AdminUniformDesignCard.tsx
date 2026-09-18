"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Shirt, Download, Upload, Trash2, AlertCircle, FileText, ExternalLink, Loader2 } from "lucide-react";
import { SchoolUniformDesign } from "@/types/database";
import { uploadAdminUniformDesign, deleteAdminUniformDesign, getAdminUniformDesign } from "@/lib/actions/uniform-designs";

interface AdminUniformDesignCardProps {
  schoolId: string;
  schoolName: string;
  initialDesign: SchoolUniformDesign | null;
  initialSignedUrl: string | null;
}

export function AdminUniformDesignCard({
  schoolId,
  schoolName,
  initialDesign,
  initialSignedUrl,
}: AdminUniformDesignCardProps) {
  const [design, setDesign] = useState<SchoolUniformDesign | null>(initialDesign);
  const [signedUrl, setSignedUrl] = useState<string | null>(initialSignedUrl);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [designName, setDesignName] = useState("Official Uniform Specification");
  const [academicYear, setAcademicYear] = useState("2026-2027");
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPdf = design?.mime_type === "application/pdf";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError("File exceeds the 5MB size limit.");
        setSelectedFile(null);
        setPreviewUrl(null);
        return;
      }

      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowedTypes.includes(file.type)) {
        setError("Invalid file type. Only JPEG, PNG, WebP, and PDF are allowed.");
        setSelectedFile(null);
        setPreviewUrl(null);
        return;
      }

      setError(null);
      setSelectedFile(file);

      if (file.type === "application/pdf") {
        setPreviewUrl(null);
      } else {
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      }
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("schoolId", schoolId);
    formData.append("file", selectedFile);
    formData.append("designName", designName);
    formData.append("academicYear", academicYear);

    const result = await uploadAdminUniformDesign(formData);

    if (!result.success) {
      setError(result.error || "Unable to upload uniform design. Please try again.");
      setIsUploading(false);
      return;
    }

    // Refresh data
    const refresh = await getAdminUniformDesign(schoolId);
    setDesign(refresh.design);
    setSignedUrl(refresh.signedUrl);

    setIsUploading(false);
    setIsOpen(false);
    clearSelection();
  };

  const handleDelete = async () => {
    if (!design) return;
    if (!confirm("Are you sure you want to delete this uniform design?")) return;

    setIsDeleting(true);
    const result = await deleteAdminUniformDesign(schoolId, design.id);

    if (!result.success) {
      alert(result.error || "Unable to delete uniform design.");
    } else {
      setDesign(null);
      setSignedUrl(null);
    }
    setIsDeleting(false);
  };

  const handleDownload = async () => {
    if (!signedUrl) return;
    try {
      const res = await fetch(signedUrl);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = design?.original_filename || `${schoolName}-uniform-design`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(signedUrl, "_blank");
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      clearSelection();
    }
  };

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Shirt className="h-4 w-4 text-emerald-600" />
              Uniform Design
            </CardTitle>
            <CardDescription>Official uniform specification</CardDescription>
          </div>
          {design && (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              Active
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {design && signedUrl ? (
          <div className="space-y-3">
            <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 bg-white flex items-center justify-center p-4 shadow-inner">
              {isPdf ? (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <FileText className="h-16 w-16 text-rose-500 mb-2" />
                  <p className="text-sm font-medium text-slate-800">{design.original_filename || "PDF Document"}</p>
                  <p className="text-xs text-slate-400 mt-1">PDF Specification Document</p>
                </div>
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={signedUrl}
                  alt={`${schoolName} uniform design`}
                  className="object-contain w-full h-full max-h-48"
                />
              )}
            </div>

            <div className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-md space-y-1 border border-slate-100">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">{design.design_name}</span>
                <span>{design.academic_year}</span>
              </div>
              {design.original_filename && (
                <p className="truncate text-slate-600" title={design.original_filename}>
                  {design.original_filename}
                </p>
              )}
              <p>
                Uploaded:{" "}
                {new Date(design.updated_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>

            {/* Action buttons: Download, Change, Delete */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  View
                </Button>
              </a>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                className="text-slate-700 hover:text-slate-900 border-slate-200"
              >
                <Download className="h-3.5 w-3.5 mr-1" />
                Download Design
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-slate-200"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {isDeleting ? "Deleting..." : "Delete Design"}
              </Button>

              <Dialog open={isOpen} onOpenChange={handleOpenChange}>
                <DialogTrigger 
                  render={
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Upload className="h-3.5 w-3.5 mr-1" />
                      Change Design
                    </Button>
                  }
                />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Change Uniform Design</DialogTitle>
                    <DialogDescription>
                      Upload a new uniform specification file for {schoolName}. This will replace the current active design.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-4 py-4">
                    {error && (
                      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                      </div>
                    )}

                    <div className="grid w-full gap-1.5">
                      <Label htmlFor="designName">Design Name</Label>
                      <Input
                        id="designName"
                        value={designName}
                        onChange={(e) => setDesignName(e.target.value)}
                        placeholder="e.g., Official Uniform Specification"
                      />
                    </div>

                    <div className="grid w-full gap-1.5">
                      <Label htmlFor="academicYear">Academic Year</Label>
                      <Input
                        id="academicYear"
                        value={academicYear}
                        onChange={(e) => setAcademicYear(e.target.value)}
                        placeholder="e.g., 2026-2027"
                      />
                    </div>

                    {!selectedFile ? (
                      <div className="grid w-full gap-1.5">
                        <Label htmlFor="designFile">Design File (PNG, JPEG, WebP, PDF — Max 5MB)</Label>
                        <Input
                          id="designFile"
                          type="file"
                          accept="image/png, image/jpeg, image/webp, application/pdf"
                          onChange={handleFileChange}
                        />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {previewUrl && (
                          <div className="flex justify-center border rounded-md p-4 bg-slate-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={previewUrl} alt="Preview" className="max-h-48 object-contain" />
                          </div>
                        )}
                        <div className="flex justify-between items-center text-sm">
                          <span className="truncate font-medium text-slate-700 max-w-[200px]" title={selectedFile.name}>
                            {selectedFile.name}
                          </span>
                          <span className="text-slate-500">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </div>
                        <Button variant="outline" size="sm" onClick={clearSelection} className="w-full">
                          Remove Selected File
                        </Button>
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleUpload}
                      disabled={!selectedFile || isUploading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isUploading ? "Uploading..." : "Upload New Design"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ) : (
          <div className="py-10 px-4 text-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-400">
              <Shirt className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-700">Uniform design not uploaded yet</p>
            <p className="text-xs text-slate-500 mt-1 max-w-[220px] mb-4">
              Upload the official uniform specification for this school.
            </p>

            <Dialog open={isOpen} onOpenChange={handleOpenChange}>
              <DialogTrigger 
                render={
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Upload Uniform Design
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Uniform Design</DialogTitle>
                  <DialogDescription>
                    Upload an official uniform specification for {schoolName}. Supported: PNG, JPEG, WebP, PDF (Max 5MB).
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md">
                      <AlertCircle className="h-4 w-4" />
                      {error}
                    </div>
                  )}

                  <div className="grid w-full gap-1.5">
                    <Label htmlFor="designName">Design Name</Label>
                    <Input
                      id="designName"
                      value={designName}
                      onChange={(e) => setDesignName(e.target.value)}
                      placeholder="e.g., Official Uniform Specification"
                    />
                  </div>

                  <div className="grid w-full gap-1.5">
                    <Label htmlFor="academicYear">Academic Year</Label>
                    <Input
                      id="academicYear"
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value)}
                      placeholder="e.g., 2026-2027"
                    />
                  </div>

                  {!selectedFile ? (
                    <div className="grid w-full gap-1.5">
                      <Label htmlFor="designFile">Design File (PNG, JPEG, WebP, PDF — Max 5MB)</Label>
                      <Input
                        id="designFile"
                        type="file"
                        accept="image/png, image/jpeg, image/webp, application/pdf"
                        onChange={handleFileChange}
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {previewUrl && (
                        <div className="flex justify-center border rounded-md p-4 bg-slate-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={previewUrl} alt="Preview" className="max-h-48 object-contain" />
                        </div>
                      )}
                      <div className="flex justify-between items-center text-sm">
                        <span className="truncate font-medium text-slate-700 max-w-[200px]" title={selectedFile.name}>
                          {selectedFile.name}
                        </span>
                        <span className="text-slate-500">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </div>
                      <Button variant="outline" size="sm" onClick={clearSelection} className="w-full">
                        Remove Selected File
                      </Button>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUpload}
                    disabled={!selectedFile || isUploading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isUploading ? "Uploading..." : "Upload Design"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

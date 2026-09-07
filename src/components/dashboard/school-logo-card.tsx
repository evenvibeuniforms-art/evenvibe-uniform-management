"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Building2, ImageIcon, Upload, Trash2, AlertCircle } from "lucide-react";
import { SchoolLogo } from "@/types/database";
import { uploadSchoolLogo, deleteSchoolLogo } from "@/lib/actions/school-logo";

interface SchoolLogoCardProps {
  schoolName: string;
  logo: SchoolLogo | null;
  signedUrl: string | null;
}

export function SchoolLogoCard({ schoolName, logo, signedUrl }: SchoolLogoCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setError("File exceeds the 2MB size limit.");
        setSelectedFile(null);
        setPreviewUrl(null);
        return;
      }
      
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        setError("Invalid file type. Only JPEG, PNG, and WebP are allowed.");
        setSelectedFile(null);
        setPreviewUrl(null);
        return;
      }

      setError(null);
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
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
    formData.append("file", selectedFile);

    const result = await uploadSchoolLogo(formData);

    if (!result.success) {
      setError(result.error || "Failed to upload school logo.");
      setIsUploading(false);
      return;
    }

    setIsUploading(false);
    setIsOpen(false);
    clearSelection();
  };

  const handleDelete = async () => {
    if (!logo || !confirm("Are you sure you want to delete the school logo?")) return;

    setIsDeleting(true);
    const result = await deleteSchoolLogo();
    
    if (!result.success) {
      alert(result.error || "Failed to delete school logo.");
    }
    setIsDeleting(false);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      clearSelection();
    }
  };

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-600" />
              School Uniform Logo
            </CardTitle>
            <CardDescription>
              This logo will be used on your school uniform.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {logo ? (
          <div className="space-y-4">
            <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 bg-white flex items-center justify-center p-4">
              {signedUrl ? (
                <img
                  src={signedUrl}
                  alt={`${schoolName} school uniform logo`}
                  className="object-contain w-full h-full"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center text-slate-400">
                  <ImageIcon className="h-10 w-10 mb-2 stroke-[1.5]" />
                  <p className="text-sm font-medium text-slate-600">Image preview unavailable</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button 
                variant="outline" 
                size="sm" 
                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-slate-200"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isDeleting ? "Deleting..." : "Delete Logo"}
              </Button>

              <Dialog open={isOpen} onOpenChange={handleOpenChange}>
                <DialogTrigger 
                  render={
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Upload className="h-4 w-4 mr-2" />
                      Change Logo
                    </Button>
                  }
                />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload School Uniform Logo</DialogTitle>
                    <DialogDescription>
                      Accepted formats: PNG, JPEG, WebP. Max size: 2MB.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="grid gap-4 py-4">
                    {error && (
                      <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md">
                        <AlertCircle className="h-4 w-4" />
                        {error}
                      </div>
                    )}
                    
                    {!selectedFile ? (
                      <div className="grid w-full max-w-sm items-center gap-1.5">
                        <Label htmlFor="logo">Logo File</Label>
                        <Input id="logo" type="file" accept="image/png, image/jpeg, image/webp" onChange={handleFileChange} />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex justify-center border rounded-md p-4 bg-slate-50">
                          {previewUrl && (
                            <img src={previewUrl} alt="Preview" className="max-h-48 object-contain" />
                          )}
                        </div>
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
                    <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                    <Button 
                      onClick={handleUpload} 
                      disabled={!selectedFile || isUploading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {isUploading ? "Uploading..." : "Upload Logo"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ) : (
          <div className="py-8 px-4 text-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 flex flex-col items-center justify-center">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mb-3 text-slate-400">
              <Building2 className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-medium text-slate-900">School uniform logo not uploaded</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-xs mb-4">
              Upload your school logo to use it on the uniform.
            </p>

            <Dialog open={isOpen} onOpenChange={handleOpenChange}>
              <DialogTrigger 
                render={
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Logo
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload School Uniform Logo</DialogTitle>
                  <DialogDescription>
                    Accepted formats: PNG, JPEG, WebP. Max size: 2MB.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-4">
                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-md">
                      <AlertCircle className="h-4 w-4" />
                      {error}
                    </div>
                  )}
                  
                  {!selectedFile ? (
                    <div className="grid w-full max-w-sm items-center gap-1.5">
                      <Label htmlFor="logo">Logo File</Label>
                      <Input id="logo" type="file" accept="image/png, image/jpeg, image/webp" onChange={handleFileChange} />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-center border rounded-md p-4 bg-slate-50">
                        {previewUrl && (
                          <img src={previewUrl} alt="Preview" className="max-h-48 object-contain" />
                        )}
                      </div>
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
                  <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                  <Button 
                    onClick={handleUpload} 
                    disabled={!selectedFile || isUploading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isUploading ? "Uploading..." : "Upload Logo"}
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

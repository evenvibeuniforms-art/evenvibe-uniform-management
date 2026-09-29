"use client";

import { useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Download, Calendar, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeliveryProofImage } from "@/types/database";

interface DeliveryProofLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  images: DeliveryProofImage[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

export function DeliveryProofLightbox({
  isOpen,
  onClose,
  images,
  currentIndex,
  onIndexChange,
}: DeliveryProofLightboxProps) {
  const currentImage = images[currentIndex];

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    }
  }, [currentIndex, onIndexChange]);

  const handleNext = useCallback(() => {
    if (currentIndex < images.length - 1) {
      onIndexChange(currentIndex + 1);
    }
  }, [currentIndex, images.length, onIndexChange]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext]);

  if (!isOpen || !currentImage) return null;

  const formattedDate = new Date(currentImage.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });

  const uploaderName = currentImage.profiles?.full_name || "Admin";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 animate-in fade-in duration-200">
      {/* Top Bar with image info & close */}
      <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between text-white bg-gradient-to-b from-black/70 to-transparent z-10">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium tracking-wide">
            {currentIndex + 1} / {images.length}
          </span>
          <span className="text-xs text-slate-300 font-mono hidden sm:inline max-w-xs truncate">
            {currentImage.file_name}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {currentImage.signed_url && (
            <a
              href={currentImage.signed_url}
              download={currentImage.file_name}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download</span>
            </a>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-full h-8 w-8"
          >
            <X className="w-5 h-5" />
            <span className="sr-only">Close</span>
          </Button>
        </div>
      </div>

      {/* Main Image Container */}
      <div className="relative max-w-5xl max-h-[75vh] w-full flex items-center justify-center">
        {/* Previous Button */}
        {currentIndex > 0 && (
          <button
            type="button"
            onClick={handlePrev}
            className="absolute left-2 sm:-left-12 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Image */}
        {currentImage.signed_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentImage.signed_url}
            alt={currentImage.caption || currentImage.file_name}
            className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl select-none"
          />
        ) : (
          <div className="p-12 text-slate-400 text-center">Image preview not available</div>
        )}

        {/* Next Button */}
        {currentIndex < images.length - 1 && (
          <button
            type="button"
            onClick={handleNext}
            className="absolute right-2 sm:-right-12 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors"
            aria-label="Next image"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Bottom Bar with Caption & Metadata */}
      <div className="absolute bottom-0 inset-x-0 p-4 sm:p-5 text-white bg-gradient-to-t from-black/80 via-black/50 to-transparent">
        <div className="max-w-3xl mx-auto text-center space-y-1.5">
          {currentImage.caption && (
            <p className="text-sm sm:text-base font-medium text-white">{currentImage.caption}</p>
          )}
          <div className="flex items-center justify-center gap-4 text-xs text-slate-300">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-400" />
              Uploaded by {uploaderName}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {formattedDate}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

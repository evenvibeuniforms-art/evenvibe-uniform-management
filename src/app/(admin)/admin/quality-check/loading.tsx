import { Skeleton } from "@/components/ui/skeleton";

export default function AdminQCLoading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Skeleton className="h-9 w-44 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 rounded-xl border border-slate-200 bg-white space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-wrap gap-4 items-center">
        <Skeleton className="h-10 w-64 rounded-md" />
        <Skeleton className="h-10 w-44 rounded-md" />
        <Skeleton className="h-10 w-44 rounded-md" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="bg-slate-50 border-b border-slate-200 p-4 grid grid-cols-6 gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16 ml-auto" />
        </div>
        <div className="divide-y divide-slate-100">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-4 grid grid-cols-6 gap-4 items-center">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-28" />
              <div className="ml-auto">
                <Skeleton className="h-8 w-16 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

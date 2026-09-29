"use client";

import { useState } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Eye } from "lucide-react";
import { SchoolDetailsDialog } from "./SchoolDetailsDialog";
import { MobileCard, MobileCardField, MobileCardActions } from "@/components/ui/mobile-card";

type SchoolWithProfile = {
  id: string;
  name: string;
  school_code: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  is_active: boolean;
  created_at: string;
  adminProfile?: {
    id: string;
    full_name: string | null;
    role: string;
    is_active: boolean;
  } | null;
};

export function SchoolsTable({ schools }: { schools: SchoolWithProfile[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "active">("all");
  const [selectedSchool, setSelectedSchool] = useState<SchoolWithProfile | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredSchools = schools.filter((school) => {
    const matchesSearch = 
      (school.name || "").toLowerCase().includes(search.toLowerCase()) || 
      (school.school_code || "").toLowerCase().includes(search.toLowerCase());
    
    if (statusFilter === "pending") return matchesSearch && !school.is_active;
    if (statusFilter === "active") return matchesSearch && school.is_active;
    return matchesSearch;
  });

  const handleView = (school: SchoolWithProfile) => {
    setSelectedSchool(school);
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input 
            placeholder="Search schools..." 
            className="pl-8" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button 
            variant={statusFilter === "all" ? "default" : "outline"}
            onClick={() => setStatusFilter("all")}
            size="sm"
          >
            All
          </Button>
          <Button 
            variant={statusFilter === "pending" ? "default" : "outline"}
            onClick={() => setStatusFilter("pending")}
            size="sm"
            className={statusFilter === "pending" ? "bg-status-warning hover:bg-status-warning text-white" : ""}
          >
            Pending
          </Button>
          <Button 
            variant={statusFilter === "active" ? "default" : "outline"}
            onClick={() => setStatusFilter("active")}
            size="sm"
            className={statusFilter === "active" ? "bg-status-success hover:bg-emerald-600 text-white" : ""}
          >
            Active
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-white shadow-sm overflow-hidden">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>School</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSchools.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                    No schools found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSchools.map((school) => (
                  <TableRow key={school.id} className={!school.is_active ? "bg-amber-50/30" : ""}>
                    <TableCell className="font-medium text-slate-900">
                      {school.name}
                    </TableCell>
                    <TableCell>
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-mono">
                        {school.school_code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="font-medium">{school.contact_name}</p>
                        <p className="text-xs text-slate-500">{school.contact_email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-600">{school.city}, {school.state}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={school.is_active ? "default" : "secondary"} className={school.is_active ? "bg-status-success hover:bg-emerald-600" : "bg-status-warning hover:bg-status-warning text-white"}>
                        {school.is_active ? "Active" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {new Date(school.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleView(school)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards View */}
        <div className="md:hidden space-y-3 p-3 bg-slate-50/50">
          {filteredSchools.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">No schools found.</div>
          ) : (
            filteredSchools.map((school) => (
              <MobileCard key={school.id} className={!school.is_active ? "border-amber-200 bg-amber-50/20" : ""}>
                <MobileCardField label="School" value={<span className="font-semibold text-slate-900">{school.name}</span>} />
                <MobileCardField label="Code" value={<span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs font-mono">{school.school_code}</span>} />
                <MobileCardField
                  label="Contact"
                  value={
                    <div>
                      <p className="font-medium text-slate-900">{school.contact_name}</p>
                      <p className="text-xs text-slate-500">{school.contact_email}</p>
                    </div>
                  }
                />
                <MobileCardField label="Location" value={`${school.city}, ${school.state}`} />
                <MobileCardField
                  label="Status"
                  value={
                    <Badge variant={school.is_active ? "default" : "secondary"} className={school.is_active ? "bg-status-success text-white" : "bg-status-warning text-white"}>
                      {school.is_active ? "Active" : "Pending"}
                    </Badge>
                  }
                />
                <MobileCardField
                  label="Registered"
                  value={new Date(school.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                />
                <MobileCardActions label="Action">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleView(school)}
                    className="w-full text-evenvibe-primary border-emerald-200 hover:bg-emerald-50 h-8 gap-1.5 justify-center"
                  >
                    <Eye className="h-4 w-4" />
                    View Details
                  </Button>
                </MobileCardActions>
              </MobileCard>
            ))
          )}
        </div>
      </div>

      <SchoolDetailsDialog 
        school={selectedSchool}
        adminProfile={selectedSchool?.adminProfile}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </div>
  );
}

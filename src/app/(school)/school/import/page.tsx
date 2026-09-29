"use client";

import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Download, Upload, AlertCircle, CheckCircle2, ArrowRight, FileType, Trash2, Info } from "lucide-react";
import { ParsedStudentRow, excelStudentRowSchema, normalizeImportedClass } from "./schema";
import { checkDuplicateAdmissionNumbers, bulkCreateStudents } from "./actions";
import Link from "next/link";
import { MobileCard, MobileCardField } from "@/components/ui/mobile-card";
import { cn } from "@/lib/utils";


export default function ImportStudentsPage() {

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedStudentRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isCheckingDB, setIsCheckingDB] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  const [importResult, setImportResult] = useState<{
    success: boolean;
    imported?: number;
    skipped?: number;
    error?: string;
  } | null>(null);

  const handleDownloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([
      ["Student Name", "Admission Number", "Class", "Section", "Gender"],
      ["Aarav Sharma", "ADM001", "Class 1", "A", "Male"],
      ["Diya Patel", "ADM002", "4", "B", "Female"],
      ["Rohan Verma", "ADM003", "10", "A", "Male"]
    ]);
    ws["!cols"] = [
      { wch: 20 },
      { wch: 18 },
      { wch: 14 },
      { wch: 10 },
      { wch: 12 },
    ];

    const instructionsWs = XLSX.utils.aoa_to_sheet([
      ["Field", "Required", "Accepted Formats & Guidance"],
      ["Student Name", "Yes", "Full name of the student (minimum 2 characters)."],
      ["Admission Number", "Yes", "Unique school admission/registration number."],
      ["Class", "Yes", "Pre-KG, LKG, UKG, 1, 2, 3 ... 12 or Class 1, Class 2 ... Class 12. Both short format (e.g. 4) and full format (e.g. Class 4) are accepted."],
      ["Section", "Yes", "Section identifier (e.g. A, B, C)."],
      ["Gender", "No", "Male or Female (optional)."],
    ]);
    instructionsWs["!cols"] = [
      { wch: 18 },
      { wch: 10 },
      { wch: 80 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Students");
    XLSX.utils.book_append_sheet(wb, instructionsWs, "Instructions");
    XLSX.writeFile(wb, "Student_Import_Template.xlsx");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Check size limit (e.g., 5MB)
    if (selectedFile.size > 5 * 1024 * 1024) {
      alert("File is too large. Maximum size is 5MB.");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setFile(selectedFile);
    setImportResult(null);
    await parseFile(selectedFile);
  };

  const parseFile = async (selectedFile: File) => {
    setIsParsing(true);
    try {
      const XLSX = await import("xlsx");
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Parse to JSON, treating first row as headers
      const rawJson = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true }) as unknown[][];
      
      if (rawJson.length <= 1) {
        alert("The Excel file is empty or contains only headers.");
        setIsParsing(false);
        return;
      }

      const headers = (rawJson[0] || []).map(h => String(h).trim().toLowerCase());
      
      // Map columns
      const colMap = {
        studentName: headers.findIndex(h => h.includes("student name")),
        admissionNumber: headers.findIndex(h => h.includes("admission number") || h === "adm no"),
        className: headers.findIndex(h => h === "class"),
        section: headers.findIndex(h => h === "section"),
        gender: headers.findIndex(h => h === "gender"),
      };

      if (colMap.studentName === -1 || colMap.className === -1 || colMap.admissionNumber === -1) {
        alert("Missing required columns. Please ensure 'Student Name', 'Admission Number', and 'Class' columns exist.");
        setIsParsing(false);
        return;
      }

      const rows: ParsedStudentRow[] = [];
      const fileAdmNumbers = new Set<string>();

      for (let i = 1; i < rawJson.length; i++) {
        const rowData = rawJson[i];
        if (!rowData || rowData.length === 0 || rowData.every(cell => !cell || String(cell).trim() === '')) {
          continue; // Skip empty rows
        }

        const rawStudentName = colMap.studentName !== -1 ? String(rowData[colMap.studentName] || "").trim() : "";
        const rawAdmNumber = colMap.admissionNumber !== -1 ? String(rowData[colMap.admissionNumber] || "").trim() : "";
        const rawClassName = colMap.className !== -1 ? String(rowData[colMap.className] || "").trim() : "";
        const rawSection = colMap.section !== -1 ? String(rowData[colMap.section] || "").trim() : "";
        const rawGender = colMap.gender !== -1 ? String(rowData[colMap.gender] || "").trim() : "";

        const rowErrors: string[] = [];
        let status: "valid" | "duplicate" | "error" = "valid";

        // Zod basic validation
        const parseResult = excelStudentRowSchema.safeParse({
          student_name: rawStudentName,
          admission_number: rawAdmNumber,
          class_name: rawClassName,
          section: rawSection,
          gender: rawGender,
        });

        if (!parseResult.success) {
          status = "error";
          parseResult.error.issues.forEach((issue) => {
            rowErrors.push(issue.message);
          });
        }

        // Duplicate within file check
        
        if (rawAdmNumber) {
          if (fileAdmNumbers.has(rawAdmNumber)) {
            status = "duplicate";
            rowErrors.push("Duplicate admission number within the uploaded file");
          } else {
            fileAdmNumbers.add(rawAdmNumber);
          }
        }

        const finalClassName = parseResult.success 
          ? parseResult.data.class_name 
          : (normalizeImportedClass(rawClassName) || rawClassName);

        rows.push({
          rowNumber: i + 1,
          student_name: parseResult.success ? parseResult.data.student_name : rawStudentName,
          admission_number: rawAdmNumber,
          class_name: finalClassName,
          section: parseResult.success ? parseResult.data.section : rawSection,
          gender: (parseResult.success ? parseResult.data.gender : rawGender) || null,
          status,
          errors: rowErrors,
        });
      }

      setParsedData(rows);
      setIsParsing(false);
      
      // Now check DB duplicates
      await checkDbDuplicates(rows);

    } catch (error) {
      console.error("Parse error:", error);
      alert("Error parsing the Excel file. Please ensure it is a valid format.");
      setIsParsing(false);
    }
  };

  const checkDbDuplicates = async (rows: ParsedStudentRow[]) => {
    setIsCheckingDB(true);
    
    // We only check rows that are structurally valid and have the composite keys
    const combinationsToCheck = rows
      .filter(r => r.status === "valid" && r.class_name && r.section && r.admission_number)
      .map(r => r.admission_number.trim());

    if (combinationsToCheck.length === 0) {
      setIsCheckingDB(false);
      return;
    }

    const { success, duplicates, error } = await checkDuplicateAdmissionNumbers(combinationsToCheck);
    
    if (!success) {
      alert(error || "Error checking existing duplicates in the database.");
      setIsCheckingDB(false);
      return;
    }

    if (duplicates && duplicates.length > 0) {
      const duplicateAdmSet = new Set(duplicates);
      const updatedRows = rows.map(r => {
        const normAdm = r.admission_number.trim();
        
        let isDup = false;
        const newErrors = [...r.errors];
        
        if (duplicateAdmSet.has(normAdm)) {
          isDup = true;
          if (!newErrors.includes("Admission number already exists in this school")) {
            newErrors.push("Admission number already exists in this school");
          }
        }
        
        if (isDup) {
          return {
            ...r,
            status: "duplicate" as const,
            errors: newErrors
          };
        }
        return r;
      });
      setParsedData(updatedRows);
    }

    setIsCheckingDB(false);
  };

  const clearFile = () => {
    setFile(null);
    setParsedData([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImport = async () => {
    const validRows = parsedData.filter(r => r.status === "valid");
    if (validRows.length === 0) return;

    setIsImporting(true);
    const result = await bulkCreateStudents(validRows);
    setImportResult(result);
    setIsImporting(false);
  };

  const validCount = parsedData.filter(r => r.status === "valid").length;
  const duplicateCount = parsedData.filter(r => r.status === "duplicate").length;
  const errorCount = parsedData.filter(r => r.status === "error").length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10 w-full min-w-0">
      <div className="space-y-1">
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Import Students</h2>
        <p className="text-xs sm:text-sm text-slate-500">Bulk upload student records using an Excel file.</p>
      </div>

      {importResult && importResult.success ? (
        <Card className="border-emerald-200 shadow-sm overflow-hidden">
          <div className="bg-evenvibe-light p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-4">
            <div className="h-14 w-14 sm:h-16 sm:w-16 bg-emerald-100 rounded-full flex items-center justify-center mb-2 shrink-0">
              <CheckCircle2 className="h-7 w-7 sm:h-8 sm:w-8 text-evenvibe-primary" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="text-lg sm:text-xl font-bold text-emerald-900">Import Completed Successfully</h3>
              <p className="text-xs sm:text-sm text-evenvibe-deep">
                {importResult.imported} students imported. {importResult.skipped ? `${importResult.skipped} skipped.` : ''}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-4 w-full sm:w-auto justify-center">
              <Button
                variant="outline"
                onClick={clearFile}
                className="w-full sm:w-auto bg-white border-emerald-200 text-evenvibe-deep hover:bg-emerald-50 text-xs sm:text-sm"
              >
                Import Another File
              </Button>
              <Link
                href="/school/students"
                className={cn(buttonVariants({ className: "w-full sm:w-auto bg-evenvibe-primary hover:bg-evenvibe-deep text-white text-xs sm:text-sm" }))}
              >
                View Students
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Card className="shadow-sm border-slate-200 overflow-hidden">
            <CardHeader className="border-b border-slate-100 p-4 sm:p-6 pb-3 sm:pb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg font-semibold text-slate-900">Upload File</CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Select or drop your standardized Excel spreadsheet.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="text-slate-600 hover:text-slate-900 w-full sm:w-auto shrink-0 justify-center h-9 text-xs sm:text-sm"
                >
                  <Download className="h-4 w-4 mr-2 shrink-0" />
                  Download Template
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3.5 sm:p-4 text-sm text-blue-950 flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                <div className="space-y-1 text-xs sm:text-sm min-w-0 flex-1">
                  <p className="font-semibold text-blue-900">Supported Class Formats</p>
                  <p className="text-blue-800 leading-relaxed break-words">
                    Class can be entered as short numbers (<strong>1, 2, 3 ... 12</strong>) or full names (<strong>Class 1, Class 2 ... Class 12</strong>), as well as <strong>Pre-KG</strong>, <strong>LKG</strong>, and <strong>UKG</strong>.
                    Short numbers will automatically be converted to the standard format upon import.
                  </p>
                </div>
              </div>

              {!file ? (
                <div 
                  className="border-2 border-dashed border-slate-300 rounded-lg p-6 sm:p-10 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer text-center"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center mb-3 sm:mb-4 shadow-sm border border-slate-100 shrink-0">
                    <Upload className="h-6 w-6 text-evenvibe-primary" />
                  </div>
                  <h3 className="text-sm sm:text-base font-medium text-slate-900">Click to upload or drag and drop</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">Excel files only (.xlsx, .xls) up to 5MB</p>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 p-3.5 sm:p-4 border border-slate-200 rounded-lg bg-white">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="h-10 w-10 shrink-0 rounded bg-evenvibe-light flex items-center justify-center border border-emerald-100">
                      <FileType className="h-5 w-5 text-evenvibe-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate" title={file.name}>{file.name}</p>
                      <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={clearFile} className="text-slate-400 hover:text-status-error shrink-0" disabled={isImporting}>
                    <Trash2 className="h-5 w-5" />
                    <span className="sr-only">Remove file</span>
                  </Button>
                </div>
              )}

              {importResult && !importResult.success && (
                <div className="mt-4 p-3.5 sm:p-4 bg-red-50 border border-red-200 rounded-md flex gap-3 text-red-800 text-xs sm:text-sm">
                  <AlertCircle className="h-5 w-5 shrink-0 text-status-error mt-0.5" />
                  <div className="min-w-0 flex-1 break-words">
                    <span className="font-semibold">Import Failed:</span> {importResult.error}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {parsedData.length > 0 && (
            <Card className="shadow-sm border-slate-200 overflow-hidden">
              <CardHeader className="border-b border-slate-100 p-4 sm:p-6 pb-3 sm:pb-4">
                <CardTitle className="text-base sm:text-lg font-semibold text-slate-900">Preview & Import</CardTitle>
                <CardDescription className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Review the parsed data before importing.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                
                {isParsing || isCheckingDB ? (
                  <div className="py-12 text-center text-slate-500 flex flex-col items-center">
                    <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full mb-4"></div>
                    <p className="text-sm font-medium">Processing data...</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Summary Row: 2 columns on mobile (2x2 grid), 4 columns on desktop */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 sm:p-4 text-center">
                        <div className="text-xl sm:text-2xl font-bold text-slate-900">{parsedData.length}</div>
                        <div className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">Total Rows</div>
                      </div>
                      <div className="bg-evenvibe-light border border-emerald-200 rounded-lg p-3 sm:p-4 text-center">
                        <div className="text-xl sm:text-2xl font-bold text-evenvibe-deep">{validCount}</div>
                        <div className="text-[10px] sm:text-xs font-semibold text-evenvibe-primary uppercase tracking-wider mt-1">Valid</div>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 text-center">
                        <div className="text-xl sm:text-2xl font-bold text-amber-700">{duplicateCount}</div>
                        <div className="text-[10px] sm:text-xs font-semibold text-status-warning uppercase tracking-wider mt-1">Duplicates</div>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 text-center">
                        <div className="text-xl sm:text-2xl font-bold text-red-700">{errorCount}</div>
                        <div className="text-[10px] sm:text-xs font-semibold text-status-error uppercase tracking-wider mt-1">Errors</div>
                      </div>
                    </div>

                    {/* Preview Table */}
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      {/* Desktop Table View */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-xs">
                            <tr>
                              <th className="px-4 py-3 text-slate-400">#</th>
                              <th className="px-4 py-3">Student Name</th>
                              <th className="px-4 py-3">Adm Number</th>
                              <th className="px-4 py-3">Class</th>
                              <th className="px-4 py-3">Section</th>
                              <th className="px-4 py-3">Gender</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3 min-w-[200px]">Issues</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white text-xs sm:text-sm">
                            {parsedData.slice(0, 50).map((row) => (
                              <tr key={row.rowNumber} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-3 text-slate-400 font-mono text-xs">{row.rowNumber}</td>
                                <td className="px-4 py-3 font-semibold text-slate-900">{row.student_name || <span className="text-slate-300 italic">Empty</span>}</td>
                                <td className="px-4 py-3 font-mono">{row.admission_number || '-'}</td>
                                <td className="px-4 py-3 font-medium">{row.class_name || '-'}</td>
                                <td className="px-4 py-3 font-medium">{row.section || '-'}</td>
                                <td className="px-4 py-3 capitalize text-slate-600">{row.gender || '-'}</td>
                                <td className="px-4 py-3">
                                  {row.status === 'valid' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Valid</span>}
                                  {row.status === 'duplicate' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Duplicate</span>}
                                  {row.status === 'error' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Error</span>}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-500">
                                  {row.errors.length > 0 ? (
                                    <ul className="list-disc list-inside text-status-error space-y-0.5">
                                      {row.errors.map((err, i) => <li key={i}>{err}</li>)}
                                    </ul>
                                  ) : (
                                    <span className="text-evenvibe-primary flex items-center"><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Ready</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Cards View */}
                      <div className="md:hidden space-y-3 p-3 bg-slate-50/50">
                        {parsedData.slice(0, 50).map((row) => (
                          <MobileCard key={row.rowNumber}>
                            <MobileCardField label="Row #" value={<span className="text-slate-500 font-mono text-xs">{row.rowNumber}</span>} />
                            <MobileCardField label="Student Name" value={<span className="font-semibold text-slate-900">{row.student_name || <span className="text-slate-300 italic">Empty</span>}</span>} />
                            <MobileCardField label="Admission Number" value={<span className="font-mono text-xs">{row.admission_number || '—'}</span>} />
                            <MobileCardField label="Class" value={row.class_name || '—'} />
                            <MobileCardField label="Section" value={row.section || '—'} />
                            <MobileCardField label="Gender" value={<span className="capitalize">{row.gender || '—'}</span>} />
                            <MobileCardField
                              label="Status"
                              value={
                                <>
                                  {row.status === 'valid' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">Valid</span>}
                                  {row.status === 'duplicate' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">Duplicate</span>}
                                  {row.status === 'error' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Error</span>}
                                </>
                              }
                            />
                            <MobileCardField
                              label="Issues"
                              value={
                                row.errors.length > 0 ? (
                                  <ul className="list-disc list-inside text-status-error text-xs space-y-0.5">
                                    {row.errors.map((err, i) => <li key={i} className="break-words">{err}</li>)}
                                  </ul>
                                ) : (
                                  <span className="text-evenvibe-primary flex items-center text-xs"><CheckCircle2 className="h-3.5 w-3.5 mr-1 shrink-0" /> Ready</span>
                                )
                              }
                            />
                          </MobileCard>
                        ))}
                      </div>

                      {parsedData.length > 50 && (
                        <div className="bg-slate-50 p-3 text-center text-xs text-slate-500 border-t border-slate-200">
                          Showing first 50 rows of {parsedData.length} total rows.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="bg-slate-50 border-t border-slate-100 p-4 sm:px-6 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
                <p className="text-xs sm:text-sm text-slate-500 text-center sm:text-left">Only valid rows will be imported.</p>
                <Button 
                  onClick={handleImport} 
                  disabled={validCount === 0 || isImporting || isParsing || isCheckingDB}
                  className="w-full sm:w-auto bg-evenvibe-primary hover:bg-evenvibe-deep text-white min-w-[160px] h-10 text-xs sm:text-sm"
                >
                  {isImporting ? (
                    <span className="flex items-center justify-center">
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      Importing...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center">
                      <ArrowRight className="h-4 w-4 mr-2 shrink-0" />
                      Import {validCount} Students
                    </span>
                  )}
                </Button>
              </CardFooter>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

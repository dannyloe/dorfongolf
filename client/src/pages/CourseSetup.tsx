import { useState } from "react";
import { useCourses, useCreateCourse, useUpdateCourseHole, useDeleteCourse, useCourseTees, useCreateCourseTee, useUpdateCourseTee, useDeleteCourseTee, type Course, type CourseTee } from "@/hooks/use-matches";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Save, Trash2, ChevronDown, ChevronUp, MapPin, X, Search, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";

const TEE_COLORS = [
  { name: "Blue", value: "#1e40af" },
  { name: "White", value: "#ffffff" },
  { name: "Gold", value: "#eab308" },
  { name: "Red", value: "#dc2626" },
  { name: "Black", value: "#1f2937" },
  { name: "Green", value: "#16a34a" },
];

interface ApiCourseResult {
  id: number;
  club_name: string;
  course_name: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

interface ApiCourseDetails {
  id: number;
  club_name: string;
  course_name: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  tees?: {
    male?: Array<{
      tee_name: string;
      course_rating: number;
      slope_rating: number;
      par_total: number;
      total_yards?: number;
      holes: Array<{ par: number; yardage?: number; handicap: number }>;
    }>;
    female?: Array<{
      tee_name: string;
      course_rating: number;
      slope_rating: number;
      par_total: number;
      total_yards?: number;
      holes: Array<{ par: number; yardage?: number; handicap: number }>;
    }>;
  };
}

function CourseImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ApiCourseResult[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<ApiCourseDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [selectedTee, setSelectedTee] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);
  const [courseName, setCourseName] = useState("");

  const handleSearch = async () => {
    if (searchQuery.length < 2) {
      toast({ title: "Error", description: "Enter at least 2 characters to search", variant: "destructive" });
      return;
    }
    setIsSearching(true);
    setSearchResults([]);
    setSelectedCourse(null);
    try {
      const response = await fetch(`/api/golf-course-api/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Search failed");
      }
      const data = await response.json();
      setSearchResults(data.courses || []);
      if (data.courses?.length === 0) {
        toast({ title: "No results", description: "No courses found. Try a different search term." });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectCourse = async (course: ApiCourseResult) => {
    setIsLoadingDetails(true);
    setSelectedCourse(null);
    try {
      const response = await fetch(`/api/golf-course-api/courses/${course.id}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to load course details");
      }
      const data = await response.json();
      const courseData = data.course || data;
      setSelectedCourse(courseData);
      setCourseName(courseData.course_name || courseData.club_name);
      const allTees = [...(courseData.tees?.male || []), ...(courseData.tees?.female || [])];
      if (allTees.length > 0) {
        setSelectedTee(allTees[0].tee_name);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleImport = async () => {
    if (!selectedCourse || !selectedTee || !courseName.trim()) {
      toast({ title: "Error", description: "Please select a tee and enter a course name", variant: "destructive" });
      return;
    }
    setIsImporting(true);
    try {
      const response = await apiRequest("POST", "/api/golf-course-api/import", {
        externalId: selectedCourse.id,
        courseName: courseName.trim(),
        selectedTee: selectedTee,
      });
      const result = await response.json();
      toast({ 
        title: "Course imported", 
        description: `${courseName} imported with ${result.holesImported} holes and ${result.teesImported} tees` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      onClose();
      setSearchQuery("");
      setSearchResults([]);
      setSelectedCourse(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const allTees = selectedCourse ? [...(selectedCourse.tees?.male || []), ...(selectedCourse.tees?.female || [])] : [];
  const currentTee = allTees.find(t => t.tee_name === selectedTee);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Search Golf Course Database
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search by course or club name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              data-testid="input-course-search"
            />
            <Button onClick={handleSearch} disabled={isSearching} data-testid="button-search-courses">
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          {searchResults.length > 0 && !selectedCourse && (
            <div className="border rounded-md max-h-60 overflow-y-auto">
              {searchResults.map((course) => (
                <button
                  key={course.id}
                  onClick={() => handleSelectCourse(course)}
                  className="w-full text-left p-3 hover-elevate border-b last:border-b-0"
                  data-testid={`button-select-course-${course.id}`}
                >
                  <div className="font-medium">{course.course_name}</div>
                  <div className="text-sm text-muted-foreground">{course.club_name}</div>
                  {course.location && (
                    <div className="text-xs text-muted-foreground">
                      {[course.location.city, course.location.state, course.location.country].filter(Boolean).join(", ")}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {isLoadingDetails && (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading course details...
            </div>
          )}

          {selectedCourse && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{selectedCourse.course_name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedCourse.club_name}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedCourse(null)}>
                  <X className="w-4 h-4 mr-1" /> Change
                </Button>
              </div>

              <div>
                <label className="text-sm font-medium">Course Name (in your app)</label>
                <Input
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="Enter course name"
                  data-testid="input-import-course-name"
                />
              </div>

              {allTees.length > 0 && (
                <div>
                  <label className="text-sm font-medium">Select Tee for Hole Data</label>
                  <select
                    value={selectedTee}
                    onChange={(e) => setSelectedTee(e.target.value)}
                    className="w-full h-9 px-3 border rounded-md bg-background"
                    data-testid="select-import-tee"
                  >
                    {allTees.map((tee, idx) => (
                      <option key={`${tee.tee_name}-${idx}`} value={tee.tee_name}>
                        {tee.tee_name} (Rating: {tee.course_rating?.toFixed(1) ?? 'N/A'}, Slope: {tee.slope_rating ?? 'N/A'}, Par: {tee.par_total})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {currentTee && currentTee.holes && currentTee.holes.length > 0 && (
                <div className="border rounded-md p-3 bg-muted/30">
                  <div className="text-sm font-medium mb-2">Hole Data Preview ({currentTee.tee_name})</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="p-1 text-left">Hole</th>
                          {currentTee.holes.slice(0, 9).map((_, i) => (
                            <th key={i} className="p-1 text-center">{i + 1}</th>
                          ))}
                          <th className="p-1 text-center bg-muted">Out</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-1 font-medium">Par</td>
                          {currentTee.holes.slice(0, 9).map((h, i) => (
                            <td key={i} className="p-1 text-center">{h.par}</td>
                          ))}
                          <td className="p-1 text-center bg-muted font-medium">
                            {currentTee.holes.slice(0, 9).reduce((s, h) => s + h.par, 0)}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-1 font-medium">Hdcp</td>
                          {currentTee.holes.slice(0, 9).map((h, i) => (
                            <td key={i} className="p-1 text-center">{h.handicap}</td>
                          ))}
                          <td className="p-1 text-center bg-muted">-</td>
                        </tr>
                      </tbody>
                    </table>
                    {currentTee.holes.length > 9 && (
                      <table className="w-full text-xs mt-2">
                        <thead>
                          <tr className="border-b">
                            <th className="p-1 text-left">Hole</th>
                            {currentTee.holes.slice(9, 18).map((_, i) => (
                              <th key={i} className="p-1 text-center">{i + 10}</th>
                            ))}
                            <th className="p-1 text-center bg-muted">In</th>
                            <th className="p-1 text-center bg-primary/10">Tot</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b">
                            <td className="p-1 font-medium">Par</td>
                            {currentTee.holes.slice(9, 18).map((h, i) => (
                              <td key={i} className="p-1 text-center">{h.par}</td>
                            ))}
                            <td className="p-1 text-center bg-muted font-medium">
                              {currentTee.holes.slice(9, 18).reduce((s, h) => s + h.par, 0)}
                            </td>
                            <td className="p-1 text-center bg-primary/10 font-medium">
                              {currentTee.holes.reduce((s, h) => s + h.par, 0)}
                            </td>
                          </tr>
                          <tr>
                            <td className="p-1 font-medium">Hdcp</td>
                            {currentTee.holes.slice(9, 18).map((h, i) => (
                              <td key={i} className="p-1 text-center">{h.handicap}</td>
                            ))}
                            <td className="p-1 text-center bg-muted">-</td>
                            <td className="p-1 text-center bg-primary/10">-</td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={handleImport} disabled={isImporting || !selectedTee || !courseName.trim()} data-testid="button-import-course">
                  {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Import Course
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TeeManagement({ courseId }: { courseId: number }) {
  const { data: tees, isLoading } = useCourseTees(courseId);
  const createTee = useCreateCourseTee(courseId);
  const updateTee = useUpdateCourseTee(courseId);
  const deleteTee = useDeleteCourseTee(courseId);
  const { toast } = useToast();

  const [isAddingTee, setIsAddingTee] = useState(false);
  const [newTee, setNewTee] = useState({ name: "", slopeRating: "113", courseRating: "72.0", color: "#ffffff" });
  const [editingTee, setEditingTee] = useState<{ id: number; name: string; slopeRating: string; courseRating: string; color: string } | null>(null);

  const handleCreateTee = async () => {
    if (!newTee.name.trim()) {
      toast({ title: "Error", description: "Please enter a tee name", variant: "destructive" });
      return;
    }
    const slope = parseInt(newTee.slopeRating) || 113;
    const rating = parseFloat(newTee.courseRating) || 72.0;
    if (rating < 55 || rating > 80) {
      toast({ title: "Error", description: "Course rating must be between 55.0 and 80.0", variant: "destructive" });
      return;
    }
    try {
      await createTee.mutateAsync({ name: newTee.name, slopeRating: slope, courseRating: Math.round(rating * 10), color: newTee.color });
      toast({ title: "Success", description: `${newTee.name} tee created` });
      setNewTee({ name: "", slopeRating: "113", courseRating: "72.0", color: "#ffffff" });
      setIsAddingTee(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleUpdateTee = async () => {
    if (!editingTee) return;
    const slope = parseInt(editingTee.slopeRating) || 113;
    const rating = parseFloat(editingTee.courseRating) || 72.0;
    if (rating < 55 || rating > 80) {
      toast({ title: "Error", description: "Course rating must be between 55.0 and 80.0", variant: "destructive" });
      return;
    }
    try {
      await updateTee.mutateAsync({ teeId: editingTee.id, name: editingTee.name, slopeRating: slope, courseRating: Math.round(rating * 10), color: editingTee.color });
      toast({ title: "Success", description: "Tee updated" });
      setEditingTee(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteTee = async (tee: CourseTee) => {
    if (!confirm(`Delete ${tee.name} tee?`)) return;
    try {
      await deleteTee.mutateAsync(tee.id);
      toast({ title: "Success", description: `${tee.name} tee deleted` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading tees...</div>;

  return (
    <div className="border-t pt-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-sm">Tee Sets</h4>
        {!isAddingTee && (
          <Button size="sm" variant="outline" onClick={() => setIsAddingTee(true)} data-testid="button-add-tee">
            <Plus className="w-3 h-3 mr-1" />
            Add Tee
          </Button>
        )}
      </div>

      {isAddingTee && (
        <div className="flex flex-wrap items-end gap-2 mb-3 p-3 bg-muted/30 rounded-md">
          <div className="flex-1 min-w-[100px]">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={newTee.name}
              onChange={(e) => setNewTee(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Blue"
              className="h-8"
              data-testid="input-new-tee-name"
            />
          </div>
          <div className="w-20">
            <label className="text-xs text-muted-foreground">Slope</label>
            <Input
              type="text"
              inputMode="numeric"
              value={newTee.slopeRating}
              onChange={(e) => setNewTee(prev => ({ ...prev, slopeRating: e.target.value }))}
              className="h-8"
              placeholder="113"
              data-testid="input-new-tee-slope"
            />
          </div>
          <div className="w-20">
            <label className="text-xs text-muted-foreground">Rating</label>
            <Input
              type="text"
              inputMode="decimal"
              value={newTee.courseRating}
              onChange={(e) => setNewTee(prev => ({ ...prev, courseRating: e.target.value }))}
              className="h-8"
              placeholder="72.0"
              data-testid="input-new-tee-rating"
            />
          </div>
          <div className="w-24">
            <label className="text-xs text-muted-foreground">Color</label>
            <select
              value={newTee.color}
              onChange={(e) => setNewTee(prev => ({ ...prev, color: e.target.value }))}
              className="w-full h-8 px-2 border rounded-md text-sm bg-background"
              data-testid="select-new-tee-color"
            >
              {TEE_COLORS.map(c => (
                <option key={c.value} value={c.value}>{c.name}</option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={handleCreateTee} disabled={createTee.isPending} data-testid="button-save-new-tee">
            <Save className="w-3 h-3 mr-1" />
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIsAddingTee(false)} data-testid="button-cancel-add-tee">
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}

      {(!tees || tees.length === 0) && !isAddingTee ? (
        <p className="text-sm text-muted-foreground">No tees configured. Add tees to enable handicap-adjusted scoring.</p>
      ) : (
        <div className="space-y-2">
          {[...(tees || [])].sort((a, b) => b.courseRating - a.courseRating).map((tee) => (
            <div key={tee.id} className="flex items-center gap-2 p-2 bg-muted/20 rounded-md">
              <div
                className="w-4 h-4 rounded-full border"
                style={{ backgroundColor: tee.color || '#ffffff' }}
              />
              {editingTee?.id === tee.id ? (
                <>
                  <Input
                    value={editingTee.name}
                    onChange={(e) => setEditingTee(prev => prev ? { ...prev, name: e.target.value } : null)}
                    className="h-7 w-24"
                    data-testid={`input-edit-tee-name-${tee.id}`}
                  />
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={editingTee.slopeRating}
                    onChange={(e) => setEditingTee(prev => prev ? { ...prev, slopeRating: e.target.value } : null)}
                    className="h-7 w-16"
                    data-testid={`input-edit-tee-slope-${tee.id}`}
                  />
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={editingTee.courseRating}
                    onChange={(e) => setEditingTee(prev => prev ? { ...prev, courseRating: e.target.value } : null)}
                    className="h-7 w-16"
                    placeholder="72.0"
                    data-testid={`input-edit-tee-rating-${tee.id}`}
                  />
                  <select
                    value={editingTee.color}
                    onChange={(e) => setEditingTee(prev => prev ? { ...prev, color: e.target.value } : null)}
                    className="h-7 px-1 border rounded-md text-xs bg-background"
                    data-testid={`select-edit-tee-color-${tee.id}`}
                  >
                    {TEE_COLORS.map(c => (
                      <option key={c.value} value={c.value}>{c.name}</option>
                    ))}
                  </select>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleUpdateTee} disabled={updateTee.isPending} data-testid={`button-save-tee-${tee.id}`}>
                    <Save className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingTee(null)} data-testid={`button-cancel-edit-tee-${tee.id}`}>
                    <X className="w-3 h-3" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="font-medium text-sm flex-1">{tee.name}</span>
                  <span className="text-xs text-muted-foreground">Slope: {tee.slopeRating}</span>
                  <span className="text-xs text-muted-foreground">Rating: {(tee.courseRating / 10).toFixed(1)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    onClick={() => setEditingTee({ id: tee.id, name: tee.name, slopeRating: String(tee.slopeRating), courseRating: (tee.courseRating / 10).toFixed(1), color: tee.color || '#ffffff' })}
                    data-testid={`button-edit-tee-${tee.id}`}
                  >
                    <Save className="w-3 h-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleDeleteTee(tee)} data-testid={`button-delete-tee-${tee.id}`}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CourseSetup() {
  const { data: courses, isLoading } = useCourses();
  const createCourse = useCreateCourse();
  const updateCourseHole = useUpdateCourseHole();
  const deleteCourse = useDeleteCourse();
  const { toast } = useToast();

  const [expandedCourse, setExpandedCourse] = useState<number | null>(null);
  const [isAddingCourse, setIsAddingCourse] = useState(false);
  const [newCourseName, setNewCourseName] = useState("");
  const [newCourseHoles, setNewCourseHoles] = useState<{ holeNumber: number; par: number; handicap: number | null }[]>(
    Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: 4, handicap: null }))
  );
  const [editingHoles, setEditingHoles] = useState<Record<string, { par: number; handicap: number | null }>>({});
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  const handleCreateCourse = async () => {
    if (!newCourseName.trim()) {
      toast({ title: "Error", description: "Please enter a course name", variant: "destructive" });
      return;
    }

    try {
      await createCourse.mutateAsync({
        name: newCourseName.trim(),
        holes: newCourseHoles,
      });
      toast({ title: "Success", description: `${newCourseName} created successfully` });
      setNewCourseName("");
      setNewCourseHoles(Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: 4, handicap: null })));
      setIsAddingCourse(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleUpdateHole = async (courseId: number, holeNumber: number, par: number, handicap: number | null) => {
    try {
      await updateCourseHole.mutateAsync({ courseId, holeNumber, par, handicap });
      const key = `${courseId}-${holeNumber}`;
      setEditingHoles(prev => {
        const newState = { ...prev };
        delete newState[key];
        return newState;
      });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteCourse = async (course: Course) => {
    if (!confirm(`Are you sure you want to delete ${course.name}?`)) return;
    try {
      await deleteCourse.mutateAsync(course.id);
      toast({ title: "Success", description: `${course.name} deleted` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const getEditingValue = (courseId: number, holeNumber: number, originalPar: number, originalHandicap: number | null) => {
    const key = `${courseId}-${holeNumber}`;
    return editingHoles[key] ?? { par: originalPar, handicap: originalHandicap };
  };

  const setEditingValue = (courseId: number, holeNumber: number, field: 'par' | 'handicap', value: number | null, originalPar: number, originalHandicap: number | null) => {
    const key = `${courseId}-${holeNumber}`;
    setEditingHoles(prev => ({
      ...prev,
      [key]: { ...getEditingValue(courseId, holeNumber, originalPar, originalHandicap), [field]: value }
    }));
  };

  const hasChanges = (courseId: number, holeNumber: number, originalPar: number, originalHandicap: number | null) => {
    const key = `${courseId}-${holeNumber}`;
    const editing = editingHoles[key];
    if (!editing) return false;
    return editing.par !== originalPar || editing.handicap !== originalHandicap;
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading courses...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-primary">Course Setup</h1>
          <p className="text-muted-foreground">Manage courses, par values, and hole handicaps</p>
        </div>
        {!isAddingCourse && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsImportDialogOpen(true)} data-testid="button-search-database">
              <Search className="w-4 h-4 mr-2" />
              Search Database
            </Button>
            <Button onClick={() => setIsAddingCourse(true)} data-testid="button-add-course">
              <Plus className="w-4 h-4 mr-2" />
              Add Course
            </Button>
          </div>
        )}
      </div>

      <CourseImportDialog 
        open={isImportDialogOpen} 
        onClose={() => setIsImportDialogOpen(false)} 
      />

      {isAddingCourse && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="w-5 h-5" />
              New Course
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Course Name</label>
              <Input
                value={newCourseName}
                onChange={(e) => setNewCourseName(e.target.value)}
                placeholder="Enter course name"
                data-testid="input-new-course-name"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Hole</th>
                    {Array.from({ length: 9 }, (_, i) => (
                      <th key={i + 1} className="p-2 text-center w-12">{i + 1}</th>
                    ))}
                    <th className="p-2 text-center bg-muted/30">Out</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2 font-medium">Par</td>
                    {Array.from({ length: 9 }, (_, i) => (
                      <td key={i + 1} className="p-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={newCourseHoles[i].par}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 3;
                            setNewCourseHoles(prev => prev.map((h, idx) => idx === i ? { ...h, par: Math.min(6, Math.max(3, val)) } : h));
                          }}
                          className="w-10 h-8 text-center p-0"
                          data-testid={`input-new-par-${i + 1}`}
                        />
                      </td>
                    ))}
                    <td className="p-2 text-center bg-muted/30 font-medium">
                      {newCourseHoles.slice(0, 9).reduce((sum, h) => sum + h.par, 0)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">Handicap</td>
                    {Array.from({ length: 9 }, (_, i) => (
                      <td key={i + 1} className="p-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={newCourseHoles[i].handicap ?? ""}
                          onChange={(e) => {
                            const val = e.target.value ? Math.min(18, Math.max(1, parseInt(e.target.value) || 1)) : null;
                            setNewCourseHoles(prev => prev.map((h, idx) => idx === i ? { ...h, handicap: val } : h));
                          }}
                          className="w-10 h-8 text-center p-0"
                          placeholder="-"
                          data-testid={`input-new-handicap-${i + 1}`}
                        />
                      </td>
                    ))}
                    <td className="p-2 text-center bg-muted/30"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Hole</th>
                    {Array.from({ length: 9 }, (_, i) => (
                      <th key={i + 10} className="p-2 text-center w-12">{i + 10}</th>
                    ))}
                    <th className="p-2 text-center bg-muted/30">In</th>
                    <th className="p-2 text-center bg-primary/10">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-2 font-medium">Par</td>
                    {Array.from({ length: 9 }, (_, i) => (
                      <td key={i + 10} className="p-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={newCourseHoles[i + 9].par}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 3;
                            setNewCourseHoles(prev => prev.map((h, idx) => idx === i + 9 ? { ...h, par: Math.min(6, Math.max(3, val)) } : h));
                          }}
                          className="w-10 h-8 text-center p-0"
                          data-testid={`input-new-par-${i + 10}`}
                        />
                      </td>
                    ))}
                    <td className="p-2 text-center bg-muted/30 font-medium">
                      {newCourseHoles.slice(9, 18).reduce((sum, h) => sum + h.par, 0)}
                    </td>
                    <td className="p-2 text-center bg-primary/10 font-bold">
                      {newCourseHoles.reduce((sum, h) => sum + h.par, 0)}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-2 font-medium">Handicap</td>
                    {Array.from({ length: 9 }, (_, i) => (
                      <td key={i + 10} className="p-1">
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={newCourseHoles[i + 9].handicap ?? ""}
                          onChange={(e) => {
                            const val = e.target.value ? Math.min(18, Math.max(1, parseInt(e.target.value) || 1)) : null;
                            setNewCourseHoles(prev => prev.map((h, idx) => idx === i + 9 ? { ...h, handicap: val } : h));
                          }}
                          className="w-10 h-8 text-center p-0"
                          placeholder="-"
                          data-testid={`input-new-handicap-${i + 10}`}
                        />
                      </td>
                    ))}
                    <td className="p-2 text-center bg-muted/30"></td>
                    <td className="p-2 text-center bg-primary/10"></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsAddingCourse(false)} data-testid="button-cancel-add-course">
                Cancel
              </Button>
              <Button onClick={handleCreateCourse} disabled={createCourse.isPending} data-testid="button-save-new-course">
                <Save className="w-4 h-4 mr-2" />
                {createCourse.isPending ? "Saving..." : "Save Course"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {courses?.map((course) => (
          <Card key={course.id} className="overflow-hidden">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover-elevate"
              onClick={() => setExpandedCourse(expandedCourse === course.id ? null : course.id)}
              data-testid={`card-course-${course.id}`}
            >
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-semibold">{course.name}</h3>
                  <p className="text-sm text-muted-foreground">Par {course.totalPar}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCourse(course);
                  }}
                  data-testid={`button-delete-course-${course.id}`}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
                {expandedCourse === course.id ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
            </div>

            {expandedCourse === course.id && (
              <CardContent className="border-t pt-4 space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="p-2 text-left w-24">Hole</th>
                        {Array.from({ length: 9 }, (_, i) => (
                          <th key={i + 1} className="p-2 text-center w-14">{i + 1}</th>
                        ))}
                        <th className="p-2 text-center bg-muted/30">Out</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-2 font-medium">Par</td>
                        {course.holes.slice(0, 9).map((hole) => {
                          const editing = getEditingValue(course.id, hole.holeNumber, hole.par, hole.handicap);
                          return (
                            <td key={hole.holeNumber} className="p-1">
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={editing.par}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 3;
                                  setEditingValue(course.id, hole.holeNumber, 'par', Math.min(6, Math.max(3, val)), hole.par, hole.handicap);
                                }}
                                className="w-10 h-8 text-center p-0"
                                data-testid={`input-par-${course.id}-${hole.holeNumber}`}
                              />
                            </td>
                          );
                        })}
                        <td className="p-2 text-center bg-muted/30 font-medium">
                          {course.holes.slice(0, 9).reduce((sum, h) => sum + h.par, 0)}
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-2 font-medium">Handicap</td>
                        {course.holes.slice(0, 9).map((hole) => {
                          const editing = getEditingValue(course.id, hole.holeNumber, hole.par, hole.handicap);
                          return (
                            <td key={hole.holeNumber} className="p-1">
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={editing.handicap ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value ? Math.min(18, Math.max(1, parseInt(e.target.value) || 1)) : null;
                                  setEditingValue(course.id, hole.holeNumber, 'handicap', val, hole.par, hole.handicap);
                                }}
                                className="w-10 h-8 text-center p-0"
                                placeholder="-"
                                data-testid={`input-handicap-${course.id}-${hole.holeNumber}`}
                              />
                            </td>
                          );
                        })}
                        <td className="p-2 text-center bg-muted/30"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="p-2 text-left w-24">Hole</th>
                        {Array.from({ length: 9 }, (_, i) => (
                          <th key={i + 10} className="p-2 text-center w-14">{i + 10}</th>
                        ))}
                        <th className="p-2 text-center bg-muted/30">In</th>
                        <th className="p-2 text-center bg-primary/10">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="p-2 font-medium">Par</td>
                        {course.holes.slice(9, 18).map((hole) => {
                          const editing = getEditingValue(course.id, hole.holeNumber, hole.par, hole.handicap);
                          return (
                            <td key={hole.holeNumber} className="p-1">
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={editing.par}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 3;
                                  setEditingValue(course.id, hole.holeNumber, 'par', Math.min(6, Math.max(3, val)), hole.par, hole.handicap);
                                }}
                                className="w-10 h-8 text-center p-0"
                                data-testid={`input-par-${course.id}-${hole.holeNumber}`}
                              />
                            </td>
                          );
                        })}
                        <td className="p-2 text-center bg-muted/30 font-medium">
                          {course.holes.slice(9, 18).reduce((sum, h) => sum + h.par, 0)}
                        </td>
                        <td className="p-2 text-center bg-primary/10 font-bold">
                          {course.totalPar}
                        </td>
                      </tr>
                      <tr className="border-b">
                        <td className="p-2 font-medium">Handicap</td>
                        {course.holes.slice(9, 18).map((hole) => {
                          const editing = getEditingValue(course.id, hole.holeNumber, hole.par, hole.handicap);
                          return (
                            <td key={hole.holeNumber} className="p-1">
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={editing.handicap ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value ? Math.min(18, Math.max(1, parseInt(e.target.value) || 1)) : null;
                                  setEditingValue(course.id, hole.holeNumber, 'handicap', val, hole.par, hole.handicap);
                                }}
                                className="w-10 h-8 text-center p-0"
                                placeholder="-"
                                data-testid={`input-handicap-${course.id}-${hole.holeNumber}`}
                              />
                            </td>
                          );
                        })}
                        <td className="p-2 text-center bg-muted/30"></td>
                        <td className="p-2 text-center bg-primary/10"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {course.holes.some(h => hasChanges(course.id, h.holeNumber, h.par, h.handicap)) && (
                  <div className="flex justify-end">
                    <Button
                      onClick={async () => {
                        for (const hole of course.holes) {
                          if (hasChanges(course.id, hole.holeNumber, hole.par, hole.handicap)) {
                            const editing = getEditingValue(course.id, hole.holeNumber, hole.par, hole.handicap);
                            await handleUpdateHole(course.id, hole.holeNumber, editing.par, editing.handicap);
                          }
                        }
                        toast({ title: "Success", description: "Course updated" });
                      }}
                      disabled={updateCourseHole.isPending}
                      data-testid={`button-save-course-${course.id}`}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {updateCourseHole.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                )}

                <TeeManagement courseId={course.id} />
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {courses?.length === 0 && !isAddingCourse && (
        <Card className="p-8 text-center">
          <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No courses yet. Add your first course to get started.</p>
        </Card>
      )}
    </div>
  );
}

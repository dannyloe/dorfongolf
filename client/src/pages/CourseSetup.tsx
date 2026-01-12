import { useState } from "react";
import { useCourses, useCreateCourse, useUpdateCourseHole, useDeleteCourse, useCourseTees, useCreateCourseTee, useUpdateCourseTee, useDeleteCourseTee, type Course, type CourseTee } from "@/hooks/use-matches";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Save, Trash2, ChevronDown, ChevronUp, MapPin, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TEE_COLORS = [
  { name: "Blue", value: "#1e40af" },
  { name: "White", value: "#ffffff" },
  { name: "Gold", value: "#eab308" },
  { name: "Red", value: "#dc2626" },
  { name: "Black", value: "#1f2937" },
  { name: "Green", value: "#16a34a" },
];

function TeeManagement({ courseId }: { courseId: number }) {
  const { data: tees, isLoading } = useCourseTees(courseId);
  const createTee = useCreateCourseTee(courseId);
  const updateTee = useUpdateCourseTee(courseId);
  const deleteTee = useDeleteCourseTee(courseId);
  const { toast } = useToast();

  const [isAddingTee, setIsAddingTee] = useState(false);
  const [newTee, setNewTee] = useState({ name: "", slopeRating: 113, courseRating: 720, color: "#ffffff" });
  const [editingTee, setEditingTee] = useState<{ id: number; name: string; slopeRating: number; courseRating: number; color: string } | null>(null);

  const handleCreateTee = async () => {
    if (!newTee.name.trim()) {
      toast({ title: "Error", description: "Please enter a tee name", variant: "destructive" });
      return;
    }
    try {
      await createTee.mutateAsync(newTee);
      toast({ title: "Success", description: `${newTee.name} tee created` });
      setNewTee({ name: "", slopeRating: 113, courseRating: 720, color: "#ffffff" });
      setIsAddingTee(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleUpdateTee = async () => {
    if (!editingTee) return;
    try {
      await updateTee.mutateAsync({ teeId: editingTee.id, name: editingTee.name, slopeRating: editingTee.slopeRating, courseRating: editingTee.courseRating, color: editingTee.color });
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
              onChange={(e) => setNewTee(prev => ({ ...prev, slopeRating: parseInt(e.target.value) || 113 }))}
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
              value={(newTee.courseRating / 10).toFixed(1)}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val) && val >= 55 && val <= 80) {
                  setNewTee(prev => ({ ...prev, courseRating: Math.round(val * 10) }));
                }
              }}
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
          {tees?.map((tee) => (
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
                    onChange={(e) => setEditingTee(prev => prev ? { ...prev, slopeRating: parseInt(e.target.value) || 113 } : null)}
                    className="h-7 w-16"
                    data-testid={`input-edit-tee-slope-${tee.id}`}
                  />
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={(editingTee.courseRating / 10).toFixed(1)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val >= 55 && val <= 80) {
                        setEditingTee(prev => prev ? { ...prev, courseRating: Math.round(val * 10) } : null);
                      }
                    }}
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
                    onClick={() => setEditingTee({ id: tee.id, name: tee.name, slopeRating: tee.slopeRating, courseRating: tee.courseRating, color: tee.color || '#ffffff' })}
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
          <Button onClick={() => setIsAddingCourse(true)} data-testid="button-add-course">
            <Plus className="w-4 h-4 mr-2" />
            Add Course
          </Button>
        )}
      </div>

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

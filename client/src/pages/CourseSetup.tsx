import { useState } from "react";
import { useCourses, useCreateCourse, useUpdateCourseHole, useDeleteCourse, type Course } from "@/hooks/use-matches";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Plus, Save, Trash2, ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

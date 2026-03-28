import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import SignInButton from '@/components/ui/signin';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, FileText, Moon, Sun, Search, FolderPlus, FlaskConical, FolderOpen, Users, ArrowLeft, MoreVertical, Check, ChevronDown } from 'lucide-react';
import type { CanvasListItem } from '@/types/canvas';
import { useTheme } from '@/components/theme-provider';

interface CanvasGalleryProps {
  canvases: CanvasListItem[];
  projects: string[];
  onAddProject: (name: string) => void;
  onDeleteProject: (name: string) => void;
  onMoveCanvasToProject: (canvasId: string, project: string) => void;
  onCreateNew: (name: string, description?: string, project?: string) => void;
  onCreateTemp: () => void;
  onOpenCanvas: (canvasId: string) => void;
  onDeleteCanvas: (canvasId: string) => void;
}

export function CanvasGallery({
  canvases,
  projects,
  onAddProject,
  onDeleteProject,
  onMoveCanvasToProject,
  onCreateNew,
  onCreateTemp,
  onOpenCanvas,
  onDeleteCanvas,
}: CanvasGalleryProps) {
  const { theme, setTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openCreateMenu, setOpenCreateMenu] = useState(false);

  const handleCreateAndOpen = () => {
    const timestamp = new Date().toLocaleTimeString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const canvasName = `Untitled - ${timestamp}`;
    const targetProject = activeProject ?? 'General';
    onCreateNew(canvasName, undefined, targetProject);
    setOpenCreateMenu(false);
  };

  const handleAddProject = () => {
    const name = window.prompt('Project name');
    if (!name || !name.trim()) return;
    onAddProject(name.trim());
    setOpenCreateMenu(false);
  };

  const handleDeleteProject = (projectName: string) => {
    const confirmed = window.confirm(
      `Delete project "${projectName}"? Canvases inside will be moved to General.`
    );
    if (!confirmed) {
      return;
    }
    onDeleteProject(projectName);
    if (activeProject === projectName) {
      setActiveProject(null);
    }
  };

  const resolvedTheme = useMemo(() => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }, [theme]);

  const filteredCanvases = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    return canvases.filter((canvas) => {
      const matchesProject = activeProject
        ? canvas.project === activeProject
        : canvas.project === 'General';
      if (!matchesProject) {
        return false;
      }
      if (!search) {
        return true;
      }
      const target = `${canvas.name} ${canvas.description || ''} ${canvas.project}`.toLowerCase();
      return target.includes(search);
    });
  }, [canvases, searchQuery, activeProject]);

  useEffect(() => {
    if (!openMenuId && !openCreateMenu) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      if (
        target.closest('[data-canvas-menu]') ||
        target.closest('[data-canvas-menu-trigger]') ||
        target.closest('[data-create-menu]') ||
        target.closest('[data-create-menu-trigger]')
      ) {
        return;
      }

      setOpenMenuId(null);
      setOpenCreateMenu(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuId(null);
        setOpenCreateMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openMenuId, openCreateMenu]);

  const projectCards = useMemo(() => {
    return projects
      .filter((project) => project !== 'General')
      .map((project) => ({
        name: project,
        count: canvases.filter((canvas) => canvas.project === project).length,
      }));
  }, [projects, canvases]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto max-w-7xl space-y-8 p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-5xl font-bold tracking-tight">Better Excalidraw</h1>
            <p className="mt-2 text-base text-muted-foreground">
              {activeProject
                ? `${filteredCanvases.length} canvas${filteredCanvases.length !== 1 ? 'es' : ''} in ${activeProject}`
                : `${canvases.length} canvas${canvases.length !== 1 ? 'es' : ''} total`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
                setTheme(nextTheme);
              }}
              title="Toggle dark mode (or press D)"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="size-5" />
              ) : (
                <Moon className="size-5" />
              )}
            </Button>
            
            <SignInButton />
            <div className="relative">
              <div className="inline-flex items-center">
                <Button
                  onClick={handleCreateAndOpen}
                  size="lg"
                  className="gap-2 rounded-r-none"
                >
                  <Plus className="size-5" />
                  New
                </Button>
                <Button
                  onClick={() => setOpenCreateMenu((prev) => !prev)}
                  size="lg"
                  className="rounded-l-none border-l border-primary-foreground/20 px-2.5"
                  data-create-menu-trigger
                  title="Open create menu"
                >
                  <ChevronDown className={`size-4 transition-transform ${openCreateMenu ? 'rotate-180' : ''}`} />
                </Button>
              </div>

              {openCreateMenu && (
                <div
                  data-create-menu
                  className="absolute right-0 top-11 z-30 min-w-52 rounded-lg border border-border/80 bg-popover/95 p-1 shadow-xl backdrop-blur"
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                    onClick={handleCreateAndOpen}
                  >
                    <Plus className="size-4" />
                    New Canvas
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                    onClick={() => {
                      onCreateTemp();
                      setOpenCreateMenu(false);
                    }}
                  >
                    <FlaskConical className="size-4" />
                    Temp Canvas
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                    onClick={handleAddProject}
                  >
                    <FolderPlus className="size-4" />
                    New Project
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search canvases"
              className="pl-9"
            />
          </div>
          <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
            {activeProject ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setActiveProject(null)}
              >
                <ArrowLeft className="size-4" />
                Back to Home
              </Button>
            ) : (
              <>
                <Users className="size-4" />
                {projectCards.length} project{projectCards.length !== 1 ? 's' : ''}
              </>
            )}
          </div>
        </div>

        {/* Canvas Grid */}
        {!activeProject && projectCards.length === 0 && filteredCanvases.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 py-20">
            <FileText className="mb-4 size-20 text-muted-foreground/30" />
            <h3 className="mb-2 text-2xl font-semibold">No matching canvases</h3>
            <p className="mb-8 text-muted-foreground">
              Try another search/project filter or create a new canvas
            </p>
            <Button 
              onClick={handleCreateAndOpen}
              size="lg" 
              className="gap-2"
            >
              <Plus className="size-5" />
              Create First Canvas
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {!activeProject && projectCards.map((project) => (
              <Card
                key={project.name}
                onClick={() => setActiveProject(project.name)}
                className="group relative cursor-pointer overflow-hidden border border-border/50 py-0 gap-0 shadow-sm transition-all duration-200 hover:shadow-lg"
              >
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteProject(project.name);
                  }}
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 z-10 text-destructive hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete project"
                >
                  <Trash2 className="size-4" />
                </Button>
                <div className="aspect-video w-full overflow-hidden bg-gradient-to-br from-muted to-muted-foreground/10">
                  <div className="flex h-full flex-col items-center justify-center gap-2">
                    <FolderOpen className="size-12 text-muted-foreground/50" />
                    <div className="rounded-full border border-border/50 bg-background/80 px-2 py-0.5 text-xs text-muted-foreground">
                      {project.count} canvas{project.count !== 1 ? 'es' : ''}
                    </div>
                  </div>
                </div>
                <CardHeader className="pb-2 pt-3">
                  <CardTitle className="truncate text-sm">{project.name}</CardTitle>
                  <CardDescription className="text-xs">Project folder</CardDescription>
                </CardHeader>
              </Card>
            ))}

            {filteredCanvases.map((canvas) => {
              const isMenuOpen = openMenuId === canvas.id;

              // Extract thumbnail from data JSON
              let thumbnail: string | undefined;
              if (canvas.data) {
                try {
                  const parsed = JSON.parse(canvas.data);
                  thumbnail = parsed.thumbnail;
                } catch (err) {
                  // Ignore parse errors
                }
              }
              
              return (
              <Card
                key={canvas.id}
                onClick={() => onOpenCanvas(canvas.id)}
                className="group relative cursor-pointer overflow-hidden border border-border/50 py-0 gap-0 shadow-sm transition-all duration-200 hover:shadow-lg"
              >
                {/* Preview Image */}
                <div className="aspect-video w-full overflow-hidden bg-muted">
                  {thumbnail ? (
                    <img
                      src={thumbnail}
                      alt={canvas.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                      <FileText className="size-8 text-muted-foreground/30" />
                    </div>
                  )}
                </div>

                <div className="absolute right-2 top-2 z-10 flex flex-col items-center gap-1.5">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteCanvas(canvas.id);
                    }}
                    variant="ghost"
                    size="icon"
                    className={`size-8 rounded-full border border-border/40 bg-background/80 text-destructive backdrop-blur transition-all hover:bg-destructive/10 hover:text-destructive ${
                      isMenuOpen
                        ? 'opacity-100 shadow-sm'
                        : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                    }`}
                    title="Delete canvas"
                  >
                    <Trash2 className="size-4" />
                  </Button>

                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId((prev) => (prev === canvas.id ? null : canvas.id));
                    }}
                    variant="ghost"
                    size="icon"
                    data-canvas-menu-trigger
                    className={`size-8 rounded-full border border-border/40 bg-background/80 backdrop-blur transition-all ${
                      isMenuOpen
                        ? 'opacity-100 shadow-sm'
                        : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                    }`}
                    title="Canvas actions"
                  >
                    <MoreVertical className="size-4" />
                  </Button>
                </div>

                {isMenuOpen && (
                  <div
                    data-canvas-menu
                    className="absolute right-2 top-12 z-20 min-w-48 rounded-lg border border-border/80 bg-popover/95 p-1 shadow-xl backdrop-blur"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Move to folder</div>
                    {projects.map((project) => (
                      <button
                        key={`${canvas.id}-${project}`}
                        type="button"
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                          canvas.project === project
                            ? 'bg-muted font-medium'
                            : 'hover:bg-muted'
                        }`}
                        onClick={() => {
                          onMoveCanvasToProject(canvas.id, project);
                          setOpenMenuId(null);
                        }}
                      >
                        <span>{project}</span>
                        {canvas.project === project && <Check className="size-3.5 text-muted-foreground" />}
                      </button>
                    ))}
                  </div>
                )}

                <CardHeader className="pb-2 pt-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 inline-flex rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {canvas.project}
                      </div>
                      <CardTitle className="truncate text-sm">
                        {canvas.name}
                      </CardTitle>
                      {canvas.description && (
                        <CardDescription className="mt-0.5 line-clamp-1 text-xs">
                          {canvas.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="text-xs text-muted-foreground">
                    {formatDate(canvas.updatedAt)}
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

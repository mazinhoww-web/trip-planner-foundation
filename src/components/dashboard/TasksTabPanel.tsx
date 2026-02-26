import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmActionButton } from '@/components/common/ConfirmActionButton';
import { Tables } from '@/integrations/supabase/types';
import { CheckCircle2, ListTodo, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { ReactNode } from 'react';

type TaskPriority = 'baixa' | 'media' | 'alta';

type Props = {
  canEditTrip: boolean;
  generatingTasks: boolean;
  onGenerateTasks: () => Promise<void> | void;
  taskForm: {
    titulo: string;
    categoria: string;
    prioridade: TaskPriority;
  };
  onTaskTitleChange: (value: string) => void;
  onTaskCategoryChange: (value: string) => void;
  onTaskPriorityChange: (value: TaskPriority) => void;
  onCreateTask: () => Promise<void> | void;
  isCreatingTask: boolean;
  taskSearch: string;
  onTaskSearchChange: (value: string) => void;
  tasksLoading: boolean;
  tasksFiltered: Tables<'tarefas'>[];
  onToggleTask: (task: Tables<'tarefas'>) => Promise<void> | void;
  isUpdatingTask: boolean;
  onRemoveTask: (id: string) => Promise<void> | void;
  isRemovingTask: boolean;
  prioridadeBadge: (prioridade: TaskPriority) => ReactNode;
};

export function TasksTabPanel({
  canEditTrip,
  generatingTasks,
  onGenerateTasks,
  taskForm,
  onTaskTitleChange,
  onTaskCategoryChange,
  onTaskPriorityChange,
  onCreateTask,
  isCreatingTask,
  taskSearch,
  onTaskSearchChange,
  tasksLoading,
  tasksFiltered,
  onToggleTask,
  isUpdatingTask,
  onRemoveTask,
  isRemovingTask,
  prioridadeBadge,
}: Props) {
  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="font-display text-xl">Tarefas da viagem</CardTitle>
          <Button
            variant="outline"
            disabled={!canEditTrip || generatingTasks}
            onClick={() => void onGenerateTasks()}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {generatingTasks ? 'Gerando...' : 'Gerar tarefas com IA'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
          <Input
            placeholder="Título da tarefa"
            value={taskForm.titulo}
            onChange={(e) => onTaskTitleChange(e.target.value)}
          />
          <Input
            placeholder="Categoria"
            value={taskForm.categoria}
            onChange={(e) => onTaskCategoryChange(e.target.value)}
          />
          <Select
            value={taskForm.prioridade}
            onValueChange={(value: TaskPriority) => onTaskPriorityChange(value)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => void onCreateTask()} disabled={!canEditTrip || !taskForm.titulo.trim() || isCreatingTask}>
            <Plus className="mr-2 h-4 w-4" />
            Criar tarefa
          </Button>
        </div>

        <Input
          placeholder="Buscar tarefa por título ou categoria"
          value={taskSearch}
          onChange={(e) => onTaskSearchChange(e.target.value)}
        />

        {tasksLoading ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Carregando tarefas...
          </div>
        ) : tasksFiltered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <ListTodo className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma tarefa encontrada.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasksFiltered.map((task) => (
              <Card key={task.id} className="border-border/50">
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className={`font-medium ${task.concluida ? 'line-through text-muted-foreground' : ''}`}>
                      {task.titulo}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      {prioridadeBadge(task.prioridade)}
                      {task.categoria && <Badge variant="secondary">{task.categoria}</Badge>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void onToggleTask(task)}
                      disabled={!canEditTrip || isUpdatingTask}
                    >
                      {task.concluida ? (
                        <>
                          <RotateCcw className="mr-1 h-4 w-4" />
                          Reabrir
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          Concluir
                        </>
                      )}
                    </Button>
                    <ConfirmActionButton
                      ariaLabel="Remover tarefa"
                      title="Remover tarefa"
                      description="Esta tarefa será removida da lista."
                      confirmLabel="Remover"
                      disabled={!canEditTrip || isRemovingTask}
                      onConfirm={() => void onRemoveTask(task.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </ConfirmActionButton>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

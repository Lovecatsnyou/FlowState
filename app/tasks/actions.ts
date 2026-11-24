'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '../../lib/supabase/server';
import { isTaskStatus, taskColumns, type TaskRow, type TaskStatus } from '../../lib/tasks';

type UpdateStatusResult =
  | { success: true; task: TaskRow }
  | { success: false; error: string };

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<UpdateStatusResult> {
  if (typeof taskId !== 'string' || !taskId.trim() || !isTaskStatus(status)) {
    return { success: false, error: 'Некорректная задача или статус.' };
  }

  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'Войдите в аккаунт, чтобы изменить статус.' };
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({ status })
      .eq('id', taskId)
      .eq('user_id', user.id)
      .select(taskColumns)
      .single();

    if (error || !data) {
      console.error('Ошибка изменения статуса задачи:', error);
      return { success: false, error: 'Не удалось подтвердить изменение статуса. Проверьте задачу на сервере перед повтором.' };
    }

    revalidatePath('/dashboard');
    revalidatePath('/tasks');
    return { success: true, task: data };
  } catch (error) {
    console.error('Ошибка изменения статуса задачи:', error);
    return { success: false, error: 'Не удалось подтвердить изменение статуса. Проверьте задачу на сервере перед повтором.' };
  }
}

import axiosClient from './axiosClient';

// The assignee's side: their open and finished tasks, and marking a status.
export const getMyTasks = () => axiosClient.get('/tasks/mine');
export const changeTaskStatus = (id, status, comment) =>
  axiosClient.patch(`/tasks/${id}/status`, { status, comment });

// One task with its whole history. Its assignee may read it; anyone else
// needs task.read.
export const getTask = (id) => axiosClient.get(`/tasks/${id}`);

// The admin's side: every task, creating tasks by hand, and acting on one.
// Each action answers with the refreshed task.
export const getAllTasks = () => axiosClient.get('/tasks');
export const getTaskExamOptions = () => axiosClient.get('/tasks/exam-options');
export const getTaskTemplateOptions = (eventId) =>
  axiosClient.get('/tasks/template-options', { params: { eventId } });
export const createTaskFromTemplate = (eventId, taskTemplateId) =>
  axiosClient.post('/tasks/from-template', { eventId, taskTemplateId });
export const createOneOffTask = (data) => axiosClient.post('/tasks', data);
export const cancelTask = (id, comment) => axiosClient.patch(`/tasks/${id}/cancel`, { comment });
export const pauseTask = (id, comment) => axiosClient.patch(`/tasks/${id}/pause`, { comment });
export const resumeTask = (id, comment) => axiosClient.patch(`/tasks/${id}/resume`, { comment });
export const adminReassignTask = (id, designationId, comment) =>
  axiosClient.patch(`/tasks/${id}/reassign`, { designationId, comment });

// The senior's side: status updates sent to them, one as delivered, and what
// they can do with it. Each action answers with the refreshed status update.
export const getSentToMe = () => axiosClient.get('/task-updates/mine');
export const getTaskUpdate = (id) => axiosClient.get(`/task-updates/${id}`);
export const okayTaskUpdate = (id, comment) => axiosClient.post(`/task-updates/${id}/okay`, { comment });
export const forwardTaskUpdate = (id, designationIds, comment) =>
  axiosClient.post(`/task-updates/${id}/forward`, { designationIds, comment });
export const reassignTask = (id, designationId, comment) =>
  axiosClient.post(`/task-updates/${id}/reassign`, { designationId, comment });

// Designations a task or status update may be forwarded or re-assigned to.
// Open to any signed-in user, unlike the Designations list itself.
export const getTaskDesignationOptions = () => axiosClient.get('/task-updates/designation-options');

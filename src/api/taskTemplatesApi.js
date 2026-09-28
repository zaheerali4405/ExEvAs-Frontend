import axiosClient from './axiosClient';

// Task templates: the steps of a workflow, each in one of its activities.
// Every call answers with the template itself.
export const getTaskTemplates = () => axiosClient.get('/task-templates');
export const getTaskTemplate = (id) => axiosClient.get(`/task-templates/${id}`);
export const createTaskTemplate = (data) => axiosClient.post('/task-templates', data);
export const updateTaskTemplate = (id, data) => axiosClient.patch(`/task-templates/${id}`, data);
export const setTaskTemplateStatus = (id, isActive) => axiosClient.patch(`/task-templates/${id}/status`, { isActive });

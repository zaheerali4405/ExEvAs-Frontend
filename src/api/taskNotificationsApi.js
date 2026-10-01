import axiosClient from './axiosClient';

export const getTaskNotifications = () => axiosClient.get('/task-notifications');
export const getTaskNotification = (id) => axiosClient.get(`/task-notifications/${id}`);
export const createTaskNotification = (data) => axiosClient.post('/task-notifications', data);
export const updateTaskNotification = (id, data) => axiosClient.patch(`/task-notifications/${id}`, data);
export const setTaskNotificationStatus = (id, isActive) =>
  axiosClient.patch(`/task-notifications/${id}/status`, { isActive });

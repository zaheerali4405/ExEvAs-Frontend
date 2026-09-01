import axiosClient from './axiosClient';

export const getNotificationTemplates = () => axiosClient.get('/notification-templates');
export const getNotificationTemplate = (id) => axiosClient.get(`/notification-templates/${id}`);
export const createNotificationTemplate = (data) => axiosClient.post('/notification-templates', data);
export const updateNotificationTemplate = (id, data) => axiosClient.patch(`/notification-templates/${id}`, data);
export const setNotificationTemplateStatus = (id, isActive) =>
  axiosClient.patch(`/notification-templates/${id}/status`, { isActive });

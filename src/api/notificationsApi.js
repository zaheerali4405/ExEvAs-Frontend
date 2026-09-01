import axiosClient from './axiosClient';

export const getNotifications = () => axiosClient.get('/notifications');
export const getNotification = (id) => axiosClient.get(`/notifications/${id}`);
export const createNotification = (data) => axiosClient.post('/notifications', data);
export const updateNotification = (id, data) => axiosClient.patch(`/notifications/${id}`, data);
export const sendNotification = (id) => axiosClient.patch(`/notifications/${id}/send`);
export const setNotificationActiveStatus = (id, isActive) =>
  axiosClient.patch(`/notifications/${id}/status`, { isActive });

export const getMyNotifications = () => axiosClient.get('/notifications/mine');
export const markNotificationRead = (id) => axiosClient.patch(`/notifications/mine/${id}/read`);

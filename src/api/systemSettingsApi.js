import axiosClient from './axiosClient';

export const getSystemSettings = () => axiosClient.get('/system-settings');
export const updateSystemSettings = (data) => axiosClient.patch('/system-settings', data);

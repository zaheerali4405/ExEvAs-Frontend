import axiosClient from './axiosClient';

export const getActivities = () => axiosClient.get('/activities');
export const getActivity = (id) => axiosClient.get(`/activities/${id}`);
export const createActivity = (data) => axiosClient.post('/activities', data);
export const updateActivity = (id, data) => axiosClient.patch(`/activities/${id}`, data);
export const setActivityStatus = (id, isActive) => axiosClient.patch(`/activities/${id}/status`, { isActive });

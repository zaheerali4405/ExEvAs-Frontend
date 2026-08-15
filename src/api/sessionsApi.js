import axiosClient from './axiosClient';

export const getSessions = () => axiosClient.get('/sessions');
export const createSession = (data) => axiosClient.post('/sessions', data);
export const updateSession = (id, data) => axiosClient.patch(`/sessions/${id}`, data);
export const setSessionStatus = (id, isActive) => axiosClient.patch(`/sessions/${id}/status`, { isActive });

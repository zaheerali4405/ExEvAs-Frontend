import axiosClient from './axiosClient';

export const getClasses = () => axiosClient.get('/classes');
export const createClass = (data) => axiosClient.post('/classes', data);
export const updateClass = (id, data) => axiosClient.patch(`/classes/${id}`, data);
export const setClassStatus = (id, isActive) => axiosClient.patch(`/classes/${id}/status`, { isActive });

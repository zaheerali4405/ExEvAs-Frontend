import axiosClient from './axiosClient';

export const getInstitutes = () => axiosClient.get('/institutes');
export const createInstitute = (data) => axiosClient.post('/institutes', data);
export const updateInstitute = (id, data) => axiosClient.patch(`/institutes/${id}`, data);
export const setInstituteStatus = (id, isActive) => axiosClient.patch(`/institutes/${id}/status`, { isActive });

import axiosClient from './axiosClient';

export const getDegreeLevels = () => axiosClient.get('/degree-levels');
export const createDegreeLevel = (data) => axiosClient.post('/degree-levels', data);
export const updateDegreeLevel = (id, data) => axiosClient.patch(`/degree-levels/${id}`, data);
export const setDegreeLevelStatus = (id, isActive) => axiosClient.patch(`/degree-levels/${id}/status`, { isActive });

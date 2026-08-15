import axiosClient from './axiosClient';

export const getExamTypes = () => axiosClient.get('/exam-types');
export const createExamType = (data) => axiosClient.post('/exam-types', data);
export const updateExamType = (id, data) => axiosClient.patch(`/exam-types/${id}`, data);
export const setExamTypeStatus = (id, isActive) => axiosClient.patch(`/exam-types/${id}/status`, { isActive });

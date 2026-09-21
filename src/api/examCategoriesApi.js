import axiosClient from './axiosClient';

export const getExamCategories = () => axiosClient.get('/exam-categories');
export const getExamCategory = (id) => axiosClient.get(`/exam-categories/${id}`);
export const createExamCategory = (data) => axiosClient.post('/exam-categories', data);
export const updateExamCategory = (id, data) => axiosClient.patch(`/exam-categories/${id}`, data);
export const setExamCategoryStatus = (id, isActive) => axiosClient.patch(`/exam-categories/${id}/status`, { isActive });

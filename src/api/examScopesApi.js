import axiosClient from './axiosClient';

export const getExamScopes = () => axiosClient.get('/exam-scopes');
export const getExamScope = (id) => axiosClient.get(`/exam-scopes/${id}`);
export const createExamScope = (data) => axiosClient.post('/exam-scopes', data);
export const updateExamScope = (id, data) => axiosClient.patch(`/exam-scopes/${id}`, data);
export const setExamScopeStatus = (id, isActive) => axiosClient.patch(`/exam-scopes/${id}/status`, { isActive });

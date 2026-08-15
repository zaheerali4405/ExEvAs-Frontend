import axiosClient from './axiosClient';

export const getSubjects = () => axiosClient.get('/subjects');
export const createSubject = (data) => axiosClient.post('/subjects', data);
export const updateSubject = (id, data) => axiosClient.patch(`/subjects/${id}`, data);
export const setSubjectStatus = (id, isActive) => axiosClient.patch(`/subjects/${id}/status`, { isActive });

import axiosClient from './axiosClient';

export const getOspeOsceExams = () => axiosClient.get('/ospe-osce');
export const getOspeOsceExam = (id) => axiosClient.get(`/ospe-osce/${id}`);
export const createOspeOsceExam = (data) => axiosClient.post('/ospe-osce', data);
export const updateOspeOsceExam = (id, data) => axiosClient.patch(`/ospe-osce/${id}`, data);
export const updateOspeOsceExamStatus = (id, status) => axiosClient.patch(`/ospe-osce/${id}/status`, { status });

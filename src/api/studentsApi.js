import axiosClient from './axiosClient';

export const getStudents = () => axiosClient.get('/students');
export const createStudent = (data) => axiosClient.post('/students', data);
export const updateStudent = (id, data) => axiosClient.patch(`/students/${id}`, data);
export const setStudentStatus = (id, isActive) => axiosClient.patch(`/students/${id}/status`, { isActive });

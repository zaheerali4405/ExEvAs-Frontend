import axiosClient from './axiosClient';

export const getDepartments = () => axiosClient.get('/departments');
export const createDepartment = (data) => axiosClient.post('/departments', data);
export const updateDepartment = (id, data) => axiosClient.patch(`/departments/${id}`, data);
export const setDepartmentStatus = (id, isActive) => axiosClient.patch(`/departments/${id}/status`, { isActive });

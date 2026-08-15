import axiosClient from './axiosClient';

export const getEmployees = () => axiosClient.get('/employees');
export const createEmployee = (data) => axiosClient.post('/employees', data);
export const updateEmployee = (id, data) => axiosClient.patch(`/employees/${id}`, data);
export const setEmployeeStatus = (id, isActive) => axiosClient.patch(`/employees/${id}/status`, { isActive });

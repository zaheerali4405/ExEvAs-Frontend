import axiosClient from './axiosClient';

export const getWorkflows = () => axiosClient.get('/workflows');
export const getWorkflow = (id) => axiosClient.get(`/workflows/${id}`);
export const createWorkflow = (data) => axiosClient.post('/workflows', data);
export const updateWorkflow = (id, data) => axiosClient.patch(`/workflows/${id}`, data);
export const setWorkflowStatus = (id, isActive) => axiosClient.patch(`/workflows/${id}/status`, { isActive });
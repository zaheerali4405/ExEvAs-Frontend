import axiosClient from './axiosClient';

export const getRoles = () => axiosClient.get('/roles');

export const createRole = (data) => axiosClient.post('/roles', data);

export const updateRole = (id, data) => axiosClient.patch(`/roles/${id}`, data);

export const setRoleStatus = (id, isActive) =>
  axiosClient.patch(`/roles/${id}/status`, { isActive });

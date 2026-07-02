import axiosClient from './axiosClient';

export const getPermissions = () => axiosClient.get('/permissions');

export const setPermissionStatus = (id, isActive) =>
  axiosClient.patch(`/permissions/${id}/status`, { isActive });

export const createPermission = (data) =>
  axiosClient.post('/permissions', data);

export const updatePermission = (id, data) =>
  axiosClient.patch(`/permissions/${id}`, data);
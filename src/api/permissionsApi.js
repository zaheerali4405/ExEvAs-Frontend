import axiosClient from './axiosClient';

export const getPermissions = () => axiosClient.get('/permissions');

export const setPermissionStatus = (id, isActive) =>
  axiosClient.patch(`/permissions/${id}/status`, { isActive });
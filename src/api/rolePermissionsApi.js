import axiosClient from './axiosClient';

export const getRolePermissions = (roleId) =>
  axiosClient.get(`/role-permissions/role/${roleId}`);

export const assignPermission = (roleId, permissionId) =>
  axiosClient.post('/role-permissions', { roleId, permissionId });

export const unassignPermission = (roleId, permissionId) =>
  axiosClient.delete(`/role-permissions/role/${roleId}/permission/${permissionId}`);
